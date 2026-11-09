# 引き継ぎ書 — Obsidian 第二の脳プロジェクト

- 最終更新: 2026-11-09
- リポジトリ: `dirtflare/claude-skills`
- ブランチ: `claude/tender-ptolemy-tlruis`（PR は未作成）
- 直近コミット: `5f0d1e9` Add obsidian-autopilot

---

## 1. 依頼の経緯

| # | 依頼 | 対応状況 |
|---|---|---|
| 1 | X の記事を精査して Obsidian 環境をブラッシュアップ | 完了（`3fe4ba6`） |
| 2 | 「自動記憶しない・全く役に立てれていない」。Web の知見も精査し、導入して満足で終わらない**完全な第二の脳**へ進化させたい | 中核は完了（`5f0d1e9`）。残作業あり（§6） |
| 3 | Instagram の投稿（@koji_aionisan） | **未消化**。リール動画で本文は動画内。視聴不可 |
| 4 | YouTube（Jev × Obsidian） | タイトル・投稿者のみ取得。**動画内容は未視聴** |
| 5 | Jev が全く機能していない。トークン削減の可能性を精査 | 原因特定・API 実装・連携設計まで完了。**実機未検証** |

### 最重要の前提

**ユーザーの Vault はローカル PC（ターミナル側）にあり、このクラウドセッションからは見えない。**
したがってここで作ったものは**一度も実 Vault に適用されていない**。
すべて「移植可能なキット + ローカル適用手順」として作ってある。

---

## 2. 現在の成果物

```
.claude/skills/
├── x-post-analysis/          (既存)
├── obsidian-vault-kit/       構造: scaffold / Schema / テンプレ / Bases / 権限
├── obsidian-autopilot/       ★今回の中核: 自動記憶・自動想起・毎朝の押し出し
├── obsidian-distill/         1 ノートの蒸留（dry-run 既定）
├── obsidian-weekly-review/   週次レポート（読み取り専用）
└── obsidian-vault-audit/     Schema 監査・移行計画（読み取り専用）
```

### obsidian-autopilot のスクリプト

| ファイル | 役割 | 検証 |
|---|---|---|
| `vault_search.py` | 検索エンジン。CJK bigram + BM25 | ✅ 日本語 6 クエリで誤りゼロ |
| `hook_capture.py` | UserPromptSubmit: 記録 + 想起注入 | ✅ 正常系・異常系とも |
| `hook_answer.py` | Stop: 結論を記録 | ✅ |
| `daily_rollup.py` | Morning Brief | ✅ 7 カテゴリ発火・冪等 |
| `vault_stats.py` | 効果測定 | ✅ |
| `install_autopilot.py` | フック導入 | ✅ 冪等・非破壊・uninstall 可 |
| `jev_client.py` | Jev クライアント（依存ゼロ） | ⚠️ **モックのみ**。実 API 未検証 |

---

## 3. 設計判断とその理由（ここを崩さないこと）

調査の結論として、第二の脳が死ぬ条件は一つに集約される。

> 自分の Vault から引き出すより、ゼロから考え直す方が速いなら、その Vault は墓場である。

構造（Schema・テンプレート）は「どこに置くか」しか解かない。
**入力も想起も人間の意志力に依存**したままで、意志力は必ず切れる。
だから自動化の対象を**整理ではなく、入力・想起・押し出し**に置いた。

| 判断 | 理由 |
|---|---|
| 想起を `UserPromptSubmit` に載せた | このフックだけが `additionalContext` を返して Claude の文脈に注入できる。他に選択肢がない |
| `SessionEnd` を使わない | 既定バジェットが 1.5 秒。発火しない不具合report あり。記録を取りこぼす。`Stop` は `last_assistant_message` を直接くれる |
| フックは全例外を握り潰し常に exit 0 | Vault の不整合が Claude Code の操作自体を壊してはいけない |
| 形態素解析器を使わず CJK bigram | 外部依存と辞書が不要。日本語検索で実用精度が出る |
| bigram ノイズを 3 段で抑制 | ①ひらがなのみは寄与 1/10 ②内容語が無ければ落とす ③最高スコア比 0.3 未満を落とす |
| 絶対スコア閾値を使わない | Vault 規模で意味が変わる。相対比率が安定する |
| 測定指標をノート数にしない | 「整えた満足感」と実効性は主観で区別できない。想起発火回数と Output Conversion で見る |

---

## 4. 調査結果（再取得は高コスト。ここを参照すること）

### 検証済みの公式仕様

- **Obsidian 公式 CLI** 実在。1.12 インストーラー必須（1.12.7+ 推奨）。
  move/rename は内部リンクを自動更新するので `mv` より安全
- **Bases** `filters`/`formulas`/`properties`/`views`。`file.mtime`・`today()`・`now()`・`if()`・期間 `'14d'` 利用可
- **Claude Code フック**
  - 共通: `session_id` / `transcript_path` / `cwd` / `hook_event_name`
  - `UserPromptSubmit`: `prompt` あり。`additionalContext` を返せる。timeout 30 秒
  - `Stop`: `last_assistant_message` あり
  - `SessionEnd`: `reason`（clear/resume/logout/prompt_input_exit/other）。**既定 1.5 秒**（個別 timeout で最大 60 秒）
  - 出力上限 10,000 文字。exit 0 で stdout を JSON として解釈
  - `disable-model-invocation: true` で自動起動を止められる
- **Jev API**（§5）

### PKM 失敗モード（実践者の観察。研究ではない）

