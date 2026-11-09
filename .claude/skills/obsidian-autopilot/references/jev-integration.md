# Jev (TypeSafe AI) を Obsidian で活かす

## なぜ「導入したのに何も起きない」のか

Jev を入れても何も変わらないのは、使い方を間違えているのではなく、
**そもそも受動的に効く仕組みではない**ため。

公式の Claude Code プラグイン（`claude plugin install typesafe@typesafe-ai`）が
やるのは、**エージェントに Jev を呼ぶコードを書かせられるようにする**ことだけ。
Claude Code の動作に割り込むわけでも、トークンを自動で削るわけでもない。

> Jev は Claude Code / Cursor / Codex の背後のモデルを置き換えるものではない。

つまり **Jev を呼ぶ処理を自分で持っていない限り、永遠に何も起きない。**
これが「導入済みだが全く機能していない」の正体。

## Jev とは何か

TypeSafe の "System One" モデル。**文章を生成しない。型付きの判断だけを返す。**

| プリミティブ | 問い方 | 返るもの |
|---|---|---|
| `noul` | その記述は成り立つか | `0〜1` の確率 |
| `choice` | こちらが並べた選択肢のどれか | `choice` + `confidence` + 各選択肢の確率 |
| `score` | 順序付きラベル（1〜10 個）での位置 | `score`（小数可） + `confidence` |
| `box` | 画像中のどこにあるか | 座標 + `confidence` |

同じ `state` への独立した問いは **1 リクエストにまとめる**。
並列評価されるので、問いを増やしても応答時間はほぼ変わらない。

## トークンが減る本当の理屈

Jev は Claude のトークンを自動で削らない。削れるのは、
**今 Claude にやらせている「判断」を Jev に移したときだけ**。

| | Claude に判断させる | Jev に判断させる |
|---|---|---|
| 出力 | 文章（説明が付いてくる） | 型付きの値のみ |
| 入力単価 | 高い | $0.042 / 1M トークン |
| 出力課金 | あり | 無料 |
| 応答 | 秒単位 | 70〜500ms（ベンダー公称） |

Inbox 100 件を分類する場合:

- Claude: 100 件分の本文を読み、各件について理由つきで答える
- Jev: 同じ本文に型付きの問いを 3 つ。100 件で約 50K トークン ≒ **$0.002**

桁が違うのは、**Jev が説明を書かないから**。

### 注意すべき点

- 「1M → 86K トークン」「3 分の 1 のコスト」といった数字は、
  宣伝記事か単発の実測で、**独立したベンチマークは見つからない**
- それらを実現する「エージェントループに割り込む」プラグインは
  **TypeSafe 公式ではなく第三者製**。文脈の剪定が
  推論の重要な痕跡を落とす危険を指摘する声もある
- Jev にも課金は発生する。無料になるのではなく、**単価の安い方へ逃がす**だけ
- 2026-11 時点で自前の無料枠は見当たらない。価格は公式で確認すること

## Jev に向くこと / 向かないこと

ここを外すと「使えない」と感じる。

| 向く | 向かない |
|---|---|
| 振り分け・トリアージ | 要約・返信・文章生成 → Claude |
| 用意した選択肢から 1 つ選ぶ | 計算・日付比較・件数集計 → コード |
| 文章への yes/no 判定 | 厳密な検索・実行 → コード |
| 壊れやすいパース処理の置き換え | 新しい値を作り出すこと |
| 自信度の低いものを人間へ回す | |

