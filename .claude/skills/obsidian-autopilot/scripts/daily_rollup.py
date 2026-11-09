#!/usr/bin/env python3
"""Morning Brief — Vault の方から「今日見るべきもの」を押し出す。

第二の脳が機能しない最大の理由は、こちらから思い出して取りに行く必要があることだ。
取りに行く必要があるなら、ゼロから考え直した方が速い。だから押し出す。

今日の Daily Note の冒頭に、次を書き込む:

- 期限切れ / 期限が近い Project
- next_action が無い active Project
- 14 日以上動いていない Project
- revisit 期限を迎えた Decision
- 滞留している Inbox
- 今日の再浮上ノート（長く触っていない知識を 1 件）

同じ日に二度実行しても重複しない。

    python3 daily_rollup.py --vault ~/MyVault
    python3 daily_rollup.py --vault ~/MyVault --stdout   # 書き込まず表示だけ
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from autopilot_lib import (  # noqa: E402
    append_under_heading, daily_note_path, ensure_daily_note, load_config,
)
from vault_search import FRONTMATTER_RE, markdown_files, parse_frontmatter  # noqa: E402

BRIEF_HEADING = "Morning Brief"
STALE_DAYS = 14
INBOX_STALE_DAYS = 14
RESURFACE_MIN_AGE_DAYS = 30


def iso(value: object) -> date | None:
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None


def load_notes(vault: Path) -> list[dict]:
    notes = []
    for path in markdown_files(vault):
        try:
            text = path.read_text(encoding="utf-8")
            stat = path.stat()
        except (OSError, UnicodeDecodeError):
            continue
        match = FRONTMATTER_RE.match(text)
        properties = parse_frontmatter(match.group(1)) if match else {}
        body = text[match.end():] if match else text
        notes.append({
            "path": path,
            "rel": path.relative_to(vault).as_posix(),
            "title": path.stem,
            "props": properties,
            "body": body,
            "mtime": datetime.fromtimestamp(stat.st_mtime).date(),
        })
    return notes


def get(note: dict, key: str) -> str:
    value = note["props"].get(key, "")
    return value.strip() if isinstance(value, str) else ""


def link(note: dict) -> str:
    return f"[[{note['title']}]]"


def build_brief(vault: Path, today: date) -> list[str]:
    notes = load_notes(vault)
    lines: list[str] = []

    projects = [n for n in notes if get(n, "type") == "project"]
    active = [n for n in projects if get(n, "status") == "active"]
    decisions = [n for n in notes if get(n, "type") == "decision"]

    # --- 期限
    overdue, soon = [], []
    for note in active:
        due = iso(note["props"].get("due"))
        if not due:
            continue
        if due < today:
            overdue.append((due, note))
        elif due <= today + timedelta(days=7):
            soon.append((due, note))

    if overdue:
        lines.append("**期限超過**")
        for due, note in sorted(overdue):
            lines.append(f"- {link(note)} — 期限 {due} ({(today - due).days}日超過)")
        lines.append("")
    if soon:
        lines.append("**今週が期限**")
        for due, note in sorted(soon):
            lines.append(f"- {link(note)} — 期限 {due}")
        lines.append("")

    # --- next_action の欠落は「止まる」最大の原因
    missing = [n for n in active if not get(n, "next_action")]
    if missing:
        lines.append("**next_action が無い（止まる）**")
        for note in missing:
            lines.append(f"- {link(note)}")
        lines.append("")

    # --- 停止
    stale = [
        n for n in active
        if (today - n["mtime"]).days >= STALE_DAYS and get(n, "next_action")
    ]
    if stale:
        lines.append(f"**{STALE_DAYS}日以上動いていない**")
        for note in sorted(stale, key=lambda n: n["mtime"]):
            days = (today - note["mtime"]).days
            lines.append(f"- {link(note)} — {days}日 / next: {get(note, 'next_action')}")
        lines.append("")

    # --- 決めっぱなしの回収
    due_decisions = []
    for note in decisions:
        revisit = iso(note["props"].get("revisit"))
        if revisit and revisit <= today:
            due_decisions.append((revisit, note))
    if due_decisions:
        lines.append("**見直し期限が来た判断**")
        for revisit, note in sorted(due_decisions):
            lines.append(f"- {link(note)} — revisit {revisit}")
        lines.append("")

    # --- Inbox 滞留
    inbox = [
        n for n in notes
        if get(n, "status") == "inbox" and (today - n["mtime"]).days >= INBOX_STALE_DAYS
    ]
    if inbox:
        oldest = sorted(inbox, key=lambda n: n["mtime"])[:5]
        lines.append(f"**Inbox に {len(inbox)} 件滞留**（古い順）")
        for note in oldest:
            lines.append(f"- {link(note)} — {(today - note['mtime']).days}日")
        lines.append("")

    # --- 再浮上: 長く触っていない知識を 1 件だけ
    # 日付で決定的に選ぶので、同じ日に何度実行しても同じノートが出る。
    candidates = [
        n for n in notes
        if get(n, "type") in {"note", "decision"}
        and (today - n["mtime"]).days >= RESURFACE_MIN_AGE_DAYS
    ]
    if candidates:
        candidates.sort(key=lambda n: n["rel"])
        seed = int(hashlib.sha256(today.isoformat().encode()).hexdigest(), 16)
        pick = candidates[seed % len(candidates)]
        lines.append("**今日の再浮上**")
        lines.append(f"- {link(pick)} — {(today - pick['mtime']).days}日ぶり")
        lines.append("")

    if not lines:
        lines = ["- 指摘なし。止まっている Project も期限切れの判断もありません。", ""]

    return lines


def main() -> int:
    parser = argparse.ArgumentParser(description="Write today's Morning Brief.")
    parser.add_argument("--vault", default=".")
    parser.add_argument("--stdout", action="store_true", help="書き込まず表示だけ")
    args = parser.parse_args()

    vault = Path(args.vault).expanduser().resolve()
    if not vault.is_dir():
        print(f"Not a directory: {vault}", file=sys.stderr)
        return 2

    today = date.today()
    lines = build_brief(vault, today)

    if args.stdout:
        print(f"## {BRIEF_HEADING}\n")
        print("\n".join(lines))
        return 0

    config = load_config(vault)
    path = daily_note_path(vault, config)
    ensure_daily_note(path)

    if BRIEF_HEADING in path.read_text(encoding="utf-8"):
        print(f"Already written today: {path.relative_to(vault)}")
        return 0

    append_under_heading(path, BRIEF_HEADING, lines)
    print(f"Wrote Morning Brief to {path.relative_to(vault)} ({len(lines)} lines)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
