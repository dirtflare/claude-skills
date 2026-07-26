# 取得手段リファレンス(プラットフォーム別)

**検証日: 2026-07-26 / 検証環境: Claude Code on the web(リモート実行環境)**

料金や UI と同じく、この種の挙動は変わる。上から順に試し、
成功した時点で抽出へ進む。全部失敗したらユーザー提供素材へ。

---

## 共通の前提

### URL の正規化

トラッキングパラメータは落としてから使う。

- Instagram: `?igsh=...` を削除。`/reel/<id>/` と `/p/<id>/` は等価
- TikTok: `?is_from_webapp=...` `?_t=` `?_r=` を削除
- 短縮 URL は先に展開する:
  ```bash
  curl -sSL -o /dev/null -w '%{url_effective}\n' <短縮URL>
  ```
  (`t.co` / `vm.tiktok.com` / `instagr.am` など)

### ブラウザ操作(Playwright)の現状

**リモート実行環境では現在ほぼ使えない。** Chromium は
`/opt/pw-browsers/chromium` にあり Playwright も入っているが、
エグレスプロキシの CA を Chromium が信頼しないため失敗する:

| 症状 | 意味 |
|---|---|
| `ERR_CERT_AUTHORITY_INVALID` | Chromium が `/root/.ccr/ca-bundle.crt` を読んでいない。NSS ストア経由が必要で `certutil` が無い |
| `ERR_CONNECTION_RESET` | プロキシ手前で切断。`launch({proxy:{server: process.env.HTTPS_PROXY}})` を渡しても変わらない |

`example.com` でも再現するので**サイト側のブロックではない**。
**`--ignore-certificate-errors` 等で TLS 検証を切って回避してはいけない。**
ローカル CLI 環境では通常動くので、ブラウザ前提の手順は
「ローカルなら可」と条件付きで案内する。

リモートでは代わりに **curl + メタタグ / oEmbed** を主経路にする。
これで本文・投稿者・日時・エンゲージメント・カバー画像まで取れる。

### カバーフレームは画像として読む

どのプラットフォームでも、取得したサムネイル URL は curl で落とせて
**そのまま画像として読める**。動画本体は取れないが、
カバーフレームには往々にしてサムネ文字(結論・釣り文句)が焼き込まれており、
本文だけでは分からない主張が読み取れる。**必ず1枚は読む。**

```bash
curl -sS "<サムネイルURL>" -o cover.jpg && file cover.jpg
```

---

## X (x.com / twitter.com)

1. **WebFetch** を status URL に 1 回
2. **ミラー API** — `https://api.fxtwitter.com/<user>/status/<id>` に 1 回
3. **ブラウザ操作** — 上記の通りリモートでは期待しない
4. **ユーザー提供素材**

**ネットワークポリシー注意:** リモート環境では x.com が環境の
ネットワークポリシーで遮断されていることがある(接続前の 403 =
プロキシのポリシー拒否)。その場合 1–3 は全滅する。原因を
「モデルの制限」ではなく環境設定として正確に伝え、恒久対応として
claude.ai/code の環境設定でネットワークポリシーを緩和できることを案内する。

---

## Instagram (リール / 投稿)

### 効く手段:投稿ページの OG メタタグ(検証済み)

**User-Agent が結果を決める。ここが最大の落とし穴。**
デスクトップ Chrome を騙ると JS シェル(`"pageID":"httpErrorPage"`)が
返って OG タグが**入らない**。**クローラ系 UA を使う。**

| User-Agent | 結果 |
|---|---|
| `Mozilla/5.0 (compatible; bot)` | **OG タグあり**(約 634KB) |
| `facebookexternalhit/1.1` | **OG タグあり** |
| デスクトップ Chrome を騙る UA | OG タグ無し(約 602KB の JS シェル)。5回試して5回失敗 |
| UA 未指定 | 0 バイト |

```bash
curl -sS -A "Mozilla/5.0 (compatible; bot)" \
  "https://www.instagram.com/reel/<SHORTCODE>/" -o r.html -w "%{http_code}\n"
grep -c 'og:description' r.html   # 0 なら UA を疑う(リールの存在は疑わない)
```

