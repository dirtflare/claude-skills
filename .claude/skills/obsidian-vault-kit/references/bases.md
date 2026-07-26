# Bases — Vault の経営ダッシュボード

Bases は Obsidian のコア機能。ノートの Properties をデータベースのように
表示・フィルター・並び替えできる。

**データは独自 DB へ移されない。Markdown の Properties のまま残る。**
だから Bases をやめても情報は失われない。これが Dataview より優先する理由。

`.base` ファイルとして `90_System/Bases/` に置くか、ノート内へ埋め込む。

## 構文の要点

| セクション | 役割 |
|---|---|
| `filters` | データセットを絞る。`and` / `or` / `not` が使える。全体にもビュー単位にも書ける |
| `formulas` | 計算プロパティ。全ビューから `formula.<name>` で参照できる |
| `properties` | 各プロパティの表示設定（`displayName` など） |
| `views` | 描画方法。type、名前、フィルター、並び順を指定 |

使える主なもの:

- ファイル情報 — `file.name`, `file.ext`, `file.mtime`, `file.ctime`, `file.size`
- 日付関数 — `today()`（日付）, `now()`（日時）
- 期間 — `'1d'`, `'14d'` のような文字列。日付演算にはそのまま使える
  （`now() - '14d'`）。期間同士の演算には `duration('1d') * 2` のように明示する
- 条件 — `if(condition, trueResult, falseResult)`

> 動作が怪しいときは、まず Obsidian 上で 1 ビューだけ作って確認してから
> `.base` ファイルへ落とす。構文は公式ドキュメント（Bases > Syntax / Functions）が正。

---

## Projects.base — 止まっている仕事を見つける

`90_System/Bases/Projects.base`

```yaml
filters:
  and:
    - 'file.ext == "md"'
    - 'type == "project"'

formulas:
  missing_next_action: 'if(!next_action, "⚠ next action なし", "")'
  stale: 'if(file.mtime < now() - "14d", "14日以上更新なし", "")'

properties:
  file.name:
    displayName: Project
  owner:
    displayName: Owner
  next_action:
    displayName: Next Action
  due:
    displayName: Due
  formula.missing_next_action:
    displayName: Health
  formula.stale:
    displayName: Stale

views:
  - type: table
    name: Active
    filters:
      and:
        - 'status == "active"'
    order:
      - file.name
      - owner
      - next_action
      - due
      - formula.missing_next_action
      - formula.stale

  - type: table
    name: Waiting
    filters:
      and:
        - 'status == "waiting"'
    order:
      - file.name
      - owner
      - next_action

  - type: table
    name: Overdue
    filters:
      and:
        - 'status == "active"'
        - 'due'
        - 'due < today()'
    order:
      - file.name
      - due
      - next_action
```

このビューが答える問い:
**「next_action が無い active Project はどれか」「14 日以上動いていない Project はどれか」**

---

## Decisions.base — 決めっぱなしを回収する

`90_System/Bases/Decisions.base`

```yaml
filters:
  and:
    - 'file.ext == "md"'
    - 'type == "decision"'

formulas:
  review_state: 'if(revisit <= today(), "要レビュー", "")'
  no_revisit: 'if(!revisit, "⚠ revisit 未設定", "")'

properties:
  file.name:
    displayName: Decision
  project:
    displayName: Project
  revisit:
    displayName: Revisit
  confidence:
    displayName: Confidence
  formula.review_state:
    displayName: Review

views:
  - type: table
    name: Revisit Due
    filters:
      and:
        - 'revisit'
        - 'revisit <= today()'
    order:
      - file.name
      - project
      - revisit
      - confidence
      - formula.review_state

  - type: table
    name: Missing Revisit
    filters:
      and:
        - 'status == "active"'
        - '!revisit'
    order:
      - file.name
      - project
      - created

  - type: table
    name: Low Confidence
    filters:
      and:
        - 'confidence == "low"'
    order:
      - file.name
      - project
      - created
```

**このビューを見るだけで、決めっぱなしになっている判断を回収できる。**

---

## Inbox.base — Capture が溜まっていないか

`90_System/Bases/Inbox.base`

```yaml
filters:
  and:
    - 'file.ext == "md"'
    - 'status == "inbox"'

formulas:
  age: 'if(file.ctime < now() - "14d", "⚠ 14日以上滞留", "")'

properties:
  file.name:
    displayName: Note
  type:
    displayName: Type
  file.ctime:
    displayName: Captured
  formula.age:
    displayName: Age

views:
  - type: table
    name: Oldest First
    order:
      - file.ctime
      - file.name
      - type
      - formula.age
```

週次レビューでは**古い順に処理する**。
各入力を Delete / Archive / Project / Source / Evergreen / Decision / Output のどれかにする。

---

## Outputs.base — 知識が成果物へ変換されているか

`90_System/Bases/Outputs.base`

```yaml
filters:
  and:
    - 'file.ext == "md"'
    - 'type == "output"'

formulas:
  reused: 'if(!source_notes, "⚠ 既存ノート未再利用", "")'

properties:
  file.name:
    displayName: Output
  status:
    displayName: Status
  project:
    displayName: Project
  formula.reused:
    displayName: Reuse

views:
  - type: table
    name: Drafts
    filters:
      and:
        - 'status != "done"'
    order:
      - file.name
      - status
      - project
      - formula.reused

  - type: table
    name: Published
    filters:
      and:
        - 'status == "done"'
    order:
      - file.name
      - project
      - file.mtime
```

`source_notes` が空の Output は、**Vault を使わずに書いた成果物**である。
これが多いなら、知識が再利用されていない。Output Conversion Rate が低い状態。

---

## Bases と Dataview の使い分け

```
Bases でできるなら Bases。
Dataview でしかできない場合だけ Dataview。
DataviewJS は、自分で読んで理解できるコードだけ。
```

理由は機能ではなく**壊れ方**にある。

- Bases は Properties を Markdown に残す。プラグインを外しても情報は残る
- DataviewJS は Vault の書き換え・ファイル作成削除・ネットワークアクセスが可能。
  通常の Dataview Query よりリスクが高い

高機能であることより、**壊れたときに Markdown だけで復旧できること**の方が重要。
