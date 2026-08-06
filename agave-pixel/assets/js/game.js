/* PIXAGAVE — ゲーム本体
 * ゲーム内時計 / 育成シミュレーション / 進化 / 交配 / 品評会 / 導線
 *
 * 時間はすべて「ゲーム日」で数える。リアル時間との換算はペース設定で決まり、
 * 既定は 1ゲーム日 = 1実時間。UI には常に「あと何日 / 実時間およそ何分」を出す。
 */

import {
  SPECIES, SPECIES_BY_ID, STAGES, STAGE_REQUIREMENTS, BRANCHES, BRANCH_KEYS,
  GENE_KEYS, QUESTS, STARTERS, SHOP, PACES, DAYS_PER_SEASON, NATURES, TYPES,
  JUDGES, RIVAL_PREFIX,
} from './data.js';
import { loadSave, writeSave, uid } from './store.js';
import { seededRandom } from './sprite.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const round1 = (v) => Math.round(v * 10) / 10;
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

/* ---------- 季節 ---------- */

const SEASONS = [
  { key: 'spring', ja: '春', icon: '❀', growth: 1.0 },
  { key: 'summer', ja: '夏', icon: '☀', growth: 1.25 },
  { key: 'autumn', ja: '秋', icon: '☂', growth: 0.95 },
  { key: 'winter', ja: '冬', icon: '❄', growth: 0.6 },
];

/* 冬型の品種は夏に緩み、冬に伸びる */
const WINTER_GROWERS = new Set(['elephantipes', 'lithops']);

export function seasonAt(clock) {
  const i = Math.floor(clock / DAYS_PER_SEASON) % 4;
  const s = SEASONS[((i % 4) + 4) % 4];
  const into = clock % DAYS_PER_SEASON;
  return { ...s, daysLeft: round1(DAYS_PER_SEASON - into) };
}

export function growthFactor(species, season) {
  if (!WINTER_GROWERS.has(species.id)) return season.growth;
  return { spring: 1.0, summer: 0.6, autumn: 1.15, winter: 1.1 }[season.key];
}

/* 成長が鈍る時期。進化を止めることはしない(ゲームとして待たされすぎるため) */
export const isSlowSeason = (species, season) => growthFactor(species, season) < 0.8;

/* ---------- 初期状態 ---------- */

function freshState() {
  const now = Date.now();
  return {
    v: 2,
    lang: 'ja',
    coins: 600,
    createdAt: now,
    clock: 0,              // ゲーム内の経過日数(小数)
    lastRealMs: now,
    plants: [],
    dex: {},
    items: { shade: 0, fertilizer: 2, medicine: 1, pot: 0, seed: 0 },
    quests: {},
    stats: {
      photos: 0, measures: 0, evolutions: 0, contests: 0, contestWins: 0,
      waterings: 0, streak: 1, lastLoginDay: dayKey(now), league: 0,
    },
    settings: { grid: 48, colors: 8, dither: true, pace: 'normal' },
    log: [],
    tutorial: { adopt: false, photo: false, water: false, evolve: false },
  };
}

export function createPlant(speciesId, opts = {}) {
  const species = SPECIES_BY_ID[speciesId];
  const clock = opts.clock ?? 0;
  const seed = opts.seed || `${speciesId}:${Date.now()}:${Math.random()}`;
  const rnd = seededRandom(seed);
  const genes = opts.genes || defaultGenes(species, rnd);
  const nature = opts.nature || NATURES[Math.floor(rnd() * NATURES.length)];
  return {
    id: uid('pl'),
    speciesId,
    nickname: opts.nickname || species.ja,
    seed,
    nature,
    createdAt: Date.now(),
    bornDay: clock,
    stage: 0,
    branch: null,
    exp: 0,
    genes,
    baseGenes: { ...genes },
    care: { hydration: 78, nutrition: 60, health: 92 },
    light: species.light,
    lux: 0,
    lightHours: 0,
    lastWaterDay: clock,
    lastPhotoDay: -99,
    pest: 0,
    metrics: { diameter: 0, leaves: 0, height: 0 },
    baseline: { diameter: 0, stageAtDay: clock },
    album: [],
    events: [{ t: Date.now(), day: clock, type: 'birth', text: `${species.ja} を棚に迎えた` }],
    spriteId: null,
    photoId: null,
    parents: opts.parents || null,
    hybrid: opts.hybrid || null,
    gen: opts.gen || 1,
    waterIntervals: [],
    note: '',
  };
}

function defaultGenes(species, rnd) {
  const g = {};
  for (const k of GENE_KEYS) g[k] = Math.round(clamp(species.bias[k] + (rnd() - 0.5) * 26, 1, 100));
  return g;
}

/* ---------- 本体 ---------- */

