/* PIXAGAVE — 写真ピクセル化エンジン
 *
 * 実物の写真 1 枚から
 *   (1) 背景を落とした「株だけ」のドット絵スプライト
 *   (2) その株固有の個性値(遺伝子)
 * を生成する。すべてブラウザ内 canvas 処理で完結し、外部送信は一切しない。
 *
 * パイプライン:
 *   crop → 背景推定 → マスク生成 → モルフォロジー整形 → 最大連結成分抽出
 *   → グリッド縮小(マスク加重平均) → k-means 減色 → スタイライズ(HSL量子化)
 *   → ディザ → 陰影 + 輪郭 → PNG
 */

const WORK = 160; // 解析用の作業解像度

/* ---------- 基本ユーティリティ ---------- */

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読み込めませんでした'));
    };
    img.src = url;
  });
}

export function loadImageFromUrl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めませんでした'));
    img.src = src;
  });
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/* 中央を正方形に切り出して size×size に描画 */
function squareCrop(img, size) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const sx = ((img.naturalWidth || img.width) - side) / 2;
  const sy = ((img.naturalHeight || img.height) - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size);
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => clamp(v, 0, 1);

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const lumaOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/* ---------- 1. 背景推定 & マスク生成 ---------- */

function estimateBackground(data, size) {
  // 外周 12% のリングから中央値を取る(角だけだと空/机の片寄りに弱い)
  const band = Math.max(2, Math.round(size * 0.12));
  const rs = [], gs = [], bs = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edge = x < band || y < band || x >= size - band || y >= size - band;
      if (!edge) continue;
      const i = (y * size + x) * 4;
      rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
    }
  }
  const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1] || 0; };
  return [med(rs), med(gs), med(bs)];
}

function buildMask(data, size) {
  const bg = estimateBackground(data, size);
  const [br, bgc, bb] = bg;
  const bgHsl = rgbToHsl(br, bgc, bb);
  const mask = new Uint8Array(size * size);

  // 背景との差の分布を見て閾値を自動調整する
  const diffs = new Float32Array(size * size);
  for (let p = 0; p < size * size; p++) {
    const i = p * 4;
    const dr = data[i] - br, dg = data[i + 1] - bgc, db = data[i + 2] - bb;
    diffs[p] = Math.sqrt(dr * dr + dg * dg + db * db);
  }
  const sorted = Float32Array.from(diffs).sort();
  const p60 = sorted[Math.floor(sorted.length * 0.6)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  const thr = clamp((p60 + p90) / 2, 26, 96);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = y * size + x;
      const i = p * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const [h, s, l] = rgbToHsl(r, g, b);
      // 植物寄りの色(緑〜黄緑〜青緑、あるいは彩度の高い色)を優遇
      const plantish = (h >= 55 && h <= 190 && s > 0.12) ? 1 : 0;
      // 背景の色相と大きく離れていれば主題とみなす
      let hueGap = Math.abs(h - bgHsl[0]);
      if (hueGap > 180) hueGap = 360 - hueGap;
      const score =
        diffs[p] / thr +
        plantish * 0.55 +
        (s > 0.22 ? 0.35 : 0) +
        (hueGap > 45 && s > 0.15 ? 0.3 : 0) -
        (l > 0.93 ? 0.6 : 0) - // 白飛びした背景
        (l < 0.06 ? 0.4 : 0);
      mask[p] = score >= 1 ? 1 : 0;
    }
  }
  return { mask, bg };
}

/* 3×3 モルフォロジー */
function morph(mask, size, op, times = 1) {
  let src = mask;
  for (let t = 0; t < times; t++) {
    const dst = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let hit = op === 'erode' ? 1 : 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            const v = nx < 0 || ny < 0 || nx >= size || ny >= size ? 0 : src[ny * size + nx];
            if (op === 'erode') hit &= v;
            else hit |= v;
          }
        }
        dst[y * size + x] = hit;
      }
    }
    src = dst;
  }
  return src;
}

