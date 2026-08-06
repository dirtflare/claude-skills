/* PIXAGAVE — ドット絵の手続き生成
 *
 * 写真がまだ無い株を描くための描画エンジン。
 * canvas のパス描画はアンチエイリアスがかかってドット絵にならないため、
 * 自前のピクセルラスタライザ(Grid)を用意し、1px 単位で塗っている。
 *
 * 品種は「骨格(form)」ごとに専用の描画ルーチンを持ち、
 * ロゼット・球体塊根・徳利型・亀甲・薔薇状・窓・擬態でシルエットが変わる。
 * さらに段階(stage)で葉数と大きさが変わるので、進化すると姿が目に見えて育つ。
 */

import { BRANCHES } from './data.js';

export const SPRITE_GRID = 64;
const CHAR = 96; // 鉢や演出を含むキャラクター枠

/* ---------- 決定論的乱数 ---------- */

export function seededRandom(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < String(seedStr).length; i++) {
    h ^= String(seedStr).charCodeAt(i);
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

/* ---------- ピクセルラスタライザ ---------- */

class Grid {
  constructor(n) {
    this.n = n;
    this.buf = new Array(n * n).fill(null);
  }
  set(x, y, c) {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.n || yi >= this.n || !c) return;
    this.buf[yi * this.n + xi] = c;
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.n || y >= this.n) return null;
    return this.buf[y * this.n + x];
  }
  /* 多角形の走査線塗り */
  poly(pts, c) {
    if (pts.length < 3) return;
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
    minY = Math.max(0, Math.floor(minY));
    maxY = Math.min(this.n - 1, Math.ceil(maxY));
    for (let y = minY; y <= maxY; y++) {
      const xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [x1, y1] = pts[j], [x2, y2] = pts[i];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]); x <= Math.round(xs[k + 1]); x++) this.set(x, y, c);
      }
    }
  }
  stroke(pts, c, closed = true) {
    for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      this.line(a[0], a[1], b[0], b[1], c);
    }
  }
  line(x0, y0, x1, y1, c) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= steps; i++) {
      this.set(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, c);
    }
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
  }
  /* 塗りの外周 1px を縁取る */
  outline(c) {
    const add = [];
    for (let y = 0; y < this.n; y++) {
      for (let x = 0; x < this.n; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) {
          add.push([x, y]);
        }
      }
    }
    for (const [x, y] of add) this.set(x, y, c);
  }
  toCanvas() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = this.n;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(this.n, this.n);
    for (let i = 0; i < this.buf.length; i++) {
      const c = this.buf[i];
      if (!c) continue;
      const [r, g, b] = hexToRgb(c);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/* ---------- 葉の形 ---------- */

/**
 * 1枚の葉を多角形として組み立てる。
 * @param cx,cy 基点 / angle 向き(ラジアン) / len 長さ / halfW 最大半幅
 * @param curve 反り(正で外側に反る) / tip 先端の細さ(0=尖る,1=丸い)
 */
function leafPoly(cx, cy, angle, len, halfW, curve = 0, tip = 0.08) {
  const steps = 10;
  const left = [], right = [];
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const px = Math.cos(angle + Math.PI / 2), py = Math.sin(angle + Math.PI / 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // 幅: 根元は細く、1/3 あたりで最大、先端で尖る
    const w = halfW * Math.sin(Math.PI * Math.pow(t, 0.72)) ** 0.85 * (1 - t * (1 - tip));
    const bend = curve * Math.sin(Math.PI * t) * len * 0.16;
    const sx = cx + dx * len * t + px * bend;
    const sy = cy + dy * len * t + py * bend;
    left.push([sx + px * w, sy + py * w]);
    right.push([sx - px * w, sy - py * w]);
  }
  return left.concat(right.reverse());
}

/* 多角形を重心方向に縮める(ハイライト用) */
function shrink(pts, t, ox = 0, oy = 0) {
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length; cy /= pts.length;
  return pts.map(([x, y]) => [cx + (x - cx) * t + ox, cy + (y - cy) * t + oy]);
}

/* ---------- 骨格ごとの描画 ---------- */

const FORMS = {
  rosette_wide: drawRosette,
  rosette_long: (g, ctx) => drawRosette(g, { ...ctx, long: true }),
  geometric: drawGeometric,
  globe: drawGlobe,
  bottle: drawBottle,
  adenium: drawAdenium,
  turtle: drawTurtle,
  echeveria: drawEcheveria,
  haworthia: drawHaworthia,
  lithops: drawLithops,
};

function drawRosette(g, { sp, genes, stage, rnd, long }) {
  const [dark, mid, light, edge, mark] = sp.palette;
  const n = g.n;
  const cx = n / 2;
  const cy = n * 0.78;
  const grow = 0.52 + stage * 0.13;

  // 葉は「少なく・太く・先を鈍く」。細かく多いと草の束に見えてロゼットにならない
  const count = Math.round((long ? 6 : 4) + stage * 0.7 + (genes.leaf / 100) * 1.5);
  const baseLen = n * (long ? 0.42 : 0.33) * grow * (0.9 + (genes.vigor / 100) * 0.24);
  // 幅は長さに対する比で決める(太さの印象は比率で決まるため)
  const widthRatio = long
    ? 0.17 + (genes.leaf / 100) * 0.10
    : 0.30 + (genes.leaf / 100) * 0.16;
  const tipRound = long ? 0.14 : 0.26;
  // 締まっているほど葉が立ち、緩いほど水平に開帳する
  const openness = 0.62 + (1 - genes.compact / 100) * 0.34;

  const layers = [
    { count: Math.max(3, Math.round(count * 0.7)), lenK: 0.82, wK: 0.9, spreadK: 1.12, body: mix(dark, mid, 0.3), lit: mix(mid, light, 0.3) },
    { count, lenK: 1, wK: 1, spreadK: 1, body: mid, lit: light },
  ];

  for (const L of layers) {
    for (let i = 0; i < L.count; i++) {
      const t = L.count === 1 ? 0.5 : i / (L.count - 1);
      // 左水平 → 上 → 右水平 の扇。openness で開き具合が変わる
      const angle = -Math.PI / 2 + (t - 0.5) * Math.PI * openness * L.spreadK + (rnd() - 0.5) * 0.08;
      const len = baseLen * L.lenK * (0.82 + 0.18 * Math.sin(Math.PI * t)) * (0.94 + rnd() * 0.12);
      const halfW = len * widthRatio * L.wK;
      const curve = (t - 0.5) * 1.8; // 外側の葉ほど外へ反る
      const pts = leafPoly(cx, cy, angle, len, halfW, curve, tipRound);

      g.poly(pts, L.body);
      g.poly(shrink(pts, 0.52, -0.7, -0.7), L.lit);      // 面の明部
      if (genes.variegation > 52 && i % 2 === 0) {
        g.poly(shrink(pts, 0.22, 0, -0.6), mark);        // 中斑
      }
      g.stroke(pts, mix(edge, dark, 0.3));               // 葉を1枚ずつ分離させる縁

      // 鋸歯: 葉の中ほどの縁に少数だけ。多いと毛羽立って見える
      if (genes.spine > 45) {
        const half = pts.length / 2;
        const teeth = Math.round(1 + (genes.spine / 100) * 2);
        for (let k = 1; k <= teeth; k++) {
          const idx = Math.min(half - 1, Math.round(half * (0.45 + (k / (teeth + 1)) * 0.4)));
          g.set(pts[idx][0], pts[idx][1], edge);
          g.set(pts[pts.length - 1 - idx][0], pts[pts.length - 1 - idx][1], edge);
        }
      }
      // 先端の爪(1本だけ、はっきり出す)
      const bend = curve * len * 0.16;
      const tx = cx + Math.cos(angle) * len + Math.cos(angle + Math.PI / 2) * bend;
      const ty = cy + Math.sin(angle) * len + Math.sin(angle + Math.PI / 2) * bend;
      for (let s = 0; s <= 2; s++) {
        g.set(tx + Math.cos(angle) * s, ty + Math.sin(angle) * s, edge);
      }
    }
  }
  // 株元をまとめる
  g.ellipse(cx, cy - 1, 3.2 * grow, 2.2 * grow, mix(dark, edge, 0.4));
}

function drawGeometric(g, { sp, genes, stage, rnd }) {
  const [dark, mid, light, edge, mark] = sp.palette;
  const n = g.n;
  const cx = n / 2, cy = n * 0.78;
  const grow = 0.52 + stage * 0.13;
  const count = Math.round(6 + stage * 1.2);
  const len = n * 0.32 * grow;
  for (const layer of [0, 1]) {
    const c = layer === 0 ? Math.max(3, Math.round(count * 0.7)) : count;
    for (let i = 0; i < c; i++) {
      const t = c === 1 ? 0.5 : i / (c - 1);
      const angle = -Math.PI / 2 + (t - 0.5) * Math.PI * (layer === 0 ? 0.95 : 0.78);
      const L = len * (layer === 0 ? 0.8 : 1) * (0.84 + 0.16 * Math.sin(Math.PI * t));
      // 幅広で直線的な三角形の葉(この品種は葉が厚く短い)
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const px = Math.cos(angle + Math.PI / 2), py = Math.sin(angle + Math.PI / 2);
      const w = L * 0.42;
      const pts = [
        [cx + px * w * 0.5, cy + py * w * 0.5],
        [cx + dx * L * 0.55 + px * w * 0.5, cy + dy * L * 0.55 + py * w * 0.5],
        [cx + dx * L, cy + dy * L],
        [cx + dx * L * 0.55 - px * w * 0.5, cy + dy * L * 0.55 - py * w * 0.5],
        [cx - px * w * 0.5, cy - py * w * 0.5],
      ];
      g.poly(pts, layer === 0 ? dark : mid);
      g.poly(shrink(pts, 0.56, -0.6, -0.6), light);
      // 葉の縁に走る白い線(この品種の特徴)
      g.stroke(pts, mark, true);
      g.line(cx + dx * L * 0.2, cy + dy * L * 0.2, cx + dx * L * 0.9, cy + dy * L * 0.9, mark);
      g.set(cx + dx * (L + 1), cy + dy * (L + 1), '#1a1a18');
    }
  }
  g.ellipse(cx, cy - 1, 3 * grow, 2 * grow, dark);
}

function drawGlobe(g, { sp, genes, stage, rnd }) {
  const [dark, mid, light, edge, leafC] = sp.palette;
  const n = g.n;
  const cx = n / 2, cy = n * 0.66;
  const grow = 0.5 + stage * 0.14;
  const rx = n * 0.24 * grow * (0.9 + (genes.compact / 100) * 0.3);
  const ry = rx * 0.92;

  // 枝と葉(球体より先に描いて奥に置く)
  const branches = 2 + Math.round((genes.vigor / 100) * 3) + Math.floor(stage / 2);
  for (let b = 0; b < branches; b++) {
    const a = -Math.PI / 2 + (b - (branches - 1) / 2) * 0.36 + (rnd() - 0.5) * 0.16;
    const len = n * (0.16 + rnd() * 0.14) * grow;
    let x = cx + Math.cos(a) * rx * 0.4, y = cy - ry * 0.8;
    for (let s = 0; s < len; s++) {
      x += Math.cos(a); y += Math.sin(a);
      g.set(x, y, mix(edge, mid, 0.4));
      if (s > len * 0.4 && s % 3 === 0) {
        g.ellipse(x + 1.5, y, 1.6, 1.1, leafC);
        g.ellipse(x - 1.5, y, 1.6, 1.1, mix(leafC, dark, 0.3));
      }
    }
  }
  // 塊根本体
  g.ellipse(cx, cy, rx, ry, mid);
  g.ellipse(cx - rx * 0.22, cy - ry * 0.24, rx * 0.6, ry * 0.55, light);
  g.ellipse(cx + rx * 0.42, cy + ry * 0.3, rx * 0.5, ry * 0.45, dark);
  // 表皮の点描
  for (let i = 0; i < rx * ry * 0.12; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
    g.set(cx + Math.cos(a) * rx * r * 0.9, cy + Math.sin(a) * ry * r * 0.9, mix(mid, dark, 0.45));
  }
}

function drawBottle(g, { sp, genes, stage, rnd }) {
  const [dark, mid, light, edge, leafC] = sp.palette;
  const n = g.n;
  const cx = n / 2, base = n * 0.82;
  const grow = 0.5 + stage * 0.14;
  const h = n * 0.34 * grow;
  const wBot = n * 0.22 * grow, wTop = wBot * 0.42;

  const trunk = [
    [cx - wBot, base], [cx - wTop, base - h],
    [cx + wTop, base - h], [cx + wBot, base],
  ];
  g.poly(trunk, mid);
  g.poly([[cx - wBot * 0.9, base], [cx - wTop * 0.7, base - h * 0.95], [cx - wTop * 0.1, base - h * 0.95], [cx - wBot * 0.15, base]], light);
  g.poly([[cx + wBot * 0.3, base], [cx + wTop * 0.3, base - h * 0.9], [cx + wTop, base - h], [cx + wBot, base]], dark);
  // 荒れた樹皮
  for (let i = 0; i < h * 1.6; i++) {
    const y = base - rnd() * h;
    const w = wBot + (wTop - wBot) * ((base - y) / h);
    const x = cx + (rnd() - 0.5) * w * 1.7;
    g.line(x, y, x + (rnd() - 0.5) * 3, y + 1, mix(dark, edge, 0.5));
  }
  g.stroke(trunk, edge);
  // 枝と細かい葉
  const branches = 2 + Math.floor(stage / 2);
  for (let b = 0; b < branches; b++) {
    const a = -Math.PI / 2 + (b - (branches - 1) / 2) * 0.5;
    let x = cx + Math.cos(a) * wTop * 0.6, y = base - h;
    const len = n * 0.16 * grow;
    for (let s = 0; s < len; s++) {
      x += Math.cos(a); y += Math.sin(a);
      g.set(x, y, edge);
      if (s % 2 === 0 && s > 2) {
        g.set(x + 1, y - 1, leafC);
        g.set(x - 1, y - 1, mix(leafC, dark, 0.35));
      }
    }
  }
}

function drawAdenium(g, { sp, genes, stage, rnd }) {
  const [dark, mid, light, edge, flower] = sp.palette;
  const n = g.n;
  const cx = n / 2, base = n * 0.80;
  const grow = 0.5 + stage * 0.14;
  const rx = n * 0.19 * grow, ry = n * 0.15 * grow;

  // 二股の塊根
  g.ellipse(cx - rx * 0.45, base - ry * 0.7, rx * 0.75, ry, mid);
  g.ellipse(cx + rx * 0.45, base - ry * 0.7, rx * 0.75, ry, mid);
  g.ellipse(cx, base - ry * 1.5, rx * 0.85, ry * 1.1, mid);
  g.ellipse(cx - rx * 0.4, base - ry * 1.7, rx * 0.5, ry * 0.6, light);
  g.ellipse(cx + rx * 0.6, base - ry * 0.9, rx * 0.4, ry * 0.5, dark);

  // 枝
  const branches = 2 + Math.floor(stage * 0.8);
  for (let b = 0; b < branches; b++) {
    const a = -Math.PI / 2 + (b - (branches - 1) / 2) * 0.44;
    let x = cx + Math.cos(a) * rx * 0.4, y = base - ry * 2.2;
    const len = n * 0.14 * grow;
    for (let s = 0; s < len; s++) {
      x += Math.cos(a); y += Math.sin(a);
      g.set(x, y, mix(mid, dark, 0.4));
      g.set(x + 1, y, mix(mid, dark, 0.6));
    }
    // 葉
    for (let k = 0; k < 3; k++) {
      const la = a + (k - 1) * 0.6;
      g.poly(leafPoly(x, y, la, 6 * grow, 2.2 * grow, 0, 0.3), '#4F7A4A');
    }
    // 花(段階が進むと咲く)
    if (stage >= 3) {
      g.ellipse(x, y - 2, 2.6, 2.2, flower);
      g.set(x, y - 2, '#FFF2F5');
    }
  }
}

function drawTurtle(g, { sp, genes, stage, rnd }) {
  const [dark, mid, light, edge, vine] = sp.palette;
  const n = g.n;
  const cx = n / 2, base = n * 0.82;
  const grow = 0.5 + stage * 0.14;
  const rx = n * 0.26 * grow, ry = n * 0.20 * grow;

  // 蔓(奥)
  for (let b = 0; b < 2 + Math.floor(stage / 2); b++) {
    let x = cx + (b - 0.5) * rx * 0.7, y = base - ry * 1.6;
    let a = -Math.PI / 2 + (rnd() - 0.5) * 0.6;
    for (let s = 0; s < n * 0.2 * grow; s++) {
      a += (rnd() - 0.5) * 0.24;
      x += Math.cos(a); y += Math.sin(a);
      g.set(x, y, mix(vine, dark, 0.3));
      if (s % 4 === 0 && s > 3) {
        g.poly([[x, y - 1], [x + 2.4, y - 2.6], [x + 3.2, y], [x + 1.4, y + 1.4]], vine);
      }
    }
  }
  // 甲羅
  g.ellipse(cx, base - ry, rx, ry, mid);
  // 亀甲状の割れ目
  const plates = 4 + Math.floor(stage);
  for (let i = 0; i < plates; i++) {
    for (let j = 0; j < plates; j++) {
      const px = cx - rx + (i + 0.5) * (rx * 2 / plates);
      const py = base - ry * 2 + (j + 0.5) * (ry * 2 / plates);
      const dx = (px - cx) / rx, dy = (py - (base - ry)) / ry;
      if (dx * dx + dy * dy > 0.92) continue;
      const s = (rx / plates) * 0.78;
      g.poly([[px, py - s], [px + s, py], [px, py + s], [px - s, py]],
        mix(light, mid, 0.25 + rnd() * 0.4));
      g.stroke([[px, py - s], [px + s, py], [px, py + s], [px - s, py]], edge);
    }
  }
  g.ellipse(cx - rx * 0.5, base - ry * 1.35, rx * 0.3, ry * 0.3, mix(light, '#ffffff', 0.25));
}

function drawEcheveria(g, { sp, genes, stage, rnd }) {
  const [dark, mid, light, edgeC, tip] = sp.palette;
  const n = g.n;
  const cx = n / 2, cy = n * 0.56;
  const grow = 0.5 + stage * 0.135;
  const rings = 2 + Math.floor(stage * 0.7);
  const R = n * 0.34 * grow;

  for (let ring = rings; ring >= 0; ring--) {
    const rr = R * ((ring + 0.6) / (rings + 0.6));
    const count = 5 + ring * 4;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ring * 0.6;
      const lx = cx + Math.cos(a) * rr * 0.78;
      const ly = cy + Math.sin(a) * rr * 0.56;
      const size = (2.4 + (genes.leaf / 100) * 2.6) * grow * (1 - ring * 0.06);
      const body = ring === rings ? dark : mix(mid, light, (rings - ring) / (rings + 1));
      const pts = leafPoly(lx - Math.cos(a) * size * 0.6, ly - Math.sin(a) * size * 0.42,
        a, size * 2.1, size * 0.92, 0, 0.5);
      g.poly(pts, body);
      g.poly(shrink(pts, 0.5, -0.4, -0.5), mix(body, light, 0.5));
      // 葉先の紅葉
      g.set(lx + Math.cos(a) * size * 1.1, ly + Math.sin(a) * size * 0.8, edgeC);
      if (genes.variegation > 50) g.set(lx + Math.cos(a) * size * 0.9, ly + Math.sin(a) * size * 0.65, tip);
      g.stroke(pts, mix(dark, edgeC, 0.25));
    }
  }
}

