---
name: generate
description: >-
  Generate images, video, audio and 3D through pay-as-you-go model aggregators
  (fal.ai first, kie.ai / WaveSpeed as optional lanes) with a hard cost ceiling,
  and keep every output plus its prompt in a local library you own. Also exports
  an existing Higgsfield account's generations and prompts to local disk before
  cancelling or downgrading. Use when the user wants to generate media from
  Claude Code, asks about fal.ai / kie.ai / WaveSpeed / Higgsfield, wants to cut
  a generative-AI subscription, worries about a platform training on their
  outputs or deleting them, or mentions 画像生成, 動画生成, 生成AI, 従量課金,
  API で生成, ローカル保存, 退避, バックアップ, 解約前, 生成物の権利,
  コスト上限, 予算, 見積もり.
---

# /generate — 従量課金 + ローカル所有の生成環境

このスキルは2つの独立した仕事をする。片方だけ使ってもよい。

1. **退避** — Higgsfield 等のプラットフォーム上の生成物とプロンプトを
   ローカルへ吸い出す。解約するかどうかとは無関係に、先にやっておく価値がある。
2. **生成** — fal.ai の従量課金 API で新規生成し、最初からローカルへ落とす。

背景の判断材料は [references/decision.md](references/decision.md) にある。
**「サブスクを解約すれば安くなる」とは限らない**ので、乗り換えを勧める前に必ず読むこと。

---

## ハードルール (例外なし)

このスキルで課金の発生する操作を行うときは、以下を必ず守る。

1. **送信前に必ず見積もりを提示する。** 金額を出さずに API を叩かない。
   ユーザーが「100枚生成して」と言っても、まず総額を計算して提示し、承認を得る。
2. **単価が分からないモデルは実行しない。** `references/pricing.json` に
   無いモデルは `fal_generate.py` が exit 3 で止まる。この停止を
   `--assume-cost` で機械的に回避しない。まず実価格を調べる。
3. **`--budget` を必ず付ける。** ユーザーが金額を言わなければ、こちらから
   上限を提案して確認する。
4. **バッチは小さく始める。** 初回は 1〜2 枚で出力とコストを確認してから
   枚数を増やす。いきなり大量生成しない。
5. **失敗しても課金される前提で扱う。** 生成が気に入らなくても料金は戻らない。
   プロンプトの推敲は生成前に済ませる。

---

## 1. 退避 (Higgsfield → ローカル)

Higgsfield の履歴は MCP 経由でしか列挙できないため2段構えになる。

### 手順

**ステップ1: 履歴を JSON として吸い出す**

`show_generations` を `next_cursor` が `null` になるまでページングし、
各ページの応答をそのまま連番ファイルへ保存する。

```
manifest/page-0001.json
manifest/page-0002.json
...
```

- `size` は 100 が上限。ページ数を減らすため 100 を使う。
- `next_cursor` を次の呼び出しの `cursor` に渡す。
- Marketing Studio の生成物は履歴が別系統なので
  `show_marketing_studio_generations` でも同じことをする。
- アップロードした参照画像も残したければ `show_medias`
  (`type` を image / video / audio でそれぞれ) を同様にページングする。

保存するのは**応答 JSON そのまま**でよい。加工しない。
スクリプト側が `{"items": [...]}` / 配列 / JSONL のいずれも受け付ける。

**ステップ2: 実体をダウンロードする**

```bash
# まず対象と件数だけ確認 (通信しない)
python3 .claude/skills/generate/scripts/higgsfield_export.py \
  --manifest-dir ./manifest --out ./higgsfield-export --dry-run

# 実行
python3 .claude/skills/generate/scripts/higgsfield_export.py \
  --manifest-dir ./manifest --out ./higgsfield-export
```

主なオプション:

| オプション | 効果 |
|---|---|
| `--include-inputs` | 参照画像・入力画像も落とす (再生成の材料として要るなら) |
| `--include-thumbnails` | `minUrl` 等のサムネイルも落とす (既定はスキップ) |
| `--workers N` | 並列数 (既定 4)。4K 画像が多いので上げすぎない |
| `--dry-run` | 件数と保存先だけ表示 |

### 出力

```
higgsfield-export/
  media/<type>/<YYYY-MM-DD>/<timestamp>_<id>.png
  metadata/<id>.json      ← プロンプト・モデル・seed・全パラメータ
  index.jsonl             ← 機械可読インデックス
  index.md                ← 人間用の一覧表
  .state.json             ← 再開用
```

