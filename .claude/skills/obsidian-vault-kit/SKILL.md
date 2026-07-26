---
name: obsidian-vault-kit
description: Obsidian Vault を「意思決定をコンパイルする知識リポジトリ」として設計・構築・維持する。Vault の新規作成 (scaffold)、フォルダ / Properties / Links / Tags の役割分離、Property Schema 設計、テンプレート整備、Bases ダッシュボード、Git・Validator・権限設定の導入に使う。ユーザーが「Obsidian を構築」「Vault を設計」「Vault を作りたい」「Obsidian 環境を整えたい」「Schema を決めたい」「テンプレートを作りたい」「Bases を作りたい」と依頼したときに使う。個別ノートの蒸留には obsidian-distill、週次レビューには obsidian-weekly-review、監査には obsidian-vault-audit を使う。
---

# Goal

Obsidian Vault を、ノートの保管庫ではなく **再利用可能な知識リポジトリ** として構築する。
判断基準は「きれいかどうか」ではなく、次の 6 指標で測る。

| 指標 | 定義 | 目標 |
|---|---|---|
| Capture Latency | 思いついてから保存するまで | 30 秒以内 |
| Retrieval Time | 必要な情報へ到達するまで | 通常 30 秒 / 重要判断 60 秒 |
| Context Reconstruction Cost | 昔のノートの文脈を復元する時間 | 背景・決定・理由・前提・次の行動が残っている |
| Decision Traceability | 判断理由を後から追える割合 | Reversal Trigger 付き |
| Output Conversion Rate | 保存した知識が成果物へ再利用された割合 | 上げ続ける |
| Agent Executability | AI が Vault のルールを誤解せず操作できる割合 | Validator 合格率で測る |

ノート数は指標ではない。再利用されない記録は、分母だけを増やす。

# Default mode

**Dry-run を既定とする。** ユーザーが明示的に「適用して」「書き込んで」と言うまで、
提案と差分の提示だけを行う。

# Read first

作業前に必ず読む。

1. 対象 Vault の `CLAUDE.md` / `AGENTS.md`（あれば）
2. `references/note-types.md` — ノート型と必須 Property
3. `references/property-vocabulary.md` — 許可された Property 語彙
4. 既存 Vault を扱う場合は `git status` で作業ツリーが clean か確認

# 1. Vault を新規構築する

`scripts/scaffold_vault.py` を使う。既存ファイルは上書きしない。

```bash
python3 scripts/scaffold_vault.py --vault ~/MyVault
python3 scripts/scaffold_vault.py --vault ~/MyVault --dry-run   # 確認のみ
```

生成される構造:

```
MyVault/
├── 00_Inbox/          # 未分類の入力。ここでは整理しない。タグ不要
│   ├── AI/            # AI が生成した未レビュー草稿の置き場
│   └── Clippings/
├── 10_Daily/          # 時系列の作業ログ
├── 20_Projects/       # 終了条件のある活動。必ず next_action を持つ
├── 30_Areas/          # 終わりのない責任範囲
├── 40_Notes/          # 長期的に再利用する知識
│   └── MOCs/
├── 50_Sources/        # 外部情報。「相手の主張」と「自分の解釈」を分ける
├── 60_Entities/       # 人物・企業・製品。同一実体は 1 ノート
│   ├── People/
│   ├── Companies/
│   └── Products/
├── 70_Outputs/        # 成果物。独立トップレベルに置くことが重要
│   ├── Drafts/
│   └── Published/
├── 80_Assets/
├── 90_System/         # Vault 自身を動かす仕組み
│   ├── Templates/
│   ├── Bases/
│   ├── Schemas/
│   ├── AgentSkills/   # Skill の原本（各エージェントへ同期する元）
│   └── Metrics/
├── 99_Archive/
├── scripts/
├── CLAUDE.md
└── AGENTS.md
```

## Vault を分けるか

**原則は 1 つ。** Obsidian の内部リンクは Vault 内で解決されるため、
分けると知識間の関係も分断される。

物理的に分離するのは次だけ:

- 契約上、外部 AI 投入が禁止されている情報
- 医療・個人番号・認証情報
- 機密性の高い人事情報
- 規制対象データ

「Personal Vault」と「Regulated Vault」に分ける。
**AI に絶対読ませてはいけないデータは、AI を起動する Vault に置かない。**
設定ミス・コピー・添付・バックアップを考えると、物理分離が最も強い。

# 2. 役割を混ぜない（最重要）

Vault が破綻する最大の原因は、同じ分類をフォルダ・タグ・Property・リンクの
全部で表現することだ。役割を固定する。

| 要素 | 表すもの | 例 |
|---|---|---|
| **フォルダ** | ライフサイクル（今どの工程か） | `00_Inbox`, `20_Projects`, `99_Archive` |
| **Properties** | 機械が扱う型と状態 | `type`, `status`, `created`, `due` |
| **Links** | 意味関係 | `[[価格戦略]]`, `[[株式会社ABC]]` |
| **Tags** | 一時的な横断状態 | `#review`, `#waiting`, `#question` |

