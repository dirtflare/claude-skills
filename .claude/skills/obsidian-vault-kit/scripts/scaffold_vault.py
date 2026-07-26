#!/usr/bin/env python3
"""Obsidian Vault の骨組みを作る。

既存ファイルは**上書きしない**。既存 Vault に対して実行すると、
足りないものだけを足す。

    python3 scaffold_vault.py --vault ~/MyVault --dry-run
    python3 scaffold_vault.py --vault ~/MyVault
    python3 scaffold_vault.py --vault ~/MyVault --no-agent-config
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

FOLDERS = [
    "00_Inbox/AI",
    "00_Inbox/Clippings",
    "10_Daily",
    "20_Projects",
    "30_Areas",
    "40_Notes/MOCs",
    "50_Sources",
    "60_Entities/People",
    "60_Entities/Companies",
    "60_Entities/Products",
    "70_Outputs/Drafts",
    "70_Outputs/Published",
    "80_Assets",
    "90_System/Templates",
    "90_System/Bases",
    "90_System/Schemas",
    "90_System/AgentSkills",
    "90_System/Metrics",
    "99_Archive",
    "scripts",
]

# --- Templates -------------------------------------------------------------

TEMPLATE_DAILY = """---
type: daily
created: "{{date:YYYY-MM-DD}}"
status: active
---

# {{date:YYYY-MM-DD}}

## 今日の勝ち筋

- [ ] 今日これだけは終わらせる：
- [ ] 二番目：
- [ ] 三番目：

## Timeline

- {{time:HH:mm}}

## Decisions

-

## Captures

-

## Friction Log

- 何を探したが、見つからなかったか：
- どの作業で認知負荷が高かったか：

## End of Day

- [ ] 独立して残す内容を Inbox または Notes へ移した
- [ ] 重要な判断を Decision Note にした
- [ ] 明日の最初の行動を決めた
"""

TEMPLATE_PROJECT = """---
type: project
created: "{{date:YYYY-MM-DD}}"
status: active
owner: me
area:
due:
next_action:
topics: []
sensitivity: internal
---

# {{title}}

## Outcome

このプロジェクトが完了したと判断できる状態を書く。

## Why Now

なぜ今やるのか。やらない場合のコストは何か。

## Constraints

- 期限：
- 予算：
- 人員：
- やらないこと：

## Current State

現在地を三行以内で説明する。

## Next Actions

- [ ]

## Decisions

-

## Key People

-

## Sources

-

## Risks

-

## Log

### {{date:YYYY-MM-DD}}

-
"""

TEMPLATE_DECISION = """---
type: decision
created: "{{date:YYYY-MM-DD}}"
status: active
project:
owner: me
revisit:
confidence: medium
sensitivity: internal
---

# {{title}}

## Decision

何を決めたかを一文で書く。

## Context

この判断が必要になった背景。

## Options Considered

### Option A

利点：
欠点：

### Option B

利点：
欠点：

### Do Nothing

何もしない場合に起きること：

## Why This Option

この選択肢を選んだ理由。

## Evidence

- 確認できている事実：
- 使用したデータ：
- 関連 Source：

## Assumptions

- まだ検証できていない前提：

## Reversal Trigger

何が起きたら、この判断を撤回または変更するか。

## Expected Signal

判断が正しければ、どの指標が、いつ、どう変化するはずか。

## Follow-up

- [ ]

## Related

-
"""

TEMPLATE_SOURCE = """---
type: source
created: "{{date:YYYY-MM-DD}}"
status: inbox
source_url:
author:
published:
topics: []
confidence: medium
sensitivity: internal
---

# {{title}}

## Source Summary

著者・発言者が主張している内容を、自分の評価と分離して書く。

## Claims

1.
2.
3.

## Evidence Presented

-

## My Interpretation

-

## Counterarguments

-

## What Changes If True

この内容が正しい場合、何を変えるべきか。

## Promote

- [ ] Evergreen Note にする
- [ ] Decision に反映する
- [ ] Project に反映する
- [ ] Output で使う
- [ ] 保存せず破棄する

## Related

-
"""

TEMPLATE_EVERGREEN = """---
type: note
created: "{{date:YYYY-MM-DD}}"
status: active
topics: []
source_notes: []
confidence: medium
sensitivity: internal
---

# {{title}}

## Claim

このノートで主張すること。

## Explanation

自分の言葉で説明する。

## Why It Matters

意思決定や行動へどう影響するか。

## Evidence

-

## Counterevidence

-

## Use When

どのような状況でこのノートを参照するか。

## Examples

-

## Related

-

## Possible Outputs

-
"""

TEMPLATE_MEETING = """---
type: meeting
created: "{{date:YYYY-MM-DD}}"
status: inbox
project:
attendees: []
sensitivity: internal
---

# {{title}}

## Purpose

この会議で決めたかったこと。

## Raw Log

- {{time:HH:mm}}

## Decisions Made

-

## Open Questions

-

## Action Items

- [ ]

## My Interpretation

-
"""

TEMPLATE_MOC = """---
type: note
created: "{{date:YYYY-MM-DD}}"
status: active
aliases: []
topics: []
---