/* 中央に最も近い最大連結成分だけを残す */
function largestComponent(mask, size) {
  const label = new Int32Array(size * size).fill(-1);
  const stack = new Int32Array(size * size);
  let best = null;
  let id = 0;
  const cx = size / 2, cy = size / 2;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start] !== -1) continue;
    let sp = 0;
    stack[sp++] = start;
    label[start] = id;
    let count = 0;
    let sumx = 0, sumy = 0;
    while (sp > 0) {
      const p = stack[--sp];
      count++;
      const x = p % size, y = (p / size) | 0;
      sumx += x; sumy += y;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const np = ny * size + nx;
        if (mask[np] && label[np] === -1) {
          label[np] = id;
          stack[sp++] = np;
        }
      }
    }
    const dist = Math.hypot(sumx / count - cx, sumy / count - cy) / size;
    const weight = count * (1 - clamp01(dist) * 0.75); // 中央寄りを優遇
    if (!best || weight > best.weight) best = { id, weight, count };
    id++;
  }
  if (!best) return mask;
  const out = new Uint8Array(size * size);
  for (let p = 0; p < out.length; p++) out[p] = label[p] === best.id ? 1 : 0;
  return out;
}

/* 穴埋め: 外周から到達できない 0 領域を 1 にする */
function fillHoles(mask, size) {
  const outside = new Uint8Array(size * size);
  const stack = [];
  for (let x = 0; x < size; x++) {
    stack.push(x, (size - 1) * size + x);
  }
  for (let y = 0; y < size; y++) {
    stack.push(y * size, y * size + size - 1);
  }
  while (stack.length) {
    const p = stack.pop();
    if (p < 0 || p >= mask.length || outside[p] || mask[p]) continue;
    outside[p] = 1;
    const x = p % size, y = (p / size) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < size - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - size);
    if (y < size - 1) stack.push(p + size);
  }
  const out = new Uint8Array(mask);
  for (let p = 0; p < out.length; p++) if (!outside[p]) out[p] = 1;
  return out;
}

/* ---------- 2. グリッド縮小 ---------- */

function downsample(data, size, mask, grid) {
  // マスクの外接矩形を正方形に整えてから grid×grid へ
  let minX = size, minY = size, maxX = -1, maxY = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (mask[y * size + x]) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) { minX = 0; minY = 0; maxX = size - 1; maxY = size - 1; }
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const side = Math.max(w, h);
  const ox = minX - (side - w) / 2;
  const oy = minY - (side - h) / 2;

  const cells = new Array(grid * grid);
  const cell = side / grid;
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      let r = 0, g = 0, b = 0, n = 0, tot = 0;
      const x0 = Math.floor(ox + gx * cell), x1 = Math.ceil(ox + (gx + 1) * cell);
      const y0 = Math.floor(oy + gy * cell), y1 = Math.ceil(oy + (gy + 1) * cell);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (x < 0 || y < 0 || x >= size || y >= size) { tot++; continue; }
          tot++;
          if (!mask[y * size + x]) continue;
          const i = (y * size + x) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2];
          n++;
        }
      }
      const cover = tot ? n / tot : 0;
      cells[gy * grid + gx] = n
        ? { r: r / n, g: g / n, b: b / n, cover }
        : { r: 0, g: 0, b: 0, cover: 0 };
    }
  }
  return { cells, bbox: { minX, minY, maxX, maxY, side } };
}

/* ---------- 3. 減色 (k-means) ---------- */

function kmeans(points, k, iterations = 14) {
  if (!points.length) return [];
  k = Math.min(k, points.length);
  // 輝度順に等間隔サンプリングして初期中心を決める(k-means++ の簡易版)
  const sorted = [...points].sort((a, b) => lumaOf(a[0], a[1], a[2]) - lumaOf(b[0], b[1], b[2]));
  const centers = [];
  for (let i = 0; i < k; i++) {
    centers.push([...sorted[Math.floor(((i + 0.5) / k) * (sorted.length - 1))]]);
  }
  const assign = new Int32Array(points.length);
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let p = 0; p < points.length; p++) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const dr = points[p][0] - centers[c][0];
        const dg = points[p][1] - centers[c][1];
        const db = points[p][2] - centers[c][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; bi = c; }
      }
      if (assign[p] !== bi) { assign[p] = bi; moved = true; }
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let p = 0; p < points.length; p++) {
      const s = sums[assign[p]];
      s[0] += points[p][0]; s[1] += points[p][1]; s[2] += points[p][2]; s[3]++;
    }
    for (let c = 0; c < centers.length; c++) {
      if (sums[c][3] > 0) {
        centers[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
      }
    }
    if (!moved && it > 2) break;
  }
  const weights = new Array(centers.length).fill(0);
  for (let p = 0; p < points.length; p++) weights[assign[p]]++;
  return centers.map((c, i) => ({ rgb: c, weight: weights[i] / points.length }));
}

/* 中心色を「ドット絵らしい」色に整える。
 * 元写真の色相は残しつつ、彩度と明度を段階化して情報量を落とす。 */