function drawHaworthia(g, { sp, genes, stage, rnd }) {
  const [dark, mid, light, window, windowLite] = sp.palette;
  const n = g.n;
  const cx = n / 2, cy = n * 0.80;
  const grow = 0.5 + stage * 0.14;
  const count = Math.round(7 + stage * 2);
  for (const layer of [0, 1]) {
    const c = layer === 0 ? Math.round(count * 0.6) : count;
    for (let i = 0; i < c; i++) {
      const t = c === 1 ? 0.5 : i / (c - 1);
      const angle = -Math.PI / 2 + (t - 0.5) * Math.PI * 0.72;
      const len = n * 0.36 * grow * (layer === 0 ? 0.8 : 1) * (0.78 + 0.22 * Math.sin(Math.PI * t));
      const pts = leafPoly(cx, cy, angle, len, 3.2 * grow, (t - 0.5) * 0.9, 0.1);
      g.poly(pts, layer === 0 ? dark : mid);
      // 上半分が半透明の「窓」
      const win = shrink(pts, 0.62, 0, -len * 0.18);
      g.poly(win, layer === 0 ? mix(window, dark, 0.35) : window);
      g.poly(shrink(win, 0.5, -0.4, -0.8), windowLite);
      g.stroke(pts, mix(dark, '#000000', 0.3));
    }
  }
}

