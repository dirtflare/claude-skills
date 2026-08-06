/* PIXAGAVE — スプライト合成 / 手続き生成
 *
 * ・写真がまだ無い株のために、種と個性値からドット絵を手続き生成する
 * ・写真由来スプライトと共通の「キャラクター枠」(鉢・影・段階演出)に合成する
 * 進化しても写真は同じなので、段階差はスケール・鉢・演出・彩度で表現する。
 */

import { BRANCHES } from './data.js';

const CHAR = 64; // キャラクター合成キャンバスの一辺

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/* 決定論的乱数(同じ株はいつ描いても同じ形になる) */
export function seededRandom(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    return (h >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function hsl(h, s, l) {
  return `hsl(${((h % 360) + 360) % 360} ${clamp(s, 0, 100)}% ${clamp(l, 0, 100)}%)`;
}

/* ---------- 手続き生成 ---------- */

export function proceduralSprite(species, genes, seed, grid = 44) {
  const rnd = seededRandom(seed || species.id);
  const c = canvas(grid, grid);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const hue = species.hue;

  if (species.world === 'caudex') drawCaudex(ctx, grid, hue, genes, rnd);
  else if (species.world === 'succulent') drawSucculent(ctx, grid, hue, genes, rnd);
  else drawAgave(ctx, grid, hue, genes, rnd);

  outline(ctx, grid);
  return c.toDataURL('image/png');
}

function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

function drawAgave(ctx, g, hue, genes, rnd) {
  const cx = g / 2;
  const cy = g * 0.82;
  const leaves = Math.round(9 + (genes.leaf / 100) * 5 + (genes.vigor / 100) * 4);
  const spread = 0.78 + (1 - genes.compact / 100) * 0.5; // 締まりが低いほど開帳する
  const maxLen = g * (0.40 + (genes.vigor / 100) * 0.12);
  const width = 1.6 + (genes.leaf / 100) * 3.4;

  for (let i = 0; i < leaves; i++) {
    const t = leaves === 1 ? 0.5 : i / (leaves - 1);
    const angle = -Math.PI / 2 + (t - 0.5) * Math.PI * spread + (rnd() - 0.5) * 0.14;
    const len = maxLen * (0.66 + 0.34 * Math.sin(Math.PI * t)) * (0.9 + rnd() * 0.2);
    const shade = -8 + Math.abs(t - 0.5) * 22 + rnd() * 6;
    const light = 34 - Math.abs(t - 0.5) * 12 + (genes.bloom / 100) * 12;
    const sat = 44 + (genes.vigor / 100) * 24 - (genes.bloom / 100) * 18;
    const base = hsl(hue + shade, sat, light);
    const edge = hsl(hue + shade - 6, sat + 8, light - 12);
    const varieg = hsl(hue + 34, 62, 74);

    for (let s = 0; s <= len; s++) {
      const p = s / len;
      const x = cx + Math.cos(angle) * s;
      const y = cy + Math.sin(angle) * s * 0.94;
      const half = Math.max(0.5, (width * (1 - p * 0.82)) / 2);
      for (let w = -half; w <= half; w += 0.5) {
        const ox = x + Math.cos(angle + Math.PI / 2) * w;
        const oy = y + Math.sin(angle + Math.PI / 2) * w;
        let col = base;
        if (Math.abs(w) > half - 0.6) col = edge;
        // 中斑: 葉の中心線を明色で抜く
        if (genes.variegation > 55 && Math.abs(w) < half * 0.34 && p > 0.15 && (i % 2 === 0)) col = varieg;
        px(ctx, ox, oy, col);
      }
      // 鋸歯
      if (genes.spine > 40 && s > len * 0.28 && s % Math.max(2, Math.round(6 - genes.spine / 25)) < 1) {
        const tooth = hsl(hue - 40, 30, 22 + (genes.spine / 100) * 16);
        px(ctx, x + Math.cos(angle + Math.PI / 2) * (half + 0.6), y + Math.sin(angle + Math.PI / 2) * (half + 0.6), tooth);
        px(ctx, x - Math.cos(angle + Math.PI / 2) * (half + 0.6), y - Math.sin(angle + Math.PI / 2) * (half + 0.6), tooth);
      }
    }
    // 葉先の爪
    const tipX = cx + Math.cos(angle) * len;
    const tipY = cy + Math.sin(angle) * len * 0.94;
    px(ctx, tipX, tipY, hsl(hue - 60, 22, 16 + (genes.spine / 100) * 22));
  }
}

function drawCaudex(ctx, g, hue, genes, rnd) {
  const cx = g / 2;
  const cy = g * 0.72;
  const rx = g * (0.20 + (genes.compact / 100) * 0.13);
  const ry = rx * (0.78 + (1 - genes.compact / 100) * 0.3);

  for (let y = -ry; y <= ry; y += 0.5) {
    for (let x = -rx; x <= rx; x += 0.5) {
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) > 1) continue;
      const d = Math.hypot(x / rx, y / ry);
      const l = 46 - d * 18 - (x > 0 ? 4 : 0) + (y < 0 ? 6 : 0);
      const crack = rnd() < 0.06 + (genes.spine / 100) * 0.06 ? -14 : 0;
      px(ctx, cx + x, cy + y, hsl(hue + (rnd() - 0.5) * 10, 26 + (genes.vigor / 100) * 14, l + crack));
    }
  }
  // 枝と葉
  const branches = 2 + Math.round((genes.vigor / 100) * 3);
  for (let b = 0; b < branches; b++) {
    const a = -Math.PI / 2 + (b - (branches - 1) / 2) * 0.42 + (rnd() - 0.5) * 0.2;
    const len = g * (0.2 + rnd() * 0.16);
    let x = cx + Math.cos(a) * rx * 0.5;
    let y = cy - ry * 0.75;
    for (let s = 0; s < len; s++) {
      x += Math.cos(a) * 1 + (rnd() - 0.5) * 0.5;
      y += Math.sin(a) * 1;
      px(ctx, x, y, hsl(hue + 10, 24, 34));
      if (s > len * 0.45 && s % 3 === 0) {
        const leaf = hsl(hue + 42, 46 + (genes.vigor / 100) * 18, 40);
        px(ctx, x + 1, y, leaf);
        px(ctx, x - 1, y, leaf);
        px(ctx, x, y - 1, leaf);
      }
    }
  }
}

