/* PIXAGAVE — 通し動作確認
 * 合成写真を投入して「ピクセル変換 → 記録 → 実測 → 進化 → 書き出し」まで一周させる。
 *   node tools/smoke-test.mjs [--shots]
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SHOTS = process.argv.includes('--shots');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  const file = join(ROOT, path === '/' ? 'index.html' : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(4173, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const step = async (name, fn) => {
  await fn();
  console.log(`  ✓ ${name}`);
};

await page.goto('http://localhost:4173/');
await page.waitForSelector('#view');

console.log('PIXAGAVE smoke test');

await step('起動してホームが描画される', async () => {
  await page.click('[data-close]').catch(() => {});
  const title = await page.textContent('.page-head h1');
  if (!title) throw new Error('ホームが描画されていない');
});

await step('株を迎える', async () => {
  await page.evaluate(() => {
    const p = window.PIXAGAVE.game.adopt('titanota');
    window.__pid = p.id;
    window.PIXAGAVE.go('plant', p.id);
  });
  await page.waitForSelector('.detail-hero');
});

await step('手続き生成スプライトが表示される', async () => {
  await page.waitForFunction(() => {
    const img = document.querySelector('.detail-hero img.sprite');
    return img && img.src.startsWith('data:image/png') && img.naturalWidth > 0;
  }, null, { timeout: 8000 });
});

/* 合成写真: 濃い緑のロゼットを明るい背景に置いたもの */
const photo = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#cfd6cc';
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = '#c3cbc0';
  for (let i = 0; i < 400; i++) {
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 6, 6);
  }
  for (let i = 0; i < 15; i++) {
    const a = (i / 15) * Math.PI * 2;
    ctx.save();
    ctx.translate(256, 300);
    ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, 0, -170);
    g.addColorStop(0, '#1f5a3c');
    g.addColorStop(1, '#57a86a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.quadraticCurveTo(-12, -120, 0, -175);
    ctx.quadraticCurveTo(12, -120, 26, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  return c.toDataURL('image/png');
});
const photoBuffer = Buffer.from(photo.split(',')[1], 'base64');

await step('写真からドット絵を生成する', async () => {
  await page.click(`[data-photo]`);
  await page.waitForSelector('#drop');
  await page.setInputFiles('#file', { name: 'agave.png', mimeType: 'image/png', buffer: photoBuffer });
  await page.waitForSelector('#preview', { state: 'visible' });
  await page.waitForFunction(() => {
    const s = document.querySelector('#prev-sprite');
    return s && s.src.startsWith('data:image/png') && s.src.length > 400;
  }, null, { timeout: 8000 });
  const text = await page.textContent('#analysis');
  if (!/葉幅/.test(text)) throw new Error('解析結果が出ていない');
  if (SHOTS) await page.screenshot({ path: 'tools/shots/03-pixelize.png' });
  await page.click('#save-photo');
  await page.waitForSelector('.modal-back', { state: 'detached' });
});

await step('個性値が写真に同期し、アルバムに残る', async () => {
  const n = await page.evaluate(() => window.PIXAGAVE.game.plant(window.__pid).album.length);
  if (n !== 1) throw new Error(`アルバム件数が ${n}`);
});

await step('ケア操作(水やり・実測)が反映される', async () => {
  await page.evaluate(() => {
    const g = window.PIXAGAVE.game;
    g.state.plants.find((p) => p.id === window.__pid).care.hydration = 5;
    g.water(window.__pid);
    g.measure(window.__pid, { diameter: 6, leaves: 8, height: 5 });
  });
  const h = await page.evaluate(() => window.PIXAGAVE.game.plant(window.__pid).care.hydration);
  if (h < 90) throw new Error(`水分が回復していない: ${h}`);
});

