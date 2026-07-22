---
name: lenis-gsap-integration
description: >-
  Integrate Lenis smooth scroll (darkroomengineering/lenis) with GSAP and
  ScrollTrigger (greensock/gsap) — the correct RAF wiring, ScrollTrigger.update
  sync, pinning/scrub/snap setup, refresh timing, and the React (lenis/react +
  useGSAP) variant. This is a general-purpose skill, not tied to any particular
  app or repository. Use it whenever the user wants smooth scrolling with
  scroll-driven animation, mentions Lenis, GSAP, ScrollTrigger, スムーススクロール,
  慣性スクロール, スクロール連動アニメーション, パララックス, ピン留め, scrub / pin /
  snap, or asks why their ScrollTrigger is janky, stutters, or desyncs when
  Lenis is enabled.
---

# Lenis × GSAP ScrollTrigger 連携スキル

Lenis(スムーススクロール)と GSAP ScrollTrigger(スクロール連動アニメーション)を
正しく噛み合わせるための運用手順。両者は別々の RAF ループを持つため、
**素直に併用すると desync・カクつき・ピンのズレ**が起きる。核心は次の 3 点:

1. Lenis の `scroll` イベントで `ScrollTrigger.update` を叩く(位置同期)
2. Lenis の RAF を **GSAP の ticker に一本化**する(ループ二重化の解消)
3. GSAP ticker の `lagSmoothing(0)` を切る(遅延補正が同期を壊すため)

**このスキルは特定のアプリやリポジトリに紐付かない。**
コードをどこに書き込むかはユーザーが出力先を指定した場合だけ。
指定が無ければチャットでの提示・説明が成果物である。

バージョン依存の記述(オプション名・デフォルト値)は Lenis v1.3 系 /
GSAP v3 系を前提とする。既存プロジェクトに入れる前に、まず
`package.json` で実際のバージョンを確認すること。

## Step 1 — 前提を確認する

導入前に次を確認し、齟齬があれば先に解消する:

- **GSAP のバージョンと入手経路**。v3.12 以降は ScrollTrigger を含む全プラグインが
  無料。npm(`gsap`)か CDN か、`registerPlugin` 済みか。
- **既存のスクロール実装との競合**。他のスムーススクロール(locomotive-scroll 等)、
  `scroll-behavior: smooth`、CSS scroll-snap は Lenis と二重化するので外す。
- **スクロールコンテナ**。`window` 全体か、特定の要素(`wrapper`/`content`)か。
  要素スクロールの場合は ScrollTrigger 側の `scroller` 指定が別途必要になる。
- **React/Vue かバニラか**。React なら Step 5(`lenis/react` + `useGSAP`)へ。

## Step 2 — インストールと登録

```bash
npm i lenis gsap
```

```js
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'      // 推奨(オーバースクロール等の基本スタイル)
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)  // tree-shaking からプラグインを守る
```

CSS を省くと環境によってスクロールが効かない/二重スクロールバーが出ることがある。
最小構成でも `lenis.css` は入れる。

## Step 3 — 連携の核(バニラ JS)

**これがこのスキルの中心。丸暗記して良い定型。**

```js
// 1. Lenis を生成(autoRaf は使わない。RAF は GSAP に任せる)
const lenis = new Lenis()

// 2. Lenis のスクロールごとに ScrollTrigger を更新(位置同期)
lenis.on('scroll', ScrollTrigger.update)

// 3. Lenis の RAF を GSAP ticker に一本化
//    ticker の time は「秒」なので ×1000 して Lenis へ「ミリ秒」で渡す
gsap.ticker.add((time) => {
  lenis.raf(time * 1000)
})

// 4. GSAP の遅延補正を無効化(同期を壊すため必須)
gsap.ticker.lagSmoothing(0)
```

### なぜこの 4 行なのか(削るとどうなるか)

- **`new Lenis({ autoRaf: true })` にしてはいけない。** autoRaf は Lenis 独自の
  RAF ループを回す。GSAP ticker と二重ループになり時間軸がズレ、ピンやスクラブが
  微妙にカクつく。RAF は **どちらか一方**に統一する。ここでは GSAP に寄せる。
- **`lenis.on('scroll', ScrollTrigger.update)` を省くと**、慣性で動いている間の
  中間位置を ScrollTrigger が知らず、アニメーションがスクロール位置に追従せず遅れる。
- **`* 1000` を忘れると** Lenis の内部時間がミリ秒前提なので、渡す値が 1000 倍
  遅くなり、スムーススクロールがほぼ止まって見える。
