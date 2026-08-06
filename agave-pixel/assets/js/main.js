/* PIXAGAVE — エントリポイント */

import { game } from './game.js';
import { render, wireGlobal, go, toast, openModal, closeModal } from './ui.js';

function boot() {
  wireGlobal();
  game.tick(true);          // 前回終了時からの経過を反映(オフライン進行)
  render();

  game.addEventListener('quest', (e) => {
    for (const q of e.detail.done) toast(`ミッション達成: ${q.ja} (+${q.reward})`, 'gold');
  });

  // 実時間の経過をゆっくり反映する。1分ごとに再計算すれば十分。
  setInterval(() => {
    if (game.tick()) render();
  }, 60_000);

  // タブに戻ってきた時にも追いつかせる
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && game.tick()) render();
  });

  if (!game.state.plants.length && !localStorage.getItem('pixagave.onboarded')) {
    localStorage.setItem('pixagave.onboarded', '1');
    welcome();
  }
}

function welcome() {
  openModal('PIXAGAVE へようこそ', `
    <p>実物のアガベ・塊根・多肉の写真をドット絵に変換し、<b>実際の育成が進んだ分だけ</b>キャラクターが進化していく育成管理アプリです。</p>
    <ol style="padding-left:18px;line-height:1.9">
      <li>棚に株を迎える</li>
      <li>実物を1枚撮る → 背景を落としてドット絵化し、写真の解析結果から個性値が決まる</li>
      <li>水やり・日照・実測を記録する → 経験値と個性値が動く</li>
      <li>経験値・日数・記録枚数・実測の伸びがすべて揃うと進化する(全5段階)</li>
      <li>成株で 4 系統(締型・錦・鬼爪・巨大)のどれかに分岐 — どれになるかは育て方次第</li>
    </ol>
    <p class="hint">写真も記録もすべて端末内に保存され、外部へ送信されることはありません。
    進化条件は実際の栽培リズムに合わせてあるため、動作を試したいときは設定の「タイムワープ」を使ってください。</p>
    <div class="row" style="margin-top:16px">
      <button class="btn primary" id="w-start">株を迎えにいく</button>
      <button class="btn" data-close>あとで</button>
    </div>`, (body) => {
    body.querySelector('#w-start').addEventListener('click', () => {
      closeModal();
      go('collection');
      document.querySelector('[data-adopt-dialog]')?.click();
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// デバッグ用: コンソールから状態を触れるようにする
window.PIXAGAVE = { game, render, go };
