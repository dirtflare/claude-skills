# Templates

`90_System/Templates/` へ置くテンプレート。
Templates コアプラグインで `{{title}}` `{{date}}` `{{time}}` が使える。
テンプレート内の Properties は新しいノートへ統合される。

`scaffold_vault.py` がこれらを自動生成する。手で作る場合はここからコピーする。

---

## Daily.md

```markdown
---
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
```

**Friction Log が最も重要。**
「何を探したが見つからなかったか」を記録すると、
実際の検索失敗に基づいて Vault を改善できる。
見た目の好みではなく、失敗した検索から構造を進化させる。

Daily では整理しすぎない。Capture Latency を守る。

---

## Project.md

```markdown
---
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
```

Project Note はタスクの倉庫ではない。
**誰かが 30 秒で現状を理解できる、プロジェクトの司令室**にする。

---

## Decision.md

```markdown
---
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
```

**最も重要なのは `## Reversal Trigger`。**
優秀な意思決定者は、正しさを主張し続ける人ではない。
どの条件で自分の判断を変更するかを、決定時点で書ける人である。

この構造があるから、AI に
「前提が崩れている Decision を列挙して」と依頼できる。

`revisit` に日付を入れると Decision Review Base に自動で乗る。

---

## Source.md

```markdown
---
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
```

「要約した」で終わらせない。
**`## What Changes If True` を必須にすると、情報収集が行動へ接続される。**

---

## Evergreen.md

```markdown
---
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
```

**`## Use When` は未来の検索意図を文章として保存する欄。**

例:
- 料金プランを改定するとき
- 高単価商品の営業トークを作るとき
- 顧客が価格に反対したとき

この記述は、人間の検索にも AI の意味検索にも効く。

タイトルは分野名ではなく**主張**にする。

---

## Meeting.md

```markdown
---
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
```

生ログは削らずに残す。蒸留は `obsidian-distill` が後で行う。
**会議は消費されるが、Decision は未来の行動を拘束する。**
重要な判断は必ず Decision Note へ切り出す。

---

## MOC.md

```markdown
---
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
```

MOC は目次ではない。
**領域全体をどう理解しているかを圧縮した、編集済みの認知モデル。**

AI に草案を作らせてよいが、**最終編集は人間が行う**。
どの考えを中心へ置くかは、知識整理ではなく戦略判断だから。

MOC は最初に作らない。2 週目に 2〜3 個だけ作る。