**再実行は安全。** 取得済みはスキップし、中断しても続きから再開する。
一部 URL が失敗しても他は落とし切り、exit 2 で失敗分を報告する。
その場合はもう一度同じコマンドを実行すればよい。

### 注意

- **メタデータが本体。** 画像は再生成できるが、プロンプトは失うと戻らない。
  スクリプトはダウンロードより先に `metadata/` を書く。
- 解約するなら、**猶予期間内に**これを完了させること。
- CloudFront の URL は無期限ではない。マニフェストを取ったら早めに落とす。

---

## 2. 生成 (fal.ai)

### 準備

1. https://fal.ai でアカウントを作り、ダッシュボードで API キーを発行する
2. `export FAL_KEY=xxxxxxxx`

キーを置いておくだけでは課金されない。従量課金なので使った分のみ。

### 実行

```bash
# 必ず先に見積もり (API を呼ばない)
python3 .claude/skills/generate/scripts/fal_generate.py \
  --model fal-ai/nano-banana-2 --prompt "a cat" -n 4 --dry-run

# 予算を明示して実行
python3 .claude/skills/generate/scripts/fal_generate.py \
  --model fal-ai/nano-banana-2 --prompt "a cat" -n 4 --budget 0.50
```

モデル固有のパラメータは `--input` に JSON で渡す:

```bash
python3 .claude/skills/generate/scripts/fal_generate.py \
  --model fal-ai/flux/dev \
  --input '{"prompt":"a cat","image_size":"landscape_16_9","num_images":2}' \
  --budget 0.20
```

`--input @path.json` でファイルからも読める。長いプロンプトはこちらが楽。

### 終了コードの意味

| コード | 意味 | 対処 |
|---|---|---|
| 0 | 成功 | — |
| 3 | 単価不明で停止 | `pricing.json` に追記する。安易に `--assume-cost` で回避しない |
| 4 | 予算超過で停止 | 枚数を減らすか、ユーザーに確認して予算を上げる |
| 5 | 結果から URL を取り出せない | `metadata/` の `result` を見てスキーマを確認 |

### 出力

```
generations/
  media/fal/<YYYY-MM-DD>/<timestamp>_<request_id>.png
  metadata/fal_<id>_<timestamp>.json   ← 入力・結果・見積もりコスト
  ledger.jsonl                          ← 1行1実行の課金台帳
```

`ledger.jsonl` を集計すれば、いつ何にいくら使ったかが分かる:

```bash
python3 -c "import json,sys;print(sum(json.loads(l)['estimated_usd'] for l in open('generations/ledger.jsonl')))"
```

これは**見積もりの累計**であって請求額ではない。
必ず fal のダッシュボードと突き合わせること。

### 新しいモデルを足す

1. https://fal.ai/models でモデルページを開き、モデル ID と価格表記を読む
2. `references/pricing.json` の `models` に 1出力あたり USD で追記する
3. 入力スキーマはモデルページの API タブに載っている。`--input` にそのまま渡す

秒課金の動画モデルは「想定尺 × 単価」で**多めに**見積もる。
見積もりが実費より高い分には事故らない。

---

## プロバイダの選び方

詳細と根拠は [references/decision.md](references/decision.md)。要点だけ:

| | 位置づけ |
|---|---|
| **fal.ai** | **既定。** GPT Image 2 の公式パートナー API。600+ モデル、企業利用実績あり |
| kie.ai | 任意の実験レーン。安いが非公認再販・**メディア保持14日**・SLA なし。本番や納品物には使わない |
| WaveSpeed | fal に無いニッチモデルが要るときだけ |

**kie.ai を既定にしない。** 価格差は実用域では小さく、
公式パートナーである fal を捨てる理由にならない。

---

## Higgsfield を併用する場合

Higgsfield MCP が繋がっているなら、Claude Code から直接使える。
サブスクを払っている間は**枠を使い切る方が得**なので、以下で切り分ける。

- **Higgsfield で作る** — プリセット、Motion Control、Marketing Studio など
  fal に無い機能。月次でリセットされる枠を消化する
- **fal で作る** — 権利が重要なもの (商用・納品物・人物の参照画像を使うもの)。
  Higgsfield の学習許諾条項に触れない
- **どちらで作っても** — ローカルの単一ライブラリへ集約する。
  保持期間にも解約にも依存しない資産にする