function stylize(rgb, speciesHue, strength = 0.14) {
  let [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  // 種の基調色相へ少しだけ引き寄せる(個体差は残す)
  let gap = speciesHue - h;
  if (gap > 180) gap -= 360;
  if (gap < -180) gap += 360;
  h += gap * strength;
  s = clamp01(Math.round(clamp01(s * 1.22) * 6) / 6);
  l = clamp(Math.round(l * 9) / 9, 0.06, 0.95);
  return hslToRgb(h, s, l);
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/* ---------- 4. 個性値の解析 ---------- */

function analyze(cells, grid, species) {
  const inside = [];
  let area = 0, perimeter = 0;
  const rows = new Array(grid).fill(0);
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const c = cells[y * grid + x];
      if (c.cover < 0.42) continue;
      area++;
      rows[y]++;
      inside.push({ x, y, ...c });
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        const n = nx < 0 || ny < 0 || nx >= grid || ny >= grid ? null : cells[ny * grid + nx];
        if (!n || n.cover < 0.42) perimeter++;
      }
    }
  }
  if (!area) {
    return { raw: {}, hue: species.hue, area: 0 };
  }

  const lums = inside.map((c) => lumaOf(c.r, c.g, c.b));
  const meanL = lums.reduce((a, b) => a + b, 0) / lums.length;
  const sd = Math.sqrt(lums.reduce((a, b) => a + (b - meanL) ** 2, 0) / lums.length);

  let hx = 0, hy = 0, satSum = 0;
  let brightPale = 0, highlight = 0;
  for (const c of inside) {
    const [h, s, l] = rgbToHsl(c.r, c.g, c.b);
    hx += Math.cos((h * Math.PI) / 180) * s;
    hy += Math.sin((h * Math.PI) / 180) * s;
    satSum += s;
    if (l > 0.62 && s < 0.24) brightPale++;              // 白粉・粉質
    if (lumaOf(c.r, c.g, c.b) > meanL + sd * 1.05 && s > 0.16) highlight++; // 斑・覆輪
  }
  const meanHue = ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360;
  const meanSat = satSum / inside.length;

  // 締まり: 外接円に対する充填率が高いほど「詰まっている」
  const bboxArea = grid * grid;
  const compactness = area / bboxArea;
  // 棘・鋸歯: 面積あたりの輪郭長。ギザギザなほど大きい
  const roughness = perimeter / (4 * Math.sqrt(area));
  // 葉幅: 行ごとの被覆長の平均(幅広ほど大)
  const meanRow = rows.filter((r) => r > 0).reduce((a, b) => a + b, 0) / rows.filter((r) => r > 0).length;
  const leafiness = meanRow / grid;

  const raw = {
    leaf: clamp(leafiness * 150 - 10, 0, 100),
    compact: clamp(compactness * 210, 0, 100),
    spine: clamp((roughness - 1.05) * 118, 0, 100),
    variegation: clamp((highlight / area) * 330, 0, 100),
    bloom: clamp((brightPale / area) * 280, 0, 100),
    vigor: clamp(meanSat * 105 + compactness * 45, 0, 100),
  };
  return { raw, hue: meanHue, area, contrast: sd / 64, meanSat };
}

/* 解析値と種のバイアスを合成して確定した個性値にする */
export function mixGenes(raw, species, luck = Math.random) {
  const out = {};
  for (const key of ['leaf', 'compact', 'spine', 'variegation', 'bloom', 'vigor']) {
    const photo = raw && Number.isFinite(raw[key]) ? raw[key] : 50;
    const bias = species.bias[key];
    const jitter = (luck() - 0.5) * 12;
    out[key] = Math.round(clamp(photo * 0.55 + bias * 0.45 + jitter, 1, 100));
  }
  return out;
}

/* ---------- 5. 本体 ---------- */

/**
 * 写真をドット絵スプライトに変換する。
 * @param {HTMLImageElement} img
 * @param {{species: object, grid?: number, colors?: number, dither?: boolean}} opts
 * @returns {{sprite: string, thumb: string, grid: number, analysis: object}}
 */
