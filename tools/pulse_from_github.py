#!/usr/bin/env python3
"""GitHub 上の動きを、会社の稼働記録として取り込む。

ブラウザ版（claude.ai/code）のセッションは、それぞれ別のコンテナで動く。
別セッションの作業は手元のファイルには届かないが、**GitHub には届く**。
そこで、コミットやPRを担当部署の記録に落として、オフィスビューに反映させる。

使い方（セッションが GitHub MCP で取ってきた結果を流し込む）:

    echo '[{"repo":"owner/app","sha":"abc1234","when":"2026-08-06T04:15:29Z",
            "title":"Add login screen","files":["src/App.tsx"],"kind":"commit"}]' \\
      | python3 tools/pulse_from_github.py

    python3 tools/pulse_from_github.py --seen      # 取り込み済みの識別子を出す
    python3 tools/pulse_from_github.py --dry-run

同じ sha / PR番号は二度書かない。書き込みは追記のみ。
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPANY = Path(__file__).resolve().parent.parent / "company"
SEEN = COMPANY / ".state" / "github_seen.json"

# 触ったファイルから担当部署を決める。当たらなければ dev（開発部）。
PATH_RULES = [
    ("video", ["renders/", "frames/", ".mp4", "hyperframes"]),
    ("sns", ["x-post", "social/", "posts/"]),
    ("audio", [".mp3", ".wav", "audio/", "suno"]),
    ("design", [".svg", ".png", ".jpg", ".css", "styles/", "assets/", "figma", "canva"]),
    ("docs", [".md", "docs/", "readme"]),          # 上のどれにも当たらない .md だけ資料部
]
DEFAULT_DEPT = "dev"


def dept_for(files: list[str]) -> str:
    for dept, hints in PATH_RULES:
        if (COMPANY / "departments" / dept).is_dir():
            if files and all(any(h in f.lower() for h in hints) for f in files):
                return dept
    return DEFAULT_DEPT if (COMPANY / "departments" / DEFAULT_DEPT).is_dir() else "secretary"


def load_seen() -> set[str]:
    try:
        return set(json.loads(SEEN.read_text(encoding="utf-8")))
    except Exception:
        return set()


def save_seen(seen: set[str]) -> None:
    SEEN.parent.mkdir(parents=True, exist_ok=True)
    SEEN.write_text(json.dumps(sorted(seen), ensure_ascii=False, indent=0), encoding="utf-8")


def log_file(dept: str, day: str) -> Path:
    base = COMPANY / "secretary" if dept == "secretary" else COMPANY / "departments" / dept
    return base / "logs" / f"{day}.md"


def append(dept: str, when: dt.datetime, kind: str, title: str, body: str, dry: bool) -> None:
    day, time = when.strftime("%Y-%m-%d"), when.strftime("%H:%M")
    if dry:
        print(f"  + {dept:<10} {day} {time} [{kind}] {title}")
        return
    path = log_file(dept, day)
    path.parent.mkdir(parents=True, exist_ok=True)
    head = "" if path.exists() else f"# {day}\n"
    with path.open("a", encoding="utf-8") as f:
        f.write(head + f"\n## {time} [{kind}] {title}\n{body}\n")


def parse_when(value: str) -> dt.datetime:
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone()
    except Exception:
        return dt.datetime.now()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--seen", action="store_true", help="取り込み済みの識別子を出して終わる")
    args = ap.parse_args()

    if args.seen:
        print(json.dumps(sorted(load_seen()), ensure_ascii=False))
        return

    try:
        events = json.load(sys.stdin)
    except Exception as exc:
        print(f"入力を読めませんでした: {exc}", file=sys.stderr)
        sys.exit(1)
    if isinstance(events, dict):
        events = events.get("events", [])

    seen = load_seen()
    added = 0
    for e in events:
        repo = e.get("repo", "?")
        ident = f"{repo}@{e.get('sha') or e.get('number') or e.get('title')}"
        if ident in seen:
            continue
        files = e.get("files") or []
        dept = e.get("dept") or dept_for(files)
        title = re.sub(r"\s+", " ", (e.get("title") or "")).strip()[:80]
        product = repo.split("/")[-1]
        if e.get("kind") == "pr":
            head = f"PR #{e.get('number')} {e.get('state', '')}: {title}"
        else:
            head = f"{product}: {title}"
        body = f"リポジトリ {repo}"
        if e.get("sha"):
            body += f" / commit {str(e['sha'])[:7]}"
        if files:
            body += f" / 触ったファイル {len(files)} 件（{files[0]} ほか）"
        body += "。GitHub の動きから取り込み。"
        append(dept, parse_when(e.get("when", "")), "作業", head, body, args.dry_run)
        seen.add(ident)
        added += 1

    if not args.dry_run:
        save_seen(seen)
    print(f"取り込み {added} 件（既知 {len(seen) - added} 件）")


if __name__ == "__main__":
    main()