タグは次の程度に限定する: `#review` `#waiting` `#question` `#contradiction` `#publish`

「マーケティング」「AI」のような**概念はタグではなくリンクにする**。
タグを概念辞書に使うと、`#AI` `#人工知能` `#生成AI` `#LLM` のように増殖する。
日本語は表記揺れが起きやすいので、概念ノート側に `aliases` を持たせて吸収する。

```yaml
---
type: note
status: active
created: 2026-07-24
aliases:
  - LTV
  - 顧客生涯価値
  - lifetime value
---
```

> Properties 内で Wikilink を使う場合は必ず引用符で囲む: `- "[[価格戦略]]"`

# 3. Schema は 3 段階に分ける

入力時から 20 項目を埋めさせてはいけない。Capture Latency が壊れる。
詳細は `references/property-vocabulary.md`。

**Capture 段階**（必須はこれだけ）
```yaml
---
type: inbox
created: 2026-07-24
status: inbox
---
```

**Promoted 段階**（長期保存の価値が出たら）
```yaml
---
type: note
created: 2026-07-24
status: active
topics:
  - "[[価格戦略]]"
source_notes:
  - "[[SRC 競合価格調査 2026-07]]"
confidence: medium
sensitivity: internal
---
```

**Operational 段階**（Project / Decision で必要な項目）
```yaml
---
type: project
created: 2026-07-24
status: active
owner: me
area: "[[経営]]"
due: 2026-09-30
next_action: 競合5社の年額プランを比較する
---
```

`updated` は手入力しない。Bases から `file.mtime` を参照できる。

# 4. 命名規則

日本語の本文・タイトルを英語にする必要はない。
ただし **Property 名とフォルダ名は ASCII** に寄せる。

```
Project:   PJT 法人向け料金体系の再設計
Decision:  DEC 2026-07-24 年額プランを標準提案にする
Meeting:   MTG 2026-07-24 株式会社ABC 定例
Source:    SRC 著者名 - 記事タイトル
Person:    田中太郎
Company:   株式会社ABC
```

**Evergreen Note は「分野名」ではなく「主張」にする。**

| 弱いタイトル | 強いタイトル |
|---|---|
| 価格戦略 | 高価格商品ほど機能より失敗回避を売る |
| 採用 | 採用面接では能力より再現条件を聞く |
| AIエージェント | AIエージェントには自由度より検証可能性を与える |

主張型にすると、検索結果の一覧だけで内容を思い出せる。

# 5. テンプレートと Bases

- テンプレート全文 → `references/templates.md`
  （Daily / Project / Decision / Source / Evergreen / Meeting / MOC）
- Bases 定義 → `references/bases.md`
  （Active Projects / Decision Review / Inbox Age / Output Queue）

テンプレートは `90_System/Templates/` へ、Bases は `90_System/Bases/` へ置く。
Templates コアプラグインで `{{title}}` `{{date}}` `{{time}}` が使える。

**特に重要な 3 フィールド:**

- Decision Note の `## Reversal Trigger` — 何が起きたら判断を撤回するか。
  優秀な意思決定者は正しさを主張し続ける人ではなく、
  **どの条件で自分の判断を変えるかを決定時点で書ける人**。
- Source Note の `## What Changes If True` — 情報収集を行動へ接続する。
- Evergreen Note の `## Use When` — 未来の検索意図を文章で保存する。
  人間の検索にも AI の意味検索にも効く。

Daily Note の `## Friction Log`（何を探して見つからなかったか）も必須にする。
**見た目の好みではなく、失敗した検索から構造を進化させる。**

# 6. プラグインは Tier 制

| Tier | 方針 | 中身 |
|---|---|---|
| **Tier 0** | まずこれだけで運用 | Properties, Templates, Daily Notes, Bases, Backlinks, Outgoing Links, Bookmarks, Workspaces, Search, Canvas, File Recovery |
| **Tier 1** | 明確な摩擦が出たら | QuickAdd（入力経路を 4 つに固定）, Templater, Tasks |
| **Tier 2** | Bases で足りない場合だけ | Dataview |

原則: **Bases でできるなら Bases。Dataview でしかできない場合だけ Dataview。
DataviewJS は自分で読んで理解できるコードだけ。**

Templater は任意の JavaScript とシステムコマンドを実行できる。
DataviewJS は Vault の書き換え・ファイル削除・ネットワークアクセスが可能。
**理解していない外部テンプレートをそのまま使わない。**

アクティブな Community Plugin は 12 個以内を目安に。各プラグインに記録する:
導入目的 / 代替手段 / データの保存形式 / 外した場合に失われる機能 / 最終使用日 / 削除条件。

# 7. Git・Validator・権限

セキュリティと運用の詳細 → `references/security-and-git.md`

最低限:

```bash
python3 scripts/vault_check.py --vault ~/MyVault    # Schema 違反を検出
```

AI による大規模変更は必ずブランチを切る。

```bash
git switch -c ai/normalize-project-schema
# Claude / Codex で変更
python3 scripts/vault_check.py --vault .
git diff --check && git diff --stat
```