# MOC {{title}}

## Current Thesis

現時点での自分の結論を三〜五行で書く。

## Core Principles

1.
2.
3.

## Evidence

-

## Counterarguments

-

## Open Questions

-

## Decisions

-

## Outputs

-
"""

# --- Bases -----------------------------------------------------------------

BASE_PROJECTS = """filters:
  and:
    - 'file.ext == "md"'
    - 'type == "project"'

formulas:
  missing_next_action: 'if(!next_action, "⚠ next action なし", "")'
  stale: 'if(file.mtime < now() - "14d", "14日以上更新なし", "")'

properties:
  file.name:
    displayName: Project
  owner:
    displayName: Owner
  next_action:
    displayName: Next Action
  due:
    displayName: Due
  formula.missing_next_action:
    displayName: Health
  formula.stale:
    displayName: Stale

views:
  - type: table
    name: Active
    filters:
      and:
        - 'status == "active"'
    order:
      - file.name
      - owner
      - next_action
      - due
      - formula.missing_next_action
      - formula.stale

  - type: table
    name: Waiting
    filters:
      and:
        - 'status == "waiting"'
    order:
      - file.name
      - owner
      - next_action

  - type: table
    name: Overdue
    filters:
      and:
        - 'status == "active"'
        - 'due'
        - 'due < today()'
    order:
      - file.name
      - due
      - next_action
"""

BASE_DECISIONS = """filters:
  and:
    - 'file.ext == "md"'
    - 'type == "decision"'

formulas:
  review_state: 'if(revisit <= today(), "要レビュー", "")'
  no_revisit: 'if(!revisit, "⚠ revisit 未設定", "")'

properties:
  file.name:
    displayName: Decision
  project:
    displayName: Project
  revisit:
    displayName: Revisit
  confidence:
    displayName: Confidence
  formula.review_state:
    displayName: Review

views:
  - type: table
    name: Revisit Due
    filters:
      and:
        - 'revisit'
        - 'revisit <= today()'
    order:
      - file.name
      - project
      - revisit
      - confidence
      - formula.review_state

  - type: table
    name: Missing Revisit
    filters:
      and:
        - 'status == "active"'
        - '!revisit'
    order:
      - file.name
      - project
      - created
"""

BASE_INBOX = """filters:
  and:
    - 'file.ext == "md"'
    - 'status == "inbox"'

formulas:
  age: 'if(file.ctime < now() - "14d", "⚠ 14日以上滞留", "")'

properties:
  file.name:
    displayName: Note
  type:
    displayName: Type
  file.ctime:
    displayName: Captured
  formula.age:
    displayName: Age

views:
  - type: table
    name: Oldest First
    order:
      - file.ctime
      - file.name
      - type
      - formula.age
"""

BASE_OUTPUTS = """filters:
  and:
    - 'file.ext == "md"'
    - 'type == "output"'

formulas:
  reused: 'if(!source_notes, "⚠ 既存ノート未再利用", "")'

properties:
  file.name:
    displayName: Output
  status:
    displayName: Status
  project:
    displayName: Project
  formula.reused:
    displayName: Reuse

views:
  - type: table
    name: Drafts
    filters:
      and:
        - 'status != "done"'
    order:
      - file.name
      - status
      - project
      - formula.reused

  - type: table
    name: Published
    filters:
      and:
        - 'status == "done"'
    order:
      - file.name
      - project
      - file.mtime
"""

# --- Agent contract --------------------------------------------------------

VAULT_CONTRACT = """# Vault Operating Contract

This repository is an Obsidian vault whose source of truth is Markdown.

## Language and format

- Write prose in Japanese unless explicitly requested otherwise.
- Use ASCII snake_case for property names.
- Use ISO dates: YYYY-MM-DD.
- Preserve valid YAML frontmatter.
- Quote Wikilinks used inside properties.

## Safety

- Default to dry-run for bulk work.
- Never delete, rename, move, or overwrite files without explicit approval.
- For moves and renames, prefer Obsidian CLI so internal links can be updated.
- Never fabricate sources, quotes, evidence, dates, or links.
- Separate observed facts, source claims, model inference, and decisions.
- Do not read or edit notes under 90_Private/.
- Do not process notes with `sensitivity: never_ai`.

## Writing locations

- Put unreviewed AI drafts in `00_Inbox/AI/`.
- Put approved output drafts in `70_Outputs/Drafts/`.
- Do not directly promote AI-generated text to `40_Notes/` without review.

## Schema

Before creating or editing typed notes, read:

- `90_System/Schemas/note-types.md`
- `90_System/Schemas/property-vocabulary.md`

## Validation

Before edits:

1. Run `git status`.
2. State which files will change.

After edits:

1. Run `python3 scripts/vault_check.py --vault .`
2. Run `git diff --check`.
3. Summarize changed files, assumptions, and unresolved issues.
"""

GITIGNORE = """.DS_Store
Thumbs.db
.trash/

# 開くたびに変化するため除外
.obsidian/workspace.json
.obsidian/workspaces.json

