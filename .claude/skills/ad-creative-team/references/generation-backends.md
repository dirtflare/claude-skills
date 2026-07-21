# 生成バックエンド選定ガイド(Step 4)

案(アングル×フォーマット)ごとに最適なエンジンを選ぶ。エンジンは道具。迷ったら
「ロゴ・色を本物で当てたい→Canva」「写実的な絵が欲しい→Higgsfield」で足りる。

生成系はいずれもクレジットを消費する。5枚超のバッチは Step 3 の承認後に回す。

---

## Canva — オンブランドのレイアウト量産

ロゴ・パレット・書体を "本物" で当てられるのが最大の強み。SNS投稿・バナー・
メール・ポスター等のテンプレ量産に向く。

- `mcp__Canva__list-brand-kits` — 既存ブランドキットを取得。あれば `brand_kit_id`
  を後続に渡す(色・書体・ロゴが自動で当たる)。
- `mcp__Canva__generate-design` — `design_type`(`instagram_post`=1080×1350,
  `facebook_post`, `your_story`=縦, `poster`, `flyer`, `email` 等)+ `query`
  (何を作るか、詳細なほど良い)+ `brand_kit_id`。`asset_ids` でロゴ等を挿入可。
- `mcp__Canva__search-brand-templates`(`dataset:"non_empty"`)→ autofill 系で、
  同一テンプレにコピー違いを流し込む "同型多バリエーション" が作れる(A/B向き)。
- `mcp__Canva__export-design` で書き出し、`upload-asset-from-url` で外部素材投入。

使いどころ: テキストが主役のオファー訴求、listicle、比較表、決まった型の横展開。

---

## Higgsfield — フォトリアルなマーケ/商品ビジュアル

`mcp__Higgsfield-MCP__generate_image`。広告・商品・コマース用途の既定モデルは
**`marketing_studio_image`**。

- `params.model: "marketing_studio_image"`, `params.prompt`, `params.aspect_ratio`,
  `params.count`(1〜4)。`get_cost:true` で事前にクレジット見積り可。
- 参照画像を使うなら Web URL は `media_import_url` → 返る `media_id` を
  `params.medias[].value` に(URL直渡し不可)。ローカル素材は `media_upload_widget`。
- UGC / 人物・アバターは `soul` 系、4K・文字入り・図解は `nano_banana_pro` 等。
  迷ったら `models_explore(action:'recommend')` で用途から推薦を取る。
- `virality_predictor` で生成物の相対スコアを付け、テスト優先度の参考にする。

使いどころ: ヒーロー画像、商品カット、UGC風、before/after のビジュアル。

---

## Comfy — カスタム制御 / OSS・パートナーモデル

`mcp__comfy_MCP__partner_generate`(Flux, Google nano-banana/Gemini, BFL 等の
パートナーAPI)または `submit_workflow`(LoRA/ControlNet 等の自前パイプライン)。

- **必ず先に** `mcp__comfy_MCP__get_prompting_guide` を呼ぶ。`model:"partner"` で
  パートナー各モデルの slug と流儀、モデル名指定でその系統の推奨設定が得られる。
- 細かい構図制御・スタイル固定・特定モデルの質感が要るときに使う。

使いどころ: 独特のアートディレクション、スタイル統一、特定モデル指定。

---

## Figma — 静的レイアウトシステム

`mcp__Figma__*`(`use_figma` 前に `/figma-use` スキルを読む)。デザイン
コンポーネント/トークンで広告フォーマットを体系立てて量産したいとき。コード
連携やデザインシステム前提の案件向け。単発のビジュアルなら上の3つで足りる。

---

## 選定チートシート

| 欲しいもの | 第一候補 |
|---|---|
| ロゴ・色・書体を正確に当てたSNS/バナー | Canva(brand kit) |
| 同型テンプレにコピー違いをA/B量産 | Canva(brand template autofill) |
| 写実的な商品・マーケ画像、ヒーロー | Higgsfield(marketing_studio_image) |
| UGC風・人物・アバター | Higgsfield(soul系) |
| 4K・文字入り・図解 | Higgsfield(nano_banana_pro)/ Comfy |
| 独特のスタイル固定・細かい構図制御 | Comfy(partner_generate) |
| デザインシステムで体系展開 | Figma |
