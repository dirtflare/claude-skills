/* PIXAGAVE — エントリポイント */

import { game } from './game.js';
import { render, wireGlobal, toast, t, go } from './ui.js';

function boot() {
  wireGlobal();
  game.tick(true);   // 前回終了時からの経過を反映(オフライン進行)
  render();

  game.addEventListener('quest', (e) => {
    for (const q of e.detail.done) toast(`${q.ja} +${q.reward}`, 'gold');
  });

  // 実時間の経過をゆっくり反映する。ペースが速い設定でも 1 分粒度で十分。
  setInterval(() => { if (game.tick()) render(); }, 60_000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && game.tick()) render();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// デバッグ用
window.PIXAGAVE = { game, render, t, go };
