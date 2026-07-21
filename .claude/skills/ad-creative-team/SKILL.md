---
name: ad-creative-team
description: >-
  ブランドURLを1つ渡すだけで、社内広告クリエイティブチームのように動く運用手順。
  ブランド文脈を抽出し、その業界で「すでに勝っている」広告の型を調べ、自社の
  プロダクト・パレット・コピーに載せ替えた広告クリエイティブをバッチ生成する。
  生成はこのセッションの MCP(Canva のブランドキット/テンプレ、Higgsfield の
  marketing studio、Comfy の partner_generate、Figma)を使い、外部有料サービス
  (Gooseworks / Goose Ads 等)には依存しない。次のような場面で必ず使うこと:
  「自社ブランドの広告を作って」「広告バナーを一括で」「A/Bテスト用の広告を量産」
  「competitor ads を参考に作って」「create ads for my brand <URL>」、あるいは
  広告クリエイティブ・広告素材・Meta/Google広告・SNS広告・LP用ビジュアルの
  制作を頼まれたとき。ユーザーが「Goose Ads を自前で再現」と言った場合もこれ。
---

# 広告クリエイティブチーム(自前版 Goose Ads)

ブランドURL → 広告バッチ、を一気通貫で回すディレクター用の指示書。

**このスキルの本質は「生成ボタン」ではなく「文脈と手順の保持」である。**
価値の源泉は、ブランド文脈(何を・誰に・どんなトーンで)と制作手順を Claude 側に
持たせることで、単発の画像生成ではなく "検証に回せる広告のバッチ" を一発で
出せるようにする点にある。だから最初に文脈を固め、最後まで文脈を手放さない。

生成エンジンは状況に応じて切り替える(Step 4)。エンジンは道具であって主役ではない。

---

## Step 0 — 依頼内容を確定する

最低限、次を確認する。URL 以外は仮定してよいが、仮定したら明記する。

- **ブランドURL**(必須)。無ければ本スキルは始められない。ユーザーに聞く。
- **目的**: 認知(ブランド想起)/ 獲得(CV・購入・登録)。既定は「獲得」。
- **プラットフォーム/フォーマット**: Instagram/Facebook/TikTok/X/Google/LP。
  既定は Instagram(1080×1350, 4:5)と正方形(1:1)。
- **本数**: 何案作るか。既定は 6 案(3アングル × 2バリエーション)。
- **競合**(任意): 名指しがあれば参照探索の的が絞れる。無ければ業界で探す。

大量生成はクレジットを消費する(Higgsfield / Comfy / Canva)。**5枚を超える
実生成の前には、案の一覧を見せて一度承認を取る**(Step 3 の後)。

---

## Step 1 — ブランド文脈を抽出する(Brand Brief)

広告の "load-bearing" な部分。ここが薄いと、以降が全部ズレる。

1. `WebFetch` でトップページを取得。必要に応じ product / features / pricing /
   about など主要下層も 1〜2 枚取得する。取得できない(認証・ネットワーク
   ポリシー遮断)場合は推測で埋めず、ユーザーに素材(スクショ/コピペ/主要情報)を頼む。
2. 既存の Canva ブランドキットがあるか `mcp__Canva__list-brand-kits` で確認。
   あれば以降の Canva 生成でそれを使い、ロゴ・色・書体を"本物"で当てられる。
3. 抽出結果を **`<workspace>/brand-brief.md`** に保存する(再利用可能な資産にする)。

Brand Brief に必ず含める項目:

```
# Brand Brief: <ブランド名>
- Product / Offer   : 何を売っているか、主力SKU/プラン
- Value proposition : 一番刺さる便益(1文)
- Target audience   : 誰に(属性・状況・悩み)
- Tone of voice     : 声のトーン(例: 端的/親密/権威的/遊び心)
- Palette           : 主要カラー hex(例: #0A2540 / #635BFF / #FFFFFF)
- Typography vibe   : 書体の雰囲気(例: geometric sans / serif editorial)
- Logo / assets     : ロゴ・素材のURL(あれば)
- Signature copy    : 実際に使われている決め台詞・キャッチ
- Do / Don't        : ブランド上やってよい表現/避ける表現
```

**捏造しない。** URL から読み取れない項目は「要確認」と残し、埋めたいなら聞く。

---

## Step 2 — 「勝っている広告」の型を調べる(Reference research)

Goose Ads の肝は "その分野で実際に出稿されている広告" を参照する点。ここを
自前の一次情報で代替する。**盗むのはコピーではなく "構造" である。**

