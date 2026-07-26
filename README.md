# claude-skills

Claude Code 用の汎用スキルを集めたリポジトリです。
特定のアプリやリポジトリに紐付かないスキルをここに集約します。

## 収録スキル一覧

| スキル | 説明 |
|---|---|
| [x-post-analysis](.claude/skills/x-post-analysis/SKILL.md) | X (Twitter) の投稿を「取得 → 抽出 → 検証 → 構造化」して、構造化レポートや指定の成果物(設計書・ワークフロー・メモ等)にまとめるスキル。URL・コピペ本文・スクリーンショット・動画の文字起こしなど、あらゆる入力ソースに対応。 |
| [obsidian-vault-kit](.claude/skills/obsidian-vault-kit/SKILL.md) | Obsidian Vault を「意思決定をコンパイルする知識リポジトリ」として設計・構築・維持する。Vault の scaffold、Schema 設計、テンプレート、Bases、Git・Validator・権限設定まで。 |
| [obsidian-distill](.claude/skills/obsidian-distill/SKILL.md) | Inbox・Daily・Meeting・Source ノートを、出典を保持したまま Evergreen Note / Decision / Task へ蒸留する。既定は dry-run。 |
| [obsidian-weekly-review](.claude/skills/obsidian-weekly-review/SKILL.md) | 週次レビュー。決まったのに動いていないこと、崩れた前提、停止した Project、繰り返した検索失敗を回収する。読み取り専用。 |
| [obsidian-vault-audit](.claude/skills/obsidian-vault-audit/SKILL.md) | Schema drift・型揺れ・命名違反・重複・孤立ノートを監査し、危険度つきで報告する。一括移行の計画作成にも。読み取り専用。 |

## 使い方

このリポジトリをクローンするか、必要なスキルの `SKILL.md` を
自分のプロジェクトの `.claude/skills/<スキル名>/SKILL.md` にコピーしてください。

---

# Obsidian スキル群

4 つのスキルで役割を分けています。**破壊的な操作を持つのは vault-kit だけ**で、
他の 3 つは既定で読み取り専用または dry-run です。

```
obsidian-vault-kit     構築・設計    scaffold / Schema / テンプレート / Bases / 権限
obsidian-distill       日常運用      1 ノートを蒸留して昇格          （dry-run 既定）
obsidian-weekly-review 週次          レポート生成                    （読み取り専用）
obsidian-vault-audit   月次          監査・移行計画                  （読み取り専用）
```

## ローカル Vault への適用手順

Vault がローカル PC にある場合、ターミナルの Claude Code から使います。

### 1. スキルを入れる

**個人用（全プロジェクトで使える。おすすめ）**

```bash
git clone https://github.com/dirtflare/claude-skills.git
mkdir -p ~/.claude/skills
cp -r claude-skills/.claude/skills/obsidian-* ~/.claude/skills/
```

**Vault 専用にする場合**

```bash
mkdir -p ~/MyVault/.claude/skills
cp -r claude-skills/.claude/skills/obsidian-* ~/MyVault/.claude/skills/
```

Claude Code はスキルディレクトリの変更を監視するので、基本的に再起動は不要です
（トップレベルのスキルディレクトリを新規作成した場合のみ再起動）。

### 2. Vault を構築する

まず dry-run で何が作られるか確認します。**既存ファイルは上書きされません。**

```bash
cd ~/MyVault   # 既存 Vault でも、空ディレクトリでも可
python3 ~/.claude/skills/obsidian-vault-kit/scripts/scaffold_vault.py \
  --vault . --dry-run
```

問題なければ適用します。

```bash
python3 ~/.claude/skills/obsidian-vault-kit/scripts/scaffold_vault.py --vault .
```

生成されるもの:

- フォルダ構造（`00_Inbox` 〜 `99_Archive`）
- テンプレート 7 種（Daily / Project / Decision / Source / Evergreen / Meeting / MOC）
- Bases 4 種（Projects / Decisions / Inbox / Outputs）
- `CLAUDE.md` と `AGENTS.md`（同一の Vault Operating Contract）
- `.claude/settings.json`（`90_Private/` などの Read を deny）
- `.codex/config.toml`（サンドボックス設定）
- `.gitignore`
- `scripts/vault_check.py` と `scripts/sync_skills.py`

### 3. Obsidian 側の設定

