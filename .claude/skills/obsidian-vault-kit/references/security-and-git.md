# Security・Git・エージェント設定

「機密ファイルを読まないで」と CLAUDE.md に書くだけでは弱い。
**文章ではなく設定にする。**

---

## 1. Claude Code の権限設定

Vault ルートの `.claude/settings.json`。
`permissions.deny` の対象は**ファイル検索結果からも除外される**ため、
「うっかり grep で拾う」事故も防げる。

```json
{
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
```

`ask` は「実行前に必ず聞く」。破壊的な操作をここへ入れる。

## 2. Codex のサンドボックス

Vault ルートの `.codex/config.toml`。

```toml
sandbox_mode = "workspace-write"
approval_policy = "on-request"

[sandbox_workspace_write]
network_access = false
writable_roots = []
```

workspace-write は作業領域内の書き込みに限定し、
境界外やネットワークが必要な操作では承認を求める。
**まず狭く始め、必要な権限だけを追加する。**

## 3. 最も重要な原則

> **AI に絶対読ませてはいけないデータは、AI を起動する Vault へ置かない。**

設定ミス、コピー、添付、リンク先、バックアップまで考えると、
**物理分離が最も強い**。Personal Vault と Regulated Vault を分ける。

`sensitivity: never_ai` は表明であって強制ではない。
強制したいなら `permissions.deny` か、別 Vault。

---

## 4. Git

Obsidian は Markdown フォルダなので Git との相性が良い。
Git があることで、AI の誤編集は「事故」ではなく「取り消せる差分」になる。

### .gitignore

```gitignore
.DS_Store
Thumbs.db
.trash/

# 開くたびに変化するため除外（公式も除外を案内している）
.obsidian/workspace.json
.obsidian/workspaces.json

90_Private/
*.tmp
```

`.obsidian/` 全体は除外しない。
プラグイン構成とテンプレート設定は、復旧のために追跡する価値がある。

### AI に変更させるときの手順

```bash
git status                                   # clean であることを確認
git switch -c ai/normalize-project-schema

# Claude または Codex で変更

python3 scripts/vault_check.py --vault .
git diff --check
git diff --stat
git diff                                     # 目で見る
```

変更が大きい場合は worktree で本体から隔離する。

```bash
git worktree add ../MyVault-AI -b ai/vault-refactor
```

AI は `MyVault-AI` だけを編集する。人間が差分を確認してから本体へ取り込む。

---

## 5. CLAUDE.md / AGENTS.md

Vault ルートに置く。**両方に同じ契約を書く。**
Claude Code は `CLAUDE.md` を継続的な指示として読み込み、
Codex は `AGENTS.md` をルートから作業ディレクトリまで探索する。

**全業務手順を書き込まない。** 毎セッション必要な規則だけ。
長い手順は Skills へ移す（Skills は必要なときだけ全文が読み込まれる）。

```markdown
# Vault Operating Contract

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
```

---

## 6. Skills を複数エージェントで共有する

Skill は Agent Skills オープン標準（`SKILL.md` + 任意の `scripts/`,
`references/`, `assets/`）で、Claude Code・Codex ほか多数のクライアントが対応する。

ただし**探索パスはクライアントごとに異なる**。
Claude 用に `.claude/skills/` へ置いただけでは他エージェントから見えない。

そこで**原本を 1 つにする**。

```
90_System/AgentSkills/        # 原本
    ↓ sync_skills.py
.claude/skills/               # Claude Code
.agents/skills/               # Agent Skills 標準パス
```

```bash
python3 scripts/sync_skills.py --vault ~/MyVault
```

共有 Skill の frontmatter は、原則 `name` と `description` だけにする。
Claude 固有の `allowed-tools` や `context: fork` を共有原本へ入れると、
他エージェントでの互換性が下がる。プラットフォーム固有設定は薄いラッパーへ分離する。

> 各エージェントの探索パスは変わりうる。
> `sync_skills.py --dest` で追加先を指定できるようにしてある。

### 破壊的 Skill は明示実行だけにする

書き込み系 Skill は自動起動させない。

```yaml
---
name: obsidian-apply-migration
description: 承認済みの Schema 移行計画を適用する。明示的に呼び出された場合だけ使う。
disable-model-invocation: true
---
```

`disable-model-invocation: true` は Claude Code の機能で、
モデルによる自動呼び出しを無効にする（`/name` での明示実行のみになる）。

---

## 7. Skill の description はルーターである

説明文ではない。**「いつ使うか」と「いつ使わないか」**を書く。

エージェントは起動時に name と description だけを読み、
タスクが一致したときに初めて本文を読む（progressive disclosure）。
だから description の精度が、そのまま起動精度になる。

悪い例:
```yaml
description: Obsidian のノートを整理するスキル
```

良い例:
```yaml
description: >
  Obsidian の Inbox・Daily・Meeting・Source ノートを、出典を保持した
  Evergreen Note、Decision、Task へ蒸留する。「整理」「蒸留」「promote」
  「会議メモから決定を抽出」と依頼されたときに使う。
  破壊的な一括変更やファイル名移行には使わない。
```