function drawLithops(g, { sp, genes, stage, rnd }) {
  const [dark, mid, light, mark, flowerC] = sp.palette;
  const n = g.n;
  const cx = n / 2, cy = n * 0.72;
  const grow = 0.55 + stage * 0.12;
  const rx = n * 0.15 * grow, ry = n * 0.17 * grow;
  const pairs = 1 + Math.floor(stage / 2);

  for (let p = 0; p < pairs; p++) {
    const ox = cx + (p - (pairs - 1) / 2) * rx * 2.5;
    for (const side of [-1, 1]) {
      const bx = ox + side * rx * 0.55;
      g.ellipse(bx, cy, rx, ry, mid);
      g.ellipse(bx, cy - ry * 0.35, rx * 0.9, ry * 0.55, light);
      // 上面の模様(擬態)
      for (let i = 0; i < 14; i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.8;
        g.set(bx + Math.cos(a) * rx * r, cy - ry * 0.3 + Math.sin(a) * ry * 0.45 * r, mark);
      }
      g.ellipse(bx + side * rx * 0.5, cy + ry * 0.3, rx * 0.4, ry * 0.5, dark);
    }
    // 裂け目
    g.line(ox, cy - ry * 0.7, ox, cy + ry * 0.2, dark);
    if (stage >= 4 && p === 0) {
      // 完成株は花を咲かせる
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        g.line(ox, cy - ry * 0.5, ox + Math.cos(a) * rx * 1.1, cy - ry * 0.5 + Math.sin(a) * ry * 0.9, flowerC);
      }
      g.set(ox, cy - ry * 0.5, '#FFF6D8');
    }
  }
}