function drawSucculent(ctx, g, hue, genes, rnd) {
  const cx = g / 2;
  const cy = g * 0.56;
  const rings = 3 + Math.round((genes.leaf / 100) * 2);
  for (let ring = rings; ring >= 0; ring--) {
    const r = (g * 0.36) * (ring / rings) * (0.55 + (1 - genes.compact / 100) * 0.6) + 2;
    const count = 5 + ring * 4;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ring * 0.5;
      const lx = cx + Math.cos(a) * r;
      const ly = cy + Math.sin(a) * r * 0.72;
      const size = 2.2 + (genes.leaf / 100) * 2.2 - ring * 0.15;
      const l = 40 + (rings - ring) * 4 + (genes.bloom / 100) * 12;
      const tipTint = genes.variegation > 50 ? 26 : 8;
      for (let y = -size; y <= size; y += 0.5) {
        for (let x = -size; x <= size; x += 0.5) {
          if ((x * x) / (size * size) + (y * y) / (size * size * 0.55) > 1) continue;
          const edge = Math.hypot(x / size, y / (size * 0.74)) > 0.72;
          px(ctx, lx + x, ly + y,
            hsl(hue + (edge ? tipTint : 0), 34 + (genes.vigor / 100) * 20, edge ? l - 10 : l));
        }
      }
    }
  }
}

/* 不透明部分の外周 1px を暗色で縁取る */
function outline(ctx, g) {
  const img = ctx.getImageData(0, 0, g, g);
  const d = img.data;
  const alphaAt = (x, y) => (x < 0 || y < 0 || x >= g || y >= g ? 0 : d[(y * g + x) * 4 + 3]);
  const out = new Uint8ClampedArray(d);
  for (let y = 0; y < g; y++) {
    for (let x = 0; x < g; x++) {
      const i = (y * g + x) * 4;
      if (d[i + 3] > 0) continue;
      if (alphaAt(x - 1, y) || alphaAt(x + 1, y) || alphaAt(x, y - 1) || alphaAt(x, y + 1)) {
        out[i] = 10; out[i + 1] = 24; out[i + 2] = 18; out[i + 3] = 230;
      }
    }
  }
  ctx.putImageData(new ImageData(out, g, g), 0, 0);
}

/* ---------- キャラクター合成 ---------- */

const STAGE_SCALE = [0.44, 0.60, 0.76, 0.92, 1.0];

/**
 * 株スプライトを鉢・影・演出つきのキャラクターに合成する。
 * @param {HTMLImageElement} plantImg
 * @param {{stage:number, branch:string|null, genes:object, world:string, pest:number, seed:string}} info
 * @returns {HTMLCanvasElement} CHAR×CHAR
 */