class Game extends EventTarget {
  LEAGUES = [
    { ja: '棚デビュー', min: 0, reward: 120 },
    { ja: '地区大会', min: 240, reward: 240 },
    { ja: '県大会', min: 400, reward: 420 },
    { ja: '全国大会', min: 580, reward: 700 },
    { ja: '世界選手権', min: 780, reward: 1200 },
  ];

  constructor() {
    super();
    this.state = loadSave() || freshState();
    this.migrate();
  }

  migrate() {
    const base = freshState();
    this.state = { ...base, ...this.state };
    for (const key of ['stats', 'items', 'settings', 'tutorial']) {
      this.state[key] = { ...base[key], ...this.state[key] };
    }
    // v1(実時間ベース)からの移行
    if (typeof this.state.clock !== 'number') this.state.clock = 0;
    if (typeof this.state.lastRealMs !== 'number') this.state.lastRealMs = Date.now();
    for (const p of this.state.plants) {
      p.baseGenes ||= { ...p.genes };
      p.waterIntervals ||= [];
      p.album ||= [];
      p.events ||= [];
      p.metrics ||= { diameter: 0, leaves: 0, height: 0 };
      p.nature ||= NATURES[0];
      p.seed ||= p.id;
      if (typeof p.bornDay !== 'number') p.bornDay = 0;
      if (typeof p.lastWaterDay !== 'number') p.lastWaterDay = this.state.clock;
      if (typeof p.lastPhotoDay !== 'number') p.lastPhotoDay = -99;
      p.baseline = { diameter: p.baseline?.diameter || 0, stageAtDay: p.baseline?.stageAtDay ?? 0 };
    }
  }

