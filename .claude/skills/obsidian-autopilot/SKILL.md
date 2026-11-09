---
name: obsidian-autopilot
description: Obsidian Vault を「自動で記憶し、自動で思い出す」第二の脳にする。Claude Code のフックで会話を Vault へ自動記録し、関連する過去ノートを毎回の会話へ自動注入し、毎朝 Vault 側から「今日見るべきもの」を押し出す。ユーザーが「Obsidian が自動記憶しない」「Vault が役に立っていない」「第二の脳として機能させたい」「自動でメモを取らせたい」「過去のノートを勝手に思い出してほしい」「Vault の効果を測りたい」と言ったときに使う。Vault の新規構築や Schema 設計は obsidian-vault-kit を使う。
---

# Goal

Vault を**止まった倉庫**から**動く第二の脳**に変える。

第二の脳が失敗する条件は一つに集約できる。

> 自分の Vault から引き出すより、ゼロから考え直す方が速いなら、その Vault は墓場である。

テンプレートや Schema をどれだけ整えても、この条件は解消しない。
構造は「置き場所」を決めるだけで、**入力も想起も人間の意志力に依存**するからだ。
意志力は必ず切れる。切れた時点で Vault は死ぬ。

だから自動化する対象は整理ではなく、**入力・想起・押し出し**の 3 つである。

# 3 つのループ

| ループ | 仕組み | 効果 |
|---|---|---|
| **自動取り込み** | `Stop` / `UserPromptSubmit` フック | 何もしなくても Daily Note に会話が溜まる |
| **自動想起** | `UserPromptSubmit` が `additionalContext` を返す | 話しかけるたび、関連する過去の結論が勝手に文脈へ入る |
| **自動押し出し** | `daily_rollup.py` を cron で毎朝 | 止まった Project・期限切れの判断を Vault 側から突きつける |

**自動想起が核心。** 検索しに行く必要があるものは、結局使われない。
こちらが思い出さなくても向こうから出てくる状態にして、初めて第二の脳になる。

# 導入

```bash
python3 scripts/install_autopilot.py --vault ~/MyVault --dry-run
python3 scripts/install_autopilot.py --vault ~/MyVault
```

既存の `.claude/settings.json` はマージされ、バックアップが残る。
二重実行しても重複登録されない。`--uninstall` で元に戻る。

詳細は `references/install.md`。設計の根拠は `references/architecture.md`。

# スクリプト

| スクリプト | 役割 |
|---|---|
| `vault_search.py` | 検索エンジン。CJK bigram + BM25。日本語で機能する |
| `hook_capture.py` | UserPromptSubmit: 問いを記録し、関連ノートを注入する |
| `hook_answer.py` | Stop: Claude の結論を記録する |
| `daily_rollup.py` | Morning Brief を今日の Daily Note へ書く |
| `vault_stats.py` | 効いているかを数字で出す |
| `install_autopilot.py` | フックを settings.json へ導入する |

## 検索を手で叩く

```bash
python3 scripts/vault_search.py index --vault ~/MyVault
python3 scripts/vault_search.py query --vault ~/MyVault "価格改定の判断"
python3 scripts/vault_search.py query --vault ~/MyVault --min-ratio 0.3 "..."
```

`--min-ratio` は最高スコアに対する比率の下限。想起フックの既定は 0.3。
絶対スコアの閾値は Vault の規模で意味が変わるため使わない。

# 設定

`90_System/autopilot.json`

| キー | 既定 | 意味 |
|---|---|---|
| `capture_prompts` | true | 問いを Daily へ記録する |
| `capture_answers` | true | 結論を Daily へ記録する |
| `recall` | true | 関連ノートを注入する |
| `recall_limit` | 3 | 注入する件数 |
| `recall_min_ratio` | 0.3 | 最高スコアに対する比率の下限 |
| `min_prompt_chars` | 12 | これ未満の入力は記録しない |
| `log_queries` | false | 想起ログに問い本文を残すか |
| `exclude_patterns` | [] | 記録しない入力の正規表現 |

**記録しすぎない。** Daily Note がノイズで埋まると読まれなくなり、
結局「導入して終わり」に戻る。`min_prompt_chars` と `exclude_patterns` で削る。

# 効いているかを測る

```bash
python3 scripts/vault_stats.py --vault ~/MyVault
```

見るべき指標は 2 つだけ。

1. **想起の発火回数** — Vault が実際に知識を戻してきた回数。
   0 のままなら、フックが入っていないか、Vault に中身が無い
2. **Output Conversion** — 成果物のうち既存ノートを再利用した割合。
   低いなら、知識は溜まっているが使われていない

ノート数・リンク数・Graph の見た目は指標ではない。

# このスキルがやらないこと

- Vault の新規構築、Schema 設計、テンプレート作成 → `obsidian-vault-kit`
- 1 ノートの蒸留・昇格 → `obsidian-distill`
- 週次レビュー → `obsidian-weekly-review`
- Schema 監査・移行計画 → `obsidian-vault-audit`

# 運用上の注意

- **フックは絶対に失敗してはいけない。** 全ての例外を握り潰し、常に exit 0 を返す。
  壊れた入力・Vault 不在・インデックス破損でもセッションを止めない
- **`SessionEnd` は使わない。** 既定のバジェットが 1.5 秒しかなく、
  発火しない事例も報告されている。記録を取りこぼす
- **注入は短く保つ。** 毎ターン入るので、長いと会話のコストになり邪魔になる
- **インデックスは mtime 差分で更新する。** 全件再構築は `--force` のときだけ
- `90_Private/` と `.obsidian/` は検索対象から除外される
- `.recall_index.json` と `.recall_log.jsonl` は `90_System/` 配下。
  Git 管理しないなら `.gitignore` へ追加する

# 想起の精度を上げる

想起が当たらないときに効く順。

1. **Evergreen Note に `## Use When` を書く** — 未来の検索意図が文章で入るので、
   インデックス側で 3 倍の重みがつく。最も効果が大きい
2. **タイトルを主張にする** — 「価格戦略」より
   「高価格商品ほど機能より失敗回避を売る」。タイトルは 4 倍の重み
3. **`aliases` を足す** — 日本語の表記揺れと英略語（LTV 等）を吸収する
4. それでも外すなら `recall_min_ratio` を下げる（0.2 など）