HTTP 200 が返り、`<head>` に必要な情報が揃っている:

| メタタグ | 取れるもの |
|---|---|
| `og:title` | 投稿者の表示名 + **キャプション全文** |
| `og:description` / `name="description"` | **いいね数・コメント数・投稿日** + キャプション全文 |
| `og:url` | 正規 URL。`/<username>/reel/<id>/` の形で **@ハンドルが入る** |
| `og:image` | **カバーフレームの JPEG**(そのまま curl で落として読める) |

抽出例:

```bash
python3 - <<'PY'
import re, html
s = open('r.html', encoding='utf-8').read()
for key in ('og:title', 'og:description', 'og:url', 'og:image'):
    # キャプションは改行を含むので re.S が必須。付けないと og:title と
    # og:description が「見つからない」ように見える(実際は存在する)
    m = re.search(r'<meta property="%s" content="(.*?)" ?/>' % key, s, re.S)
    print(key, '::', html.unescape(m.group(1)) if m else 'NOT FOUND')
PY
```

### 効かない手段(試すだけ無駄)

| 手段 | 結果 |
|---|---|
| WebFetch を投稿 URL に | **HTTP 503**(UA を選べないため) |
| `/embed/captioned/` | HTTP 200 だが `"pageID":"httpErrorPage"` の JS シェル。本文なし |
| `api.instagram.com/oembed/` | 302(認証必須) |
| Playwright で直接 | `ERR_CONNECTION_RESET` |

`"pageID":"httpErrorPage"` は**投稿が消えた印ではない**。
UA が弾かれただけなので、UA を変えて再試行する。

### 取れないもの

- **動画そのもの**(音声・全フレーム)。`video_url` は HTML に出てこない
- コメント本文

→ **報告には「動画未視聴」を必ず明記する。**

---

## TikTok

### 効く手段:oEmbed(検証済み)

```bash
curl -sS "https://www.tiktok.com/oembed?url=https://www.tiktok.com/@<user>/video/<id>"
```

JSON が返る。使うキー:

| キー | 内容 |
|---|---|
| `title` | **キャプション全文**(ハッシュタグ込み) |
| `author_name` / `author_unique_id` | 表示名 / @ハンドル |
| `thumbnail_url` | **カバーフレーム**(落として読める) |
| `html` | 埋め込み用。中に **音源名**(`♬ original sound - ...`)が入っている |
| `embed_product_id` | 動画 ID |

エラーの読み方:

```json
{"message":"Something went wrong","code":400}
```

→ HTTP 400。動画 ID が不正・削除済み・非公開のいずれか。
エンドポイント自体は生きているので、URL を確認してもらう。

### 効かない手段

| 手段 | 結果 |
|---|---|
| 動画ページを curl | HTTP 200 だが **captcha / "Verify" ページ**。OG メタは無い |
| プロフィールページを curl | JS シェル。動画 ID すら含まれない |

→ **プロフィール URL だけでは何も取れない。動画の URL を必ずもらう。**

### 取れないもの

- 動画そのもの、いいね/コメント数、コメント本文
- 投稿日時(oEmbed に含まれない)

→ 日時が必要なら、ユーザーに画面で確認してもらう。

---

## YouTube Shorts(参考)

`https://www.youtube.com/oembed?url=<動画URL>&format=json` が同様に使える
(タイトル・投稿者・サムネイル)。**未検証。** 使う場合は結果を明示し、
失敗したら Instagram / TikTok と同じくユーザー提供素材へ切り替える。

---

## ユーザー提供素材への切り替え

自動取得が全滅したら、失敗の理由を**一言で**伝え、
次のいずれか **1 つ**だけ依頼する(全部は求めない)。

- **スクリーンショット添付** — 最も確実。画像は直接読める。長い場合は複数枚
- **キャプションのコピペ** — 整形不要
- 動画の場合 — 字幕・文字起こし・NotebookLM まとめ等、手元にある要約

「取得できなかった」で止めず、**取れた範囲(カバー画像だけでも)で
暫定の判断を先に出し**、足りない部分を名指しで依頼する。
