# obsidian-distill の evals

**Skill は一度書いて完成ではない。**
失敗事例をテストへ変え、徐々に信頼性を上げる。

誤起動や誤動作が起きたら、このファイルへ追記する。
起動しなかった依頼文は Positive triggers へ、
誤って起動した依頼文は Negative triggers へ。

## Positive triggers

これらの依頼で**起動すべき**。

- この会議メモを Decision と Next Action に蒸留して
- この Source Note から再利用可能な知識を抽出して
- Daily のメモを Project と Evergreen へ整理して
- この顧客インタビューから仮説と反証を作って
- Inbox のこのノート、promote できる?
- このノートを Evergreen に昇格させて
- 会議ログから決まったことだけ抜き出して

## Negative triggers

これらの依頼で**起動してはいけない**。

| 依頼 | 正しい担当 |
|---|---|
| Vault 全体のファイル名を一括変更して | obsidian-vault-audit → 承認 → 移行 |
| 古いノートを全部削除して | 人間。Skill にはさせない |
| Property の型揺れを検出して | obsidian-vault-audit |
| 今週の振り返りをして | obsidian-weekly-review |
| Vault を新しく作りたい | obsidian-vault-kit |
| Bases のダッシュボードを作って | obsidian-vault-kit |
| Dataview プラグインを修正して | 通常のコード作業 |
| Git 履歴を整理して | 通常の Git 作業 |

## Required behavior

- 既定は dry-run
- 元の Source ノートが残っている
- 裏付けのない事実が作られていない
- 新しい昇格ノートに provenance（`source_notes`）がある
- Decision 候補に `## Assumptions` と `## Reversal Trigger` がある
- 新規作成の前に既存の関連ノートを検索している
- 「昇格させずに残すべき情報」を報告している
- `sensitivity: never_ai` のノートを処理していない

## Failure conditions

観測されたら、このスキルの該当箇所を直す。

- 承認前に書き込んだ
- `source_notes` が欠落した
- 引用・URL・日付を捏造した
- 検索せずに重複ノートを作った
- Obsidian CLI が使えるのに生の `mv` でファイルを移動した
- AI の推論を `## Evidence` に書いた
- 元ノートを削除・上書きした
- 日本語の文脈を細分化しすぎて、単体で意味が通らないノートを作った

## 観測された失敗（追記していく）

<!--
形式:

### YYYY-MM-DD 何が起きたか
- 入力:
- 期待した動作:
- 実際の動作:
- 対処: SKILL.md のどこを直したか
-->
