---
name: obsidian-distill
description: Obsidian の Inbox・Daily・Meeting・Source ノートを、出典を保持したまま Evergreen Note、Decision、Task、Project リンクへ蒸留する。ユーザーが「整理」「蒸留」「promote」「昇格」「会議メモから決定を抽出」「Source から知識化」「このノートを再利用可能にして」と依頼したときに使う。破壊的な一括変更、ファイル名の一括移行、Schema 監査には使わない（それらは obsidian-vault-audit）。
---

# Goal

生のノートを再利用可能な知識へ変換する。ただし次を犠牲にしない。

- **provenance**（どこから来た情報か）
- **裏付けのない主張を作らないこと**
- **文脈の早すぎる分断を避けること**

# Default mode

**Dry-run。** ユーザーが明示的に「適用して」「書き込んで」と言うまで、
提案の提示だけを行う。

# Required inputs

- 対象ノートのパス
- 想定する用途（分かれば）
- 関連する Project（分かれば）

不明な場合は推測で埋めず、提案の中で「要確認」として提示する。

# Read first

1. Vault ルートの `CLAUDE.md` / `AGENTS.md`（あれば）
2. `90_System/Schemas/note-types.md` — 型と必須見出し
3. `90_System/Schemas/property-vocabulary.md` — 許可された Property
4. **対象ノートの全文**（部分読みで蒸留しない）
5. その frontmatter と outgoing links

`sensitivity: never_ai` のノートは処理しない。`90_Private/` 配下も読まない。

# Step 1 — 分類（混ぜない）

対象を次のカテゴリへ分離する。

1. **Observed facts** — 観測した事実
2. **Source claims** — 出典・参加者が主張していること
3. **User interpretation** — ユーザー自身の解釈
4. **Model inference** — あなた（AI）の推論
5. **Decisions** — 決定
6. **Tasks** — 行動
7. **Open questions** — 未解決の問い
8. **Candidate durable insights** — 長期保存の候補

**ラベルなしにこれらを統合してはいけない。**
AI が作った「もっともらしい解釈」が、数カ月後に事実として再利用される事故を防ぐ。

# Step 2 — 既存ノートを検索する（新規作成の前に）

**重複ノートの量産が、この作業の最大の失敗モード。**

1. 特徴的な検索フレーズを 3〜7 個抽出する
2. Vault 内で既存の関連ノートを検索する
3. 重複しそうなノートを実際に開いて中身を確認する
4. 関連 Project や MOC の backlinks を調べる
5. **ニアイコールの新規作成より、既存ノートの加筆を優先する**

Obsidian CLI が使えるなら:

```bash
obsidian search query="<フレーズ>"
obsidian search:context query="<フレーズ>"
obsidian backlinks path="<関連ノート>"
obsidian unresolved counts
```

使えない場合は Grep / Glob でよい。**検索を省略しない。**

# Step 3 — 昇格の判定

## Decision を作る条件

対象に次のいずれかが含まれるとき。

- 選択された選択肢
- コミットメント
- 却下された代替案
- 将来の行動を変える条件

Decision には `## Assumptions` と `## Reversal Trigger` を必ず持たせる。
**何が起きたらこの判断を撤回するか**が書けないなら、それはまだ Decision ではない。

## Evergreen を作る条件（すべて満たすとき）

- 出典の文脈を離れても理解できる
- 主張をユーザー自身の言葉で表現できる
- provenance をリンクできる
- 未来の利用場面（`## Use When`）を書ける

一つでも欠けるなら、**Source ノートに残す**。

## Source に残すもの

主に証拠、引用、出典固有の詳細であるもの。
「要約したから昇格」ではない。

# Step 4 — 提案を出す（書き込む前に）

次の 7 点を必ず報告する。

1. 作成する予定のファイル
2. 更新する予定のファイル
3. 張る予定のリンク
4. 抽出した Decision と Task
5. **検証が必要な主張**
6. 重複の可能性があるノート
7. **昇格させずに残すべき情報**（これを省かない）

# Step 5 — 書き込み（承認後のみ）

- **元の Source ノートを保存する**（消さない・移動しない）
- 昇格したノートに `source_notes` リンクを付ける
- 許可された Property 語彙だけを使う
- Properties 内の Wikilink は引用符で囲む: `- "[[価格戦略]]"`
- 不確実なものは `## Open Questions` か `## Assumptions` へ置く
- **AI の推論を `## Evidence` へ変換しない**
- グラフを繋がって見せるためだけの架空 Wikilink を作らない
- 新規 Evergreen は、レビュー前なら `00_Inbox/AI/` へ置く

# Step 6 — 検証

```bash
python3 scripts/vault_check.py --vault .
git diff --check
git diff --stat
```

差分を読み、意図しない削除がないか確認する。

# Completion format

- 作成したファイル
- 更新したファイル
- 抽出した Decision
- 抽出した Task
- 置いた仮定
- Validator の結果
- **人間のレビューを推奨する箇所**

# 禁止事項

- 承認前の書き込み
- `source_notes` の欠落
- 引用・URL・日付・出典の捏造
- 検索なしの新規ノート作成
- Obsidian CLI が使える環境で、生の `mv` によるファイル移動
- 元ノートの削除・上書き