/* ---------- 公開 API ---------- */

/**
 * 品種・個性値・段階からドット絵スプライトを生成する。
 * @returns {string} PNG dataURL (SPRITE_GRID × SPRITE_GRID)
 */
export function proceduralSprite(sp, genes, seed, stage = 3) {
  const g = new Grid(SPRITE_GRID);
  const rnd = seededRandom(`${seed}:${sp.id}:${stage}`);
  const draw = FORMS[sp.form] || drawRosette;
  draw(g, { sp, genes, stage: clamp(stage, 0, 4), rnd });
  g.outline('#0A1410');
  return g.toCanvas().toDataURL('image/png');
}

/* 鉢・影・段階演出を足してキャラクターに仕立てる */
export function composeCharacter(plantImg, info) {
  const c = document.createElement('canvas');
  c.width = c.height = CHAR;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rnd = seededRandom(info.seed || 'x');
  const stage = clamp(info.stage | 0, 0, 4);
  const branch = info.branch ? BRANCHES[info.branch] : null;

  // 背景は透明のまま。地色は CSS 側の枠が持つので、ここで色を敷くと紙の上で汚れて見える
  const potW = Math.round(26 + stage * 4);
  const potH = Math.round(14 + stage * 2);
  const potX = Math.round((CHAR - potW) / 2);
  const potY = CHAR - potH - 8;

  // 影
  ctx.fillStyle = '#00120c55';
  ctx.fillRect(potX - 3, CHAR - 8, potW + 6, 3);
  ctx.fillRect(potX - 1, CHAR - 5, potW + 2, 2);

  // 株
  const scale = (0.62 + stage * 0.095) * (info.branch === 'titan' ? 1.1 : 1);
  const squash = info.branch === 'compact' ? 0.9 : 1;
  const pw = Math.round(CHAR * scale);
  const ph = Math.round(pw * squash);
  const pxx = Math.round((CHAR - pw) / 2);
  const pyy = Math.round(potY - ph + potH * 0.45);
  ctx.drawImage(plantImg, pxx, Math.max(-4, pyy), pw, ph);

  // 鉢
  const clay = info.world === 'caudex' ? ['#8A6242', '#A0764F', '#5E4530'] : ['#5E4A3A', '#755C47', '#3F3126'];
  for (let y = 0; y < potH; y++) {
    const inset = Math.round((y / potH) * 3);
    ctx.fillStyle = clay[0];
    ctx.fillRect(potX + inset, potY + y, potW - inset * 2, 1);
  }
  ctx.fillStyle = clay[2];
  ctx.fillRect(potX + potW - 6, potY + 3, 4, potH - 4);
  ctx.fillStyle = '#ffffff22';
  ctx.fillRect(potX + 3, potY + 3, 3, potH - 6);
  ctx.fillStyle = clay[1];
  ctx.fillRect(potX - 2, potY, potW + 4, 3);
  // 用土
  ctx.fillStyle = '#3A2F26';
  ctx.fillRect(potX + 1, potY - 2, potW - 2, 3);
  for (let i = 0; i < potW / 2.5; i++) {
    ctx.fillStyle = ['#55483B', '#6B5A48', '#403428'][Math.floor(rnd() * 3)];
    ctx.fillRect(Math.round(potX + 2 + rnd() * (potW - 5)), Math.round(potY - 2 + rnd() * 3), 1, 1);
  }

  // 系統の演出
  if (stage >= 3 && branch) {
    ctx.fillStyle = branch.color;
    for (let i = 0; i < 5; i++) {
      const a = rnd() * Math.PI * 2;
      const r = CHAR * (0.3 + rnd() * 0.14);
      ctx.fillRect(Math.round(CHAR / 2 + Math.cos(a) * r), Math.round(CHAR * 0.44 + Math.sin(a) * r * 0.8), 2, 2);
    }
  }
  if (stage === 4) {
    ctx.fillStyle = '#FFD25A';
    ctx.fillRect(CHAR / 2 - 5, 5, 10, 2);
    ctx.fillRect(CHAR / 2 - 5, 3, 2, 2);
    ctx.fillRect(CHAR / 2 + 3, 3, 2, 2);
    ctx.fillRect(CHAR / 2 - 1, 1, 2, 3);
  }
  if (info.pest > 30) {
    for (let i = 0; i < Math.round(info.pest / 22); i++) {
      ctx.fillStyle = '#C6E85E';
      ctx.fillRect(Math.round(CHAR * 0.28 + rnd() * CHAR * 0.44), Math.round(CHAR * 0.3 + rnd() * CHAR * 0.36), 2, 2);
    }
  }
  return c;
}

/* 図鑑の未登録欄などで使うシルエット */
export function silhouette(spriteDataUrl, img, color = '#1E3A2E') {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
