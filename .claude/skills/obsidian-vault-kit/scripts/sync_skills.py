#!/usr/bin/env python3
"""Skill の原本を各エージェントの探索パスへ同期する。

Agent Skills はオープン標準（SKILL.md + 任意の scripts/ references/ assets/）
だが、**探索パスはクライアントごとに異なる**。
Claude 用に .claude/skills/ へ置いただけでは、他エージェントからは見えない。

そこで原本を 90_System/AgentSkills/ に一本化し、ここから配る。

    python3 sync_skills.py --vault ~/MyVault --dry-run
    python3 sync_skills.py --vault ~/MyVault
    python3 sync_skills.py --vault ~/MyVault --dest .cursor/skills

同期先は上書きされる（原本が常に正）。同期先を手で編集しないこと。
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

DEFAULT_DESTINATIONS = [
    ".claude/skills",   # Claude Code
    ".agents/skills",   # Agent Skills 標準パスとして広く使われる
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync skills to agent directories.")
    parser.add_argument("--vault", default=".", help="Vault root (default: cwd)")
    parser.add_argument(
        "--source",
        default="90_System/AgentSkills",
        help="Skill 原本のディレクトリ (default: 90_System/AgentSkills)",
    )
    parser.add_argument(
        "--dest",
        action="append",
        help="同期先。複数指定可。省略時は .claude/skills と .agents/skills",
    )
    parser.add_argument("--dry-run", action="store_true", help="Show what would change")
    args = parser.parse_args()

    vault = Path(args.vault).expanduser().resolve()
    source = vault / args.source

    if not source.is_dir():
        print(f"Missing skill source directory: {source}", file=sys.stderr)
        return 1

    skills = sorted(p for p in source.iterdir() if p.is_dir() and not p.name.startswith("."))
    if not skills:
        print(f"No skills found under: {source}", file=sys.stderr)
        return 1

    # SKILL.md の欠落は、同期前に全部まとめて弾く。
    invalid = [s for s in skills if not (s / "SKILL.md").exists()]
    if invalid:
        for skill in invalid:
            print(f"Missing SKILL.md: {skill.relative_to(vault)}", file=sys.stderr)
        return 1

    destinations = [vault / d for d in (args.dest or DEFAULT_DESTINATIONS)]
    synced = 0

    for destination_root in destinations:
        for skill in skills:
            destination = destination_root / skill.name
            action = "would sync" if args.dry_run else "synced"
            print(
                f"{action}: {skill.relative_to(vault)} -> "
                f"{destination.relative_to(vault)}"
            )
            synced += 1

            if args.dry_run:
                continue

            destination_root.mkdir(parents=True, exist_ok=True)
            if destination.exists():
                shutil.rmtree(destination)
            shutil.copytree(skill, destination)

    verb = "Would sync" if args.dry_run else "Synced"
    print(f"\n{verb} {len(skills)} skill(s) to {len(destinations)} destination(s).")

    if not args.dry_run:
        print(
            "\n注意: 同期先は上書きされる。編集は "
            f"{args.source}/ の原本に対して行うこと。"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
