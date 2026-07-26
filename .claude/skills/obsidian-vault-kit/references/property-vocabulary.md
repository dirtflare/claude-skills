# Property Vocabulary

Vault 全体で許可される Property 名と値。ここにない Property は原則使わない。

> Obsidian の Properties は YAML として保存され、
> **同じ名前の Property は Vault 全体で同じ型として扱われる。**
> 一箇所で型を変えると、他のノートにも影響する。

## 命名規則

- Property 名は **ASCII の snake_case**（本文とタイトルは日本語で構わない）
- 日付は **ISO 形式 `YYYY-MM-DD`**
- Properties 内の Wikilink は**必ず引用符で囲む**: `- "[[価格戦略]]"`

## 制御語彙

```yaml
type:
  inbox
  daily
  project
  area
  meeting
  decision
  source
  note
  person
  company
  output

status:
  inbox      # 未処理
  active     # 進行中
  waiting    # 他者待ち
  done       # 完了
  archived   # 保管

confidence:
  low
  medium
  high

sensitivity:
  public
  internal
  confidential
  never_ai   # AI に処理させない
```

`sensitivity: never_ai` は Validator と CLAUDE.md の両方で参照される。
ただし**これは表明であって強制ではない**。本当に読ませてはいけないデータは
`permissions.deny` で塞ぐか、別 Vault に置く。

## Property 一覧

| Property | 型 | 使う型 | 説明 |
|---|---|---|---|
| `type` | text | 全て | ノート型。上の語彙のみ |
| `status` | text | 大半 | ライフサイクル状態 |
| `created` | date | 全て | 作成日。`YYYY-MM-DD` |
| `aliases` | list | 任意 | 表記揺れの吸収。日本語で特に重要 |
| `topics` | list of link | note, source, project | 概念ノートへの Wikilink |
| `source_notes` | list of link | note, output | 出典ノートへの Wikilink（provenance） |
| `project` | link | decision, meeting, output | 所属 Project |
| `area` | link | project | 所属 Area |
| `owner` | text | project, decision | 担当。既定は `me` |
| `due` | date | project | 期限 |
| `next_action` | text | project | 次の具体的な一手。**必須** |
| `revisit` | date | decision | この判断を見直す日 |
| `confidence` | text | note, source, decision | 確信度 |
| `sensitivity` | text | 大半 | 取り扱い区分 |
| `source_url` | text | source | 出典 URL |
| `author` | text | source | 著者・発言者 |
| `published` | date | source | 公開日 |

## 意図的に持たない Property

- **`updated`** — 手入力しない。更新日時は `file.mtime` で取得でき、
  Bases から参照できる。手動 Property にすると保守コストになるだけ。
- **`tags` を分類に使う Property** — 概念はリンクにする。
  タグは `#review` `#waiting` `#question` `#contradiction` `#publish` の
  一時的な横断状態に限定する。
- **`id`** — ファイルパスとファイル名が識別子。二重管理しない。

## Two-Key Retrieval Rule

すべての重要情報は、**2 つの検索経路**を持たなければならない。

| 経路 | 手段 |
|---|---|
| 人間用 | タイトル / MOC / リンク / Alias |
| 機械用 | `type` / `status` / `project` / `created` / `topics` |

片方が壊れても、もう片方で見つかる。
Property を増やす目的はこれであって、埋めること自体ではない。

## Schema を変更するとき

Property 名の変更・値の統合は、必ず次の順で行う。

1. **観測**（推測しない）— 実際に使われている値を集計する
2. **計画**— 対象ファイル数、値ごとの件数、衝突ファイル、Rollback 手順
3. **承認**— 人間が計画を読む
4. **適用**— ブランチを切って一括変更
5. **検証**— `vault_check.py` と `git diff`

`obsidian-vault-audit` スキルがこの 1〜2 を担当する。
