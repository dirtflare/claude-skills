/* PIXAGAVE — ゲーム本体
 * 状態管理 / 育成シミュレーション / 進化判定 / 交配 / 品評会 / クエスト / 季節
 */

import {
  SPECIES, SPECIES_BY_ID, STAGES, STAGE_REQUIREMENTS, BRANCHES, GENE_KEYS,
  QUESTS, STARTERS, SHOP,
} from './data.js';
import { loadSave, writeSave, uid } from './store.js';
import { seededRandom } from './sprite.js';

export const DAY = 86400000;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round1 = (v) => Math.round(v * 10) / 10;

/* ---------- 季節 ---------- */
/* 実際の栽培に合わせ、月から成長期/休眠期を決める(北半球基準)。
 * 夏型(アガベ・多肉・多くの塊根)は冬に、冬型(亀甲竜など)は真夏に休眠する。 */
const WINTER_GROWERS = new Set(['elephantipes', 'lithops']);

export function seasonOf(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return { key: 'spring', ja: '春', icon: '❀', temp: 18 };
  if (m >= 6 && m <= 8) return { key: 'summer', ja: '夏', icon: '☀', temp: 30 };
  if (m >= 9 && m <= 11) return { key: 'autumn', ja: '秋', icon: '☂', temp: 20 };
  return { key: 'winter', ja: '冬', icon: '❄', temp: 7 };
}

export function growthFactor(species, season) {
  const winterType = WINTER_GROWERS.has(species.id);
  const table = winterType
    ? { spring: 0.8, summer: 0.15, autumn: 1.0, winter: 1.0 }
    : { spring: 1.0, summer: 1.2, autumn: 0.9, winter: 0.25 };
  return table[season.key];
}

export function isDormant(species, season) {
  return growthFactor(species, season) <= 0.3;
}

/* ---------- 初期状態 ---------- */

function freshState() {
  const now = Date.now();
  return {
    v: 1,
    lang: 'ja',
    coins: 600,
    createdAt: now,
    lastTickAt: now,
    warpDays: 0,
    plants: [],
    dex: {},
    items: { shade: 0, fertilizer: 2, medicine: 1, pot: 0, seed: 0 },
    quests: {},
    stats: {
      photos: 0, measures: 0, evolutions: 0, contests: 0, contestWins: 0,
      waterings: 0, streak: 1, lastLoginDay: dayKey(now), days: 1, league: 0,
    },
    settings: { grid: 44, colors: 8, dither: true, autoTick: true },
    log: [],
  };
}

const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

export function createPlant(speciesId, opts = {}) {
  const species = SPECIES_BY_ID[speciesId];
  const now = opts.now || Date.now();
  const genes = opts.genes || defaultGenes(species, opts.seed || speciesId + now);
  return {
    id: uid('pl'),
    speciesId,
    nickname: opts.nickname || species.ja,
    createdAt: now,
    stage: 0,
    branch: null,
    exp: 0,
    genes,
    baseGenes: { ...genes },
    care: { hydration: 82, nutrition: 60, health: 92 },
    light: species.light,
    lux: 0,
    lightHours: 0,
    lastWater: now,
    lastFert: now,
    lastPhoto: 0,
    pest: 0,
    metrics: { diameter: 0, leaves: 0, height: 0 },
    baseline: { diameter: 0, leaves: 0, stageAt: now },
    album: [],
    events: [{ t: now, type: 'birth', text: `${species.ja} を棚に迎えた` }],
    spriteId: null,
    photoId: null,
    parents: opts.parents || null,
    hybrid: opts.hybrid || null,
    gen: opts.gen || 1,
    waterIntervals: [],
    favorite: false,
    note: '',
  };
}

function defaultGenes(species, seed) {
  const rnd = seededRandom(String(seed));
  const g = {};
  for (const k of GENE_KEYS) {
    g[k] = Math.round(clamp(species.bias[k] + (rnd() - 0.5) * 26, 1, 100));
  }
  return g;
}

/* ---------- ゲームクラス ---------- */

class Game extends EventTarget {
  constructor() {
    super();
    this.state = loadSave() || freshState();
    this.migrate();
  }

  migrate() {
    const base = freshState();
    this.state = { ...base, ...this.state };
    this.state.stats = { ...base.stats, ...this.state.stats };
    this.state.items = { ...base.items, ...this.state.items };
    this.state.settings = { ...base.settings, ...this.state.settings };
    for (const p of this.state.plants) {
      p.baseGenes ||= { ...p.genes };
      p.waterIntervals ||= [];
      p.album ||= [];
      p.events ||= [];
      p.metrics ||= { diameter: 0, leaves: 0, height: 0 };
      p.baseline ||= { diameter: 0, leaves: 0, stageAt: p.createdAt };
    }
  }