  save() {
    writeSave(this.state);
    this.emit('change');
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /* ---- 時間 ---- */

  get pace() {
    return PACES[this.state.settings.pace] || PACES.normal;
  }
  get msPerGameDay() {
    return this.pace.realMinutesPerDay * 60000;
  }
  get clock() {
    return this.state.clock;
  }
  /** ゲーム日数 → 人間が読める実時間 */
  realTimeText(gameDays) {
    const min = Math.max(0, gameDays) * this.pace.realMinutesPerDay;
    if (min < 1) return 'まもなく';
    if (min < 60) return `約${Math.ceil(min)}分`;
    if (min < 60 * 24) return `約${Math.round(min / 60 * 10) / 10}時間`;
    return `約${Math.round(min / 1440 * 10) / 10}日`;
  }
  season() {
    return seasonAt(this.state.clock);
  }

  /* ---- 参照系 ---- */
  plant(id) { return this.state.plants.find((p) => p.id === id) || null; }
  species(p) { return SPECIES_BY_ID[p.speciesId]; }
  stageInfo(p) { return STAGES[p.stage]; }
  ageDays(p) { return Math.max(0, this.state.clock - p.bornDay); }

  displayName(p) {
    const sp = this.species(p);
    if (p.hybrid) {
      const a = SPECIES_BY_ID[p.hybrid.a]?.ja ?? '?';
      const b = SPECIES_BY_ID[p.hybrid.b]?.ja ?? '?';
      return p.branch ? `${a}×${b}・${BRANCHES[p.branch].ja}` : `${a}×${b}`;
    }
    if (p.branch) return `${sp.ja}・${BRANCHES[p.branch].ja}`;
    return `${sp.ja} ${STAGES[p.stage].ja}`;
  }

  /** その株の現在のタイプ(品種タイプ + 系統タイプ) */
  typesOf(p) {
    const list = [...this.species(p).types];
    if (p.branch && !list.includes(BRANCHES[p.branch].type)) list.push(BRANCHES[p.branch].type);
    return list;
  }

  score(p) {
    const g = p.genes;
    const sp = this.species(p);
    const gene = (g.leaf * 0.9 + g.compact * 1.6 + g.spine * 1.2 + g.variegation * 1.4 +
      g.bloom * 0.7 + g.vigor * 0.9) / 6.7;
    return Math.round(clamp(
      gene * 3.4 + p.stage * 34 + sp.rarity * 12 + Math.min(60, p.album.length * 5) +
      this.careQuality(p) * 0.9 + (p.care.health - 60) * 0.5, 0, 1200));
  }

  careQuality(p) {
    const sp = this.species(p);
    let s = 50;
    const iv = p.waterIntervals.slice(-8);
    if (iv.length >= 2) {
      const mean = iv.reduce((a, b) => a + b, 0) / iv.length;
      const sd = Math.sqrt(iv.reduce((a, b) => a + (b - mean) ** 2, 0) / iv.length);
      s += clamp(22 - Math.abs(mean - sp.water) * 3.4, -18, 22);
      s += clamp(14 - sd * 3.2, -10, 14);
    }
    s += clamp(18 - Math.abs(p.light - sp.light) * 0.55, -20, 18);
    s += (p.care.health - 70) * 0.35;
    s -= p.pest * 0.25;
    s += Math.min(12, p.album.length * 1.5);
    return Math.round(clamp(s, 0, 100));
  }

  avgWaterInterval(p) {
    if (!p.waterIntervals.length) return null;
    const iv = p.waterIntervals.slice(-10);
    return round1(iv.reduce((a, b) => a + b, 0) / iv.length);
  }

  estimatedLux(p) {
    return p.lux || Math.round(p.light * 1180 + 800);
  }

  /* ---- シミュレーション ---- */

  tick(force = false) {
    const now = Date.now();
    const elapsed = (now - this.state.lastRealMs) / this.msPerGameDay;
    if (elapsed <= 0.0008 && !force) return false;
    this.state.clock += Math.max(0, elapsed);
    this.state.lastRealMs = now;
    const season = this.season();

    for (const p of this.state.plants) {
      const sp = this.species(p);
      const gf = growthFactor(sp, season);
      const d = Math.max(0, elapsed);

      const dryRate = (100 / sp.water) * (gf < 0.8 ? 0.6 : 1) * (0.85 + p.light / 220);
      p.care.hydration = clamp(p.care.hydration - dryRate * d, 0, 120);
      p.care.nutrition = clamp(p.care.nutrition - 3.6 * d * (gf < 0.8 ? 0.5 : 1), 0, 100);

      const pestRisk = (p.care.hydration > 88 ? 1.6 : 0.35) *
        (p.light < sp.light - 22 ? 1.9 : 0.7) * (this.state.items.shade > 0 ? 0.7 : 1);
      p.pest = clamp(p.pest + pestRisk * 1.4 * d, 0, 100);

      const over = p.care.hydration > 100 ? (p.care.hydration - 100) * 1.4 : 0;
      const under = p.care.hydration < 12 ? (12 - p.care.hydration) * 2.4 : 0;
      const lightPenalty = Math.abs(p.light - sp.light) * 0.75;
      const target = clamp(100 - over - under - lightPenalty - p.pest * 0.55 +
        (p.care.nutrition > 40 ? 6 : -6), 5, 100);
      p.care.health += (target - p.care.health) * clamp(d * 0.6, 0, 1);
      p.care.health = clamp(p.care.health, 1, 100);

      this.driftGenes(p, sp, d * gf);

      if (p.care.health > 55) {
        p.exp += 18 * d * gf * (this.state.items.pot > 0 ? 1.15 : 1);
      }
    }

    this.checkLogin();
    this.checkQuests();
    writeSave(this.state);
    this.emit('tick');
    return true;
  }

  /* 育て方が姿に出る。性格で伸びやすさが変わる */
  driftGenes(p, sp, days) {
    const g = p.genes, base = p.baseGenes;
    const lightGap = p.light - sp.light;
    const dry = p.care.hydration < 45;
    const move = (key, delta) => {
      let d = delta;
      if (p.nature.up === key) d *= 1.5;
      if (p.nature.down === key) d *= 0.5;
      g[key] = Math.round(clamp(g[key] + d * days, clamp(base[key] - 30, 1, 100), clamp(base[key] + 30, 1, 100)) * 10) / 10;
    };
    if (Math.abs(lightGap) <= 8 && dry) move('compact', 1.4);
    else if (lightGap < -18) move('compact', -1.6);
    else if (lightGap > 18) move('compact', 0.3);
    if (lightGap > -5 && p.care.health > 55) move('spine', 0.6);
    if (p.care.nutrition > 55 && p.care.hydration > 35) { move('vigor', 0.9); move('leaf', 0.5); }
    else if (p.care.nutrition < 15) move('vigor', -0.6);
    if (dry && lightGap > -4) move('bloom', 0.5);
    if (p.pest > 45) { move('leaf', -0.8); move('compact', -0.6); }
  }

  checkLogin() {
    const key = dayKey(Date.now());
    const st = this.state.stats;
    if (st.lastLoginDay !== key) {
      const diff = Math.round((new Date(key) - new Date(st.lastLoginDay)) / 86400000);
      st.streak = diff === 1 ? st.streak + 1 : 1;
      st.lastLoginDay = key;
      const bonus = 30 + Math.min(70, st.streak * 5);
      this.state.coins += bonus;
      this.pushLog(`ログインボーナス +${bonus} コイン(${st.streak}日連続)`);
    }
  }

  pushLog(text) {
    this.state.log.unshift({ t: Date.now(), day: round1(this.state.clock), text });
    this.state.log = this.state.log.slice(0, 60);
  }

  /* ---- ケア ---- */

  water(id) {
    const p = this.plant(id);
    if (!p) return { ok: false };
    const sp = this.species(p);
    const interval = this.state.clock - p.lastWaterDay;
    const over = p.care.hydration > 70;
    if (interval > 0.25) p.waterIntervals = [...p.waterIntervals, round1(interval)].slice(-20);
    p.lastWaterDay = this.state.clock;
    p.care.hydration = over ? clamp(p.care.hydration + 20, 0, 118) : 100;
    let gain = 8, msg = `${p.nickname} に水をやった`, kind = '';
    if (over) {
      p.care.health = clamp(p.care.health - 5, 1, 100);
      p.pest = clamp(p.pest + 7, 0, 100);
      gain = 2;
      msg = '用土がまだ湿っている。根腐れに注意';
      kind = 'bad';
    } else if (Math.abs(interval - sp.water) <= 1.5) {
      gain = 20;
      msg = '完璧なタイミングの潅水！';
      kind = 'gold';
    }
    this.gainExp(p, gain);
    this.state.stats.waterings++;
    this.state.tutorial.water = true;
    this.pushLog(msg);
    this.save();
    return { ok: true, message: `${msg} (+${gain} EXP)`, kind, exp: gain };
  }

  fertilize(id) {
    const p = this.plant(id);
    if (!p) return { ok: false };
    if (this.state.items.fertilizer <= 0) return { ok: false, message: '活力剤がありません(ショップで購入できます)' };
    this.state.items.fertilizer--;
    p.care.nutrition = clamp(p.care.nutrition + 45, 0, 100);
    this.gainExp(p, 12);
    this.pushLog(`${p.nickname} に活力剤を与えた`);
    this.save();
    return { ok: true, message: '養分 +45 (+12 EXP)' };
  }

  treat(id) {
    const p = this.plant(id);
    if (!p) return { ok: false };
    if (p.pest < 1) return { ok: false, message: '害虫は見当たりません' };
    if (this.state.items.medicine <= 0) return { ok: false, message: '殺虫剤がありません(ショップで購入できます)' };
    this.state.items.medicine--;
    p.pest = 0;
    p.care.health = clamp(p.care.health + 6, 1, 100);
    this.gainExp(p, 14);
    this.pushLog(`${p.nickname} の害虫を駆除した`);
    this.save();
    return { ok: true, message: '害虫を駆除した (+14 EXP)' };
  }

  setLight(id, value) {
    const p = this.plant(id);
    if (p) { p.light = clamp(Math.round(value), 0, 100); this.save(); }
  }

  setLightMeasure(id, { lux, hours }) {
    const p = this.plant(id);
    if (!p) return;
    if (Number.isFinite(lux)) p.lux = Math.max(0, Math.round(lux));
    if (Number.isFinite(hours)) p.lightHours = clamp(hours, 0, 24);
    this.gainExp(p, 6);
    this.save();
  }

  addPhoto(id, { photoId, spriteId, analysis, note }) {
    const p = this.plant(id);
    if (!p) return { ok: false };
    p.album.unshift({
      id: uid('al'), t: Date.now(), day: round1(this.state.clock),
      photoId, spriteId, note: note || '', stage: p.stage, metrics: { ...p.metrics },
    });
    p.photoId = photoId;
    p.spriteId = spriteId;
    p.lastPhotoDay = this.state.clock;
    if (analysis && analysis.raw) {
      for (const k of GENE_KEYS) {
        if (!Number.isFinite(analysis.raw[k])) continue;
        p.genes[k] = Math.round(clamp(p.genes[k] * 0.78 + analysis.raw[k] * 0.22, 1, 100));
      }
    }
    this.state.stats.photos++;
    this.state.tutorial.photo = true;
    this.gainExp(p, 30);
    this.registerDex(p);
    this.pushLog(`${p.nickname} の写真を記録した (${p.album.length}枚目)`);
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
    if (!p.baseline.diameter) p.baseline.diameter = p.metrics.diameter;
    const grew = Math.max(0, (p.metrics.diameter || 0) - (prev.diameter || 0));
    const gain = 18 + Math.round(grew * 14);
    this.gainExp(p, gain);
    this.state.stats.measures++;
    p.events.unshift({
      t: Date.now(), day: round1(this.state.clock), type: 'measure',
      text: `実測 幅 ${p.metrics.diameter}cm / 葉 ${p.metrics.leaves}枚${grew ? ` (+${round1(grew)}cm)` : ''}`,
    });
    this.checkQuests();
    this.save();
    return { ok: true, exp: gain, grew };
  }

  gainExp(p, amount) {
    p.exp = Math.round(p.exp + amount * (this.state.items.pot > 0 ? 1.15 : 1));
  }

  /* ---- 進化 ---- */

  evolveCheck(p) {
    if (p.stage >= 4) return { ok: false, done: true, missing: [] };
    const req = STAGE_REQUIREMENTS[p.stage + 1];
    const days = this.ageDays(p);
    const missing = [];
    if (p.exp < req.exp) missing.push({ key: 'exp', label: '経験値', have: Math.floor(p.exp), need: req.exp });
    if (days < req.days) missing.push({ key: 'days', label: '育成日数', have: round1(days), need: req.days, unit: '日' });
    if (p.album.length < req.photos) {
      missing.push({ key: 'photos', label: '記録写真', have: p.album.length, need: req.photos, unit: '枚' });
    }
    if (p.care.health < 50) missing.push({ key: 'health', label: '健康', have: Math.round(p.care.health), need: 50 });
    return { ok: missing.length === 0, done: false, missing, req };
  }

  /** 次の進化までの見込み。実時間の目安つき */
  evolveEta(p) {
    const c = this.evolveCheck(p);
    if (c.done || c.ok) return null;
    let days = 0;
    for (const m of c.missing) {
      if (m.key === 'days') days = Math.max(days, m.need - m.have);
      if (m.key === 'exp') {
        // 健康なら概ね 1 ゲーム日で 18 EXP + 世話の分
        days = Math.max(days, (m.need - m.have) / 24);
      }
    }
    const blockers = c.missing.filter((m) => m.key === 'photos' || m.key === 'health');
    return { days: round1(days), real: this.realTimeText(days), blockers };
  }

  decideBranch(p) {
    const g = p.genes, base = p.baseGenes, care = this.careQuality(p);
    const cand = {
      compact: g.compact + (g.compact - base.compact) * 2.4 + (care > 70 ? 12 : 0),
      nishiki: g.variegation * 1.2 + (g.bloom - 50) * 0.3,
      fang: g.spine + (g.spine - base.spine) * 2.2,
      titan: g.vigor + (g.leaf - 50) * 0.6 + (p.metrics.diameter || 0) * 1.2,
    };
    return Object.entries(cand).sort((a, b) => b[1] - a[1])[0][0];
  }

  branchLean(p) {
    const g = p.genes, base = p.baseGenes, care = this.careQuality(p);
    const raw = {
      compact: g.compact + (g.compact - base.compact) * 2.4 + (care > 70 ? 12 : 0),
      nishiki: g.variegation * 1.2 + (g.bloom - 50) * 0.3,
      fang: g.spine + (g.spine - base.spine) * 2.2,
      titan: g.vigor + (g.leaf - 50) * 0.6 + (p.metrics.diameter || 0) * 1.2,
    };
    const total = Object.values(raw).reduce((a, b) => a + Math.max(1, b), 0);
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.round((Math.max(1, v) / total) * 100)]));
  }

  evolve(id) {
    const p = this.plant(id);
    if (!p) return { ok: false };
    const check = this.evolveCheck(p);
    if (!check.ok) return { ok: false, message: '進化条件を満たしていません', missing: check.missing };
    const before = this.displayName(p);
    p.stage += 1;
    let branch = null;
    if (p.stage >= 3 && !p.branch) {
      p.branch = this.decideBranch(p);
      branch = BRANCHES[p.branch];
      p.genes[branch.stat] = Math.round(clamp(p.genes[branch.stat] + 16, 1, 100));
      p.baseGenes[branch.stat] = p.genes[branch.stat];
    }
    p.baseline = { diameter: p.metrics.diameter, stageAtDay: this.state.clock };
    p.events.unshift({
      t: Date.now(), day: round1(this.state.clock), type: 'evolve',
      text: `${before} → ${this.displayName(p)}`,
    });
    this.state.stats.evolutions++;
    this.state.tutorial.evolve = true;
    this.state.coins += 120 + p.stage * 60;
    this.registerDex(p);
    this.pushLog(`${this.displayName(p)} に進化！`);
    this.checkQuests();
    this.save();
    return { ok: true, plant: p, before, after: this.displayName(p), branch };
  }

  /* ---- 図鑑 ---- */

  registerDex(p) {
    const d = (this.state.dex[p.speciesId] ||= { seen: 1, forms: {}, stages: {}, firstAt: Date.now() });
    d.stages[p.stage] = true;
    if (p.branch) d.forms[p.branch] = true;
  }

  dexProgress() {
    const seen = Object.keys(this.state.dex).length;
    const forms = Object.values(this.state.dex).reduce((a, d) => a + Object.keys(d.forms || {}).length, 0);
    return {
      total: SPECIES.length, seen, forms,
      maxForms: SPECIES.length * BRANCH_KEYS.length,
      percent: Math.round((seen / SPECIES.length) * 100),
    };
  }

  /* ---- 導線: 次にやること ---- */

  nextAction() {
    const s = this.state;
    if (!s.plants.length) {
      return {
        step: 1, title: 'まずは株を1つ迎えよう',
        body: '無償で迎えられる品種が4つあります。棚に置いた瞬間から育成が始まります。',
        cta: { label: '株を迎える', action: 'adopt' },
      };
    }
    const byUrgency = [...s.plants].sort((a, b) => this.urgency(b) - this.urgency(a));
    const worst = byUrgency[0];

    if (worst.pest > 45) {
      return {
        step: null, title: `${worst.nickname} に害虫が出ている`,
        body: '放っておくと葉幅と締まりが削られます。殺虫剤で駆除してください。',
        cta: { label: '個体を開く', action: 'plant', param: worst.id }, tone: 'danger',
      };
    }
    if (worst.care.hydration < 15) {
      return {
        step: null, title: `${worst.nickname} が乾いている`,
        body: '適正間隔に近いタイミングで水をやると経験値が多くもらえます。',
        cta: { label: '水をやる', action: 'water', param: worst.id }, tone: 'warn',
      };
    }
    const evolvable = s.plants.find((p) => this.evolveCheck(p).ok);
    if (evolvable) {
      return {
        step: null, title: `${evolvable.nickname} が進化できる！`,
        body: `${STAGES[evolvable.stage + 1].ja} へ進化します。${evolvable.stage + 1 >= 3 && !evolvable.branch ? 'ここで系統が確定します。' : ''}`,
        cta: { label: '進化させる', action: 'evolve', param: evolvable.id }, tone: 'gold',
      };
    }
    const noPhoto = s.plants.find((p) => !p.album.length);
    if (noPhoto) {
      return {
        step: 2, title: `${noPhoto.nickname} の写真を記録しよう`,
        body: '実物の写真を1枚入れると、背景を落としてドット絵になり、その株の個性値が写真から決まります。',
        cta: { label: '写真を記録', action: 'photo', param: noPhoto.id },
      };
    }
    // 進化に写真が足りない株
    for (const p of s.plants) {
      const c = this.evolveCheck(p);
      const need = c.missing.find((m) => m.key === 'photos');
      if (need) {
        return {
          step: null, title: `${p.nickname} は写真があと ${need.need - need.have} 枚`,
          body: '成長の記録を残すほど早く進化します。',
          cta: { label: '写真を記録', action: 'photo', param: p.id },
        };
      }
    }
    // 待ち時間の案内
    const withEta = s.plants
      .map((p) => ({ p, eta: this.evolveEta(p) }))
      .filter((x) => x.eta)
      .sort((a, b) => a.eta.days - b.eta.days)[0];
    if (withEta) {
      return {
        step: null, title: `${withEta.p.nickname} の進化まであと ${withEta.eta.days} 日`,
        body: `実時間で ${withEta.eta.real}。水やりや実測で経験値を足すと、その分だけ早まります。`,
        cta: { label: '個体を開く', action: 'plant', param: withEta.p.id },
      };
    }
    return {
      step: null, title: '棚は落ち着いています',
      body: '品評会に出したり、ラボで交配したり、図鑑の空欄を埋めにいきましょう。',
      cta: { label: '品評会へ', action: 'nav', param: 'contest' },
    };
  }

  urgency(p) {
    return (p.care.hydration < 15 ? 3 : 0) + (p.pest > 45 ? 3 : 0) +
      (p.care.health < 50 ? 2 : 0) + (this.evolveCheck(p).ok ? 1 : 0);
  }

  /* ---- コミュニティ(端末内生成の推定値) ---- */

  communityFor(speciesId) {
    const sp = SPECIES_BY_ID[speciesId];
    const rnd = seededRandom(`${speciesId}:${Math.floor(Date.now() / (86400000 * 7))}`);
    const mine = this.state.plants.filter((p) => p.speciesId === speciesId);
    const myWater = mine.map((p) => this.avgWaterInterval(p)).filter(Boolean);
    return {
      growers: 40 + Math.round((rnd() * 900) / sp.rarity),
      waterMean: round1(sp.water + (rnd() - 0.5) * 2.2),
      luxMean: Math.round(sp.light * 1150 + (rnd() - 0.5) * 12000),
      hoursMean: round1(6 + (sp.light / 100) * 7 + (rnd() - 0.5) * 1.6),
      myWater: myWater.length ? round1(myWater.reduce((a, b) => a + b, 0) / myWater.length) : null,
    };
  }

  communityTotals() {
    const rnd = seededRandom(`totals:${Math.floor(Date.now() / (86400000 * 7))}`);
    const trainers = 4200 + Math.round(rnd() * 900);
    return {
      species: SPECIES.length, trainers,
      photos: trainers * 23 + this.state.stats.photos,
      mySpecies: Object.keys(this.state.dex).length,
      myPhotos: this.state.stats.photos,
    };
  }

  /* ---- 品評会 ---- */

  makeRival(league, salt = '') {
    const lg = this.LEAGUES[league];
    const rnd = seededRandom(`rival:${league}:${salt}`);
    const sp = SPECIES[Math.floor(rnd() * SPECIES.length)];
    const target = lg.min + 110 + rnd() * 170;
    const genes = {};
    for (const k of GENE_KEYS) {
      genes[k] = Math.round(clamp(sp.bias[k] * (0.7 + target / 900) + (rnd() - 0.5) * 20, 5, 100));
    }
    return {
      name: `${RIVAL_PREFIX[Math.floor(rnd() * RIVAL_PREFIX.length)]}の${sp.ja}`,
      speciesId: sp.id, genes, types: sp.types,
      stage: clamp(2 + Math.floor(league / 2), 0, 4),
      score: Math.round(target),
    };
  }

  /** タイプ相性: 審査員の好みに合うと加点、苦手だと減点 */
  typeBonus(types, judgeLikes) {
    if (types.includes(judgeLikes)) return 1.35;
    const like = TYPES[judgeLikes];
    if (like && types.some((t) => like.strong.includes(t))) return 0.78;
    if (like && types.some((t) => like.weak.includes(t))) return 1.12;
    return 1;
  }

  contest(id, league) {
    const p = this.plant(id);
    const lg = this.LEAGUES[league];
    if (!p || !lg) return { ok: false };
    if (this.score(p) < lg.min) return { ok: false, message: `${lg.ja} は総合スコア ${lg.min} 以上が必要です` };

    const salt = `${p.id}:${this.state.stats.contests}`;
    const rnd = seededRandom(`judge:${salt}`);
    const judge = JUDGES[Math.floor(rnd() * JUDGES.length)];
    const rival = this.makeRival(league, salt);
    const myBonus = this.typeBonus(this.typesOf(p), judge.likes);
    const rivalBonus = this.typeBonus(rival.types, judge.likes);
    const g = p.genes;

    const categories = [
      { ja: '姿', mine: (g.compact * 1.4 + g.leaf * 0.6) / 2, theirs: (rival.genes.compact * 1.4 + rival.genes.leaf * 0.6) / 2 },
      { ja: '気迫', mine: g.spine, theirs: rival.genes.spine },
      { ja: '色', mine: (g.variegation + g.bloom) / 2, theirs: (rival.genes.variegation + rival.genes.bloom) / 2 },
      { ja: '貫禄', mine: g.vigor * 0.6 + p.stage * 14, theirs: rival.genes.vigor * 0.6 + rival.stage * 14 },
      { ja: '管理', mine: this.careQuality(p), theirs: 45 + league * 9 },
    ].map((c) => {
      const mine = Math.round(c.mine * myBonus);
      const theirs = Math.round(c.theirs * rivalBonus);
      return { ja: c.ja, mine, theirs, win: mine >= theirs };
    });

    const wins = categories.filter((c) => c.win).length;
    const won = wins >= 3;
    const reward = won ? lg.reward : Math.round(lg.reward * 0.25);
    this.state.coins += reward;
    this.state.stats.contests++;
    if (won) {
      this.state.stats.contestWins++;
      this.state.stats.league = Math.max(this.state.stats.league, Math.min(league + 1, this.LEAGUES.length - 1));
      this.gainExp(p, 60 + league * 40);
    }
    p.events.unshift({
      t: Date.now(), day: round1(this.state.clock), type: 'contest',
      text: `${lg.ja} ${won ? '優勝' : `${wins}/5部門`}(審査員: ${judge.ja})`,
    });
    this.pushLog(`${lg.ja}: ${won ? '優勝' : '入賞ならず'} — ${p.nickname}`);
    this.checkQuests();
    this.save();
    return { ok: true, won, wins, categories, rival, reward, league: lg, judge, myBonus };
  }

  /* ---- ラボ ---- */

  cross(idA, idB) {
    const a = this.plant(idA), b = this.plant(idB);
    if (!a || !b || a.id === b.id) return { ok: false, message: '異なる2株を選んでください' };
    if (a.stage < 3 || b.stage < 3) return { ok: false, message: '交配には成株以上が2株必要です' };
    if (this.state.items.seed <= 0) return { ok: false, message: '交配用種子がありません(ショップで購入できます)' };
    this.state.items.seed--;

    const rnd = seededRandom(`cross:${a.id}:${b.id}:${Date.now()}`);
    const genes = {};
    for (const k of GENE_KEYS) {
      genes[k] = Math.round(clamp((a.genes[k] + b.genes[k]) / 2 + (rnd() - 0.5) * 22, 1, 100));
    }
    let mutation = null;
    const roll = rnd();
    if (roll < 0.09) { genes.variegation = clamp(genes.variegation + 38, 1, 100); mutation = '斑入りが覚醒した'; }
    else if (roll < 0.15) { genes.vigor = clamp(genes.vigor + 30, 1, 100); genes.leaf = clamp(genes.leaf + 16, 1, 100); mutation = '巨大化の素質が出た'; }
    else if (roll < 0.2) { genes.compact = clamp(genes.compact + 32, 1, 100); mutation = '極端な矮性が出た'; }

    const child = createPlant(rnd() < 0.5 ? a.speciesId : b.speciesId, {
      genes, clock: this.state.clock,
      nickname: `${SPECIES_BY_ID[a.speciesId].ja}×${SPECIES_BY_ID[b.speciesId].ja}`,
      parents: [
        { id: a.id, name: this.displayName(a), speciesId: a.speciesId },
        { id: b.id, name: this.displayName(b), speciesId: b.speciesId },
      ],
      hybrid: { a: a.speciesId, b: b.speciesId },
      gen: Math.max(a.gen, b.gen) + 1,
    });
    if (mutation) child.events.unshift({ t: Date.now(), day: round1(this.state.clock), type: 'mutation', text: mutation });
    this.state.plants.push(child);
    this.registerDex(child);
    this.pushLog(`交配成功: ${child.nickname}${mutation ? ` — ${mutation}` : ''}`);
    this.checkQuests();
    this.save();
    return { ok: true, child, mutation };
  }

  /* ---- 経済 ---- */

  buy(itemId) {
    const item = SHOP.find((i) => i.id === itemId);
    if (!item) return { ok: false };
    if (this.state.coins < item.price) return { ok: false, message: 'コインが足りません' };
    this.state.coins -= item.price;
    this.state.items[item.id] = (this.state.items[item.id] || 0) + 1;
    this.save();
    return { ok: true, message: `${item.ja} を購入しました` };
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
    const p = createPlant(speciesId, { clock: this.state.clock });
    this.state.plants.push(p);
    this.state.tutorial.adopt = true;
    this.registerDex(p);
    this.pushLog(`${SPECIES_BY_ID[speciesId].ja} を迎えた`);
    this.checkQuests();
    this.save();
    return p;
  }

  rename(id, name) {
    const p = this.plant(id);
    if (p) { p.nickname = String(name).slice(0, 24) || p.nickname; this.save(); }
  }

  /* ---- クエスト ---- */

  checkQuests() {
    const done = [];
    let earned = 0;
    for (const q of QUESTS) {
      if (this.state.quests[q.id]) continue;
      let ok = false;
      try { ok = q.check(this.state); } catch { ok = false; }
      if (ok) {
        this.state.quests[q.id] = { at: Date.now() };
        this.state.coins += q.reward;
        earned += q.reward;
        done.push(q);
      }
    }
    if (done.length) this.emit('quest', { done, earned });
    return done;
  }

  /* ---- 助言 ---- */

  advice(p) {
    const sp = this.species(p);
    const season = this.season();
    const out = [];
    if (p.pest > 35) out.push({ level: 'danger', text: `害虫レベル ${Math.round(p.pest)}。放置すると葉幅と締まりが削られます。` });
    if (p.care.hydration < 12) out.push({ level: 'warn', text: '完全に乾いています。いま水をやると経験値が多く入ります。' });
    else if (p.care.hydration > 102) out.push({ level: 'warn', text: '過湿ぎみ。根腐れと害虫のリスクが上がっています。' });
    if (p.light < sp.light - 20) out.push({ level: 'warn', text: `日照不足。徒長して締まりが落ちています(適正 ${sp.light})。` });
    if (p.light > sp.light + 20) out.push({ level: 'warn', text: `日照が強すぎます。葉焼けの恐れ(適正 ${sp.light})。` });
    if (p.care.nutrition < 18) out.push({ level: 'info', text: '養分が切れかけています。活力剤で成長力の伸びを支えられます。' });
    if (isSlowSeason(sp, season)) out.push({ level: 'info', text: `いまは${season.ja}。${sp.ja}にとっては成長が緩む時期です(あと ${season.daysLeft} 日)。` });
    if (!p.album.length) out.push({ level: 'info', text: '写真を1枚入れると、ドット絵と個性値が実物に同期します。' });
    if (this.evolveCheck(p).ok) out.push({ level: 'good', text: '進化条件を満たしています。' });
    return out;
  }

  /* ---- 体験用 ---- */
  warp(days) {
    this.state.clock += days;
    this.state.lastRealMs = Date.now();
    this.tick(true);
    this.pushLog(`時間を ${days} ゲーム日進めた`);
    this.save();
  }

  setPace(key) {
    if (!PACES[key]) return;
    this.state.settings.pace = key;
    this.state.lastRealMs = Date.now();
    this.save();
  }

  reset() {
    this.state = freshState();
    this.save();
  }
}

export const game = new Game();
export {
  SPECIES, SPECIES_BY_ID, STAGES, STAGE_REQUIREMENTS, BRANCHES, BRANCH_KEYS,
  SHOP, QUESTS, STARTERS, PACES, NATURES, TYPES, JUDGES,
};