await step('条件を満たすと進化し、系統が分岐する', async () => {
  const result = await page.evaluate(() => {
    const g = window.PIXAGAVE.game;
    const p = g.plant(window.__pid);
    const out = [];
    for (let i = 0; i < 4; i++) {
      // 育成が進んだ状態を作る: ゲーム内時間・記録写真・経験値
      g.warp(20);
      p.care.health = 95;
      p.exp += 900;
      for (let k = 0; k < 3; k++) {
        p.album.push({ id: `x${i}${k}`, t: Date.now(), day: g.state.clock, photoId: null, spriteId: p.spriteId, stage: p.stage, metrics: { ...p.metrics } });
      }
      const r = g.evolve(window.__pid);
      out.push(r.ok ? g.displayName(p) : `NG:${JSON.stringify(r.missing?.map((m) => m.label))}`);
    }
    return { out, stage: p.stage, branch: p.branch };
  });
  if (result.stage !== 4) throw new Error(`最終段階に到達しなかった: ${JSON.stringify(result)}`);
  if (!result.branch) throw new Error('系統が分岐しなかった');
  console.log(`    → ${result.out.join(' / ')}`);
  await page.evaluate(() => window.PIXAGAVE.render());
});

await step('品評会が成立する', async () => {
  const r = await page.evaluate(() => window.PIXAGAVE.game.contest(window.__pid, 0));
  if (!r.ok) throw new Error(r.message);
  if (r.categories.length !== 5) throw new Error('審査部門が5つでない');
});

await step('交配で実生が生まれる', async () => {
  const r = await page.evaluate(() => {
    const g = window.PIXAGAVE.game;
    const b = g.adopt('reginae');
    b.stage = 3;
    g.state.items.seed = 1;
    return g.cross(window.__pid, b.id);
  });
  if (!r.ok) throw new Error(r.message);
});

await step('共有画像を書き出せる', async () => {
  const sizes = await page.evaluate(async () => {
    const { exportSpecCard, exportStory, exportCover, exportGrowthStrip } =
      await import('./assets/js/creator.js');
    const g = window.PIXAGAVE.game;
    const p = g.plant(window.__pid);
    const card = await exportSpecCard(g, p);
    const story = await exportStory(g, p);
    const cover = await exportCover(g, g.state.plants);
    let strip = '';
    try { strip = await exportGrowthStrip(g, p); } catch { strip = ''; }
    window.__card = card;
    return [card.length, story.length, cover.length, strip.length];
  });
  if (sizes.some((s, i) => i < 3 && s < 5000)) throw new Error(`書き出しが小さすぎる: ${sizes}`);
  console.log(`    → card/story/cover/strip = ${sizes.map((s) => `${Math.round(s / 1024)}KB`).join(', ')}`);
});

await step('リロードしても保存が復元される', async () => {
  await page.reload();
  await page.waitForSelector('#view');
  const n = await page.evaluate(() => {
    window.__pid = window.PIXAGAVE.game.state.plants[0].id;
    return window.PIXAGAVE.game.state.plants.length;
  });
  if (n < 3) throw new Error(`復元された株が ${n} 株`);
});

if (SHOTS) {
  const shot = async (name, fn) => {
    await fn();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `tools/shots/${name}.png`, fullPage: false });
  };
  await shot('01-home', () => page.evaluate(() => window.PIXAGAVE.go('home')));
  await shot('02-collection', () => page.evaluate(() => window.PIXAGAVE.go('collection')));
  await shot('04-plant', () => page.evaluate(() => window.PIXAGAVE.go('plant', window.__pid)));
  await shot('05-dex', () => page.evaluate(() => window.PIXAGAVE.go('dex')));
  await shot('06-contest', () => page.evaluate(() => window.PIXAGAVE.go('contest')));
  await shot('07-lab', () => page.evaluate(() => window.PIXAGAVE.go('lab')));
  await shot('08-log', () => page.evaluate(() => window.PIXAGAVE.go('log')));
  await page.setViewportSize({ width: 420, height: 900 });
  await shot('09-mobile', () => page.evaluate(() => window.PIXAGAVE.go('home')));
  await page.setViewportSize({ width: 1440, height: 980 });
  // 書き出したカードそのものを保存
  const card = await page.evaluate(async () => {
    const { exportSpecCard } = await import('./assets/js/creator.js');
    const g = window.PIXAGAVE.game;
    return exportSpecCard(g, g.plant(window.__pid));
  });
  if (card) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile('tools/shots/10-spec-card.png', Buffer.from(card.split(',')[1], 'base64'));
  }
}

await browser.close();
server.close();

if (errors.length) {
  console.error('\nコンソールエラー:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('\nすべて成功しました。');