YouTube の
[「AIに判断を任せて思考を整理！文章を書かずにObsidianをより強力に使いこなす方法」](https://www.youtube.com/watch?v=YquEXNxQfN4)
（飯塚浩也 | Obsidianでつくる最強の右腕）が言う**「文章を書かせない」**は、
まさにこの切り分けのこと。

## Obsidian での使いどころ

`scripts/jev_client.py` が依存ゼロのクライアント。

```bash
export TYPESAFE_API_KEY=...        # console.typesafe.ai で発行
python3 scripts/jev_client.py --selftest
```

### 1. Inbox トリアージ（最も効く）

週次レビューで一番重いのが「Inbox を 1 件ずつ見て行き先を決める」作業。
これは判断であって文章生成ではない。Jev の本来の用途。

```python
from jev_client import JevClient, choice, noul, score

client = JevClient()
answers = client.ask(
    {"note": note_text},
    {
        "dest": choice("このノートの行き先はどれか", {
            "evergreen": "文脈を離れても通用する、長期再利用する知識",
            "source":    "外部情報の記録。出典に紐づく",
            "decision":  "選択・コミットメント・却下した案が含まれる",
            "project":   "終了条件のある活動に属する",
            "discard":   "再利用価値がない",
            "other":     "当てはまらない",
        }),
        "has_decision": noul("このノートには、将来の行動を縛る決定が含まれているか"),
        "reuse": score("将来どのくらい再利用されそうか",
                       ["ほぼ使わない", "たまに", "頻繁に"]),
    },
)
dest, confidence = client.choice_value(answers, "dest")
if confidence < 0.6:
    dest = "needs_human"      # 自信が低いものは人間へ回す
```

**`confidence` で人間へ回す**のが肝。全件を自動処理しない。

### 2. 想起の精度を上げる（毎ターンのトークンを減らす）

`hook_capture.py` は毎ターン関連ノートを注入する。これは**トークンを足す**。
BM25 で 3 件に絞った後、Jev で「本当に役に立つか」を篩うと、
無駄な注入が減り、結果として毎ターンのトークンが減る。

```python
questions = {
    f"n{i}": noul(f"次のノートは、ユーザーの問いに答えるうえで実際に役立つか。"
                  f"ノート: {r['title']} — {r['summary']}")
    for i, r in enumerate(results)
}
answers = client.ask({"question": prompt}, questions)   # 1 リクエストで全件
kept = [r for i, r in enumerate(results)
        if client.noul_value(answers, f"n{i}") >= 0.6]
```

ただし**想起フックは速度が命**。Jev の 70〜500ms が毎ターン乗る。
遅いと感じたら BM25 だけに戻す。`autopilot.json` の `jev_gate` で切り替える前提にする。

### 3. 前提の崩壊を検知する（判断の品質に直結）

Decision Note の `## Assumptions` と `## Reversal Trigger` を、
最近の Daily / Source と突き合わせて成否を問う。

```python
answers = client.ask(
    {"assumption": assumption_text, "recent": recent_notes_text},
    {"broken": noul("`recent` の内容から見て、`assumption` はすでに崩れているか"),
     "near":   noul("`recent` の内容は、この判断の Reversal Trigger に近づいているか")},
)
```

全 Decision を Claude に読ませると高いが、Jev なら毎週回しても誤差。
**決めっぱなしの回収**という、Vault で最も価値の高い処理が常時運用できるようになる。

### 4. 記録のノイズ除去

`hook_capture.py` は現在 `min_prompt_chars` と正規表現で機械的に削っている。
Jev なら「この会話は後から見返す価値があるか」で判定できる。

ただし**毎ターン Jev を呼ぶことになる**ので、費用対効果は薄い。
Daily Note が実際にノイズで埋まってから検討する。

## 設計上の約束

- **必ずフォールバックする。** キー未設定・到達不能は `JevUnavailable`。
  Jev が無くても全機能が動くこと。Jev は精度を足すだけの層にする
- **1 リクエストにまとめる。** 独立した問いを 1 件ずつ投げない
- **`choice` には必ず `other` を入れる。** 当てはまらない入力は必ず来る
- **`confidence` で人間へ回す。** 不可逆な操作を自信度なしで実行しない
- **問いと閾値は 1 ファイルにまとめる。** 散らばると調整できなくなる
- **問いの本文を書く。** 質問 ID はモデルに送られない
- **応答の `model` を記録する。** モデル更新で挙動が変わったときに切り分けられる

## API の実体（2026-11 時点・公式ドキュメント確認済み）

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer $TYPESAFE_API_KEY
Content-Type: application/json

{ "model": "jev-latest", "state": <string|object|array>,
  "questions": { "<name>": { "type": "noul|choice|score|box", ... } } }
```

応答:

```json
{ "model": "...", "answers": { "<name>": { ... } },
  "usage": { "input_tokens": 0, "output_tokens": 0 } }
```

- `noul`  → `{"noul": 0.0〜1.0}`
- `choice`→ `{"choice": "...", "confidence": 0.0〜1.0, "probabilities": {...}}`
- `score` → `{"score": 小数可, "confidence": ..., "legend": {...}}`

公式 Python SDK もある（`pip install typesafe-sdk`、`TypeSafeClient` /
`AsyncTypeSafeClient` の `system_one(state=..., questions=...)`）。
本キットは依存を増やさないため urllib で直接叩いている。