**「機密を読まないで」と CLAUDE.md に書くだけでは弱い。設定にする。**
`.claude/settings.json` の `permissions.deny` は検索結果からも除外する。

# 8. Obsidian CLI（2026 年の決定的変化）

Obsidian には公式 CLI がある（Obsidian 1.12 インストーラーが必要、1.12.7+ 推奨）。
`mv` ではなく CLI を使うと、内部リンクの自動更新が効く。

```bash
obsidian daily                                    # 今日の Daily を開く
obsidian daily:append content="- [ ] 顧客インタビューを整理する"
obsidian search query="価格改定"
obsidian search:context query="Reversal Trigger"  # 周辺行つき
obsidian read path="20_Projects/PJT 料金体系の再設計.md"
obsidian create path="20_Projects/PJT 新規.md" template="Project"
obsidian property:set path="..." name=status value=active type=text
obsidian backlinks path="40_Notes/価格戦略.md"
obsidian unresolved counts                        # 未解決リンク
obsidian orphans total                            # 被リンクなしノート
obsidian tasks todo
```

CLI が使えない環境では Markdown を直接編集してよいが、
**move / rename だけは CLI を優先する**（リンク切れを防ぐため）。
デスクトップ版なしでサーバー上の Vault を扱う場合は Obsidian Headless（オープンベータ）。

# 9. 人間と AI の役割分担

**AI に全ノートを自由に編集させるのは AI 活用ではない。
監査されていないインターンに全資料を渡すのと同じだ。**

| 担当 | 役割 |
|---|---|
| 人間 | 目的、価値判断、最終承認、MOC の編集 |
| Obsidian | 原本、関係、履歴、ビュー |
| Claude | 意味の蒸留、比較、反証、文章化 |
| Codex | 構造変更、スクリプト、検証、差分レビュー |
| Git | 復旧、監査、実験の分離 |
| Validator | Schema 違反、リンク異常、形式崩れの検出 |

AI にさせること: 候補を作る / 矛盾を探す / 不足を指摘する / 比較する / 形式を検証する。
人間が決めること: 何を残すか / 何が重要か / どの判断を採用するか / どの考えを中心に置くか。

# 10. 構築の順番（30 日）

段階を飛ばさない。**既存の全ノートを移行しないこと。**
古い情報は必要になったときだけ移行する（Migration on Touch）。

1. **1〜3 日目** — 最小 Vault。フォルダと Daily / Project / Decision / Source の 4 テンプレートだけ。Core Plugin のみ。
2. **4〜7 日目** — 進行中の Project だけ作る。今週の重要判断から Decision Note を始める。
3. **2 週目** — 検索経路。実際に検索した言葉を記録し、Alias を追加。MOC は 2〜3 個だけ。Bases で Active Projects と Decision Review を表示。
4. **3 週目** — Git 管理開始、`.gitignore`、`vault_check.py` 導入。一括変更は必ずブランチ。
5. **4 週目** — Skills 化。最初は `obsidian-distill` / `obsidian-weekly-review` / `obsidian-vault-audit` の 3 つだけ。失敗例を evals へ追加していく。

# 9 原則（判断に迷ったらここへ戻る）

1. **保存前に分類せず、昇格時に分類する** — 入力時は Inbox か Daily だけ
2. **すべての昇格ノートに未来の利用場面を書く** — `## Use When` を必須に
3. **すべての重要情報に 2 つの検索経路を持たせる**（Two-Key Retrieval Rule）
   人間用: タイトル / MOC / リンク / Alias　機械用: type / status / project / created / topics
4. **事実・主張・解釈・判断を混ぜない** — 見出しで分離する。
   AI が作った「もっともらしい解釈」が数カ月後に事実として再利用される事故を防ぐ
5. **Decision を第一級オブジェクトにする** — 会議は消費されるが、Decision は未来の行動を拘束する
6. **Output を Vault の外側に置かない** — 構想・論点・使用ノート・反証は Obsidian 側へ。最終フォーマットだけ外部ツールへ
7. **AI を自動整理係にしない** — 毎日自動分類させると誤分類が静かに蓄積する
8. **壊れる前提で作る** — Markdown が原本 / Git / Plugin 依存を局所化 / Schema を文書化 / Validator / ブランチ / 復元テスト
9. **美しさではなく、検索失敗から改善する** — 「なんとなく汚い」で再設計しない。
   情報が見つからなかった、同じノートを二度作った、AI が誤った type を選んだ、
   判断理由が分からなかった——これら**具体的な障害が起きたときだけ**構造を変える

# Validation

書き込みを行った後は必ず:

1. `python3 scripts/vault_check.py --vault <path>`
2. `git diff --check` と `git diff --stat`
3. 変更ファイル、置いた仮定、未解決の問題を報告する

# Completion format

報告に含める:

- 作成したファイル / 更新したファイル
- 適用した Schema と、既存 Vault との差分
- Validator の結果（エラー数・警告数）
- 置いた仮定
- 人間のレビューを推奨する箇所