  save() {
    writeSave(this.state);
    this.emit('change');
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  now() {
    return Date.now() + this.state.warpDays * DAY;
  }

  /* ---- 参照系 ---- */
  plant(id) {
    return this.state.plants.find((p) => p.id === id) || null;
  }
  species(p) {
    return SPECIES_BY_ID[p.speciesId];
  }
  stageInfo(p) {
    return STAGES[p.stage];
  }
  ageDays(p) {
    return Math.max(0, (this.now() - p.createdAt) / DAY);
  }

  displayName(p) {
    const sp = this.species(p);
    const stage = STAGES[p.stage];
    if (p.hybrid) {
      const a = SPECIES_BY_ID[p.hybrid.a]?.ja ?? '?';
      const b = SPECIES_BY_ID[p.hybrid.b]?.ja ?? '?';
      return `${a}×${b}`;
    }
    if (p.branch) return `${sp.ja}・${BRANCHES[p.branch].ja}`;
    return `${sp.ja} ${stage.ja}`;
  }

  /* 総合スコア: 品評会・売却価格・ランキングの共通指標 */
  score(p) {
    const g = p.genes;
    const sp = this.species(p);
    const care = this.careQuality(p);
    const gene = (g.leaf * 0.9 + g.compact * 1.6 + g.spine * 1.2 + g.variegation * 1.4 +
      g.bloom * 0.7 + g.vigor * 0.9) / 6.7;
    const stageBonus = p.stage * 34;
    const rarity = sp.rarity * 12;
    const record = Math.min(60, p.album.length * 4);
    const health = (p.care.health - 60) * 0.5;
    return Math.round(clamp(gene * 3.6 + stageBonus + rarity + record + care * 0.9 + health, 0, 1200));
  }

  /* 管理の質 0-100。潅水間隔の安定性・日照の適正・健康・害虫から算出 */
  careQuality(p) {
    const sp = this.species(p);
    let s = 50;
    const iv = p.waterIntervals.slice(-8);
    if (iv.length >= 2) {
      const mean = iv.reduce((a, b) => a + b, 0) / iv.length;
      const sd = Math.sqrt(iv.reduce((a, b) => a + (b - mean) ** 2, 0) / iv.length);
      s += clamp(22 - Math.abs(mean - sp.water) * 3.4, -18, 22); // 適正間隔に近いほど加点
      s += clamp(14 - sd * 3.2, -10, 14);                        // ばらつきが小さいほど加点
    }
    s += clamp(18 - Math.abs(p.light - sp.light) * 0.55, -20, 18);
    s += (p.care.health - 70) * 0.35;
    s -= p.pest * 0.25;
    s += Math.min(12, p.album.length * 1.2);
    return Math.round(clamp(s, 0, 100));
  }

  /* 平均潅水間隔(日) */
  avgWaterInterval(p) {
    if (!p.waterIntervals.length) return null;
    const iv = p.waterIntervals.slice(-10);
    return round1(iv.reduce((a, b) => a + b, 0) / iv.length);
  }

  /* 推定 lux。実測が無ければ日照設定から換算する */
  estimatedLux(p) {
    if (p.lux) return p.lux;
    return Math.round(p.light * 1180 + 800);
  }

  /* ---- シミュレーション ---- */

  tick(force = false) {
    const now = this.now();
    const elapsed = (now - this.state.lastTickAt) / DAY;
    if (elapsed <= 0.0005 && !force) return false;
    const season = seasonOf(new Date(now));

    for (const p of this.state.plants) {
      const sp = this.species(p);
      const gf = growthFactor(sp, season);
      const dormant = gf <= 0.3;

      // 水分: 適正間隔で 100 → 0。休眠期は消費が落ちる
      const dryRate = (100 / sp.water) * (dormant ? 0.45 : 1) * (0.85 + p.light / 220);
      p.care.hydration = clamp(p.care.hydration - dryRate * elapsed, 0, 120);
      p.care.nutrition = clamp(p.care.nutrition - 3.6 * elapsed * (dormant ? 0.4 : 1), 0, 100);

      // 害虫: 過湿 + 弱日照 + 通気不良で増える
      const pestRisk =
        (p.care.hydration > 88 ? 1.6 : 0.35) *
        (p.light < sp.light - 22 ? 1.9 : 0.7) *
        (this.state.items.shade > 0 ? 0.85 : 1);
      p.pest = clamp(p.pest + pestRisk * 1.5 * elapsed - (p.pest > 0 ? 0.2 * elapsed : 0), 0, 100);

      // 健康: 水分帯・日照差・害虫から目標値を作り、そこへ寄せる
      const hydeal = p.care.hydration;
      const hydrationPenalty =
        hydeal > 100 ? (hydeal - 100) * 1.4 : hydeal < 12 ? (12 - hydeal) * 2.6 : 0;
      const lightPenalty = Math.abs(p.light - sp.light) * 0.75;
      const target = clamp(100 - hydrationPenalty - lightPenalty - p.pest * 0.55 +
        (p.care.nutrition > 40 ? 6 : -6), 5, 100);
      p.care.health += (target - p.care.health) * clamp(elapsed * 0.55, 0, 1);
      p.care.health = clamp(p.care.health, 1, 100);

      // 個性値のドリフト = 「育て方が姿に出る」
      if (!dormant) this.driftGenes(p, sp, elapsed);

      // 経過による微量の経験値(健康な株のみ)
      if (p.care.health > 62 && !dormant) {
        p.exp += 2.2 * elapsed * gf * (this.state.items.pot > 0 ? 1.15 : 1);
      }
      p.exp = Math.round(p.exp);
    }

    this.state.lastTickAt = now;
    this.checkLogin(now);
    this.checkQuests();
    writeSave(this.state);
    this.emit('tick');
    return true;
  }

  driftGenes(p, sp, days) {
    const g = p.genes;
    const base = p.baseGenes;
    const lightGap = p.light - sp.light;
    const dry = p.care.hydration < 45;
    const move = (key, delta) => {
      const lo = clamp(base[key] - 26, 1, 100);
      const hi = clamp(base[key] + 26, 1, 100);
      g[key] = Math.round(clamp(g[key] + delta * days, lo, hi) * 10) / 10;
    };
    // 強光 + 辛い水やり → 締まる。弱光 → 徒長して締まりが落ちる
    if (Math.abs(lightGap) <= 8 && dry) move('compact', 0.9);
    else if (lightGap < -18) move('compact', -1.1);
    else if (lightGap > 18) move('compact', 0.2);
    // 強光は棘・爪を伸ばす
    if (lightGap > -5 && p.care.health > 55) move('spine', 0.35);
    // 水と養分が潤沢なら成長力と葉幅が伸びる
    if (p.care.nutrition > 55 && p.care.hydration > 35) { move('vigor', 0.55); move('leaf', 0.3); }
    else if (p.care.nutrition < 15) move('vigor', -0.4);
    // 乾燥した強光下では白粉が乗る
    if (dry && lightGap > -4) move('bloom', 0.3);
    // 害虫の放置は全体を削る
    if (p.pest > 45) { move('leaf', -0.5); move('compact', -0.35); }
  }

  checkLogin(now) {
    const key = dayKey(Date.now());
    const st = this.state.stats;
    if (st.lastLoginDay !== key) {
      const prev = new Date(st.lastLoginDay);
      const diff = Math.round((new Date(key) - prev) / DAY);
      st.streak = diff === 1 ? st.streak + 1 : 1;
      st.lastLoginDay = key;
      st.days += 1;
      this.state.coins += 30 + Math.min(70, st.streak * 5);
      this.pushLog(`ログインボーナス +${30 + Math.min(70, st.streak * 5)} コイン(${st.streak}日連続)`);
    }
  }

  pushLog(text) {
    this.state.log.unshift({ t: this.now(), text });
    this.state.log = this.state.log.slice(0, 80);
  }

  /* ---- ケア操作 ---- */

  water(id) {
    const p = this.plant(id);
    if (!p) return { ok: false };
    const sp = this.species(p);
    const now = this.now();
    const interval = (now - p.lastWater) / DAY;
    const over = p.care.hydration > 72;
    if (interval > 0.3) p.waterIntervals.push(round1(interval));
    p.waterIntervals = p.waterIntervals.slice(-20);
    p.lastWater = now;
    p.care.hydration = clamp(p.care.hydration + (over ? 22 : 100 - p.care.hydration), 0, 118);
    let gain = 8;
    let msg = `${p.nickname} に水をやった`;
    if (over) {
      p.care.health = clamp(p.care.health - 5, 1, 100);
      p.pest = clamp(p.pest + 7, 0, 100);
      gain = 2;
      msg = `${p.nickname}: 用土がまだ湿っている。根腐れに注意`;
    } else if (Math.abs(interval - sp.water) <= 1.5) {
      gain = 16;
      msg = `${p.nickname}: 完璧なタイミングの潅水`;
    }
    this.gainExp(p, gain);
    this.state.stats.waterings++;
    this.pushLog(msg);
    this.save();
    return { ok: true, message: msg, exp: gain };
  }

  fertilize(id) {
    const p = this.plant(id);
    if (!p) return { ok: false };
    if (this.state.items.fertilizer <= 0) return { ok: false, message: '活力剤がありません' };
    this.state.items.fertilizer--;
    p.care.nutrition = clamp(p.care.nutrition + 45, 0, 100);
    p.lastFert = this.now();
    this.gainExp(p, 10);
    this.pushLog(`${p.nickname} に活力剤を与えた`);
    this.save();
    return { ok: true, message: '養分 +45' };
  }

  treat(id) {
    const p = this.plant(id);
    if (!p) return { ok: false };
    if (p.pest < 1) return { ok: false, message: '害虫は見当たりません' };
    if (this.state.items.medicine <= 0) return { ok: false, message: '殺虫剤がありません' };
    this.state.items.medicine--;
    p.pest = 0;
    p.care.health = clamp(p.care.health + 6, 1, 100);
    this.gainExp(p, 12);
    this.pushLog(`${p.nickname} の害虫を駆除した`);
    this.save();
    return { ok: true, message: '害虫を駆除した' };
  }

  setLight(id, value) {
    const p = this.plant(id);
    if (!p) return;
    const cap = this.state.items.shade > 0 ? 100 : 100;
    p.light = clamp(Math.round(value), 0, cap);
    this.save();
  }

  setLightMeasure(id, { lux, hours }) {
    const p = this.plant(id);
    if (!p) return;
    if (Number.isFinite(lux)) p.lux = Math.max(0, Math.round(lux));
    if (Number.isFinite(hours)) p.lightHours = clamp(hours, 0, 24);
    this.gainExp(p, 6);
    this.save();
  }

  /* 写真を1枚追加。個性値は「実物の最新の姿」に少しずつ寄っていく */
  addPhoto(id, { photoId, spriteId, analysis, note }) {
    const p = this.plant(id);
    if (!p) return { ok: false };
    const now = this.now();
    p.album.unshift({
      id: uid('al'), t: now, photoId, spriteId, note: note || '',
      stage: p.stage, metrics: { ...p.metrics },
    });
    p.photoId = photoId;
    p.spriteId = spriteId;
    p.lastPhoto = now;
    if (analysis && analysis.raw) {
      for (const k of GENE_KEYS) {
        if (!Number.isFinite(analysis.raw[k])) continue;
        // 写真の解析値へ 22% だけ寄せる(急激に人格が変わらないように)
        p.genes[k] = Math.round(clamp(p.genes[k] * 0.78 + analysis.raw[k] * 0.22, 1, 100));
      }
    }
    this.state.stats.photos++;
    this.gainExp(p, 25);
    this.registerDex(p);
    this.pushLog(`${p.nickname} の記録を追加した (${p.album.length}枚目)`);
    this.checkQuests();
    this.save();
    return { ok: true };
  }

  measure(id, { diameter, leaves, height }) {
    const p = this.plant(id);
    if (!p) return { ok: false };
    const prev = { ...p.metrics };
    if (Number.isFinite(diameter) && diameter > 0) p.metrics.diameter = diameter;
    if (Number.isFinite(leaves) && leaves > 0) p.metrics.leaves = Math.round(leaves);
    if (Number.isFinite(height) && height > 0) p.metrics.height = height;
    if (!p.baseline.diameter) p.baseline = { ...p.baseline, diameter: p.metrics.diameter, leaves: p.metrics.leaves };
    const grew = Math.max(0, (p.metrics.diameter || 0) - (prev.diameter || 0));
    const gain = 15 + Math.round(grew * 12);
    this.gainExp(p, gain);
    this.state.stats.measures++;
    p.events.unshift({
      t: this.now(), type: 'measure',
      text: `実測: 幅 ${p.metrics.diameter}cm / 葉 ${p.metrics.leaves}枚${grew ? ` (+${round1(grew)}cm)` : ''}`,
    });
    this.pushLog(`${p.nickname} の実測を記録 (+${gain} EXP)`);
    this.checkQuests();
    this.save();
    return { ok: true, exp: gain, grew };
  }

  gainExp(p, amount) {
    const mult = this.state.items.pot > 0 ? 1.15 : 1;
    p.exp = Math.round(p.exp + amount * mult);
  }

  /* ---- 進化 ---- */

  evolveCheck(p) {
    if (p.stage >= 4) return { ok: false, done: true, missing: [] };
    const req = STAGE_REQUIREMENTS[p.stage + 1];
    const days = this.ageDays(p);
    const photos = p.album.length;
    const grown = (p.metrics.diameter || 0) - (p.baseline.diameter || 0);
    const missing = [];
    if (p.exp < req.exp) missing.push({ key: 'exp', need: req.exp, have: Math.round(p.exp), label: '経験値' });
    if (days < req.days) missing.push({ key: 'days', need: req.days, have: Math.floor(days), label: '育成日数' });
    if (photos < req.photos) missing.push({ key: 'photos', need: req.photos, have: photos, label: '記録写真' });
    if (req.growth > 0) {
      // 実測がある場合はサイズの伸びを要求。無い場合は写真枚数で代替する
      if (p.metrics.diameter > 0) {
        if (grown < req.growth) {
          missing.push({ key: 'growth', need: req.growth, have: round1(Math.max(0, grown)), label: '実測の伸び(cm)' });
        }
      } else if (photos < req.photos + 2) {
        missing.push({ key: 'photos', need: req.photos + 2, have: photos, label: '記録写真(実測なしの場合)' });
      }
    }
    if (p.care.health < 55) missing.push({ key: 'health', need: 55, have: Math.round(p.care.health), label: '健康' });
    const season = seasonOf(new Date(this.now()));
    if (isDormant(this.species(p), season)) {
      missing.push({ key: 'season', need: 1, have: 0, label: `休眠期(${season.ja})は進化しない` });
    }
    return { ok: missing.length === 0, done: false, missing, req };
  }

  /* 系統の決定。育成の実績値が最も高い軸に寄る */
  decideBranch(p) {
    const g = p.genes;
    const base = p.baseGenes;
    const care = this.careQuality(p);
    const cand = {
      compact: g.compact + (g.compact - base.compact) * 2.2 + (care > 70 ? 12 : 0),
      nishiki: g.variegation * 1.15 + (g.bloom - 50) * 0.3,
      fang: g.spine + (g.spine - base.spine) * 2.0,
      titan: g.vigor + (g.leaf - 50) * 0.6 + (p.metrics.diameter > 0 ? p.metrics.diameter * 1.2 : 0),
    };
    return Object.entries(cand).sort((a, b) => b[1] - a[1])[0][0];
  }

  /* 系統の「今の傾き」。UI で誘導メーターとして見せる */
  branchLean(p) {
    const g = p.genes, base = p.baseGenes, care = this.careQuality(p);
    const raw = {
      compact: g.compact + (g.compact - base.compact) * 2.2 + (care > 70 ? 12 : 0),
      nishiki: g.variegation * 1.15 + (g.bloom - 50) * 0.3,
      fang: g.spine + (g.spine - base.spine) * 2.0,
      titan: g.vigor + (g.leaf - 50) * 0.6 + (p.metrics.diameter > 0 ? p.metrics.diameter * 1.2 : 0),
    };
    const total = Object.values(raw).reduce((a, b) => a + Math.max(1, b), 0);
    return Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, Math.round((Math.max(1, v) / total) * 100)])
    );
  }

  evolve(id) {
    const p = this.plant(id);
    if (!p) return { ok: false };
    const check = this.evolveCheck(p);
    if (!check.ok) return { ok: false, message: '進化条件を満たしていません', missing: check.missing };
    const before = this.displayName(p);
    p.stage += 1;
    let branched = null;
    if (p.stage >= 3 && !p.branch) {
      p.branch = this.decideBranch(p);
      branched = BRANCHES[p.branch];
      // 系統確定時に該当能力が一段伸びる
      const key = branched.stat;
      p.genes[key] = Math.round(clamp(p.genes[key] + 14, 1, 100));
      p.baseGenes[key] = p.genes[key];
    }
    p.baseline = { diameter: p.metrics.diameter, leaves: p.metrics.leaves, stageAt: this.now() };
    p.events.unshift({
      t: this.now(), type: 'evolve',
      text: `${before} → ${this.displayName(p)} に進化した`,
    });
    this.state.stats.evolutions++;
    this.state.coins += 120 + p.stage * 60;
    this.registerDex(p);
    this.pushLog(`${this.displayName(p)} に進化！`);
    this.checkQuests();
    this.save();
    return { ok: true, plant: p, before, after: this.displayName(p), branch: branched };
  }

  /* ---- 図鑑 ---- */

  registerDex(p) {
    const d = (this.state.dex[p.speciesId] ||= {
      seen: 0, raised: 0, forms: {}, firstAt: this.now(), stages: {},
    });
    d.seen = Math.max(d.seen, 1);
    d.raised = this.state.plants.filter((x) => x.speciesId === p.speciesId).length;
    d.stages[p.stage] = true;
    if (p.branch) d.forms[p.branch] = true;
    if (p.spriteId) d.sprite = p.spriteId;
  }

  dexProgress() {
    const total = SPECIES.length;
    const seen = Object.keys(this.state.dex).length;
    const forms = Object.values(this.state.dex).reduce((a, d) => a + Object.keys(d.forms || {}).length, 0);
    return { total, seen, forms, maxForms: total * 4, percent: Math.round((seen / total) * 100) };
  }

  /* ---- コミュニティ統計 ----
   * バックエンドを持たないため、品種ごとに決定論的な擬似コホートを生成し、
   * そこへ自分の実データを合成して比較する。数値は「推定値」として表示する。 */
  communityFor(speciesId) {
    const sp = SPECIES_BY_ID[speciesId];
    const week = Math.floor(Date.now() / (DAY * 7));
    const rnd = seededRandom(`${speciesId}:${week}`);
    const growers = 40 + Math.round(rnd() * 900 / sp.rarity);
    const photos = growers * (6 + Math.round(rnd() * 14));
    const waterMean = round1(sp.water + (rnd() - 0.5) * 2.2);
    const luxMean = Math.round(sp.light * 1150 + (rnd() - 0.5) * 12000);
    const hoursMean = round1(6 + (sp.light / 100) * 7 + (rnd() - 0.5) * 1.6);
    const mine = this.state.plants.filter((p) => p.speciesId === speciesId);
    const myWater = mine.map((p) => this.avgWaterInterval(p)).filter(Boolean);
    return {
      growers, photos, waterMean, luxMean, hoursMean,
      myWater: myWater.length ? round1(myWater.reduce((a, b) => a + b, 0) / myWater.length) : null,
      myLux: mine.length ? Math.round(mine.reduce((a, p) => a + this.estimatedLux(p), 0) / mine.length) : null,
      myHours: mine.length ? round1(mine.reduce((a, p) => a + (p.lightHours || 0), 0) / mine.length) : null,
    };
  }

  communityTotals() {
    const week = Math.floor(Date.now() / (DAY * 7));
    const rnd = seededRandom(`totals:${week}`);
    const trainers = 4200 + Math.round(rnd() * 900);
    const photos = trainers * 23 + this.state.stats.photos;
    return {
      species: SPECIES.length,
      trainers,
      photos,
      mySpecies: Object.keys(this.state.dex).length,
      myPhotos: this.state.stats.photos,
    };
  }

  /* ---- 品評会 ---- */

  LEAGUES = [
    { ja: '棚デビュー', min: 0, reward: 120 },
    { ja: '地区大会', min: 260, reward: 240 },
    { ja: '県大会', min: 430, reward: 420 },
    { ja: '全国大会', min: 620, reward: 700 },
    { ja: '世界選手権', min: 830, reward: 1200 },
  ];

  makeRival(league, seedSalt = '') {
    const lg = this.LEAGUES[league];
    const rnd = seededRandom(`rival:${league}:${dayKey(Date.now())}:${seedSalt}`);
    const sp = SPECIES[Math.floor(rnd() * SPECIES.length)];
    const target = lg.min + 120 + rnd() * 190;
    const genes = {};
    for (const k of GENE_KEYS) {
      genes[k] = Math.round(clamp(sp.bias[k] * (0.7 + (target / 900)) + (rnd() - 0.5) * 20, 5, 100));
    }
    return {
      name: `${['棚主', '温室勢', 'ベランダ組', '実生沼', '遮光職人'][Math.floor(rnd() * 5)]}の${sp.ja}`,
      speciesId: sp.id, genes, score: Math.round(target),
      stage: clamp(2 + Math.floor(league / 2), 0, 4),
    };
  }

  contest(id, league) {
    const p = this.plant(id);
    if (!p) return { ok: false };
    const lg = this.LEAGUES[league];
    if (!lg) return { ok: false };
    if (this.score(p) < lg.min) return { ok: false, message: `${lg.ja} は総合スコア ${lg.min} 以上が必要です` };
    const rival = this.makeRival(league, p.id + this.state.stats.contests);
    const g = p.genes;
    const categories = [
      { ja: '姿', mine: (g.compact * 1.4 + g.leaf * 0.6) / 2, theirs: (rival.genes.compact * 1.4 + rival.genes.leaf * 0.6) / 2 },
      { ja: '気迫', mine: g.spine, theirs: rival.genes.spine },
      { ja: '色', mine: (g.variegation + g.bloom) / 2, theirs: (rival.genes.variegation + rival.genes.bloom) / 2 },
      { ja: '貫禄', mine: g.vigor * 0.6 + p.stage * 14, theirs: rival.genes.vigor * 0.6 + rival.stage * 14 },
      { ja: '管理', mine: this.careQuality(p), theirs: 45 + league * 9 },
    ].map((c) => ({ ...c, mine: Math.round(c.mine), theirs: Math.round(c.theirs), win: c.mine >= c.theirs }));
    const wins = categories.filter((c) => c.win).length;
    const won = wins >= 3;
    const reward = won ? lg.reward : Math.round(lg.reward * 0.25);
    this.state.coins += reward;
    this.state.stats.contests++;
    if (won) {
      this.state.stats.contestWins++;
      this.state.stats.league = Math.max(this.state.stats.league, Math.min(league + 1, this.LEAGUES.length - 1));
      this.gainExp(p, 60 + league * 40);
      p.events.unshift({ t: this.now(), type: 'contest', text: `${lg.ja} で優勝 (${wins}/5 部門)` });
    } else {
      p.events.unshift({ t: this.now(), type: 'contest', text: `${lg.ja} に出品 (${wins}/5 部門)` });
    }
    this.pushLog(`${lg.ja}: ${won ? '優勝' : '入賞ならず'} — ${p.nickname}`);
    this.checkQuests();
    this.save();
    return { ok: true, won, wins, categories, rival, reward, league: lg };
  }

  /* ---- ラボ(交配) ---- */

  cross(idA, idB) {
    const a = this.plant(idA), b = this.plant(idB);
    if (!a || !b || a.id === b.id) return { ok: false, message: '異なる2株を選んでください' };
    if (a.stage < 3 || b.stage < 3) return { ok: false, message: '交配には成株(段階4)以上が2株必要です' };
    if (this.state.items.seed <= 0) return { ok: false, message: '交配用種子がありません' };
    this.state.items.seed--;

    const rnd = seededRandom(`cross:${a.id}:${b.id}:${Date.now()}`);
    const genes = {};
    for (const k of GENE_KEYS) {
      const mid = (a.genes[k] + b.genes[k]) / 2;
      genes[k] = Math.round(clamp(mid + (rnd() - 0.5) * 22, 1, 100));
    }
    // 突然変異: 斑・巨大化・矮性のいずれかが稀に発現する
    let mutation = null;
    const roll = rnd();
    if (roll < 0.09) {
      genes.variegation = Math.round(clamp(genes.variegation + 38, 1, 100));
      mutation = '斑入りが覚醒した';
    } else if (roll < 0.15) {
      genes.vigor = Math.round(clamp(genes.vigor + 30, 1, 100));
      genes.leaf = Math.round(clamp(genes.leaf + 16, 1, 100));
      mutation = '巨大化の素質が出た';
    } else if (roll < 0.20) {
      genes.compact = Math.round(clamp(genes.compact + 32, 1, 100));
      mutation = '極端な矮性が出た';
    }

    const childSpecies = rnd() < 0.5 ? a.speciesId : b.speciesId;
    const child = createPlant(childSpecies, {
      genes,
      now: this.now(),
      nickname: `${SPECIES_BY_ID[a.speciesId].ja}×${SPECIES_BY_ID[b.speciesId].ja}`,
      parents: [
        { id: a.id, name: this.displayName(a), speciesId: a.speciesId },
        { id: b.id, name: this.displayName(b), speciesId: b.speciesId },
      ],
      hybrid: { a: a.speciesId, b: b.speciesId },
      gen: Math.max(a.gen, b.gen) + 1,
    });
    if (mutation) child.events.unshift({ t: this.now(), type: 'mutation', text: mutation });
    this.state.plants.push(child);
    this.registerDex(child);
    this.pushLog(`交配成功: ${child.nickname}${mutation ? ` — ${mutation}` : ''}`);
    this.checkQuests();
    this.save();
    return { ok: true, child, mutation };
  }

  /* ---- 所持品 / 経済 ---- */

  buy(itemId) {
    const item = SHOP.find((i) => i.id === itemId);
    if (!item) return { ok: false };
    if (this.state.coins < item.price) return { ok: false, message: 'コインが足りません' };
    this.state.coins -= item.price;
    this.state.items[item.id] = (this.state.items[item.id] || 0) + 1;
    this.pushLog(`${item.ja} を購入した`);
    this.save();
    return { ok: true };
  }

  sell(id) {
    const p = this.plant(id);
    if (!p) return { ok: false };
    const price = Math.round(this.score(p) * 1.1 + this.species(p).rarity * 40);
    this.state.coins += price;
    this.state.plants = this.state.plants.filter((x) => x.id !== id);
    this.pushLog(`${this.displayName(p)} を ${price} コインで譲渡した`);
    this.save();
    return { ok: true, price };
  }

  adopt(speciesId) {
    const p = createPlant(speciesId, { now: this.now() });
    this.state.plants.push(p);
    this.registerDex(p);
    this.pushLog(`${SPECIES_BY_ID[speciesId].ja} を迎えた`);
    this.checkQuests();
    this.save();
    return p;
  }

  rename(id, name) {
    const p = this.plant(id);
    if (!p) return;
    p.nickname = String(name).slice(0, 24) || p.nickname;
    this.save();
  }

  /* ---- クエスト ---- */

  checkQuests() {
    let earned = 0;
    const done = [];
    for (const q of QUESTS) {
      if (this.state.quests[q.id]) continue;
      let ok = false;
      try { ok = q.check(this.state); } catch { ok = false; }
      if (ok) {
        this.state.quests[q.id] = { at: this.now() };
        this.state.coins += q.reward;
        earned += q.reward;
        done.push(q);
      }
    }
    if (done.length) {
      this.pushLog(`ミッション達成: ${done.map((d) => d.ja).join(' / ')} (+${earned} コイン)`);
      this.emit('quest', { done, earned });
    }
    return done;
  }

  /* ---- 棚メイトの助言(ルールベース) ---- */
  advice(p) {
    const sp = this.species(p);
    const season = seasonOf(new Date(this.now()));
    const out = [];
    if (isDormant(sp, season)) {
      out.push({ level: 'info', text: `${season.ja}は${sp.ja}の休眠期。水は控えめに、進化は成長期まで待つ。` });
    }
    if (p.care.hydration < 12) out.push({ level: 'warn', text: '完全に乾いている。次の潅水のタイミング。' });
    else if (p.care.hydration > 102) out.push({ level: 'warn', text: '過湿ぎみ。根腐れと害虫のリスクが上がっている。' });
    if (p.pest > 35) out.push({ level: 'danger', text: `害虫レベル ${Math.round(p.pest)}。放置すると個性値が削られる。` });
    if (p.light < sp.light - 20) out.push({ level: 'warn', text: `日照が不足。徒長して締まりが落ちている(適正 ${sp.light})。` });
    if (p.light > sp.light + 20) out.push({ level: 'warn', text: `日照が強すぎる。葉焼けの恐れ(適正 ${sp.light})。` });
    if (p.care.nutrition < 18) out.push({ level: 'info', text: '養分が切れかけ。活力剤で成長力の伸びを支えられる。' });
    if (!p.album.length) out.push({ level: 'info', text: 'まだ写真がない。1枚記録するとドット絵と個性値が実物に同期する。' });
    else if (this.now() - p.lastPhoto > DAY * 14) out.push({ level: 'info', text: '前回の記録から2週間。定点撮影すると変化が比較しやすい。' });
    if (!p.metrics.diameter) out.push({ level: 'info', text: '株幅を実測すると、進化条件の「実測の伸び」が有効になる。' });
    const check = this.evolveCheck(p);
    if (check.ok) out.push({ level: 'good', text: '進化条件を満たしている。進化させられる。' });
    return out;
  }

  /* ---- 開発 / 体験用 ---- */
  warp(days) {
    this.state.warpDays += days;
    this.tick(true);
    this.pushLog(`タイムワープ: ${days}日進めた(体験用)`);
    this.save();
  }

  reset() {
    this.state = freshState();
    this.save();
  }
}

export const game = new Game();
export { SPECIES, SPECIES_BY_ID, STAGES, BRANCHES, SHOP, QUESTS, STARTERS };