参照ソース(公開の広告ライブラリを優先):

- **Meta Ad Library** (`facebook.com/ads/library`) — 現在配信中の広告を検索可能
- **Google Ads Transparency Center** — ドメイン単位で出稿広告を確認
- **TikTok Creative Center / Top Ads** — 動画広告のトレンド
- `WebSearch` で「<カテゴリ> best performing ads 2026」「<競合> ad creative」等

各参照から抽出するのは**パターンだけ**:
フック(最初の1秒/1行)、フォーマット(UGC風/比較/before-after/リスト/証言)、
レイアウト(テキスト位置・余白・視線誘導)、オファーの見せ方、CTA の言い回し。

> ⚠️ **ToS / 権利の注意**: 参照は "構造のインスピレーション" に限る。競合の
> ロゴ・商標・実写素材・コピーをそのまま複製しない。各ライブラリの利用規約に
> 反するスクレイピングはしない(公開ページの閲覧・要約に留める)。生成物は
> あくまで自社ブランドの資産だけで構成する。

参照の要点を Brand Brief の下に「## Reference patterns」として追記する。

---

## Step 3 — クリエイティブ戦略(案出し)

Brand Brief × Reference patterns から、**互いに異なるアングル**の広告案を作る。
"1ヶ月分のテストを1プロンプトで" の正体は、この**アングルの多様性**にある。
同じ絵の色違いを量産するのではなく、訴求の切り口を散らすのが目的。

アングルの引き出しは `references/ad-angles.md` を参照(problem-agitate、
social proof、before/after、comparison、founder story、offer-led など)。

各案について次を1行ずつ定義し、表にしてユーザーに見せる:

| # | Angle | Headline | Sub / Body | CTA | Visual direction | Format |
|---|-------|----------|-----------|-----|------------------|--------|

**この表を出した時点で一度止まり、承認・修正をもらう。**(クレジット保護 +
方向性のズレを生成前に潰すため。)ユーザーが「全部行って」なら即 Step 4。

---

## Step 4 — 生成する(バックエンドを案ごとに選ぶ)

エンジン選定の詳細と呼び出し方は `references/generation-backends.md`。要点:

- **Canva** — ロゴ・パレット・書体を"本物"で当てたい、SNS/バナーの
  テンプレ量産。ブランドキット or ブランドテンプレ autofill が最強。
  (`generate-design` の `brand_kit_id`、`search-brand-templates` + autofill)
- **Higgsfield** — フォトリアルな商品・マーケ用ビジュアル、ヒーロー画像。
  `generate_image` の `marketing_studio_image`(count 1-4, aspect_ratio 指定)。
- **Comfy** — スタイライズや細かい制御、Flux / nano-banana 等。`partner_generate`
  (事前に `get_prompting_guide` で当該モデルの流儀を確認)。
- **Figma** — 静的なレイアウトシステム/デザインコンポーネントで展開したいとき。

生成プロンプトは**必ずブランドをロックする**: パレットの hex、プロダクト名、
トーン、決め台詞を毎回埋め込む。参照の "構造" は使うが、色・要素は自社のもの。

同一アングルは 1〜2 バリエーション(色・レイアウト・コピー違い)に留め、
本数は案の多様性で稼ぐ。生成物は `<workspace>/creatives/` に案IDで保存する。

---

## Step 5 — 束ねて渡す(Contact sheet)

バラの画像ではなく、**検証に回せる形**で渡すのが締め。

1. 全案を一覧できるインデックスを作る(`<workspace>/creatives/index.md` か、
   HTML のコンタクトシート)。各行: 案ID → アングル → クリエイティブ →
   ヘッドライン/CTA → 推奨プラットフォーム。
2. 可能なら Higgsfield の `virality_predictor` で相対スコアを付け、テスト
   優先度の目安にする(絶対値ではなく並べ替えの参考として扱う)。
3. ユーザーに「どれを A/B に回すか」を選べる状態で提示する。

成果物の保存先(ファイル/リポジトリ)はユーザーが指定した場合のみコミットする。
指定が無ければ workspace に置き、チャットで場所と概要を報告する。

---

## ガードレール

- **捏造しない**: ブランド事実は URL 由来のみ。読めない箇所は聞く。
- **権利**: 競合の商標・実写・コピーを複製しない。参照は構造まで。
- **クレジット**: 5枚超の実生成前に必ず案一覧で承認を取る。
- **本家非依存**: Gooseworks / `npx gooseworks` は使わない。全てこの環境の
  MCP と Web 取得だけで完結させる。