export function pixelizePhoto(img, opts = {}) {
  const species = opts.species || { hue: 150, bias: {} };
  const grid = opts.grid || 44;
  const colors = opts.colors || 8;
  const dither = opts.dither !== false;

  const imageData = squareCrop(img, WORK);
  const data = imageData.data;

  let { mask } = buildMask(data, WORK);
  mask = morph(mask, WORK, 'dilate', 1);
  mask = morph(mask, WORK, 'erode', 2);
  mask = morph(mask, WORK, 'dilate', 1);
  mask = largestComponent(mask, WORK);
  mask = fillHoles(mask, WORK);

  // マスクが小さすぎる / 大きすぎる場合は主題抽出に失敗しているので中央円にフォールバック
  let covered = 0;
  for (let p = 0; p < mask.length; p++) covered += mask[p];
  const ratio = covered / mask.length;
  if (ratio < 0.045 || ratio > 0.97) {
    mask = new Uint8Array(WORK * WORK);
    const r = WORK * 0.42;
    for (let y = 0; y < WORK; y++) {
      for (let x = 0; x < WORK; x++) {
        if (Math.hypot(x - WORK / 2, y - WORK / 2) <= r) mask[y * WORK + x] = 1;
      }
    }
  }

  const { cells } = downsample(data, WORK, mask, grid);
  const analysis = analyze(cells, grid, species);

  const points = cells.filter((c) => c.cover >= 0.42).map((c) => [c.r, c.g, c.b]);
  const centers = kmeans(points, colors);
  const palette = centers.map((c) => stylize(c.rgb, species.hue));

  // --- 描画 ---
  const out = makeCanvas(grid, grid);
  const octx = out.getContext('2d', { willReadFrequently: true });
  const outData = octx.createImageData(grid, grid);

  const nearest = (r, g, b) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < centers.length; i++) {
      const dr = r - centers[i].rgb[0], dg = g - centers[i].rgb[1], db = b - centers[i].rgb[2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  };

  const solid = (x, y) =>
    x >= 0 && y >= 0 && x < grid && y < grid && cells[y * grid + x].cover >= 0.42;

  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const idx = (y * grid + x) * 4;
      const c = cells[y * grid + x];
      if (c.cover < 0.42) {
        // 輪郭: 実体に隣接する空白セルを暗色で縁取る
        const touching = solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
        if (touching && c.cover > 0.12) {
          outData.data[idx] = 12;
          outData.data[idx + 1] = 26;
          outData.data[idx + 2] = 20;
          outData.data[idx + 3] = 235;
        } else {
          outData.data[idx + 3] = 0;
        }
        continue;
      }
      let r = c.r, g = c.g, b = c.b;
      if (dither) {
        const t = (BAYER4[y & 3][x & 3] / 16 - 0.5) * 26;
        r += t; g += t; b += t;
      }
      const pi = nearest(r, g, b);
      let [pr, pg, pb] = palette[pi] || [80, 120, 90];

      // 擬似ライティング: 左上から光が当たっている前提で縁を持ち上げ、右下を落とす
      const upLeftOpen = !solid(x - 1, y) || !solid(x, y - 1);
      const downRightOpen = !solid(x + 1, y) || !solid(x, y + 1);
      if (upLeftOpen && !downRightOpen) {
        const [h, s, l] = rgbToHsl(pr, pg, pb);
        [pr, pg, pb] = hslToRgb(h, s * 0.92, clamp01(l + 0.11));
      } else if (downRightOpen && !upLeftOpen) {
        const [h, s, l] = rgbToHsl(pr, pg, pb);
        [pr, pg, pb] = hslToRgb(h, clamp01(s * 1.05), clamp01(l - 0.1));
      }

      outData.data[idx] = pr;
      outData.data[idx + 1] = pg;
      outData.data[idx + 2] = pb;
      outData.data[idx + 3] = 255;
    }
  }
  octx.putImageData(outData, 0, 0);

  // サムネイル(元写真の縮小版。アルバム表示用に 320px の JPEG で保持)
  const thumbSize = 320;
  const tc = makeCanvas(thumbSize, thumbSize);
  const tctx = tc.getContext('2d');
  const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
  tctx.drawImage(
    img,
    ((img.naturalWidth || img.width) - side) / 2,
    ((img.naturalHeight || img.height) - side) / 2,
    side, side, 0, 0, thumbSize, thumbSize
  );

  return {
    sprite: out.toDataURL('image/png'),
    thumb: tc.toDataURL('image/jpeg', 0.72),
    grid,
    analysis,
    palette: palette.map(([r, g, b]) => `rgb(${r},${g},${b})`),
  };
}

/* 与えられたスプライト dataURL を n 倍に拡大した canvas を返す(共有画像生成用) */
export async function scaleSprite(dataUrl, scale) {
  const img = await loadImageFromUrl(dataUrl);
  const c = makeCanvas(img.width * scale, img.height * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