1. Templates コアプラグインを有効化 → テンプレートの場所を `90_System/Templates`
2. Daily Notes コアプラグイン → テンプレートを `90_System/Templates/Daily`、
   保存先を `10_Daily`
3. Bases コアプラグインを有効化 → `90_System/Bases/*.base` を開く

### 4. Git を入れる

```bash
git init && git add -A && git commit -m "Scaffold vault"
```

AI に大きな変更をさせるときは必ずブランチを切ります。

```bash
git switch -c ai/normalize-project-schema
```

### 5. 動作確認

```bash
python3 scripts/vault_check.py --vault .
```

既存 Vault に適用した場合、初回は大量のエラーが出ます。**全部直そうとしないでください。**
古い情報は必要になったときだけ移行します（Migration on Touch）。

### 6. 使う

Claude Code を Vault で起動して、日本語で頼めば起動します。

```
/obsidian-vault-audit               # 明示的に呼ぶ場合
今週の振り返りをして                  # obsidian-weekly-review が起動
この会議メモを Decision に蒸留して     # obsidian-distill が起動
```

## Obsidian CLI（任意だが推奨）

Obsidian には公式 CLI があります（Obsidian 1.12 インストーラーが必要、1.12.7+ 推奨）。

CLI 経由の move / rename は**内部リンクを自動更新**するため、`mv` より安全です。
スキル側も、CLI があればそちらを優先するよう書かれています。

```bash
obsidian search:context query="Reversal Trigger"
obsidian unresolved counts
obsidian orphans total
```

CLI が無くても、すべてのスキルは Markdown の直接編集で動作します。

## スクリプト

| スクリプト | 用途 |
|---|---|
| `scaffold_vault.py` | Vault の骨組みを作る。既存ファイルは上書きしない。`--dry-run` 対応 |
| `vault_check.py` | Schema 違反の静的検査。`--strict` で警告もエラー扱い。PyYAML があれば使い、無ければ内蔵パーサへフォールバック |
| `sync_skills.py` | `90_System/AgentSkills/` の原本を `.claude/skills/` と `.agents/skills/` へ配る |

`vault_check.py` が検出するもの:

- frontmatter の欠落・YAML パースエラー
- 不正な `type` / `status` / `confidence` / `sensitivity`
- 型別の必須 Property 欠落（例: `project` の `next_action`）
- 型別の必須見出し欠落（例: `decision` の `## Reversal Trigger`）
- ISO 形式でない日付
- **Properties 内の引用符なし Wikilink**（`- [[X]]` はリンクにならない）
- 手動 `updated` Property（`file.mtime` を使うべき）
- 未解決リンク

## 設計の前提

これらのスキルが従っている原則です。詳細は
[obsidian-vault-kit/SKILL.md](.claude/skills/obsidian-vault-kit/SKILL.md) にあります。

- **役割を混ぜない** — フォルダ = ライフサイクル、Properties = 型と状態、
  Links = 意味関係、Tags = 一時的な横断状態
- **保存前に分類せず、昇格時に分類する** — 入力時は Inbox か Daily だけ
- **Decision を第一級オブジェクトにする** — 特に `## Reversal Trigger`
- **事実・主張・解釈・AI の推論を混ぜない** — 見出しで分離する
- **AI を自動整理係にしない** — AI は候補を作り、人間が何を残すか決める
- **美しさではなく、検索失敗から改善する** — 具体的な障害が起きたときだけ構造を変える
- **壊れる前提で作る** — Markdown が原本、Git、Validator、ブランチ

## 出典

Obsidian スキル群は X の記事
[「ガチの天才・1億円プレイヤーしか辿りついていない、Obsidian構築術」](https://x.com/ai_ai_ailover/status/2080668740790690266)
（@ai_ai_ailover, 2026-07-24）の構成を土台に、公式ドキュメントで検証したうえで
実行可能な形へ再構成したものです。

記事内の技術的主張のうち、次は公式ドキュメントと一致することを確認済みです
（2026-07-26 時点）:

- Obsidian 公式 CLI の存在とコマンド体系、1.12 インストーラー要件
- Bases の `filters` / `formulas` / `properties` / `views` 構文、
  `file.mtime`・`today()`・`now()`・`if()`・期間表記
- Claude Code の `disable-model-invocation` と skills の探索パス
- Agent Skills がオープン標準であること（`SKILL.md` + `name` / `description`）

記事の「年収1億円との因果関係」は記事自身が否定しており、
ここでも成果指標としては採用していません。