- **`lagSmoothing(0)` を省くと**、重い処理でフレームが飛んだとき GSAP が時間を
  補正し、Lenis の実スクロールとの間に恒常的なズレが残る。

## Step 4 — ScrollTrigger を書く(pin / scrub / snap)

連携が済めば、ScrollTrigger は **通常どおり**書くだけで Lenis に追従する。
`scroller` の特別指定は不要(`window` スクロールの場合)。

```js
// スクラブ(スクロールに完全連動)
gsap.to('.box', {
  x: 500,
  scrollTrigger: {
    trigger: '.box',
    start: 'top center',   // 既定は 'top bottom'
    end: '+=500',
    scrub: 1,              // true=即追従 / 数値=その秒数だけ遅れて滑らかに追従
    markers: true,         // 開発中の可視化。本番では外す
  },
})

// ピン留め(区間中その要素を固定)
ScrollTrigger.create({
  trigger: '.panel',
  start: 'top top',
  end: '+=1000',
  pin: true,
  pinSpacing: true,
})
```

注意点:

- **ピン留めは Lenis と相性問題が出やすい**。ズレる場合はまず Step 3 の 4 行が
  完全か、`autoRaf` が残っていないかを疑う。それでも直らなければ `anticipatePin: 1`
  を試す。
- **スナップは二重化に注意**。CSS `scroll-snap` は必ず外す。スナップは
  ScrollTrigger の `snap` か Lenis の `lenis/snap` の**どちらか一方**で行う。
- **アンカーリンク**(`#section` へのジャンプ)は Lenis 側で処理する。
  `new Lenis({ anchors: true })`、または `lenis.scrollTo('#section')`。
  素の `scrollIntoView` はスムーススクロールを迂回する。

## Step 5 — React での連携(lenis/react + useGSAP)

React では `lenis/react` の `<ReactLenis>` を使い、RAF を自前で GSAP ticker に繋ぐ。
`autoRaf: false` にするのが肝(コンポーネントの二重 RAF を防ぐ)。

```jsx
import { ReactLenis } from 'lenis/react'
import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

function App() {
  const lenisRef = useRef(null)

  useGSAP(() => {
    const lenis = lenisRef.current?.lenis
    if (!lenis) return

    lenis.on('scroll', ScrollTrigger.update)

    const update = (time) => lenis.raf(time * 1000)
    gsap.ticker.add(update)
    gsap.ticker.lagSmoothing(0)

    // useGSAP のクリーンアップで確実に解除(ホットリロード/アンマウント対策)
    return () => {
      gsap.ticker.remove(update)
      lenis.off('scroll', ScrollTrigger.update)
    }
  }, [])

  return (
    <ReactLenis root options={{ autoRaf: false }} ref={lenisRef}>
      {/* アプリ本体 */}
    </ReactLenis>
  )
}
```

- `root` を付けると Lenis が `<html>` を対象にし、`useLenis(cb, deps, priority)`
  でどこからでもスクロールを購読できる。
- `@gsap/react` が無い場合は `useEffect` + クリーンアップ関数でも同じ形で書ける
  (Lenis 公式 README も `useEffect` 版)。ただし **必ず解除処理を書く**。
  書かないとホットリロードや再マウントで ticker にコールバックが多重登録され、
  スクロール速度が倍々に壊れる。

## Step 6 — 検証とデバッグ

導入後に必ず確認する:

1. **`markers: true`** で start/end の線がスクロール位置と一致して動くか。
   線がスクロールに追従せずズレる → Step 3 の同期(`on('scroll', ...)`)が抜けている。
2. **カクつく/スクロールが極端に遅い** → `* 1000` の付け忘れ、または `autoRaf`
   残存による二重 RAF を疑う。
3. **レイアウト確定後にトリガ位置がズレる**(画像・Web フォント・遅延読み込み)
   → 読み込み完了後に `ScrollTrigger.refresh()` を呼ぶ。Lenis の `resize()` も
   必要なら併せて。
4. **モーダル/コード領域など一部だけネイティブスクロールにしたい**
   → その要素に `data-lenis-prevent` を付ける(`-wheel` / `-touch` の個別指定も可)。
5. **アクセシビリティ**: `prefers-reduced-motion` を尊重する。低減設定時は
   `lenis.destroy()` して素のスクロールに戻すのが無難。

```js
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  lenis.destroy()
}
```

## 参照

- Lenis: https://github.com/darkroomengineering/lenis
- GSAP / ScrollTrigger: https://github.com/greensock/gsap ・ https://gsap.com/docs/v3/Plugins/ScrollTrigger/
