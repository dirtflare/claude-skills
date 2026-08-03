#!/usr/bin/env python3
"""Higgsfield の生成物をローカルへ退避する。

Higgsfield の生成履歴は MCP 経由でしか列挙できないため、この2段構えを取る。

  1. Claude が MCP (show_generations / show_medias /
     show_marketing_studio_generations) をページングしながら呼び、
     返ってきた JSON をそのまま manifest ディレクトリに保存する。
  2. このスクリプトがその JSON を読み、実体をダウンロードする。

つまりこのスクリプト自体は Higgsfield へ認証しない。ページ JSON さえ
手元にあれば、後日オフラインでも再実行できる。

出力レイアウト:

    <out>/
      media/<type>/<YYYY-MM-DD>/<timestamp>_<id>[_suffix].<ext>
      metadata/<id>.json      # 生成レコード全体 (プロンプト含む)
      index.jsonl             # 1行1ファイルの機械可読インデックス
      index.md                # 人間用の一覧
      .state.json             # 再開用。ダウンロード済み URL を記録

再実行は安全 (既存ファイルはスキップ)。中断しても続きから再開する。

使い方:
    python3 higgsfield_export.py --manifest-dir ./manifest --out ./higgsfield-export
    python3 higgsfield_export.py --manifest-dir ./manifest --out ./out --dry-run
    python3 higgsfield_export.py --manifest-dir ./manifest --out ./out --include-inputs

標準ライブラリのみ。依存パッケージなし。
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Iterable, Iterator

# CloudFront の URL は署名なしだが、素の urllib だと弾かれることがあるので UA を付ける。
USER_AGENT = "higgsfield-export/1.0 (+local archival)"

URL_RE = re.compile(r"^https?://", re.IGNORECASE)

# 拡張子が URL から取れなかったときの保険。
CONTENT_TYPE_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "model/gltf-binary": ".glb",
    "application/octet-stream": ".bin",
}

# results 配下でサムネイル扱いするキー。既定では落とさない。
THUMBNAIL_KEYS = {"minurl", "thumbnailurl", "previewurl", "posterurl"}


# --------------------------------------------------------------------------
# マニフェスト読み込み
# --------------------------------------------------------------------------


def load_manifest_records(manifest_dir: Path) -> list[dict[str, Any]]:
    """manifest ディレクトリ配下の JSON / JSONL から生成レコードを集める。

    受け付ける形:
      - MCP のページ応答そのまま:  {"items": [...], "next_cursor": ...}
      - レコードの配列:            [ {...}, {...} ]
      - 単一レコード:              {...}
      - JSONL:                     1行1レコード or 1行1ページ応答
    """
    if not manifest_dir.is_dir():
        raise SystemExit(f"manifest ディレクトリが見つからない: {manifest_dir}")

    files = sorted(
        p
        for p in manifest_dir.rglob("*")
        if p.is_file() and p.suffix.lower() in {".json", ".jsonl"}
    )
    if not files:
        raise SystemExit(
            f"{manifest_dir} に .json / .jsonl が1つもない。\n"
            "先に Claude に show_generations をページングさせ、各ページの JSON を "
            "このディレクトリへ保存すること。"
        )

    records: list[dict[str, Any]] = []
    for path in files:
        text = path.read_text(encoding="utf-8").strip()
        if not text:
            continue
        for blob in _iter_json_blobs(text, path):
            records.extend(_extract_records(blob))

    # id で重複排除。ページが重なっても安全にする。
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for rec in records:
        key = str(rec.get("id") or "")
        if key and key in seen:
            continue
        if key:
            seen.add(key)
        unique.append(rec)
    return unique


def _iter_json_blobs(text: str, path: Path) -> Iterator[Any]:
    """ファイル全体を1つの JSON として、駄目なら JSONL として読む。"""
    try:
        yield json.loads(text)
        return
    except json.JSONDecodeError:
        pass

    ok = False
    for lineno, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            yield json.loads(line)
            ok = True
        except json.JSONDecodeError as exc:
            print(f"  ! {path.name}:{lineno} を JSON として解釈できない: {exc}", file=sys.stderr)
    if not ok:
        print(f"  ! {path} から1件も読めなかった", file=sys.stderr)


def _extract_records(blob: Any) -> list[dict[str, Any]]:
    if isinstance(blob, dict):
        for key in ("items", "generations", "medias", "results", "data"):
            value = blob.get(key)
            if isinstance(value, list):
                return [r for r in value if isinstance(r, dict)]
        # ページ応答ではなく単体レコードだった場合。
        if "id" in blob or "results" in blob or "url" in blob:
            return [blob]
        return []
    if isinstance(blob, list):
        return [r for r in blob if isinstance(r, dict)]
    return []


# --------------------------------------------------------------------------
# ダウンロード対象の抽出
# --------------------------------------------------------------------------


class Asset:
    __slots__ = ("url", "record_id", "media_type", "created_at", "role", "suffix")

    def __init__(
        self,
        url: str,
        record_id: str,
        media_type: str,
        created_at: float | None,
        role: str,
        suffix: str,
    ) -> None:
        self.url = url
        self.record_id = record_id
        self.media_type = media_type
        self.created_at = created_at
        self.role = role
        self.suffix = suffix


def collect_assets(
    record: dict[str, Any], include_inputs: bool, include_thumbnails: bool
) -> list[Asset]:
    record_id = str(record.get("id") or _fallback_id(record))
    media_type = str(record.get("type") or "unknown").lower()
    created_at = _parse_created_at(record)

    assets: list[Asset] = []
    seen: set[str] = set()

    def add(url: str, role: str, suffix: str) -> None:
        if not isinstance(url, str) or not URL_RE.match(url) or url in seen:
            return
        seen.add(url)
        assets.append(Asset(url, record_id, media_type, created_at, role, suffix))

    # 本体の出力。
    results = record.get("results")
    for url, key_path in _walk_urls(results):
        leaf = key_path[-1].lower() if key_path else ""
        if leaf in THUMBNAIL_KEYS and not include_thumbnails:
            continue
        suffix = "" if leaf in {"rawurl", "url"} else "_" + _slug("-".join(key_path))
        add(url, "output", suffix)

    # show_medias 由来のレコードは results を持たず url が直下にある。
    if not assets:
        for url, key_path in _walk_urls(
            {k: v for k, v in record.items() if k not in {"params", "input", "inputs"}}
        ):
            leaf = key_path[-1].lower() if key_path else ""
            if leaf in THUMBNAIL_KEYS and not include_thumbnails:
                continue
            add(url, "output", "" if leaf == "url" else "_" + _slug("-".join(key_path)))

    # 参照画像・入力画像。既定では落とさない (再生成の材料として要るなら --include-inputs)。
    if include_inputs:
        for url, key_path in _walk_urls(record.get("params")):
            leaf = key_path[-1].lower() if key_path else ""
            if leaf in THUMBNAIL_KEYS and not include_thumbnails:
                continue
            add(url, "input", "_input_" + _slug("-".join(key_path)))

    return assets


def _walk_urls(node: Any, path: tuple[str, ...] = ()) -> Iterator[tuple[str, tuple[str, ...]]]:
    """入れ子の dict / list を辿って URL 文字列とそこまでのキー列を返す。"""
    if isinstance(node, str):
        if URL_RE.match(node):
            yield node, path
    elif isinstance(node, dict):
        for key, value in node.items():
            yield from _walk_urls(value, path + (str(key),))
    elif isinstance(node, list):
        for idx, value in enumerate(node):
            yield from _walk_urls(value, path + (str(idx),))


def _fallback_id(record: dict[str, Any]) -> str:
    for url, _ in _walk_urls(record):
        stem = Path(urllib.parse.urlparse(url).path).stem
        if stem:
            return stem
    return "unknown"


def _parse_created_at(record: dict[str, Any]) -> float | None:
    for key in ("createdAt", "created_at", "created"):
        value = record.get(key)
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
            except ValueError:
                continue
    return None


def _slug(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-").lower() or "x"


# --------------------------------------------------------------------------
# 保存先の決定
# --------------------------------------------------------------------------


def target_path(out: Path, asset: Asset) -> Path:
    if asset.created_at is not None:
        dt = datetime.fromtimestamp(asset.created_at, tz=timezone.utc)
        day = dt.strftime("%Y-%m-%d")
        stamp = dt.strftime("%Y%m%d-%H%M%S")
    else:
        day = "undated"
        stamp = "00000000-000000"

    # マニフェストは外部から来た JSON なので、パスに使う成分は必ずサニタイズする。
    # id や type に "/" や ".." が混ざっていれば --out の外へ書けてしまう。
    ext = _guess_ext(asset.url)
    name = f"{stamp}_{_safe_name(asset.record_id)}{asset.suffix}{ext}"
    sub = "inputs" if asset.role == "input" else _safe_name(asset.media_type or "unknown")
    return out / "media" / sub / day / name


def _guess_ext(url: str) -> str:
    path = urllib.parse.urlparse(url).path
    ext = Path(path).suffix
    if ext and len(ext) <= 6:
        return ext
    return ""


# --------------------------------------------------------------------------
# ダウンロード
# --------------------------------------------------------------------------


def download(url: str, dest: Path, retries: int, timeout: int) -> tuple[int, str]:
    """dest へ原子的に保存し、(バイト数, 拡張子補正後のパス文字列) を返す。"""
    dest.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        tmp_fd, tmp_name = tempfile.mkstemp(dir=str(dest.parent), suffix=".part")
        os.close(tmp_fd)
        tmp = Path(tmp_name)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                final = dest
                if not final.suffix:
                    ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip()
                    ext = CONTENT_TYPE_EXT.get(ctype) or mimetypes.guess_extension(ctype) or ".bin"
                    final = dest.with_name(dest.name + ext)

                size = 0
                with tmp.open("wb") as fh:
                    while True:
                        chunk = resp.read(1 << 20)
                        if not chunk:
                            break
                        fh.write(chunk)
                        size += len(chunk)

            if size == 0:
                raise OSError("0 バイトしか受信できなかった")

            tmp.replace(final)
            return size, str(final)
        except Exception as exc:  # noqa: BLE001 - 何が来ても再試行したい
            last_error = exc
            tmp.unlink(missing_ok=True)
            if attempt < retries:
                time.sleep(min(2 ** attempt, 30))

    raise RuntimeError(f"{retries} 回試して失敗: {url} ({last_error})")


# --------------------------------------------------------------------------
# 状態管理
# --------------------------------------------------------------------------


def load_state(out: Path) -> dict[str, Any]:
    path = out / ".state.json"
    if path.is_file():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print("  ! .state.json が壊れている。最初から確認し直す。", file=sys.stderr)
    return {"downloaded": {}}


def save_state(out: Path, state: dict[str, Any]) -> None:
    path = out / ".state.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


# --------------------------------------------------------------------------
# メイン
# --------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Higgsfield の生成物とプロンプトをローカルへ退避する",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--manifest-dir",
        type=Path,
        required=True,
        help="MCP のページ応答 JSON を置いたディレクトリ",
    )
    parser.add_argument("--out", type=Path, required=True, help="退避先ディレクトリ")
    parser.add_argument(
        "--include-inputs",
        action="store_true",
        help="参照画像・入力画像も落とす (既定は出力のみ)",
    )
    parser.add_argument(
        "--include-thumbnails",
        action="store_true",
        help="minUrl 等のサムネイルも落とす (既定はスキップ)",
    )
    parser.add_argument("--workers", type=int, default=4, help="並列ダウンロード数 (既定 4)")
    parser.add_argument("--retries", type=int, default=4, help="1 URL あたりの再試行回数 (既定 4)")
    parser.add_argument("--timeout", type=int, default=120, help="HTTP タイムアウト秒 (既定 120)")
    parser.add_argument(
        "--dry-run", action="store_true", help="ダウンロードせず、対象の一覧と件数だけ出す"
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="今回落とす件数の上限。まず少数で動作と容量を確かめてから全件へ進むために使う",
    )
    parser.add_argument(
        "--allow-host",
        action="append",
        metavar="HOST",
        help="接続先をこのホストに限定する (複数指定可)。"
        "マニフェストは外部由来の JSON なので、取得先を明示的に縛りたいときに使う。"
        "未指定ならマニフェストに書かれた全ホストへ接続する",
    )
    args = parser.parse_args(argv)

    records = load_manifest_records(args.manifest_dir)
    if not records:
        print("マニフェストから生成レコードを1件も抽出できなかった。", file=sys.stderr)
        return 1

    print(f"生成レコード: {len(records)} 件")

    # メタデータ (プロンプト込み) は先に必ず書く。実体より軽く、価値が高い。
    meta_dir = args.out / "metadata"
    if not args.dry_run:
        meta_dir.mkdir(parents=True, exist_ok=True)
        for rec in records:
            rid = str(rec.get("id") or _fallback_id(rec))
            (meta_dir / f"{_safe_name(rid)}.json").write_text(
                json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        print(f"メタデータ: {len(records)} 件を {meta_dir} へ書き出し")

    assets: list[Asset] = []
    for rec in records:
        assets.extend(collect_assets(rec, args.include_inputs, args.include_thumbnails))
    print(f"ダウンロード対象 URL: {len(assets)} 件")

    hosts = sorted({urllib.parse.urlparse(a.url).hostname or "?" for a in assets})
    print(f"接続先ホスト: {', '.join(hosts)}")

    if args.allow_host:
        allowed = set(args.allow_host)
        kept = [a for a in assets if (urllib.parse.urlparse(a.url).hostname or "") in allowed]
        if len(kept) != len(assets):
            rejected = sorted(set(hosts) - allowed)
            print(
                f"--allow-host により {len(assets) - len(kept)} 件を除外 "
                f"(対象外ホスト: {', '.join(rejected)})"
            )
            assets = kept

    if args.dry_run:
        for asset in assets[:20]:
            print(f"  [{asset.role}] {target_path(args.out, asset)}  <- {asset.url}")
        if len(assets) > 20:
            print(f"  ... 他 {len(assets) - 20} 件")
        print("\n--dry-run のため実際のダウンロードは行っていない。")
        return 0

    state = load_state(args.out)
    done: dict[str, Any] = state.setdefault("downloaded", {})

    # URL -> レコード id の対応表。index を正確に組むために使う。
    url_owner: dict[str, str] = {a.url: a.record_id for a in assets}

    pending: list[tuple[Asset, Path]] = []
    skipped = 0
    for asset in assets:
        dest = target_path(args.out, asset)
        prior = done.get(asset.url)
        if prior and Path(prior.get("path", "")).is_file():
            skipped += 1
            continue
        if dest.is_file() and dest.stat().st_size > 0:
            done[asset.url] = {"path": str(dest), "bytes": dest.stat().st_size}
            skipped += 1
            continue
        pending.append((asset, dest))

    if skipped:
        print(f"取得済みのためスキップ: {skipped} 件")
    if not pending:
        print("新規のダウンロードなし。")
        save_state(args.out, state)
        write_index(args.out, records, done, url_owner)
        return 0

    if args.limit is not None and len(pending) > args.limit:
        print(f"--limit {args.limit} により {len(pending)} 件中 {args.limit} 件だけ取得する")
        pending = pending[: args.limit]

    print(f"これから取得: {len(pending)} 件 (並列 {args.workers})")

    lock = Lock()
    failures: list[tuple[str, str]] = []
    total_bytes = 0
    completed = 0

    def work(item: tuple[Asset, Path]) -> tuple[Asset, int, str]:
        asset, dest = item
        size, final = download(asset.url, dest, args.retries, args.timeout)
        return asset, size, final

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(work, item): item for item in pending}
        for future in as_completed(futures):
            asset, dest = futures[future]
            try:
                asset, size, final = future.result()
            except Exception as exc:  # noqa: BLE001 - 1件の失敗で全体を止めない
                with lock:
                    failures.append((asset.url, str(exc)))
                    completed += 1
                    print(f"  [{completed}/{len(pending)}] 失敗 {asset.url}\n      {exc}")
                continue

            with lock:
                done[asset.url] = {"path": final, "bytes": size}
                total_bytes += size
                completed += 1
                print(f"  [{completed}/{len(pending)}] {_human(size):>9}  {final}")
                if completed % 25 == 0:
                    save_state(args.out, state)

    save_state(args.out, state)
    write_index(args.out, records, done, url_owner)

    print(f"\n取得 {completed - len(failures)} 件 / 合計 {_human(total_bytes)}")
    print(f"保存先: {args.out.resolve()}")
    if failures:
        print(f"\n失敗 {len(failures)} 件 (再実行すれば続きから retry する):", file=sys.stderr)
        for url, err in failures[:10]:
            print(f"  - {url}\n      {err}", file=sys.stderr)
        if len(failures) > 10:
            print(f"  ... 他 {len(failures) - 10} 件", file=sys.stderr)
        return 2
    return 0


def write_index(
    out: Path,
    records: list[dict[str, Any]],
    done: dict[str, Any],
    url_owner: dict[str, str] | None = None,
) -> None:
    """index.jsonl (機械可読) と index.md (人間用) を書く。

    url_owner は URL からレコード id への正確な対応表。これが無いと
    ファイル名の部分文字列一致に頼ることになり、ある id が別の id の
    部分文字列だったときに両方へ紐づいてしまう。
    """
    owner = url_owner or {}
    by_record: dict[str, list[str]] = {}
    for url, info in done.items():
        if not isinstance(info, dict):
            continue
        rid = owner.get(url)
        if rid is None:
            continue
        by_record.setdefault(rid, []).append(str(info.get("path", "")))

    rows: list[dict[str, Any]] = []
    for rec in records:
        rid = str(rec.get("id") or _fallback_id(rec))
        created = _parse_created_at(rec)
        params = rec.get("params") if isinstance(rec.get("params"), dict) else {}
        if owner:
            paths = by_record.get(rid, [])
        else:
            # 対応表を渡されていない場合のみ、従来どおり名前で拾う。
            paths = [
                info["path"]
                for info in done.values()
                if isinstance(info, dict) and rid in str(info.get("path", ""))
            ]
        rows.append(
            {
                "id": rid,
                "type": rec.get("type"),
                "model": rec.get("model"),
                "created_at": created,
                "created_at_iso": (
                    datetime.fromtimestamp(created, tz=timezone.utc).isoformat()
                    if created
                    else None
                ),
                "prompt": params.get("prompt"),
                "files": sorted(paths),
                "metadata": f"metadata/{_safe_name(rid)}.json",
            }
        )

    rows.sort(key=lambda r: r.get("created_at") or 0, reverse=True)

    out.mkdir(parents=True, exist_ok=True)
    with (out / "index.jsonl").open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")

    lines = [
        "# Higgsfield 退避インデックス",
        "",
        f"生成 {len(rows)} 件 / ファイル {sum(len(r['files']) for r in rows)} 件",
        f"書き出し: {datetime.now(timezone.utc).isoformat()}",
        "",
        "| 日時 (UTC) | 種別 | モデル | ファイル | プロンプト冒頭 |",
        "|---|---|---|---|---|",
    ]
    for row in rows:
        prompt = (row.get("prompt") or "").replace("\n", " ").replace("|", "\\|")
        if len(prompt) > 100:
            prompt = prompt[:100] + "…"
        files = "<br>".join(Path(p).name for p in row["files"]) or "—"
        lines.append(
            f"| {row.get('created_at_iso') or '—'} "
            f"| {row.get('type') or '—'} "
            f"| {row.get('model') or '—'} "
            f"| {files} "
            f"| {prompt or '—'} |"
        )
    (out / "index.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"インデックス: {out / 'index.md'} / {out / 'index.jsonl'}")


def _safe_name(text: str) -> str:
    """パス成分として安全な名前にする。

    ドットは拡張子のために残すが、先頭のドットは落とす。そうしないと
    ".." がそのまま通り、区切り文字を潰しても親ディレクトリへ抜けられる。
    """
    name = re.sub(r"[^A-Za-z0-9._-]", "_", text)[:120].lstrip(".")
    return name or "unknown"


def _human(n: int) -> str:
    size = float(n)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} GB"


if __name__ == "__main__":
    sys.exit(main())
