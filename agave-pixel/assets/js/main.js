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
    <p>実物のアガベ・塊根・多肉の写真をドット絵に変えて、育てるほどキャラクターが進化していく育成ゲームです。</p>
    <ol style="padding-left:20px;line-height:2">
      <li><b>株を迎える</b> — 無償の品種が4つあります</li>
      <li><b>写真を1枚入れる</b> — 背景を落としてドット絵になり、写真から個性値が決まります</li>
      <li><b>水やり・実測で経験値を貯める</b></li>
      <li><b>経験値・育成日数・写真の枚数</b>が揃うと進化(全5段階)</li>
      <li>成株で <b>締型 / 錦 / 鬼爪 / 巨大</b> の4系統に分岐。どれになるかは育て方次第</li>
    </ol>
    <p class="hint">
      育成日数は<b>ゲーム内の日数</b>で数えます。既定は 1ゲーム日 = 1実時間で、完成株まで実時間 16〜20 時間ほど。
      もっと速く/遅くしたい場合は設定の「時間の進み方」で変えられます。<br>
      画面の一番上にはいつも「次にやること」が出るので、迷ったらそれに従ってください。
    </p>
    <div class="row" style="margin-top:18px">
      <button class="btn primary big" id="w-start">株を迎えにいく</button>
      <button class="btn ghost" data-close>あとで</button>
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
