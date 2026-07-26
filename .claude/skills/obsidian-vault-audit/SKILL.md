---
name: obsidian-vault-audit
description: Obsidian Vault の Schema drift と構造的な問題を検出する。Property の型揺れ・表記揺れ、許可されていない status、引用符のない Wikilink、壊れた frontmatter、命名規則違反、重複ノート、未解決リンク、孤立ノートを監査し、修正方針と危険度つきで報告する。Property の一括移行計画（対象件数・衝突・Rollback 手順）の作成にも使う。ユーザーが「Vault を監査」「Schema をチェック」「型揺れを検出」「一括移行の計画を立てて」と依頼したときに使う。既定は読み取り専用で、修正の適用には使わない。
---

# Goal

Vault の構造的な破綻を、**修正する前に可視化する**。

このスキルは診断であって治療ではない。
検出 → 計画 → 承認 → 適用 の 1〜2 までを担当する。

# Default mode

**Read-only。** ファイルの作成・編集・移動・削除を一切行わない。
完了時に `git status` で変更ゼロを確認して報告する。

適用は人間の承認後、別ブランチで行う（このスキルの外）。

# Read first

1. `CLAUDE.md` / `AGENTS.md`
2. `90_System/Schemas/note-types.md`
3. `90_System/Schemas/property-vocabulary.md`
4. `90_System/Bases/` の各 `.base`（何が前提にされているか）

`sensitivity: never_ai` と `90_Private/` は対象外。

# Step 1 — 機械的検査を先に走らせる

手で読む前に Validator を回す。人間が読むべき箇所を絞るため。

```bash
python3 scripts/vault_check.py --vault .
```

Obsidian CLI が使えるなら併用する。

```bash
obsidian unresolved counts    # 未解決リンク
obsidian orphans total        # 被リンクなしノート
```

# Step 2 — 監査項目

## A. Schema drift

- **Property の型揺れ** — 同名 Property が場所によって別の型
  （Obsidian では同名 Property は Vault 全体で同じ型として扱われる。
  これが混ざると Bases が壊れる）
- 許可されていない `type` / `status` / `confidence` / `sensitivity` の値
- 必須 Property の欠落（型別）
- 壊れた frontmatter、YAML パースエラー
- **Properties 内の引用符なし Wikilink** — `- [[X]]` は
  ネストしたリストとして解釈され、リンクにならない
- ISO 形式でない日付
- 手動 `updated` Property（`file.mtime` を使うべき）
- **使われていない Property** — 語彙にあるが誰も使っていない
- **語彙にない Property** — 勝手に増えたもの

## B. 表記揺れ

- 同義タグの増殖（`#AI` `#人工知能` `#生成AI` `#LLM`）
- 概念がタグとリンクの両方で表現されている
- 同じ実体が複数ノートに分裂（人物・企業）
- Alias で吸収すべき日本語の表記揺れ

## C. 命名規則違反

```
PJT <名前>              Project
DEC YYYY-MM-DD <名前>   Decision
MTG YYYY-MM-DD <相手>   Meeting
SRC <著者> - <タイトル>  Source
```

Evergreen Note のタイトルが**分野名になっているもの**も挙げる
（「価格戦略」→「高価格商品ほど機能より失敗回避を売る」）。
これは規則違反ではないが、検索性を大きく下げる。

## D. 構造の健全性

- ライフサイクルとフォルダの不一致（`status: archived` なのに `20_Projects/`）
- 未解決リンク
- 孤立ノート（被リンクなし）で、かつ重要そうなもの
- 肥大した MOC（`## Current Thesis` が無く、リンク集になっている）
- 重複・統合候補のノート

## E. 運用の停止

- `next_action` の無い `status: active` Project
- 14 日以上更新のない active Project
- `revisit` の無い active Decision
- `## Reversal Trigger` が空の Decision
- `source_notes` の無い Output（Vault を使わずに書かれた成果物）
- 滞留している Inbox

# Step 3 — 報告

**修正しない。** 次を報告する。

各指摘について:

| 項目 | 内容 |
|---|---|
| 件数 | 何件あるか |
| 対象パス | 代表例。多い場合は上位 10 件 + 総数 |
| 修正方針 | どう直すか |
| 危険度 | 下表 |
| 自動修正可否 | スクリプトで直せるか、人間の判断が要るか |

危険度:

- **高** — Bases が壊れる、リンクが切れる、データが失われうる
- **中** — 検索性が落ちる、AI が誤解する
- **低** — 一貫性の問題。急がない

**優先順位順に並べる。** 全部直す必要はない。

# Step 4 — 一括移行の計画（依頼された場合のみ）

Property の改名・値の統合を頼まれたら、**計画だけ**作る。

**値の対応表を推測しない。実際の観測値を集計する。**

報告に含めるもの:

1. 対象ファイル数
2. **値ごとの件数**（観測値。推測ではない）
3. 衝突ファイル（新旧の Property が両方あるもの）
4. 除外対象（`99_Archive/`、`sensitivity: never_ai`）
5. 移行スクリプト案
6. 検証方法
7. **Rollback 手順**

承認後の適用手順（このスキルの外で行う）:

```bash
git switch -c ai/migrate-<name>
# 移行スクリプトを実行
python3 scripts/vault_check.py --vault .
git diff --check && git diff --stat && git diff
```

変更が大きいなら worktree で本体から隔離する。

```bash
git worktree add ../MyVault-AI -b ai/vault-refactor
```

# 禁止事項

- ファイルの作成・編集・移動・削除
- `status` / `due` / `next_action` の**存在だけ**で機械的に判断すること
  （本文の `## Current State` と `## Log` も読む)
- 観測せずに値の対応表を作ること
- 個人情報をレポートへ全文転載すること
- 「全部直しましょう」という提案（優先順位をつける）

# Completion

最後に必ず:

```bash
git status
```

**ファイル変更がゼロであることを確認して報告する。**