export function composeCharacter(plantImg, info) {
  const c = canvas(CHAR, CHAR);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rnd = seededRandom(info.seed || 'x');
  const stage = clamp(info.stage | 0, 0, 4);
  const branch = info.branch ? BRANCHES[info.branch] : null;

  // 背景の光だまり
  const glow = ctx.createRadialGradient(CHAR / 2, CHAR * 0.44, 2, CHAR / 2, CHAR * 0.44, CHAR * 0.55);
  glow.addColorStop(0, branch ? `${branch.color}22` : '#5fe3c012');
  glow.addColorStop(1, '#00000000');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CHAR, CHAR);

  // 鉢
  const potW = Math.round(16 + stage * 3.4);
  const potH = Math.round(9 + stage * 1.6);
  const potX = Math.round((CHAR - potW) / 2);
  const potY = CHAR - potH - 5;

  // 影
  ctx.fillStyle = '#00120c66';
  ctx.fillRect(potX - 2, CHAR - 5, potW + 4, 2);
  ctx.fillRect(potX, CHAR - 3, potW, 1);

  // 株本体
  const scale = STAGE_SCALE[stage] * (info.branch === 'titan' ? 1.12 : 1);
  const squash = info.branch === 'compact' ? 0.88 : 1;
  const pw = Math.max(8, Math.round(plantImg.width * (CHAR / plantImg.width) * scale * 0.92));
  const ph = Math.max(8, Math.round(pw * squash));
  const pxx = Math.round((CHAR - pw) / 2);
  const pyy = Math.round(potY - ph + potH * 0.42);

  if (info.branch === 'nishiki') {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.filter = 'saturate(1.3)';
  }
  ctx.drawImage(plantImg, pxx, Math.max(0, pyy), pw, ph);
  if (info.branch === 'nishiki') {
    ctx.restore();
    ctx.globalAlpha = 0.65;
    ctx.drawImage(plantImg, pxx, Math.max(0, pyy), pw, ph);
    ctx.globalAlpha = 1;
  }

  // 鉢の描画(株より手前)
  const potBase = info.world === 'caudex' ? '#7d5a3c' : '#5c4636';
  ctx.fillStyle = potBase;
  for (let y = 0; y < potH; y++) {
    const inset = Math.round((y / potH) * 2);
    ctx.fillRect(potX + inset, potY + y, potW - inset * 2, 1);
  }
  ctx.fillStyle = '#00000044';
  ctx.fillRect(potX + potW - 4, potY + 2, 3, potH - 3);
  ctx.fillStyle = '#ffffff1f';
  ctx.fillRect(potX + 2, potY + 2, 2, potH - 4);
  // 鉢の縁
  ctx.fillStyle = info.world === 'caudex' ? '#966f4a' : '#6f5642';
  ctx.fillRect(potX - 1, potY, potW + 2, 2);
  // 用土
  ctx.fillStyle = '#3a2f26';
  ctx.fillRect(potX + 1, potY - 1, potW - 2, 2);
  for (let i = 0; i < potW / 3; i++) {
    px(ctx, potX + 2 + rnd() * (potW - 4), potY - 1 + rnd() * 2, '#55483b');
  }

  // 段階演出
  if (stage >= 3) {
    ctx.fillStyle = branch ? `${branch.color}` : '#5fe3c0';
    for (let i = 0; i < 3 + stage; i++) {
      const a = rnd() * Math.PI * 2;
      const r = CHAR * (0.3 + rnd() * 0.16);
      px(ctx, CHAR / 2 + Math.cos(a) * r, CHAR * 0.45 + Math.sin(a) * r * 0.8, ctx.fillStyle);
    }
  }
  if (stage === 4) {
    // 完成株の冠マーク
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(CHAR / 2 - 3, 3, 6, 1);
    ctx.fillRect(CHAR / 2 - 3, 2, 1, 1);
    ctx.fillRect(CHAR / 2 + 2, 2, 1, 1);
    ctx.fillRect(CHAR / 2, 1, 1, 2);
  }
  if (info.pest > 30) {
    ctx.fillStyle = '#c9f26a';
    for (let i = 0; i < Math.round(info.pest / 20); i++) {
      px(ctx, CHAR * 0.25 + rnd() * CHAR * 0.5, CHAR * 0.3 + rnd() * CHAR * 0.4, '#b7e05a');
    }
  }
  return c;
}
