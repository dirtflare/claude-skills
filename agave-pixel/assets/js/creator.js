/* PIXAGAVE — Creator
 * 育成データからそのまま共有画像を書き出す。
 * ピクセルアート / 個体カード / ストーリー(9:16) / コレクションカバー / 成長ストリップ
 * すべて canvas 描画。フォントは端末内蔵のみを使う。
 */

import { BRANCHES, WORLDS, GENES, GENE_KEYS, SPECIES_BY_ID } from './data.js';
import { loadImageFromUrl } from './pixelize.js';
import { proceduralSprite } from './sprite.js';
import { getImage } from './store.js';

const JP = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif';
const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

const INK = '#e8f6ec';
const DIM = '#7fa694';
const BG0 = '#061410';
const BG1 = '#0d2119';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function backdrop(ctx, w, h, accent) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, BG0);
  g.addColorStop(0.55, BG1);
  g.addColorStop(1, '#08190f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // 目に見えるか見えないかの方眼(標本台紙のイメージ)
  ctx.strokeStyle = '#ffffff08';
  ctx.lineWidth = 1;
  const step = Math.round(w / 26);
  for (let x = step; x < w; x += step) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
  }
  for (let y = step; y < h; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
  }
  // 上端のスペクトル帯
  const bar = ctx.createLinearGradient(0, 0, w, 0);
  bar.addColorStop(0, accent);
  bar.addColorStop(0.5, '#ffd166');
  bar.addColorStop(1, '#f28fb0');
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, w, Math.max(4, Math.round(h / 190)));
}

