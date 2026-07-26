---
name: obsidian-weekly-review
description: Obsidian Vault の週次レビューを実行し、今週決まったこと・実行されていない決定・停止した Project・崩れた前提・繰り返した摩擦・来週の Top 3・成果物に変換できる知識をレポートする。ユーザーが「週次レビュー」「今週の振り返り」「weekly review」「今週何が決まった?」「止まっている Project は?」と依頼したときに使う。読み取り専用。ファイルの変更には使わない。
---

# Goal

**読み取り専用のレポートを作る。** Vault を変更しない。

週次レビューの目的は整頓ではない。
「決めたのに動いていないこと」と「前提が崩れた判断」を回収することだ。

# Default mode

**Read-only。** ファイルの作成・編集・移動・削除を行わない。
ユーザーが後から「これを Decision にして」と言った場合は、
`obsidian-distill` へ引き継ぐ。

# Read first

1. `CLAUDE.md` / `AGENTS.md`
2. `90_System/Schemas/note-types.md`

`sensitivity: never_ai` のノートと `90_Private/` は読まない。
個人情報はレポートへ全文転載しない。

# 対象範囲

既定は直近 7 日。ユーザーが期間を指定したらそれに従う。

- `10_Daily/` の直近 7 日分
- `status: active` の Project 全件
- 直近 7 日に作成・更新された Decision
- `revisit` 期限を迎えた Decision（期間外でも含める）
- `70_Outputs/Drafts/` の全件
- `status: inbox` のノート（滞留日数つき）

Obsidian CLI が使えるなら活用する。

```bash
obsidian search query="<検索語>"
obsidian tasks todo
obsidian orphans total
obsidian unresolved counts
```

# レポートの構成

次の 7 セクションを、この順で出す。
**各項目に原文ノートへのリンクを付ける。**

## 1. 今週決まったこと

新規 Decision の一覧。一件一行で「何を決めたか」。
Decision Note になっていないが Daily に埋もれている判断があれば、
**「Decision 化の候補」として別立てで挙げる**。

## 2. 決まったが実行されていないこと

Decision の `## Follow-up` が未完のもの。
Decision から生まれたはずの Task が Project に無いもの。

## 3. 停止している Project

- 14 日以上更新のない `status: active` の Project
- `next_action` が空の Project
- **`next_action` が曖昧な Project**（ここは機械判定できないので中身を読む）

| 弱い next_action | 強い next_action |
|---|---|
| 料金について考える | 競合5社の年額料金を表へ入力する |
| 採用を進める | 候補者3名へ二次面接の日程候補を送る |

## 4. 崩れた前提

Decision の `## Assumptions` と、直近の Daily / Source / Meeting を突き合わせる。

- すでに崩れている Assumption
- 弱くなった Evidence
- **Reversal Trigger へ近づいている Decision**
- 検証されないまま事実扱いされている主張

**これが週次レビューで最も価値の高いセクション。**
機械的な期限チェックでは出てこない。

## 5. 繰り返し発生した摩擦

Daily の `## Friction Log` を集計する。

- 何を探して見つからなかったか
- 同じ検索失敗が複数回起きていないか

各失敗に対して、対処案を 1 つ添える:
タイトルを変える / Alias を追加する / MOC へ入れる / Property を追加する /
そもそも保存対象から外す。

**Vault の構造は、見た目の好みではなく、ここから改善する。**

## 6. 来週の Top 3

active Project と未完 Decision から、来週やるべきことを 3 つ提案する。
根拠となるノートへのリンクを付ける。**推奨であって決定ではない**ことを明示する。

## 7. Output に変換できる知識

今週得た知識のうち、外部成果物へ変えられるもの。

- 複数の Source が同じ主題に集まっている箇所
- 更新された MOC
- `## Possible Outputs` が埋まっている Evergreen

# 出力ルール

- **事実・推論・提案を分離する。** 見出しかラベルで明示する
  - 事実 = ノートに書かれていること
  - 推論 = あなたが複数ノートから導いたこと
  - 提案 = あなたの推奨
- すべての指摘に原文ノートへのリンクを付ける
- 空のセクションは「該当なし」と書いて省略しない
  （該当なしという事実自体が情報になる）
- 個人情報・機密情報を全文転載しない

# 補足: 週次レビューの所要時間

30〜45 分を想定した分量にする。
網羅性より、**行動に繋がる指摘の密度**を優先する。
50 件の指摘より、5 件の「今すぐ直すべきこと」の方が価値が高い。