90_Private/
*.tmp
"""

CLAUDE_SETTINGS = """{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "deny": [
      "Read(./90_Private/**)",
      "Read(./**/.env)",
      "Read(./**/.env.*)",
      "Read(./secrets/**)",
      "Read(./credentials/**)"
    ],
    "ask": [
      "Bash(git push *)",
      "Bash(rm *)",
      "Bash(obsidian delete *)"
    ]
  }
}
"""

CODEX_CONFIG = """sandbox_mode = "workspace-write"
approval_policy = "on-request"

[sandbox_workspace_write]
network_access = false
writable_roots = []
"""

README_INBOX = """---
type: inbox
created: 2026-01-01
status: inbox
---

# Inbox

ここでは整理しない。タグも原則不要。**とにかく保存する**ための場所。

分類は保存時ではなく、再利用価値が確認された昇格時に行う。

週次レビューで古い順に処理し、各入力を次のどれかにする:
Delete / Archive / Project / Source / Evergreen / Decision / Output
"""

FILES = {
    "90_System/Templates/Daily.md": TEMPLATE_DAILY,
    "90_System/Templates/Project.md": TEMPLATE_PROJECT,
    "90_System/Templates/Decision.md": TEMPLATE_DECISION,
    "90_System/Templates/Source.md": TEMPLATE_SOURCE,
    "90_System/Templates/Evergreen.md": TEMPLATE_EVERGREEN,
    "90_System/Templates/Meeting.md": TEMPLATE_MEETING,
    "90_System/Templates/MOC.md": TEMPLATE_MOC,
    "90_System/Bases/Projects.base": BASE_PROJECTS,
    "90_System/Bases/Decisions.base": BASE_DECISIONS,
    "90_System/Bases/Inbox.base": BASE_INBOX,
    "90_System/Bases/Outputs.base": BASE_OUTPUTS,
    "00_Inbox/README.md": README_INBOX,
    "CLAUDE.md": VAULT_CONTRACT,
    "AGENTS.md": VAULT_CONTRACT,
    ".gitignore": GITIGNORE,
}

AGENT_CONFIG_FILES = {
    ".claude/settings.json": CLAUDE_SETTINGS,
    ".codex/config.toml": CODEX_CONFIG,
}

# Schema ドキュメントは、このスキルの references/ からコピーする。
SCHEMA_SOURCES = {
    "note-types.md": "90_System/Schemas/note-types.md",
    "property-vocabulary.md": "90_System/Schemas/property-vocabulary.md",
}

SCRIPT_SOURCES = {
    "vault_check.py": "scripts/vault_check.py",
    "sync_skills.py": "scripts/sync_skills.py",
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Scaffold an Obsidian vault.")
    parser.add_argument("--vault", required=True, help="Vault root directory")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change")
    parser.add_argument(
        "--no-agent-config",
        action="store_true",
        help="Skip .claude/settings.json and .codex/config.toml",
    )
    args = parser.parse_args()

    vault = Path(args.vault).expanduser().resolve()
    skill_dir = Path(__file__).resolve().parents[1]

    created: list[str] = []
    skipped: list[str] = []

    def write(relative: str, content: str) -> None:
        target = vault / relative
        if target.exists():
            skipped.append(relative)
            return
        created.append(relative)
        if args.dry_run:
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    # フォルダ
    for folder in FOLDERS:
        path = vault / folder
        if path.is_dir():
            continue
        created.append(f"{folder}/")
        if not args.dry_run:
            path.mkdir(parents=True, exist_ok=True)
            gitkeep = path / ".gitkeep"
            if not any(path.iterdir()):
                gitkeep.write_text("", encoding="utf-8")

    # ファイル
    files = dict(FILES)
    if not args.no_agent_config:
        files.update(AGENT_CONFIG_FILES)

    for relative, content in files.items():
        write(relative, content)

    # Schema ドキュメントをコピー
    for name, destination in SCHEMA_SOURCES.items():
        source = skill_dir / "references" / name
        if source.exists():
            write(destination, source.read_text(encoding="utf-8"))
        else:
            print(f"warning: schema reference not found: {source}", file=sys.stderr)

    # スクリプトをコピー
    for name, destination in SCRIPT_SOURCES.items():
        source = skill_dir / "scripts" / name
        if source.exists():
            write(destination, source.read_text(encoding="utf-8"))

    label = "Would create" if args.dry_run else "Created"
    print(f"{label} {len(created)} item(s) in {vault}:")
    for item in created:
        print(f"  + {item}")

    if skipped:
        print(f"\nSkipped {len(skipped)} existing file(s):")
        for item in skipped:
            print(f"  = {item}")

    if not args.dry_run and created:
        print(
            "\nNext:\n"
            "  1. Obsidian で Vault を開き、Templates の場所を 90_System/Templates に設定\n"
            "  2. Daily Notes のテンプレートを 90_System/Templates/Daily に設定\n"
            "  3. git init && git add -A && git commit -m 'Scaffold vault'\n"
            "  4. python3 scripts/vault_check.py --vault ."
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