Collector's fallacy / 保守コストの破綻 / 想起の摩擦 / 蒸留されない /
IKEA 効果（自分で組んだ凝った構成を過大評価する）。
最後が厄介で、**整えること自体が達成感を生む**ため機能していないことに気づけない。

### 併用候補（未導入）

- **Smart Connections** — ローカル埋め込みの意味検索。APIキー不要。
  ただし Obsidian 内で完結し、Claude Code の文脈へ自動注入はできない
- **Obsidian Local REST API** — `127.0.0.1:27124`。見出し/ブロック/frontmatter 単位の部分更新。Obsidian 起動が必要
- **Obsidian MCP サーバー群** — ファイル直読み型（Obsidian 不要）と REST API 依存型がある

---

## 5. Jev について（依頼 #5 の回答）

### なぜ機能していないのか

**受動的に効く仕組みではないから。**
公式プラグイン（`claude plugin install typesafe@typesafe-ai`）がやるのは
「エージェントに Jev を呼ぶコードを書かせられるようにする」ことだけ。
Claude Code に割り込まないし、トークンを自動で削らない。
**Jev を呼ぶ処理を自分で持たない限り、永遠に何も起きない。**

### 正体

TypeSafe の "System One" モデル。**文章を生成せず、型付きの判断のみ返す。**
`noul`(0〜1 の真偽) / `choice`(選択肢+確信度) / `score`(順序ラベル) / `box`(画像座標)。

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer $TYPESAFE_API_KEY
{"model":"jev-latest","state":<string|object|array>,"questions":{"<name>":{"type":"noul|choice|score|box",...}}}
```

価格 **$0.042 / 1M 入力トークン、出力無料**。応答 70〜500ms（ベンダー公称）。
公式 Python SDK は `pip install typesafe-sdk`。本キットは依存を増やさず urllib で直叩き。

### トークンが減る理屈

自動で減るのではない。**今 Claude にさせている「判断」を Jev に移したときだけ**減る。
Jev は説明を書かないので桁が違う（Inbox 100 件の分類が約 $0.002）。

### 注意（ユーザーへ正直に伝えること）

- 「1M→86K トークン」「3 分の 1」等の数字は**宣伝か単発実測**。独立ベンチマークは存在しない
- それを実現する「エージェントループに割り込む」プラグインは**第三者製**であり公式ではない。
  文脈剪定が推論の重要な痕跡を落とす危険を指摘する声もある
- 無料にはならない。**単価の安い方へ逃がす**だけ

詳細と実装例: `.claude/skills/obsidian-autopilot/references/jev-integration.md`

---

## 6. 残作業

### 優先度 高

1. **実 Vault への適用**（最重要。まだ一度もやっていない）
   ```bash
   git clone https://github.com/dirtflare/claude-skills.git
   mkdir -p ~/.claude/skills && cp -r claude-skills/.claude/skills/obsidian-* ~/.claude/skills/
   python3 ~/.claude/skills/obsidian-autopilot/scripts/install_autopilot.py --vault <VAULT> --dry-run
   ```
   既存 Vault に当てると初回は大量にエラーが出るが**全部直さない**（Migration on Touch）。

2. **想起の実効性確認** — 数日使ってから
   `vault_stats.py --vault <VAULT>`。想起発火が 0 ならフック未登録。
   `claude --debug` で `<vault-recall>` が出るか見る。

3. **`jev_triage.py` の実装** — references に設計と疑似コードはあるがスクリプトは未作成。
   Inbox トリアージが Jev の最有効用途。`confidence < 0.6` は人間へ回す設計にすること。

### 優先度 中

4. **想起の Jev 篩い** — `hook_capture.py` に `jev_gate` 設定を足し、
   BM25 で 3 件に絞った後 Jev の `noul` で篩う。毎ターンの注入トークンが減る。
   ただし 70〜500ms が毎ターン乗るので、速度を見て判断。
5. **前提崩壊の検知** — Decision の Assumptions を Jev で定期監査。
   Vault で最も価値の高い処理を常時運用化できる。
6. **Jev 実機検証** — `jev_client.py --selftest`。モックしか通していない。

### 未消化の入力

7. **Instagram**（@koji_aionisan, `DfMhF2etSTN`）— リール動画。
   キャプションは「#obsidian 上手に使いこなせていますか？本日はこれを上手に使うための環境構築をご紹介」のみ。
   コメント欄が全員「ハーネス」= キーワード配布型。**内容を取り込むにはスクショか文字起こしが要る。**
8. **YouTube**（`YquEXNxQfN4`）—
   「AIに判断を任せて思考を整理！文章を書かずにObsidianをより強力に使いこなす方法【Jev】【TypeSafe AI】」
   飯塚浩也 | Obsidianでつくる最強の右腕。
   タイトルの方向性（判断は Jev、文章生成はさせない）は §5 の設計と一致しているが、
   **動画内の具体手順は未確認。**

---

## 7. 次のセッションへの申し送り

- このリポジトリは**キット**であり、ユーザーの Vault そのものではない。
  Vault はローカルにあり、クラウドセッションからは触れない
- PR は未作成。ユーザーが明示的に依頼するまで作らないこと
- `references/architecture.md` に設計根拠、`references/jev-integration.md` に Jev 知見、
  `references/install.md` に導入手順とトラブルシュートがある。**作り直す前に読むこと**
- ユーザーの不満は一貫して「**導入して満足で終わっている**」。
  機能を足すより、**実際に動いていることを数字で見せる**方が依頼の本質に近い
