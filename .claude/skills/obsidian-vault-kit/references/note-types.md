# Note Types

Vault で許可されるノート型と、その必須 Property・必須見出し。
`vault_check.py` はこの表を機械可読な形で実装している。両者は同期させること。

## 型一覧

| type | 置き場所 | 役割 | 必須 Property |
|---|---|---|---|
| `inbox` | `00_Inbox/` | 未分類の入力。整理しない | `type`, `created`, `status` |
| `daily` | `10_Daily/` | 時系列の作業ログ | `type`, `created` |
| `project` | `20_Projects/` | 終了条件のある活動 | `type`, `created`, `status`, `next_action` |
| `area` | `30_Areas/` | 終わりのない責任範囲 | `type`, `created`, `status` |
| `note` | `40_Notes/` | 長期再利用する知識（Evergreen） | `type`, `created`, `status` |
| `source` | `50_Sources/` | 外部情報の記録 | `type`, `created`, `status` |
| `meeting` | `50_Sources/` または `10_Daily/` | 会議記録 | `type`, `created` |
| `decision` | `20_Projects/` 近傍 | 意思決定の記録 | `type`, `created`, `status` |
| `person` | `60_Entities/People/` | 人物 | `type`, `created` |
| `company` | `60_Entities/Companies/` | 企業 | `type`, `created` |
| `output` | `70_Outputs/` | 成果物 | `type`, `created`, `status` |

## 必須見出し

型によっては、Property だけでなく本文の構造も検査対象にする。
見出しが欠けていると、そのノートは「後から文脈を復元できない」状態になる。

| type | 必須見出し | 理由 |
|---|---|---|
| `decision` | `## Decision`, `## Why This Option`, `## Reversal Trigger` | 何を決め、なぜ決め、何が起きたら覆すか |
| `source` | `## Source Summary`, `## My Interpretation`, `## What Changes If True` | 相手の主張と自分の解釈を分離し、行動へ接続する |
| `note` | `## Claim`, `## Use When` | 主張と、未来の利用場面 |
| `project` | `## Outcome`, `## Next Actions` | 完了条件と次の一手 |

## 型ごとの設計意図

### `project` — 終了条件があるもの

「売上を伸ばす」は Area または Goal。
「法人プランの価格を 2026 年 9 月までに改定する」が Project。

Project Note はタスクの倉庫ではない。
**誰かが 30 秒で現状を理解できる、プロジェクトの司令室**にする。
だから `## Current State` を三行以内で書く。

`next_action` は必須。曖昧な next_action は Validator では検出できないので、
週次レビューで人間が見る。

| 弱い next_action | 強い next_action |
|---|---|
| 料金について考える | 競合5社の年額料金を表へ入力する |
| 採用を進める | 候補者3名へ二次面接の日程候補を送る |
| 記事を書く | 記事の見出しを7個作る |

### `decision` — Vault で最も価値が高い型

高収益な仕事ほど、情報より意思決定の品質が効く。
会議は消費されるが、Decision は未来の行動を拘束する。

`revisit` に日付を入れると、Decision Review Base に自動で乗る。
`## Reversal Trigger` があることで、AI に
「前提が崩れている Decision を列挙して」と依頼できるようになる。

### `source` — 主張と解釈を分ける

`## Source Summary` には**著者が主張していること**だけを書く。
自分の評価は `## My Interpretation` に分離する。

`## Promote` チェックリストで、Evergreen 化 / Decision 反映 / 破棄 を明示的に選ぶ。
「要約した」で終わらせない。

### `note` — Evergreen

1 ノート 1 概念を厳格に守る必要はない。
日本語は主語や前提を省略しやすいため、細分化しすぎると文脈が壊れる。

基準は **「1 ノート = 未来に一単位として再利用したい内容」**。

タイトルは分野名ではなく主張にする（SKILL.md の命名規則を参照）。

### `person` / `company` — 実体は 1 つ

同じ人物や企業が複数プロジェクトに登場しても、Entity Note は 1 つにする。
プロジェクト側から `[[株式会社ABC]]` とリンクする。

## MOC は型ではない

MOC は `type: note` で `40_Notes/MOCs/` に置く。
ただし単なるリンク集にしてはいけない。

良い MOC には**編集者の判断**が入っている。

- `## Current Thesis` — 現時点での自分の結論を 3〜5 行
- `## Core Principles` — 中心に置く主張へのリンク
- `## Counterarguments` — 反証
- `## Open Questions` — 未解決の問い
- `## Decisions` / `## Outputs` — 判断と成果物への接続

MOC は「関連ノート一覧」ではなく、
**領域全体をどう理解しているかを圧縮した、編集済みの認知モデル**である。
AI に草案を作らせてよいが、**最終編集は人間が行う**。
どの考えを中心へ置くかは知識整理ではなく戦略判断だからだ。

## 情報の分離ルール（全型共通）

次の 5 つを見出しで分離し、**ラベルなしに混ぜない**。

1. Observed facts（観測した事実）
2. Source claims（出典が主張していること）
3. My interpretation（自分の解釈）
4. Model inference（AI の推論）
5. Decisions（決定）

AI が生成した推論を `## Evidence` に昇格させてはいけない。
不確実なものは `## Open Questions` か `## Assumptions` に置く。