function label(ctx, text, x, y, { size = 22, color = DIM, font = MONO, align = 'left', spacing = 0 } = {}) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = spacing ? 'left' : align;
  ctx.textBaseline = 'alphabetic';
  if (spacing) {
    let cx = x;
    if (align === 'center') {
      const total = [...text].reduce((a, ch) => a + ctx.measureText(ch).width + spacing, -spacing);
      cx = x - total / 2;
    } else if (align === 'right') {
      const total = [...text].reduce((a, ch) => a + ctx.measureText(ch).width + spacing, -spacing);
      cx = x - total;
    }
    for (const ch of text) {
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + spacing;
    }
  } else {
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

function panel(ctx, x, y, w, h, accent = '#5fe3c0') {
  ctx.fillStyle = '#0c1f18cc';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#ffffff14';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, 4, h);
}

function drawSprite(ctx, img, cx, cy, size, accent) {
  const glow = ctx.createRadialGradient(cx, cy, size * 0.05, cx, cy, size * 0.72);
  glow.addColorStop(0, `${accent}33`);
  glow.addColorStop(1, '#00000000');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - size, cy - size, size * 2, size * 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
  ctx.imageSmoothingEnabled = true;
}

function radar(ctx, cx, cy, r, genes, accent) {
  const keys = GENE_KEYS;
  const n = keys.length;
  const pt = (i, v) => {
    const a = (-Math.PI / 2) + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r * v, cy + Math.sin(a) * r * v];
  };
  ctx.strokeStyle = '#ffffff18';
  ctx.lineWidth = 1.5;
  for (const ring of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const [x, y] = pt(i % n, ring);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const [x, y] = pt(i, Math.max(0.06, genes[keys[i]] / 100));
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = `${accent}44`;
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  for (let i = 0; i < n; i++) {
    const [x, y] = pt(i, 1.2);
    label(ctx, GENES[keys[i]].ja, x, y + 6, { size: r * 0.15, color: DIM, font: JP, align: 'center' });
  }
}

function statRow(ctx, x, y, w, name, value, accent) {
  label(ctx, name, x, y, { size: 22, color: DIM, font: JP });
  label(ctx, value, x + w, y, { size: 26, color: INK, font: MONO, align: 'right' });
  ctx.fillStyle = '#ffffff12';
  ctx.fillRect(x, y + 12, w, 1);
}

async function spriteImage(plant, override) {
  let data = override || (plant.spriteId ? await getImage(plant.spriteId) : null);
  if (!data) {
    // 写真がまだ無い株は手続き生成のドット絵で代用する
    const sp = SPECIES_BY_ID[plant.speciesId];
    if (!sp) return null;
    data = proceduralSprite(sp, plant.genes, plant.seed || plant.id, plant.stage);
  }
  return loadImageFromUrl(data);
}

/* ---------- 1. ピクセルアート単体 ---------- */

export async function exportPixelArt(plant, { scale = 16, sprite } = {}) {
  const img = await spriteImage(plant, sprite);
  if (!img) throw new Error('スプライトがありません');
  const c = canvas(img.width * scale, img.height * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

/* ---------- 2. 個体カード ---------- */

export async function exportSpecCard(game, plant, { sprite } = {}) {
  const W = 900, H = 1280;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const sp = SPECIES_BY_ID[plant.speciesId];
  const world = WORLDS[sp.world];
  const branch = plant.branch ? BRANCHES[plant.branch] : null;
  const accent = branch ? branch.color : world.color;

  backdrop(ctx, W, H, accent);

  label(ctx, 'PIXAGAVE / SPECIMEN CARD', 48, 76, { size: 22, color: DIM, spacing: 3 });
  label(ctx, world.en, W - 48, 76, { size: 22, color: accent, align: 'right', spacing: 3 });

  // 主役
  const img = await spriteImage(plant, sprite);
  if (img) drawSprite(ctx, img, W / 2, 400, 460, accent);
  else {
    ctx.fillStyle = '#ffffff08';
    ctx.fillRect(W / 2 - 180, 220, 360, 360);
    label(ctx, 'NO IMAGE', W / 2, 410, { size: 26, color: DIM, align: 'center', spacing: 4 });
  }

  // レア度
  const stars = '★'.repeat(sp.rarity) + '☆'.repeat(5 - sp.rarity);
  label(ctx, stars, W / 2, 656, { size: 30, color: '#ffd166', align: 'center', spacing: 6 });

  // 名前
  label(ctx, game.displayName(plant), W / 2, 716, { size: 54, color: INK, font: JP, align: 'center' });
  label(ctx, `${sp.en.toUpperCase()} / ${plant.nickname}`, W / 2, 754, {
    size: 22, color: DIM, align: 'center', spacing: 2,
  });

  // 段階チップ
  const chip = `${game.stageInfo(plant).ja}${branch ? ` · ${branch.ja}` : ''}`;
  ctx.font = `26px ${JP}`;
  const cw = ctx.measureText(chip).width + 48;
  ctx.fillStyle = `${accent}22`;
  ctx.fillRect(W / 2 - cw / 2, 776, cw, 46);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - cw / 2, 776, cw, 46);
  label(ctx, chip, W / 2, 807, { size: 26, color: accent, font: JP, align: 'center' });

  // レーダー + 数値
  panel(ctx, 48, 856, 380, 300, accent);
  radar(ctx, 238, 1000, 96, plant.genes, accent);

  panel(ctx, 452, 856, 400, 300, '#ffd166');
  const days = Math.floor(game.ageDays(plant));
  const iv = game.avgWaterInterval(plant);
  let sy = 906;
  const rows = [
    ['総合スコア', String(game.score(plant))],
    ['管理スコア', `${game.careQuality(plant)} / 100`],
    ['育成日数', `${days} 日`],
    ['記録', `${plant.album.length} 枚`],
    ['平均潅水間隔', iv ? `${iv} 日` : '—'],
    ['推定照度', `${game.estimatedLux(plant).toLocaleString()} lx`],
    ['株幅', plant.metrics.diameter ? `${plant.metrics.diameter} cm` : '—'],
  ];
  for (const [k, v] of rows) {
    statRow(ctx, 484, sy, 336, k, v, accent);
    sy += 40;
  }

  // 系統 / 交配
  panel(ctx, 48, 1180, W - 96, 56, accent);
  const lineage = plant.parents
    ? `LINEAGE  ${plant.parents[0].name} × ${plant.parents[1].name}  (F${plant.gen})`
    : `SPECIES  ${sp.ja} / ${sp.en}`;
  label(ctx, lineage, 76, 1216, { size: 22, color: DIM, font: JP });

  label(ctx, new Date().toISOString().slice(0, 10), W - 76, 1216, { size: 20, color: DIM, align: 'right', spacing: 2 });
  return c.toDataURL('image/png');
}

/* ---------- 3. ストーリー(9:16) ---------- */

export async function exportStory(game, plant, { sprite } = {}) {
  const W = 1080, H = 1920;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const sp = SPECIES_BY_ID[plant.speciesId];
  const branch = plant.branch ? BRANCHES[plant.branch] : null;
  const accent = branch ? branch.color : WORLDS[sp.world].color;
  backdrop(ctx, W, H, accent);

  label(ctx, 'PIXAGAVE', 72, 130, { size: 30, color: DIM, spacing: 8 });
  label(ctx, WORLDS[sp.world].en, W - 72, 130, { size: 26, color: accent, align: 'right', spacing: 5 });

  const img = await spriteImage(plant, sprite);
  if (img) drawSprite(ctx, img, W / 2, 700, 700, accent);

  label(ctx, game.displayName(plant), W / 2, 1130, { size: 76, color: INK, font: JP, align: 'center' });
  label(ctx, `${Math.floor(game.ageDays(plant))} DAYS / ${plant.album.length} LOGS`, W / 2, 1186, {
    size: 30, color: DIM, align: 'center', spacing: 5,
  });

  // 3指標
  const boxes = [
    ['SCORE', String(game.score(plant))],
    ['CARE', `${game.careQuality(plant)}`],
    ['STAGE', `${plant.stage + 1}/5`],
  ];
  const bw = 280, gap = 40;
  const startX = (W - (bw * 3 + gap * 2)) / 2;
  boxes.forEach(([k, v], i) => {
    const x = startX + i * (bw + gap);
    panel(ctx, x, 1250, bw, 170, accent);
    label(ctx, k, x + bw / 2, 1310, { size: 24, color: DIM, align: 'center', spacing: 4 });
    label(ctx, v, x + bw / 2, 1382, { size: 62, color: INK, align: 'center' });
  });

  radar(ctx, W / 2, 1620, 150, plant.genes, accent);
  label(ctx, 'agave · caudex · succulent', W / 2, 1850, { size: 26, color: DIM, align: 'center', spacing: 4 });
  return c.toDataURL('image/png');
}

/* ---------- 4. コレクションカバー ---------- */

export async function exportCover(game, plants) {
  const W = 1600, H = 900;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  backdrop(ctx, W, H, '#5fe3c0');

  label(ctx, 'PIXAGAVE / MY SHELF', 60, 90, { size: 28, color: DIM, spacing: 6 });
  label(ctx, `${plants.length} SPECIMENS`, W - 60, 90, { size: 28, color: '#5fe3c0', align: 'right', spacing: 5 });

  const list = plants.slice(0, 8);
  const cols = Math.min(4, Math.max(1, list.length));
  const rows = Math.ceil(list.length / cols);
  const cw = (W - 120) / cols;
  const chh = (H - 220) / rows;

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const sp = SPECIES_BY_ID[p.speciesId];
    const accent = p.branch ? BRANCHES[p.branch].color : WORLDS[sp.world].color;
    const x = 60 + (i % cols) * cw;
    const y = 150 + Math.floor(i / cols) * chh;
    panel(ctx, x + 8, y, cw - 16, chh - 16, accent);
    const img = await spriteImage(p);
    if (img) drawSprite(ctx, img, x + cw / 2, y + chh * 0.42, Math.min(cw, chh) * 0.62, accent);
    label(ctx, game.displayName(p), x + cw / 2, y + chh - 52, {
      size: 26, color: INK, font: JP, align: 'center',
    });
    label(ctx, `${game.score(p)} pts`, x + cw / 2, y + chh - 26, {
      size: 20, color: DIM, align: 'center', spacing: 2,
    });
  }
  label(ctx, new Date().toISOString().slice(0, 10), W / 2, H - 34, {
    size: 22, color: DIM, align: 'center', spacing: 3,
  });
  return c.toDataURL('image/png');
}

/* ---------- 5. 成長ストリップ(タイムラプス) ---------- */

export async function exportGrowthStrip(game, plant) {
  const entries = [...plant.album].reverse().slice(0, 8);
  if (!entries.length) throw new Error('記録がありません');
  const cell = 300;
  const W = Math.max(900, cell * entries.length + 80);
  const H = 560;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const sp = SPECIES_BY_ID[plant.speciesId];
  const accent = plant.branch ? BRANCHES[plant.branch].color : WORLDS[sp.world].color;
  backdrop(ctx, W, H, accent);

  label(ctx, `GROWTH LOG / ${game.displayName(plant)}`, 44, 78, { size: 26, color: INK, font: JP });
  label(ctx, `${entries.length} RECORDS`, W - 44, 78, { size: 22, color: DIM, align: 'right', spacing: 3 });

  const t0 = entries[0].t;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const x = 40 + i * cell;
    panel(ctx, x, 120, cell - 20, 380, accent);
    const spriteData = e.spriteId ? await getImage(e.spriteId) : null;
    if (spriteData) {
      const img = await loadImageFromUrl(spriteData);
      drawSprite(ctx, img, x + (cell - 20) / 2, 270, 210, accent);
    }
    const dayN = Math.max(0, Math.round((e.t - t0) / 86400000));
    label(ctx, `DAY ${dayN}`, x + (cell - 20) / 2, 430, { size: 24, color: INK, align: 'center', spacing: 3 });
    label(ctx, new Date(e.t).toISOString().slice(0, 10), x + (cell - 20) / 2, 462, {
      size: 19, color: DIM, align: 'center', spacing: 1,
    });
    if (e.metrics && e.metrics.diameter) {
      label(ctx, `${e.metrics.diameter}cm`, x + (cell - 20) / 2, 488, { size: 19, color: accent, align: 'center' });
    }
    if (i > 0) {
      label(ctx, '›', x - 12, 285, { size: 40, color: DIM, align: 'center' });
    }
  }
  label(ctx, 'PIXAGAVE', W / 2, H - 24, { size: 22, color: DIM, align: 'center', spacing: 6 });
  return c.toDataURL('image/png');
}

/* ---------- 保存 ---------- */

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
