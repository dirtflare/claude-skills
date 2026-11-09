#!/usr/bin/env python3
"""Vault が実際に役に立っているかを数字で出す。

ノート数は成果指標ではない。測るべきは「入ってきた量」ではなく
「戻ってきた量」である。

    python3 vault_stats.py --vault ~/MyVault
    python3 vault_stats.py --vault ~/MyVault --days 30
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from vault_search import FRONTMATTER_RE, markdown_files, parse_frontmatter  # noqa: E402

CAPTURE_RE = re.compile(r"^- \d{2}:\d{2} \*\*(Q|A)\*\* ", re.MULTILINE)


def get(properties: dict, key: str) -> str:
    value = properties.get(key, "")
    return value.strip() if isinstance(value, str) else ""


def has(properties: dict, key: str) -> bool:
    value = properties.get(key)
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return bool(value)
    return True


def pct(part: int, whole: int) -> str:
    return f"{(100 * part / whole):.0f}%" if whole else "—"


def main() -> int:
    parser = argparse.ArgumentParser(description="Report whether the vault is earning its keep.")
    parser.add_argument("--vault", default=".")
    parser.add_argument("--days", type=int, default=30)
    args = parser.parse_args()

    vault = Path(args.vault).expanduser().resolve()
    if not vault.is_dir():
        print(f"Not a directory: {vault}", file=sys.stderr)
        return 2

    today = date.today()
    window = today - timedelta(days=args.days)

    types: Counter[str] = Counter()
    captures = 0
    decisions, with_revisit, with_trigger = 0, 0, 0
    outputs, outputs_sourced = 0, 0
    notes_with_usewhen, total_notes = 0, 0
    recent_notes = 0
    inbox_ages: list[int] = []
    active_projects, stalled = 0, 0

    for path in markdown_files(vault):
        try:
            text = path.read_text(encoding="utf-8")
            mtime = datetime.fromtimestamp(path.stat().st_mtime).date()
        except (OSError, UnicodeDecodeError):
            continue

        match = FRONTMATTER_RE.match(text)
        properties = parse_frontmatter(match.group(1)) if match else {}
        note_type = get(properties, "type") or "untyped"
        types[note_type] += 1

        created = get(properties, "created")
        try:
            if created and date.fromisoformat(created[:10]) >= window:
                recent_notes += 1
        except ValueError:
            pass

        if note_type == "daily":
            captures += len(CAPTURE_RE.findall(text))
        elif note_type == "decision":
            decisions += 1
            if has(properties, "revisit"):
                with_revisit += 1
            if "## Reversal Trigger" in text:
                section = text.split("## Reversal Trigger", 1)[1].split("\n##", 1)[0]
                if section.strip():
                    with_trigger += 1
        elif note_type == "output":
            outputs += 1
            if has(properties, "source_notes"):
                outputs_sourced += 1
        elif note_type == "note":
            total_notes += 1
            if "## Use When" in text:
                section = text.split("## Use When", 1)[1].split("\n##", 1)[0]
                if section.strip():
                    notes_with_usewhen += 1
        elif note_type == "project" and get(properties, "status") == "active":
            active_projects += 1
            if (today - mtime).days >= 14:
                stalled += 1

        if get(properties, "status") == "inbox":
            inbox_ages.append((today - mtime).days)

    # --- 想起ログ
    recalls, recalled_paths = 0, Counter()
    cutoff = time.time() - args.days * 86400
    log = vault / "90_System" / ".recall_log.jsonl"
    if log.exists():
        for line in log.read_text(encoding="utf-8").splitlines():
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if record.get("ts", 0) < cutoff:
                continue
            recalls += 1
            for p in record.get("paths", []):
                recalled_paths[p] += 1

    total_md = sum(types.values())
    print(f"\n=== Vault Health — 直近 {args.days} 日 ===\n")
    print(f"ノート総数            {total_md}")
    print(f"  新規               {recent_notes}")
    for note_type, count in types.most_common():
        print(f"  {note_type:<17} {count}")

    print("\n--- 自動取り込み（勝手に溜まっているか）")
    print(f"Daily への自動記録     {captures} 行")

    print("\n--- 自動想起（Vault が戻してきたか）★最重要")
    print(f"想起が発火した回数     {recalls}")
    print(f"実際に浮上したノート   {len(recalled_paths)} 種")
    if recalled_paths:
        print("  よく効いたノート:")
        for path, count in recalled_paths.most_common(5):
            print(f"    {count:>3}回  {path}")
    elif recalls == 0:
        print("  ⚠ 0 回。フックが入っていないか、Vault に中身がまだ無い。")

    print("\n--- 知識が再利用される形になっているか")
    print(f"Evergreen             {total_notes}")
    print(f"  Use When あり        {notes_with_usewhen} ({pct(notes_with_usewhen, total_notes)})")
    print(f"Output                {outputs}")
    print(f"  既存ノート再利用     {outputs_sourced} ({pct(outputs_sourced, outputs)})  ← Output Conversion")

    print("\n--- 判断が追跡できるか")
    print(f"Decision              {decisions}")
    print(f"  revisit あり         {with_revisit} ({pct(with_revisit, decisions)})")
    print(f"  Reversal Trigger あり {with_trigger} ({pct(with_trigger, decisions)})")

    print("\n--- 詰まり")
    print(f"active Project        {active_projects}")
    print(f"  14日以上停止         {stalled}")
    if inbox_ages:
        print(f"Inbox 滞留            {len(inbox_ages)} 件 / 最古 {max(inbox_ages)} 日")
    else:
        print("Inbox 滞留            0 件")

    print("\n最重要指標はノート数ではない。想起の発火回数と Output Conversion である。\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
