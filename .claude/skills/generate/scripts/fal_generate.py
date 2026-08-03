#!/usr/bin/env python3
"""fal.ai の queue API を叩き、生成物をローカルへ保存する。

設計方針:

  - **予算を超えない。** 価格が分からないモデルは既定で実行を拒否する。
    見積もりを出し、--budget を超えるなら送信前に止める。
  - **モデル非依存。** submit 応答が返す status_url / response_url を
    そのまま使い、結果 JSON は再帰的に URL を走査する。モデルごとの
    出力スキーマを知らなくても 600+ モデルで動く。
  - **ローカルが正。** 生成物とプロンプトを higgsfield_export.py と
    同じレイアウトへ落とし、単一のローカルライブラリに合流させる。

必要な環境変数:
    FAL_KEY     fal.ai のダッシュボードで発行した API キー

使い方:
    export FAL_KEY=xxxxxxxx

    # まず見積もりだけ (API を呼ばない)
    python3 fal_generate.py --model fal-ai/flux/dev --prompt "a cat" -n 4 --dry-run

    # 予算を明示して実行
    python3 fal_generate.py --model fal-ai/flux/dev --prompt "a cat" -n 4 --budget 0.50

    # 任意の入力 JSON を渡す (モデル固有パラメータ)
    python3 fal_generate.py --model fal-ai/flux/dev \\
        --input '{"prompt":"a cat","image_size":"landscape_16_9","num_images":2}' \\
        --budget 0.20

価格表は references/pricing.json。fal は API で課金額を返さないため、
ここの値が唯一の防波堤になる。実際の請求はダッシュボードで必ず突き合わせること。

標準ライブラリのみ。依存パッケージなし。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

QUEUE_BASE = "https://queue.fal.run"
USER_AGENT = "fal-generate/1.0 (+local archival)"

DEFAULT_PRICING = Path(__file__).resolve().parent.parent / "references" / "pricing.json"

TERMINAL_OK = {"COMPLETED"}
TERMINAL_BAD = {"FAILED", "CANCELLED", "ERROR"}

URL_RE = re.compile(r"^https?://", re.IGNORECASE)


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------


def api(
    url: str, key: str, method: str = "GET", payload: dict[str, Any] | None = None, timeout: int = 120
) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Key {key}")
    req.add_header("User-Agent", USER_AGENT)
    if data is not None:
        req.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:2000]
        raise SystemExit(f"fal API が {exc.code} を返した ({method} {url}):\n{detail}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"fal API へ到達できない ({method} {url}): {exc.reason}") from exc

    if not body.strip():
        return {}
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"fal API の応答が JSON ではない: {body[:500]}") from exc


# --------------------------------------------------------------------------
# 価格と予算
# --------------------------------------------------------------------------


def load_pricing(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"価格表が壊れている ({path}): {exc}") from exc


def unit_price(pricing: dict[str, Any], model: str) -> float | None:
    """モデルの 1 出力あたり単価 (USD)。完全一致 → 前方一致の順に探す。"""
    models = pricing.get("models", {})
    if model in models:
        return _price_of(models[model])
    # fal-ai/flux/dev に対して fal-ai/flux のエントリを拾う。
    best: tuple[int, float] | None = None
    for key, value in models.items():
        if model.startswith(key + "/"):
            price = _price_of(value)
            if price is not None and (best is None or len(key) > best[0]):
                best = (len(key), price)
    return best[1] if best else None


def _price_of(entry: Any) -> float | None:
    if isinstance(entry, (int, float)):
        return float(entry)
    if isinstance(entry, dict):
        for key in ("usd_per_output", "usd", "price"):
            value = entry.get(key)
            if isinstance(value, (int, float)):
                return float(value)
    return None


def count_outputs(payload: dict[str, Any]) -> int:
    """入力から出力枚数を推定する。分からなければ 1。"""
    for key in ("num_images", "n", "batch_size", "num_outputs"):
        value = payload.get(key)
        if isinstance(value, int) and value > 0:
            return value
    return 1


# --------------------------------------------------------------------------
# 結果の取り出し
# --------------------------------------------------------------------------


def walk_urls(node: Any, path: tuple[str, ...] = ()) -> Iterator[tuple[str, tuple[str, ...]]]:
    if isinstance(node, str):
        if URL_RE.match(node):
            yield node, path
    elif isinstance(node, dict):
        for key, value in node.items():
            yield from walk_urls(value, path + (str(key),))
    elif isinstance(node, list):
        for idx, value in enumerate(node):
            yield from walk_urls(value, path + (str(idx),))


def download(url: str, dest: Path, timeout: int = 300) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    tmp = dest.with_suffix(dest.suffix + ".part")
    size = 0
    with urllib.request.urlopen(req, timeout=timeout) as resp, tmp.open("wb") as fh:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            fh.write(chunk)
            size += len(chunk)
    tmp.replace(dest)
    return size


# --------------------------------------------------------------------------
# メイン
# --------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="fal.ai で生成し、結果をローカルへ保存する",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--model", required=True, help="fal のモデル ID (例 fal-ai/flux/dev)")
    parser.add_argument("--prompt", help="プロンプト。--input の簡易版")
    parser.add_argument("--input", help="モデルへ渡す入力 JSON (文字列 or @ファイルパス)")
    parser.add_argument("-n", "--num", type=int, help="生成枚数 (入力の num_images に載せる)")
    parser.add_argument(
        "--budget",
        type=float,
        help="この実行で許容する上限 USD。見積もりが超えたら送信せず終了する",
    )
    parser.add_argument(
        "--assume-cost",
        type=float,
        help="価格表に無いモデルの 1 出力あたり単価を明示する (USD)",
    )
    parser.add_argument("--pricing", type=Path, default=DEFAULT_PRICING, help="価格表 JSON")
    parser.add_argument(
        "--out", type=Path, default=Path("generations"), help="保存先 (既定 ./generations)"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="見積もりと送信内容だけ出し、API を呼ばない"
    )
    parser.add_argument("--timeout", type=int, default=900, help="完了待ちの上限秒 (既定 900)")
    parser.add_argument("--poll", type=float, default=2.0, help="ポーリング間隔秒 (既定 2)")
    args = parser.parse_args(argv)

    # ---- 入力の組み立て ------------------------------------------------
    payload: dict[str, Any] = {}
    if args.input:
        raw = args.input
        if raw.startswith("@"):
            raw = Path(raw[1:]).read_text(encoding="utf-8")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"--input が JSON として読めない: {exc}") from exc
        if not isinstance(payload, dict):
            raise SystemExit("--input はオブジェクト形式の JSON であること")
    if args.prompt:
        payload["prompt"] = args.prompt
    if args.num is not None:
        payload["num_images"] = args.num
    if not payload:
        raise SystemExit("--prompt か --input のどちらかは必要")

    # ---- 見積もり (ハードルール: 送信前に必ず出す) ----------------------
    pricing = load_pricing(args.pricing)
    per_output = args.assume_cost if args.assume_cost is not None else unit_price(pricing, args.model)
    outputs = count_outputs(payload)

    print(f"モデル      : {args.model}")
    print(f"出力数      : {outputs}")

    if per_output is None:
        print("単価        : 不明", file=sys.stderr)
        print(
            f"\n中止: {args.model} の単価が価格表 ({args.pricing}) に無い。\n"
            "価格が分からないまま課金される実行は許可しない。次のどちらかを行うこと:\n"
            f"  1. {args.pricing} に該当モデルの単価を追記する\n"
            "  2. --assume-cost <USD> で 1 出力あたりの単価を明示する\n"
            "単価は https://fal.ai/models/<model> の価格表記で確認できる。",
            file=sys.stderr,
        )
        return 3

    estimate = per_output * outputs
    source = "--assume-cost" if args.assume_cost is not None else str(args.pricing.name)
    print(f"単価        : ${per_output:.4f} / 出力  ({source})")
    print(f"見積もり    : ${estimate:.4f}")

    if args.budget is not None:
        print(f"予算        : ${args.budget:.4f}")
        if estimate > args.budget:
            print(
                f"\n中止: 見積もり ${estimate:.4f} が予算 ${args.budget:.4f} を超えている。"
                "\n枚数を減らすか、--budget を明示的に引き上げること。",
                file=sys.stderr,
            )
            return 4
    else:
        print("予算        : 未指定 (--budget の指定を推奨)")

    print("\n送信する入力:")
    print(json.dumps(payload, ensure_ascii=False, indent=2)[:2000])

    if args.dry_run:
        print("\n--dry-run のため送信していない。")
        return 0

    key = os.environ.get("FAL_KEY", "").strip()
    if not key:
        raise SystemExit("FAL_KEY が未設定。export FAL_KEY=... してから実行すること。")

    # ---- 送信 ----------------------------------------------------------
    submit_url = f"{QUEUE_BASE}/{args.model.strip('/')}"
    print(f"\n送信中: {submit_url}")
    submitted = api(submit_url, key, method="POST", payload=payload)

    request_id = submitted.get("request_id")
    if not request_id:
        raise SystemExit(f"submit 応答に request_id が無い: {json.dumps(submitted)[:500]}")
    print(f"request_id: {request_id}")

    # 応答が返す URL をそのまま使う。自前で組み立てるとサブパス付きモデルで壊れる。
    status_url = submitted.get("status_url")
    response_url = submitted.get("response_url")
    if not status_url or not response_url:
        base = _base_model(args.model)
        status_url = status_url or f"{QUEUE_BASE}/{base}/requests/{request_id}/status"
        response_url = response_url or f"{QUEUE_BASE}/{base}/requests/{request_id}"

    # ---- 完了待ち ------------------------------------------------------
    deadline = time.time() + args.timeout
    status = ""
    while True:
        info = api(status_url, key)
        status = str(info.get("status") or "").upper()
        queue_pos = info.get("queue_position")
        suffix = f" (待ち {queue_pos})" if queue_pos not in (None, 0) else ""
        print(f"  状態: {status or '不明'}{suffix}")

        if status in TERMINAL_OK:
            break
        if status in TERMINAL_BAD:
            raise SystemExit(f"生成に失敗した: {json.dumps(info, ensure_ascii=False)[:1000]}")
        if time.time() > deadline:
            raise SystemExit(
                f"{args.timeout} 秒待っても完了しなかった。request_id={request_id}\n"
                f"後から取得する場合: curl -H 'Authorization: Key $FAL_KEY' {response_url}"
            )
        time.sleep(args.poll)

    result = api(response_url, key)

    # ---- 保存 ----------------------------------------------------------
    now = datetime.now(timezone.utc)
    day = now.strftime("%Y-%m-%d")
    stamp = now.strftime("%Y%m%d-%H%M%S")
    short = str(request_id)[:8]

    saved: list[str] = []
    for idx, (url, path) in enumerate(walk_urls(result)):
        ext = Path(urllib.parse.urlparse(url).path).suffix or ".bin"
        tag = "" if idx == 0 else f"_{idx}"
        dest = args.out / "media" / "fal" / day / f"{stamp}_{short}{tag}{ext}"
        try:
            size = download(url, dest)
        except Exception as exc:  # noqa: BLE001 - 1件落とせなくても他は残す
            print(f"  ! ダウンロード失敗 {url}: {exc}", file=sys.stderr)
            continue
        saved.append(str(dest))
        print(f"  保存: {dest} ({size / 1024:.0f} KB)")
        _ = path  # キー列は今は使わないが walk_urls の契約として残す

    record = {
        "provider": "fal.ai",
        "model": args.model,
        "request_id": request_id,
        "created_at": now.timestamp(),
        "created_at_iso": now.isoformat(),
        "prompt": payload.get("prompt"),
        "input": payload,
        "result": result,
        "files": saved,
        "estimated_usd": round(estimate, 6),
        "unit_price_usd": per_output,
        "budget_usd": args.budget,
    }

    meta_dir = args.out / "metadata"
    meta_dir.mkdir(parents=True, exist_ok=True)
    (meta_dir / f"fal_{short}_{stamp}.json").write_text(
        json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    ledger = args.out / "ledger.jsonl"
    with ledger.open("a", encoding="utf-8") as fh:
        fh.write(
            json.dumps(
                {
                    "ts": now.isoformat(),
                    "provider": "fal.ai",
                    "model": args.model,
                    "request_id": request_id,
                    "outputs": len(saved),
                    "estimated_usd": round(estimate, 6),
                },
                ensure_ascii=False,
            )
            + "\n"
        )

    print(f"\n保存 {len(saved)} 件 / 見積もり ${estimate:.4f}")
    print(f"台帳: {ledger}")
    if not saved:
        print("警告: 結果 JSON から URL を取り出せなかった。metadata の result を確認すること。", file=sys.stderr)
        return 5
    return 0


def _base_model(model: str) -> str:
    """ステータス取得用のベースモデル ID。fal-ai/flux/dev -> fal-ai/flux"""
    parts = model.strip("/").split("/")
    return "/".join(parts[:2]) if len(parts) > 2 else "/".join(parts)


if __name__ == "__main__":
    sys.exit(main())
