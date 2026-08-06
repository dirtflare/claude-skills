/* PIXAGAVE — UI レイヤ
 * ルーティング / 画面描画 / モーダル / スプライト解決
 *
 * 方針:
 *  - 画面上部には常に「いま何をすればいいか」を出す
 *  - 最初の1株を選ぶところから始める(空のホームに放り出さない)
 *  - 表示文言はすべて t() 経由。言語設定が全画面に効く
 */

import {
  game, SPECIES, SPECIES_BY_ID, STAGES, BRANCHES, BRANCH_KEYS,
  SHOP, QUESTS, STARTERS, PACES, TYPES,
} from './game.js';
import { WORLDS, GENES, GENE_KEYS, I18N, SPECIES_EN, NATURES } from './data.js';
import { getImage, putImage, uid, exportAll, importAll, clearSave } from './store.js';
import { pixelizePhoto, loadImageFromFile, loadImageFromUrl } from './pixelize.js';
import { proceduralSprite, composeCharacter } from './sprite.js';
import {
  exportSpecCard, exportStory, exportCover, exportGrowthStrip, exportPixelArt, downloadDataUrl,
} from './creator.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const pct = (v, max = 100) => `${clamp((v / max) * 100, 0, 100).toFixed(1)}%`;

/* ---------- 文言 ---------- */

export function t(key, vars) {
  const lang = game.state.lang || 'ja';
  let s = (I18N[lang] && I18N[lang][key]) || I18N.ja[key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}
const isJa = () => (game.state.lang || 'ja') === 'ja';

/* 品種名・説明・分類は言語で切り替える */
const spName = (sp) => (isJa() ? sp.ja : sp.en);
const spDex = (sp) => (isJa() ? sp.dex : (SPECIES_EN[sp.id]?.dex || sp.dex));
const spCategory = (sp) => (isJa() ? sp.category : (SPECIES_EN[sp.id]?.category || sp.category));
const worldName = (w) => (isJa() ? WORLDS[w].ja : WORLDS[w].en);
const stageName = (i) => (isJa() ? STAGES[i].ja : STAGES[i].en);
const branchName = (k) => (isJa() ? BRANCHES[k].ja : BRANCHES[k].en);
const geneName = (k) => (isJa() ? GENES[k].ja : GENES[k].en);

const fmtDate = (ts) => new Date(ts).toLocaleDateString(isJa() ? 'ja-JP' : 'en-GB', { month: 'numeric', day: 'numeric' });

export function toast(message, kind = '') {
  if (!message) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3400);
}

/* ---------- モーダル ---------- */

let modalCleanup = null;

export function openModal(title, bodyHtml, onMount, opts = {}) {
  closeModal();
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"
      ${opts.width ? `style="width:min(${opts.width},100%)"` : ''}>
    <header><h2>${esc(title)}</h2><button class="btn sm ghost" data-close>${esc(t('action.close'))}</button></header>
    <div class="modal-body">${bodyHtml}</div>
  </div>`;
  $('#modal-root').appendChild(back);
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.hasAttribute('data-close')) closeModal();
  });
  const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', onKey);
  modalCleanup = () => document.removeEventListener('keydown', onKey);
  if (onMount) onMount($('.modal-body', back), back);
  mountSprites(back);
  return back;
}

export function closeModal() {
  if (modalCleanup) { modalCleanup(); modalCleanup = null; }
  $('#modal-root').innerHTML = '';
}

/* ---------- スプライト ---------- */

const charCache = new Map();

async function plantSpriteData(p, stage = p.stage) {
  if (p.spriteId) {
    const stored = await getImage(p.spriteId);
    if (stored) return stored;
  }
  return proceduralSprite(game.species(p), p.genes, p.seed || p.id, stage);
}

export async function characterUrl(p, stage = p.stage, branch = p.branch) {
  const key = `${p.id}:${p.spriteId || 'proc'}:${stage}:${branch}:${Math.round(p.pest / 25)}`;
  if (charCache.has(key)) return charCache.get(key);
  const img = await loadImageFromUrl(await plantSpriteData(p, stage));
  const url = composeCharacter(img, {
    stage, branch, genes: p.genes, world: game.species(p).world, pest: p.pest, seed: p.seed || p.id,
  }).toDataURL('image/png');
  charCache.set(key, url);
  return url;
}

async function speciesCharUrl(sp, stage = 3) {
  const key = `sp:${sp.id}:${stage}`;
  if (charCache.has(key)) return charCache.get(key);
  const img = await loadImageFromUrl(proceduralSprite(sp, sp.bias, `dex:${sp.id}`, stage));
  const url = composeCharacter(img, {
    stage, branch: null, genes: sp.bias, world: sp.world, pest: 0, seed: sp.id,
  }).toDataURL('image/png');
  charCache.set(key, url);
  return url;
}

export async function mountSprites(root = document) {
  for (const el of $$('img[data-plant]', root)) {
    const p = game.plant(el.dataset.plant);
    if (!p) continue;
    const stage = el.dataset.stage !== undefined ? Number(el.dataset.stage) : p.stage;
    const branch = el.dataset.branch || (stage >= 3 ? p.branch : null);
    try { el.src = await characterUrl(p, stage, branch); } catch { /* noop */ }
  }
  for (const el of $$('img[data-species]', root)) {
    const sp = SPECIES_BY_ID[el.dataset.species];
    if (sp) el.src = await speciesCharUrl(sp, el.dataset.stage ? Number(el.dataset.stage) : 3);
  }
  for (const el of $$('img[data-image]', root)) {
    const data = await getImage(el.dataset.image);
    if (data) el.src = data;
  }
}

const accentOf = (p) => (p.branch ? BRANCHES[p.branch].color : WORLDS[game.species(p).world].color);

/* ---------- 共通パーツ ---------- */

function meter(label, value, max, color) {
  return `<div class="meter">
    <div class="lab"><span>${esc(label)}</span><b>${Math.round(value)}</b></div>
    <div class="track"><span style="--mc:${color};width:${pct(value, max)}"></span></div>
  </div>`;
}

const typeBadges = (types) => types.map((ty) =>
  `<span class="type-badge" style="background:${TYPES[ty]?.color || '#888'}">${esc(ty)}</span>`).join(' ');

function plantCard(p) {
  const accent = accentOf(p);
  const alerts = [];
  if (game.evolveCheck(p).ok) alerts.push(isJa() ? '進化可' : 'Ready');
  else if (p.care.hydration < 15) alerts.push(isJa() ? '水切れ' : 'Dry');
  else if (p.pest > 45) alerts.push(isJa() ? '害虫' : 'Pests');
  return `<button class="plant-card" data-open-plant="${p.id}" style="--accent:${accent}">
    ${alerts.length ? `<span class="alert">${esc(alerts[0])}</span>` : ''}
    <div class="sprite-frame" style="--accent:${accent}">
      <img class="sprite" data-plant="${p.id}" alt="${esc(p.nickname)}" />
    </div>
    <div>
      <div class="name">${esc(p.nickname)}</div>
      <div class="meta">${esc(stageName(p.stage))}${p.branch ? ` · ${esc(branchName(p.branch))}` : ''} · ${game.score(p)}pts</div>
    </div>
    <div class="track sm"><span style="--mc:var(--info);width:${pct(p.care.hydration, 110)}"></span></div>
  </button>`;
}

function evolutionLine(p) {
  const nodes = STAGES.map((st, i) => {
    const reached = i <= p.stage;
    const showBranch = i >= 3 ? p.branch : null;
    const name = i > p.stage ? '???' : (i >= 3 && p.branch ? `${stageName(i)}・${branchName(p.branch)}` : stageName(i));
    return `<div class="evo-node ${i === p.stage ? 'cur' : ''} ${reached ? '' : 'locked'}">
      <div class="sprite-frame" style="--accent:${accentOf(p)}">
        <img class="sprite" data-plant="${p.id}" data-stage="${i}" ${showBranch ? `data-branch="${showBranch}"` : ''} alt="" />
      </div>
      <div class="nm">${esc(name)}</div>
    </div>`;
  }).join('<span class="evo-arrow">▶</span>');

  const lean = p.stage < 3 ? game.branchLean(p) : null;
  return `<div class="evoline">
    <div class="chain">${nodes}</div>
    ${p.branch
      ? `<p class="hint">${esc(t('evolve.fixed', { branch: branchName(p.branch) }))} ${isJa() ? esc(BRANCHES[p.branch].ja_desc) : ''}</p>`
      : `<p class="hint">${esc(t('evolve.branchHint'))}</p>
         <div class="evo-branches">
           ${Object.entries(lean).sort((a, b) => b[1] - a[1]).map(([k, v]) => `
             <div class="meter">
               <div class="lab"><span style="color:${BRANCHES[k].color}">${esc(branchName(k))}</span><b>${v}%</b></div>
               <div class="track sm"><span style="--mc:${BRANCHES[k].color};width:${v}%"></span></div>
             </div>`).join('')}
         </div>`}
  </div>`;
}

/* ---------- 最初の1株を選ぶ ---------- */

function viewStart() {
  const choices = STARTERS.slice(0, 3).map((id) => SPECIES_BY_ID[id]);
  return `<div class="starter">
    <div class="label">PIXAGAVE</div>
    <h1>${isJa() ? '最初の1株を選んでください' : 'Choose your first plant'}</h1>
    <p class="lead">${isJa()
      ? '育てるほどドット絵のキャラクターが進化します。実物の写真を入れれば、その株の姿と個性値がそのまま反映されます。'
      : 'Your plant evolves as a pixel character the more you grow it. Add a photo of the real thing and its shape and traits carry straight over.'}</p>
    <div class="starter-grid">
      ${choices.map((sp) => `
        <button class="starter-card" data-adopt="${sp.id}" data-price="0">
          <div class="sprite-frame" style="--accent:${WORLDS[sp.world].color}">
            <img class="sprite" data-species="${sp.id}" alt="" /></div>
          <div class="label" style="margin-top:12px">No.${String(sp.no).padStart(3, '0')} · ${esc(spCategory(sp))}</div>
          <h3 style="margin:4px 0 8px;font-size:19px">${esc(spName(sp))}</h3>
          <div class="row" style="margin-bottom:8px">${typeBadges(sp.types)}</div>
          <p class="hint">${esc(spDex(sp))}</p>
        </button>`).join('')}
    </div>
    <div class="row" style="justify-content:center;margin-top:26px">
      <button class="btn ghost" data-adopt-dialog>${isJa() ? '他の品種も見る' : 'See all species'}</button>
      <button class="btn ghost" data-help>${esc(t('action.help'))}</button>
    </div>
  </div>`;
}

/* ---------- ホーム ---------- */

function todoList() {
  const s = game.state;
  const tut = s.tutorial;
  const firstPlant = s.plants[0];
  const steps = [
    { k: 'adopt', text: t('todo.adopt'), done: tut.adopt || s.plants.length > 0, cta: 'data-adopt-dialog', label: t('action.adopt') },
    { k: 'photo', text: t('todo.photo'), done: tut.photo, cta: firstPlant ? `data-photo="${firstPlant.id}"` : '', label: t('action.photo') },
    { k: 'water', text: t('todo.water'), done: tut.water, cta: firstPlant ? `data-water="${firstPlant.id}"` : '', label: t('action.water') },
    { k: 'evolve', text: t('todo.evolve'), done: tut.evolve, cta: firstPlant ? `data-open-plant="${firstPlant.id}"` : '', label: t('action.open') },
    { k: 'contest', text: t('todo.contest'), done: s.stats.contests > 0, cta: 'data-nav="contest"', label: t('nav.contest') },
  ];
  if (steps.every((x) => x.done)) return '';
  const nowIdx = steps.findIndex((x) => !x.done);
  return `<section class="panel">
    <h2>${esc(t('home.todo'))}</h2>
    <p class="hint" style="margin:-6px 0 12px">${esc(t('todo.title'))}</p>
    <ol class="todo">
      ${steps.map((x, i) => `<li class="${x.done ? 'done' : ''} ${i === nowIdx ? 'now' : ''}">
        <span class="no">${x.done ? '✓' : i + 1}</span>
        <span class="txt">${esc(x.text)}</span>
        ${!x.done && i === nowIdx && x.cta ? `<button class="btn sm gold go" ${x.cta}>${esc(x.label)}</button>` : ''}
      </li>`).join('')}
    </ol>
  </section>`;
}

function viewHome() {
  const s = game.state;
  if (!s.plants.length && !s.tutorial.adopt) return viewStart();

  const next = game.nextAction();
  const season = game.season();
  const ctaAttr = {
    adopt: 'data-adopt-dialog',
    plant: `data-open-plant="${next.cta.param}"`,
    water: `data-water="${next.cta.param}"`,
    evolve: `data-evolve="${next.cta.param}"`,
    photo: `data-photo="${next.cta.param}"`,
    nav: `data-nav="${next.cta.param}"`,
  }[next.cta.action] || '';
  const tone = { danger: 'var(--terra)', warn: 'var(--gold)', gold: 'var(--gold)' }[next.tone] || 'var(--leaf)';

  return `
  <div class="page-head">
    <div>
      <div class="label">${season.icon} ${esc(isJa() ? season.ja : season.key)} · ${s.plants.length} · ${Math.floor(s.clock)} ${esc(t('label.gameday'))}</div>
      <h1>${esc(t('page.home.title'))}</h1>
    </div>
    <div class="actions">
      <button class="btn ghost" data-help>${esc(t('action.help'))}</button>
      <button class="btn" data-adopt-dialog>${esc(t('action.adopt'))}</button>
    </div>
  </div>

  <div class="stack">
    <section class="next" style="--accent:${tone}">
      ${next.cta.param && game.plant(next.cta.param)
        ? `<div class="n-sprite"><div class="sprite-frame" style="--accent:${tone}">
             <img class="sprite" data-plant="${next.cta.param}" alt="" /></div></div>`
        : ''}
      <div class="n-body">
        <div class="label" style="color:${tone}">${esc(t('home.next'))}</div>
        <h2>${esc(next.title)}</h2>
        <p>${esc(next.body)}</p>
      </div>
      <button class="btn ${next.tone === 'danger' ? 'danger' : next.tone === 'gold' ? 'gold' : 'primary'} big"
        ${ctaAttr}>${esc(next.cta.label)}</button>
    </section>

    ${todoList()}

    ${s.plants.length ? `<section class="panel">
      <h2>${esc(t('home.party'))}</h2>
      <div class="party">${s.plants.map(plantCard).join('')}</div>
    </section>` : ''}

    <div class="grid g2">
      <section class="panel">
        <h2>${esc(t('home.evolveLeft'))}</h2>
        ${s.plants.length ? s.plants.map((p) => {
          const c = game.evolveCheck(p);
          if (c.done) return `<div class="row" style="justify-content:space-between;padding:7px 0">
            <span>${esc(p.nickname)}</span><span class="label">${esc(stageName(4))}</span></div>`;
          if (c.ok) return `<div class="row" style="justify-content:space-between;padding:7px 0">
            <span>${esc(p.nickname)}</span>
            <button class="btn gold sm" data-evolve="${p.id}">${esc(t('action.evolve'))}</button></div>`;
          const eta = game.evolveEta(p);
          const worst = c.missing[0];
          return `<div style="padding:10px 0;border-bottom:1px solid var(--line)">
            <div class="row" style="justify-content:space-between">
              <span>${esc(p.nickname)} <span class="label">→ ${esc(stageName(p.stage + 1))}</span></span>
              <span class="num" style="color:var(--ink-3)">${esc(t('label.remaining'))} ${eta.days}d / ${esc(eta.real)}</span>
            </div>
            <div class="track sm" style="margin-top:6px">
              <span style="--mc:var(--gold);width:${pct(worst.have, worst.need)}"></span></div>
            <div class="hint">${esc(c.missing.map((m) => `${m.label} ${m.have}/${m.need}`).join(' · '))}</div>
          </div>`;
        }).join('') : `<p class="hint">${esc(t('home.noplants'))}</p>`}
      </section>

      <section class="panel">
        <h2>${esc(t('home.missions'))}</h2>
        <div class="meter" style="margin-bottom:14px">
          <div class="lab"><span>${esc(t('label.done'))}</span><b>${Object.keys(s.quests).length} / ${QUESTS.length}</b></div>
          <div class="track"><span style="--mc:var(--gold);width:${pct(Object.keys(s.quests).length, QUESTS.length)}"></span></div>
        </div>
        ${QUESTS.filter((q) => !s.quests[q.id]).slice(0, 4).map((q) =>
          `<div class="row" style="justify-content:space-between;font-size:13px;padding:3px 0">
            <span>${esc(q.ja)}</span><span class="num" style="color:var(--gold)">+${q.reward}</span></div>`).join('')}
      </section>
    </div>

    <section class="panel">
      <h2>${esc(t('home.recent'))}</h2>
      ${s.log.slice(0, 6).map((l) =>
        `<div style="font-size:13px;padding:5px 0;border-bottom:1px solid var(--line)">
          <span class="num" style="color:var(--ink-3)">${fmtDate(l.t)}</span> ${esc(l.text)}</div>`).join('')
        || `<p class="hint">${esc(t('home.noplants'))}</p>`}
    </section>
  </div>`;
}

/* ---------- コレクション ---------- */

function viewCollection() {
  const plants = [...game.state.plants].sort((a, b) => game.score(b) - game.score(a));
  return `
  <div class="page-head">
    <div>
      <div class="label">${esc(t('page.collection.kicker'))}</div>
      <h1>${esc(t('page.collection.title'))}</h1>
      <p class="lead">${plants.length} · ${plants.reduce((a, p) => a + game.score(p), 0)} pts</p>
    </div>
    <div class="actions">
      <button class="btn ghost" data-export="cover">Cover PNG</button>
      <button class="btn primary" data-adopt-dialog>${esc(t('action.adopt'))}</button>
    </div>
  </div>
  ${plants.length
    ? `<div class="grid g3">${plants.map(plantCard).join('')}</div>`
    : `<section class="panel"><h2>${esc(t('home.noplants'))}</h2>
       <button class="btn primary" style="margin-top:12px" data-adopt-dialog>${esc(t('action.adopt'))}</button></section>`}`;
}

/* ---------- 図鑑 ---------- */

function viewDex() {
  const prog = game.dexProgress();
  return `
  <div class="page-head">
    <div>
      <div class="label">${esc(t('page.dex.kicker'))}</div>
      <h1>${esc(t('page.dex.title'))}</h1>
      <p class="lead">${esc(t('page.dex.lead', { total: prog.total, forms: prog.maxForms }))}</p>
    </div>
  </div>
  <section class="panel" style="margin-bottom:18px">
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div><div class="label">${esc(t('page.dex.title'))}</div><b class="num" style="font-size:27px">${prog.seen}/${prog.total}</b></div>
      <div><div class="label">${esc(t('sec.branchComplete'))}</div><b class="num" style="font-size:27px">${prog.forms}/${prog.maxForms}</b></div>
      <div><div class="label">%</div><b class="num" style="font-size:27px">${prog.percent}%</b></div>
    </div>
    <div class="track" style="margin-top:14px"><span style="--mc:var(--leaf);width:${prog.percent}%"></span></div>
  </section>
  ${Object.entries(WORLDS).map(([key, w]) => `
    <section class="panel" style="--accent:${w.color};margin-bottom:18px">
      <h2>${esc(worldName(key))}</h2>
      <div class="grid g4">
        ${SPECIES.filter((s) => s.world === key).map((sp) => {
          const d = game.state.dex[sp.id];
          const forms = d ? Object.keys(d.forms || {}) : [];
          return `<button class="dex-cell ${d ? '' : 'locked'}" data-open-species="${sp.id}">
            <div class="no">No.${String(sp.no).padStart(3, '0')}</div>
            <div class="sprite-frame" style="--accent:${w.color};margin:8px 0">
              <img class="sprite" data-species="${sp.id}" alt="" /></div>
            <div class="nm">${d ? esc(spName(sp)) : '???'}</div>
            <div class="label">${'★'.repeat(sp.rarity)}</div>
            <div class="forms">${BRANCH_KEYS.map((b) =>
              `<i style="background:${forms.includes(b) ? BRANCHES[b].color : 'var(--line)'}" title="${esc(branchName(b))}"></i>`).join('')}</div>
          </button>`;
        }).join('')}
      </div>
    </section>`).join('')}`;
}

/* ---------- 記録 ---------- */

function viewLog() {
  const events = [];
  for (const p of game.state.plants) {
    for (const e of p.events) events.push({ ...e, plant: p });
    for (const a of p.album) events.push({ t: a.t, type: 'photo', text: t('action.photo'), plant: p, album: a });
  }
  events.sort((a, b) => b.t - a.t);
  const icon = { evolve: '⇧', photo: '◎', measure: '⌗', contest: '♜', birth: '✿', mutation: '✷' };
  return `
  <div class="page-head">
    <div><div class="label">${esc(t('page.log.kicker'))}</div><h1>${esc(t('page.log.title'))}</h1>
      <p class="lead">${events.length}</p></div>
    ${game.state.plants.length ? `<div class="actions">
      <select id="strip-plant" class="btn ghost">
        ${game.state.plants.map((p) => `<option value="${p.id}">${esc(p.nickname)}</option>`).join('')}
      </select>
      <button class="btn" data-export="strip">Growth strip</button>
    </div>` : ''}
  </div>
  <section class="panel">
    <div class="timeline">
      ${events.slice(0, 60).map((e) => `
        <div class="item">
          <div>
            <div class="when">${fmtDate(e.t)}${e.day !== undefined ? ` / ${Math.floor(e.day)}d` : ''}</div>
            ${e.album && e.album.photoId
              ? `<img class="thumb" data-image="${e.album.photoId}" alt="" />`
              : `<div class="sprite-frame" style="--accent:${accentOf(e.plant)}">
                   <img class="sprite" data-plant="${e.plant.id}" alt="" /></div>`}
          </div>
          <div>
            <div><span style="color:var(--leaf)">${icon[e.type] || '·'}</span>
              <b>${esc(e.plant.nickname)}</b> — ${esc(e.text)}</div>
            ${e.album && e.album.note ? `<div class="hint">${esc(e.album.note)}</div>` : ''}
            <button class="btn sm ghost" style="margin-top:8px" data-open-plant="${e.plant.id}">${esc(t('action.open'))}</button>
          </div>
        </div>`).join('') || `<p class="hint">${esc(t('home.noplants'))}</p>`}
    </div>
  </section>`;
}

/* ---------- 品評会 ---------- */

function viewContest() {
  const plants = game.state.plants;
  const unlocked = game.state.stats.league;
  if (!plants.length) {
    return `<div class="page-head"><div><div class="label">${esc(t('page.contest.kicker'))}</div>
      <h1>${esc(t('page.contest.title'))}</h1></div></div>
      <section class="panel"><p class="hint">${esc(t('msg.noPlants'))}</p></section>`;
  }
  return `
  <div class="page-head">
    <div><div class="label">${esc(t('page.contest.kicker'))}</div><h1>${esc(t('page.contest.title'))}</h1>
      <p class="lead">${esc(t('page.contest.lead'))}</p></div>
  </div>
  <section class="panel" style="margin-bottom:18px">
    <h2>${esc(t('sec.entry'))}</h2>
    <select id="contest-plant" class="btn ghost" style="width:100%;max-width:400px">
      ${plants.map((p) => `<option value="${p.id}">${esc(p.nickname)} — ${game.score(p)}pts [${game.typesOf(p).join('/')}]</option>`).join('')}
    </select>
  </section>
  <div class="grid g2">
    ${game.LEAGUES.map((lg, i) => {
      const locked = i > unlocked;
      return `<section class="panel" style="${locked ? 'opacity:.55' : ''}">
        <h2>${esc(lg.ja)}</h2>
        <div class="row" style="justify-content:space-between">
          <span class="label">${esc(t('stat.score'))} ${lg.min}+</span>
          <span class="num" style="color:var(--gold)">+${lg.reward}</span>
        </div>
        <button class="btn ${locked ? '' : 'gold'} block" style="margin-top:16px" data-contest="${i}" ${locked ? 'disabled' : ''}>
          ${locked ? esc(t('label.locked')) : esc(t('page.contest.title'))}</button>
      </section>`;
    }).join('')}
  </div>`;
}

/* ---------- ラボ ---------- */

function viewLab() {
  const mature = game.state.plants.filter((p) => p.stage >= 3);
  const lineage = game.state.plants.filter((p) => p.parents);
  return `
  <div class="page-head">
    <div><div class="label">${esc(t('page.lab.kicker'))}</div><h1>${esc(t('page.lab.title'))}</h1>
      <p class="lead">${esc(t('page.lab.lead'))}</p></div>
    <div class="actions"><span class="chip">${esc(t('label.seeds'))} ${game.state.items.seed}</span></div>
  </div>
  <section class="panel" style="margin-bottom:18px">
    <h2>${esc(t('sec.cross'))}</h2>
    ${mature.length >= 2 ? `
      <div class="grid g2">
        <div class="field"><label>A</label><select id="cross-a">
          ${mature.map((p) => `<option value="${p.id}">${esc(p.nickname)}</option>`).join('')}</select></div>
        <div class="field"><label>B</label><select id="cross-b">
          ${mature.map((p) => `<option value="${p.id}">${esc(p.nickname)}</option>`).join('')}</select></div>
      </div>
      <button class="btn primary" data-cross ${game.state.items.seed <= 0 ? 'disabled' : ''}>${esc(t('sec.cross'))}</button>`
      : `<p class="hint">${esc(t('page.lab.lead'))}</p>`}
  </section>
  <section class="panel">
    <h2>${esc(t('sec.familyTree'))}</h2>
    ${lineage.length ? lineage.map((p) => `
      <div class="row" style="padding:12px 0;border-bottom:1px solid var(--line)">
        <div class="sprite-frame" style="width:60px;--accent:${accentOf(p)}"><img class="sprite" data-plant="${p.id}" alt="" /></div>
        <div><b>${esc(p.nickname)}</b> <span class="chip">F${p.gen}</span>
          <div class="hint">${esc(p.parents[0].name)} × ${esc(p.parents[1].name)}</div></div>
        <div style="margin-left:auto"><button class="btn sm ghost" data-open-plant="${p.id}">${esc(t('action.open'))}</button></div>
      </div>`).join('') : `<p class="hint">—</p>`}
  </section>`;
}

/* ---------- ショップ ---------- */

function viewShop() {
  const inv = game.state.items;
  return `
  <div class="page-head">
    <div><div class="label">${esc(t('page.shop.kicker'))}</div><h1>${esc(t('page.shop.title'))}</h1>
      <p class="lead">${game.state.coins.toLocaleString()} ${esc(t('label.coins'))}</p></div>
  </div>
  <div class="grid g2" style="margin-bottom:18px">
    ${SHOP.map((item) => `
      <section class="panel">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">${item.icon} ${esc(item.ja)}</h2>
          <span class="chip">${esc(t('label.owned'))} ${inv[item.id] || 0}</span>
        </div>
        <p class="hint" style="margin:10px 0 16px">${esc(item.ja_desc)}</p>
        <button class="btn ${game.state.coins >= item.price ? 'primary' : ''} block" data-buy="${item.id}"
          ${game.state.coins < item.price ? 'disabled' : ''}>${item.price}</button>
      </section>`).join('')}
  </div>
  <section class="panel">
    <h2>${esc(t('sec.sell'))}</h2>
    <div class="grid g4" style="margin-top:14px">
      ${game.state.plants.map((p) => `
        <div class="panel" style="padding:12px;box-shadow:none">
          <div class="sprite-frame" style="--accent:${accentOf(p)}"><img class="sprite" data-plant="${p.id}" alt="" /></div>
          <div style="font-size:13px;margin-top:8px">${esc(p.nickname)}</div>
          <div class="label">${Math.round(game.score(p) * 1.1 + game.species(p).rarity * 40)}</div>
          <button class="btn danger sm block" style="margin-top:8px" data-sell="${p.id}">${esc(t('sec.sell'))}</button>
        </div>`).join('') || `<p class="hint">${esc(t('msg.noPlants'))}</p>`}
    </div>
  </section>`;
}

/* ---------- 設定 ---------- */

function viewSettings() {
  const s = game.state.settings;
  const langNames = {
    ja: '日本語', en: 'English', 'zh-Hant': '繁體中文', 'zh-Hans': '简体中文',
    ko: '한국어', es: 'Español', fr: 'Français',
  };
  return `
  <div class="page-head"><div><div class="label">${esc(t('page.settings.kicker'))}</div>
    <h1>${esc(t('page.settings.title'))}</h1></div></div>
  <div class="grid g2">
    <section class="panel">
      <h2>${esc(t('settings.pace'))}</h2>
      <p class="hint" style="margin:-6px 0 14px">${esc(t('settings.paceNote'))}</p>
      <div class="pick">
        ${Object.entries(PACES).map(([k, p]) => `
          <button data-pace="${k}" aria-pressed="${s.pace === k}">
            <b>${esc(isJa() ? p.ja : p.en)}</b><span>${esc(p.note)}</span></button>`).join('')}
      </div>
      <p class="hint" style="margin-top:12px">${esc(t('label.pace'))}: <b>${esc(isJa() ? game.pace.ja : game.pace.en)}</b></p>
    </section>

    <section class="panel">
      <h2>${esc(t('settings.lang'))}</h2>
      <div class="field">
        <select id="set-lang">
          ${Object.keys(I18N).map((l) =>
            `<option value="${l}" ${game.state.lang === l ? 'selected' : ''}>${langNames[l]}</option>`).join('')}
        </select>
      </div>
      <p class="hint">${esc(t('help.body'))}</p>
    </section>

    <section class="panel">
      <h2>${esc(t('settings.pixel'))}</h2>
      <div class="grid" style="grid-template-columns:120px 1fr;gap:18px;align-items:start">
        <div class="sprite-frame" style="--accent:var(--leaf)"><img class="sprite" id="pixel-preview" alt="" /></div>
        <div>
          <div class="field">
            <label>${esc(t('settings.grid'))} <b class="num" id="lab-grid">${s.grid}</b></label>
            <input type="range" id="set-grid" min="24" max="72" step="4" value="${s.grid}" />
          </div>
          <div class="field">
            <label>${esc(t('settings.colors'))} <b class="num" id="lab-colors">${s.colors}</b></label>
            <input type="range" id="set-colors" min="4" max="16" value="${s.colors}" />
          </div>
          <div class="field">
            <label><input type="checkbox" id="set-dither" ${s.dither ? 'checked' : ''} /> ${esc(t('settings.dither'))}</label>
          </div>
          <p class="hint">${esc(t('settings.preview'))}</p>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>${esc(t('settings.data'))}</h2>
      <p class="hint">${esc(t('settings.dataNote'))}</p>
      <div class="row" style="margin-top:16px">
        <button class="btn ghost" data-export-data>${esc(t('settings.export'))}</button>
        <button class="btn ghost" data-import-data>${esc(t('settings.import'))}</button>
        <button class="btn danger" data-reset>${esc(t('settings.reset'))}</button>
      </div>
    </section>

    <section class="panel">
      <h2>${esc(t('settings.warp'))}</h2>
      <div class="row" style="margin-top:6px">
        ${[1, 3, 8, 20].map((d) => `<button class="btn ghost" data-warp="${d}">+${d}d</button>`).join('')}
      </div>
      <p class="hint" style="margin-top:12px">${Math.floor(game.state.clock)} ${esc(t('label.gameday'))} · ${esc(isJa() ? game.season().ja : game.season().key)}</p>
    </section>
  </div>`;
}

/* ---------- 個体詳細 ---------- */

function viewPlant(id) {
  const p = game.plant(id);
  if (!p) return `<section class="panel"><p>${esc(t('msg.noPlants'))}</p></section>`;
  const sp = game.species(p);
  const accent = accentOf(p);
  const check = game.evolveCheck(p);
  const eta = game.evolveEta(p);
  const community = game.communityFor(sp.id);
  const iv = game.avgWaterInterval(p);
  const a = p.album[p.album.length - 1], b = p.album[0];

  return `
  <div class="page-head">
    <div>
      <button class="btn sm ghost" data-nav="collection">${esc(t('page.plant.back'))}</button>
      <div class="label" style="margin-top:12px">No.${String(sp.no).padStart(3, '0')} · ${esc(spCategory(sp))}</div>
      <h1>${esc(p.nickname)}</h1>
      <div class="row" style="margin-top:8px">
        ${typeBadges(game.typesOf(p))}
        <span class="chip">${esc(t('label.nature'))}: ${esc(p.nature.ja)}</span>
        <span class="chip">${'★'.repeat(sp.rarity)}</span>
      </div>
    </div>
    <div class="actions">
      <button class="btn ghost" data-rename="${p.id}">${esc(t('action.rename'))}</button>
      <button class="btn primary" data-photo="${p.id}">${esc(t('action.photo'))}</button>
    </div>
  </div>

  <div class="stack">
    <section class="panel detail-hero" id="plant-hero" style="--accent:${accent}">
      <div class="grid" style="grid-template-columns:minmax(200px,264px) minmax(0,1fr);align-items:start">
        <div>
          <div class="sprite-frame hero" style="--accent:${accent}">
            <img class="sprite" data-plant="${p.id}" alt="${esc(p.nickname)}" /></div>
          <div style="text-align:center;margin-top:12px">
            <b class="serif" style="font-size:18px">${esc(stageName(p.stage))}${p.branch ? `・${esc(branchName(p.branch))}` : ''}</b>
            <div class="label" style="margin-top:4px">${esc(spName(sp))} · ${Math.floor(game.ageDays(p))} ${esc(t('label.days'))} · ${p.album.length} ${esc(t('label.records'))}</div>
          </div>
        </div>
        <div>
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px">
            ${meter(t('stat.hydration'), p.care.hydration, 110, 'var(--info)')}
            ${meter(t('stat.nutrition'), p.care.nutrition, 100, 'var(--leaf)')}
            ${meter(t('stat.health'), p.care.health, 100, accent)}
            ${meter(t('stat.pest'), p.pest, 100, 'var(--terra)')}
          </div>
          <div class="field" style="margin-top:18px">
            <label>${esc(t('label.light'))} <b class="num" id="light-val">${p.light}</b> / ${esc(t('label.ideal'))} ${sp.light}
              <span class="hint">(${game.estimatedLux(p).toLocaleString()} lx)</span></label>
            <input type="range" id="light-range" min="0" max="100" value="${p.light}" data-light="${p.id}" />
          </div>
          <div class="row">
            <button class="btn primary" data-water="${p.id}">${esc(t('action.water'))}</button>
            <button class="btn" data-fert="${p.id}">${esc(t('action.fert'))}(${game.state.items.fertilizer})</button>
            <button class="btn" data-treat="${p.id}">${esc(t('action.pest'))}(${game.state.items.medicine})</button>
            <button class="btn ghost" data-measure="${p.id}">${esc(t('action.measure'))}</button>
          </div>
          <div class="row" style="margin-top:18px;gap:26px">
            <div><div class="label">${esc(t('stat.score'))}</div><b class="num" style="font-size:23px">${game.score(p)}</b></div>
            <div><div class="label">${esc(t('stat.care'))}</div><b class="num" style="font-size:23px">${game.careQuality(p)}</b></div>
            <div><div class="label">${esc(t('stat.exp'))}</div><b class="num" style="font-size:23px">${Math.floor(p.exp)}</b></div>
          </div>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>${esc(t('sec.evolution'))}</h2>
      ${check.done ? `<p class="hint">${esc(t('evolve.done'))}</p>`
        : check.ok ? `<p style="color:var(--gold);font-size:16px"><b>${esc(t('evolve.can'))}</b></p>
            <button class="btn gold big" data-evolve="${p.id}">${esc(t('action.evolve'))} → ${esc(stageName(p.stage + 1))}</button>`
        : `<div class="row" style="justify-content:space-between;margin-bottom:14px">
             <span>${esc(t('evolve.until', { stage: stageName(p.stage + 1) }))}</span>
             <span class="num" style="color:var(--gold)">${eta.days}d / ${esc(t('label.realtime'))} ${esc(eta.real)}</span>
           </div>
           ${check.missing.map((m) => `
             <div class="meter" style="margin-bottom:10px">
               <div class="lab"><span>${esc(m.label)}</span><b>${m.have} / ${m.need}</b></div>
               <div class="track"><span style="--mc:var(--gold);width:${pct(m.have, m.need)}"></span></div>
             </div>`).join('')}
           <p class="hint">${esc(t('evolve.hint'))}</p>`}
      <h3>${esc(t('sec.tree'))}</h3>
      ${evolutionLine(p)}
    </section>

    <div class="grid g2">
      <section class="panel">
        <h2>${esc(t('sec.genes'))}</h2>
        ${GENE_KEYS.map((k) => {
          const v = p.genes[k], d = v - p.baseGenes[k];
          const nat = p.nature.up === k ? ' ▲' : p.nature.down === k ? ' ▼' : '';
          return `<div class="gene-row">
            <span>${esc(geneName(k))}<span style="color:var(--gold)">${nat}</span></span>
            <div class="track sm"><span style="--mc:${accent};width:${pct(v)}"></span></div>
            <span class="val">${Math.round(v)}${d ? `<span class="delta" style="color:${d > 0 ? 'var(--leaf)' : 'var(--danger)'}">${d > 0 ? '+' : ''}${Math.round(d)}</span>` : ''}</span>
          </div>`;
        }).join('')}
      </section>

      <section class="panel">
        <h2>${esc(t('sec.advice'))}</h2>
        <ul class="advice">
          ${game.advice(p).map((x) => `<li class="${x.level}">${esc(x.text)}</li>`).join('')}
        </ul>
      </section>
    </div>

    <div class="grid g2">
      <section class="panel">
        <h2>${esc(t('sec.dexEntry'))}</h2>
        <p style="font-size:14px">${esc(spDex(sp))}</p>
        <div class="row" style="margin-top:14px">
          <span class="chip">${esc(t('action.water'))} ${sp.water}d</span>
          <span class="chip">${esc(t('label.light'))} ${sp.light}</span>
          <span class="chip">×${sp.growth}</span>
        </div>
        ${p.parents ? `<h3>${esc(t('sec.lineage'))}</h3><div class="row">
          <span class="chip on">F${p.gen}</span>
          <span>${esc(p.parents[0].name)}</span>×<span>${esc(p.parents[1].name)}</span></div>` : ''}
      </section>

      <section class="panel">
        <h2>${esc(t('sec.care'))}</h2>
        ${[[t('action.water'), iv ? `${iv}d` : '—', `${community.waterMean}d`, iv, community.waterMean],
           ['lux', `${game.estimatedLux(p).toLocaleString()}`, `${community.luxMean.toLocaleString()}`, game.estimatedLux(p), community.luxMean],
        ].map(([label, mine, theirs, mv, tv]) => `
          <div style="margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ink-3)">
              <span>${esc(label)}</span><b style="color:var(--ink)">${mine} <span style="color:var(--ink-3)">/ ⌀ ${theirs}</span></b></div>
            <div class="track sm" style="margin-top:5px"><span style="--mc:var(--leaf);width:${mv ? pct(mv, Math.max(mv, tv) * 1.25) : 0}"></span></div>
            <div class="track sm" style="margin-top:3px"><span style="--mc:var(--line-2);width:${pct(tv, Math.max(mv || 0, tv) * 1.25)}"></span></div>
          </div>`).join('')}
        <button class="btn sm ghost" data-light-measure="${p.id}">lux</button>
      </section>
    </div>

    <section class="panel">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">${esc(t('sec.album'))}</h2>
        <div class="row">
          <button class="btn sm ghost" data-export="card" data-target="${p.id}">Card</button>
          <button class="btn sm ghost" data-export="story" data-target="${p.id}">Story</button>
          <button class="btn sm ghost" data-export="pixel" data-target="${p.id}">PNG</button>
        </div>
      </div>
      ${a && b && a.id !== b.id ? `
        <div class="grid g2" style="margin-top:18px">
          <div class="compare" id="compare" style="--split:50%">
            <img data-image="${a.photoId}" alt="" /><img class="after" data-image="${b.photoId}" alt="" />
            <div class="handle"></div>
            <div class="cap l">${fmtDate(a.t)}</div><div class="cap r">${fmtDate(b.t)}</div>
          </div>
          <div class="grid g4">
            ${p.album.slice(0, 8).reverse().map((x) => `
              <div><div class="sprite-frame" style="--accent:${accent}"><img class="sprite" data-image="${x.spriteId}" alt="" /></div>
              <div class="label" style="text-align:center;margin-top:4px">${fmtDate(x.t)}</div></div>`).join('')}
          </div>
        </div>` : ''}
      <div class="grid g4" style="margin-top:18px">
        ${p.album.map((x) => `
          <div><img data-image="${x.photoId}" alt="" style="border:1px solid var(--line);border-radius:var(--r)" />
          <div class="label" style="margin-top:6px">${fmtDate(x.t)} · ${esc(stageName(x.stage))}</div></div>`).join('')
          || `<p class="hint">${esc(t('photo.note'))}</p>`}
      </div>
    </section>
  </div>`;
}

/* ---------- ルーティング ---------- */

const NAV = [
  { key: 'home', icon: '⌂', label: 'nav.home' },
  { key: 'collection', icon: '❑', label: 'nav.collection' },
  { key: 'dex', icon: '❖', label: 'nav.dex' },
  { key: 'log', icon: '≡', label: 'nav.timeline' },
  { key: 'contest', icon: '♜', label: 'nav.contest' },
  { key: 'lab', icon: '⚗', label: 'nav.lab' },
  { key: 'shop', icon: '◈', label: 'nav.shop' },
  { key: 'settings', icon: '⚙', label: 'nav.settings' },
];

export const route = { view: 'home', param: null };

export function go(view, param = null) {
  route.view = view;
  route.param = param;
  render();
  window.scrollTo(0, 0);
}

function renderNav() {
  const alerts = game.state.plants.filter((p) => game.urgency(p) > 0).length;
  const item = (n, withBadge) => `<button data-nav="${n.key}" aria-current="${route.view === n.key}">
    <span class="ico">${n.icon}</span><span>${esc(t(n.label))}</span>
    ${withBadge && n.key === 'home' && alerts ? `<span class="badge">${alerts}</span>` : ''}</button>`;
  $('#rail-nav').innerHTML = NAV.map((n) => item(n, true)).join('');
  $('#tabbar').innerHTML = NAV.filter((n) => ['home', 'collection', 'dex', 'contest', 'settings'].includes(n.key))
    .map((n) => item(n, false)).join('');
}

export function render() {
  const views = {
    home: viewHome, collection: viewCollection, dex: viewDex, log: viewLog,
    contest: viewContest, lab: viewLab, shop: viewShop, settings: viewSettings, start: viewStart,
  };
  $('#view').innerHTML = route.view === 'plant' ? viewPlant(route.param) : (views[route.view] || viewHome)();
  $('#coin-rail').textContent = game.state.coins.toLocaleString();
  $('#coin-mobile').textContent = `${game.state.coins.toLocaleString()}`;
  const s = game.season();
  $('#season-rail').textContent = `${s.icon} ${isJa() ? s.ja : s.key} · ${Math.floor(game.state.clock)}d`;
  renderNav();
  mountSprites($('#view'));
  wireView();
}

/* ---------- ダイアログ ---------- */

function helpDialog() {
  openModal(t('help.title'), `
    <p>${esc(t('help.body'))}</p>
    <ol style="padding-left:20px;line-height:2.1">
      <li>${esc(t('todo.adopt'))}</li>
      <li>${esc(t('todo.photo'))}</li>
      <li>${esc(t('todo.water'))}</li>
      <li>${esc(t('todo.evolve'))}</li>
      <li>${esc(t('todo.contest'))}</li>
    </ol>
    <h3>${esc(t('sec.evolution'))}</h3>
    <p class="hint">${esc(t('evolve.hint'))}<br>${esc(t('evolve.branchHint'))}</p>
    <h3>${esc(t('settings.pace'))}</h3>
    <p class="hint">${esc(t('settings.paceNote'))} — ${esc(t('label.pace'))}: <b>${esc(isJa() ? game.pace.ja : game.pace.en)}</b></p>
    <div class="row" style="margin-top:18px"><button class="btn primary" data-close>${esc(t('action.close'))}</button></div>`);
}

function adoptDialog() {
  openModal(t('action.adopt'), `
    <div class="grid g3" style="margin-top:6px">
      ${SPECIES.map((sp) => {
        const price = STARTERS.includes(sp.id) ? 0 : sp.rarity * 260;
        const afford = game.state.coins >= price;
        return `<div class="panel" style="padding:14px;--accent:${WORLDS[sp.world].color};${afford ? '' : 'opacity:.45'}">
          <div class="sprite-frame" style="--accent:${WORLDS[sp.world].color}"><img class="sprite" data-species="${sp.id}" alt="" /></div>
          <div class="label" style="margin-top:10px">No.${String(sp.no).padStart(3, '0')}</div>
          <b class="serif" style="font-size:16px">${esc(spName(sp))}</b>
          <div class="row" style="margin:8px 0">${typeBadges(sp.types)}</div>
          <div class="hint">${esc(spDex(sp))}</div>
          <button class="btn ${afford ? 'primary' : ''} sm block" style="margin-top:12px"
            data-adopt="${sp.id}" data-price="${price}" ${afford ? '' : 'disabled'}>
            ${price ? `${price}` : esc(t('label.free'))}</button>
        </div>`;
      }).join('')}
    </div>`, null, { width: '1000px' });
}

function photoDialog(plantId) {
  const p = game.plant(plantId);
  if (!p) return;
  const s = game.state.settings;
  let current = null, sourceImg = null;

  openModal(t('photo.title', { name: p.nickname }), `
    <div class="dropzone" id="drop">
      <b>${esc(t('photo.drop'))}</b>
      <div class="hint" style="margin-top:8px">${esc(t('photo.note'))}</div>
      <input type="file" accept="image/*" id="file" hidden />
    </div>
    <div id="preview" style="display:none;margin-top:18px">
      <div class="grid g2">
        <div><div class="label" style="margin-bottom:6px">${esc(t('photo.original'))}</div>
          <img id="prev-photo" style="border:1px solid var(--line);border-radius:var(--r)" alt="" /></div>
        <div><div class="label" style="margin-bottom:6px">${esc(t('photo.pixel'))}</div>
          <div class="sprite-frame" style="--accent:${accentOf(p)}"><img class="sprite" id="prev-sprite" alt="" /></div></div>
      </div>
      <div class="grid g2" style="margin-top:18px">
        <div class="field"><label>${esc(t('settings.grid'))} <b class="num" id="v-grid">${s.grid}</b></label>
          <input type="range" id="o-grid" min="24" max="72" step="4" value="${s.grid}" /></div>
        <div class="field"><label>${esc(t('settings.colors'))} <b class="num" id="v-colors">${s.colors}</b></label>
          <input type="range" id="o-colors" min="4" max="16" value="${s.colors}" /></div>
      </div>
      <div class="field"><label><input type="checkbox" id="o-dither" ${s.dither ? 'checked' : ''} /> ${esc(t('settings.dither'))}</label></div>
      <div class="field"><label>Memo</label><input type="text" id="o-note" /></div>
      <div id="analysis" class="hint"></div>
      <div class="row" style="margin-top:18px">
        <button class="btn primary" id="save-photo">${esc(t('photo.save'))} (+30 EXP)</button>
        <button class="btn ghost" data-close>${esc(t('action.cancel'))}</button>
      </div>
    </div>`, (body) => {
    const drop = $('#drop', body), file = $('#file', body), preview = $('#preview', body);
    const run = () => {
      if (!sourceImg) return;
      const grid = Number($('#o-grid', body).value);
      const colors = Number($('#o-colors', body).value);
      $('#v-grid', body).textContent = grid;
      $('#v-colors', body).textContent = colors;
      current = pixelizePhoto(sourceImg, {
        species: game.species(p), grid, colors, dither: $('#o-dither', body).checked,
      });
      $('#prev-sprite', body).src = current.sprite;
      $('#prev-photo', body).src = current.thumb;
      const raw = current.analysis.raw || {};
      $('#analysis', body).innerHTML = `${esc(t('photo.result'))} — ${
        GENE_KEYS.map((k) => `${esc(geneName(k))} <b class="num">${Math.round(raw[k] ?? 50)}</b>`).join(' / ')}`;
    };
    const handle = async (f) => {
      if (!f) return;
      try {
        sourceImg = await loadImageFromFile(f);
        preview.style.display = 'block';
        drop.style.display = 'none';
        run();
      } catch (err) { toast(err.message, 'bad'); }
    };
    drop.addEventListener('click', () => file.click());
    file.addEventListener('change', () => handle(file.files[0]));
    ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => handle(e.dataTransfer.files[0]));
    for (const id of ['#o-grid', '#o-colors', '#o-dither']) $(id, body).addEventListener('input', run);

    $('#save-photo', body).addEventListener('click', async () => {
      if (!current) return;
      const spriteId = uid('spr'), photoId = uid('ph');
      await putImage(spriteId, current.sprite);
      await putImage(photoId, current.thumb);
      game.addPhoto(p.id, { photoId, spriteId, analysis: current.analysis, note: $('#o-note', body).value.trim() });
      charCache.clear();
      closeModal();
      toast(t('msg.photoSaved'), 'gold');
      render();
    });
  }, { width: '880px' });
}

function measureDialog(plantId) {
  const p = game.plant(plantId);
  if (!p) return;
  openModal(t('action.measure'), `
    <div class="grid g2" style="margin-top:8px">
      <div class="field"><label>cm</label><input type="number" id="m-d" step="0.1" min="0" value="${p.metrics.diameter || ''}" /></div>
      <div class="field"><label>leaves</label><input type="number" id="m-l" step="1" min="0" value="${p.metrics.leaves || ''}" /></div>
    </div>
    <button class="btn primary" id="save-m">${esc(t('action.save'))}</button>`, (body) => {
    $('#save-m', body).addEventListener('click', () => {
      const r = game.measure(p.id, {
        diameter: parseFloat($('#m-d', body).value), leaves: parseFloat($('#m-l', body).value),
      });
      closeModal();
      toast(`+${r.exp} EXP`, 'gold');
      render();
    });
  });
}

function lightDialog(plantId) {
  const p = game.plant(plantId);
  openModal('lux', `
    <div class="grid g2" style="margin-top:8px">
      <div class="field"><label>lux</label><input type="number" id="l-lux" value="${p.lux || ''}" /></div>
      <div class="field"><label>hours</label><input type="number" id="l-h" step="0.5" value="${p.lightHours || ''}" /></div>
    </div>
    <button class="btn primary" id="save-l">${esc(t('action.save'))}</button>`, (body) => {
    $('#save-l', body).addEventListener('click', () => {
      game.setLightMeasure(p.id, { lux: parseFloat($('#l-lux', body).value), hours: parseFloat($('#l-h', body).value) });
      closeModal();
      render();
    });
  });
}

async function evolveDialog(plantId) {
  const p = game.plant(plantId);
  if (!p) return;
  const before = await characterUrl(p);
  const beforeName = `${stageName(p.stage)}`;
  const res = game.evolve(plantId);
  if (!res.ok) { toast(res.message, 'bad'); return; }
  charCache.clear();
  const after = await characterUrl(p);

  const flash = document.createElement('div');
  flash.className = 'flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1100);

  openModal(t('sec.evolution'), `
    <div class="evolve-scene">
      <div class="label">${esc(t('evolve.changing'))}</div>
      <div class="evolve-pair">
        <div><div class="sprite-frame"><img class="sprite" src="${before}" alt="" /></div>
          <div class="label" style="text-align:center;margin-top:8px">${esc(beforeName)}</div></div>
        <div class="arrow">➜</div>
        <div><div class="sprite-frame" style="--accent:${accentOf(p)}"><img class="sprite" src="${after}" alt="" /></div>
          <div class="label" style="text-align:center;margin-top:8px">${esc(stageName(p.stage))}</div></div>
      </div>
      <h3 class="serif" style="margin:0;font-size:20px">${esc(t('evolve.happened', {
        before: `${p.nickname}(${beforeName})`, after: `${stageName(p.stage)}${res.branch ? `・${branchName(p.branch)}` : ''}`,
      }))}</h3>
      ${res.branch ? `<p class="hint" style="max-width:480px">
        <b style="color:${res.branch.color}">${esc(branchName(p.branch))}</b> — ${esc(res.branch.ja_desc)}</p>` : ''}
      <div class="row" style="justify-content:center">
        <button class="btn gold" data-export="card" data-target="${p.id}">Card PNG</button>
        <button class="btn ghost" data-close>${esc(t('action.close'))}</button>
      </div>
    </div>`, (body) => {
    body.addEventListener('click', (e) => {
      const el = e.target.closest('[data-export]');
      if (el) handleExport(el.dataset.export, el.dataset.target);
    });
  });
}

function contestDialog(leagueIndex) {
  const sel = $('#contest-plant');
  const plantId = sel ? sel.value : (game.state.plants[0] || {}).id;
  const res = game.contest(plantId, Number(leagueIndex));
  if (!res.ok) { toast(res.message, 'bad'); return; }
  const p = game.plant(plantId);
  openModal(`${res.league.ja} — ${res.won ? '★' : '—'}`, `
    <div class="panel" style="margin-bottom:18px;box-shadow:none">
      <div class="label">${esc(t('label.judge'))}</div>
      <b>${esc(res.judge.ja)}</b> — ${esc(res.judge.comment)}
      <div class="row" style="margin-top:10px">
        <span>${esc(t('label.likes'))}:</span>${typeBadges([res.judge.likes])}
        <span class="chip ${res.myBonus > 1 ? 'on' : ''}">${esc(t('label.bonus'))} ×${res.myBonus}</span>
      </div>
    </div>
    <div class="row" style="justify-content:space-around;margin-bottom:20px">
      <div style="text-align:center">
        <div class="sprite-frame" style="width:120px;--accent:${accentOf(p)}"><img class="sprite" data-plant="${p.id}" alt="" /></div>
        <div class="label" style="margin-top:8px">${esc(p.nickname)}</div></div>
      <div style="align-self:center;color:var(--ink-3)">VS</div>
      <div style="text-align:center">
        <div class="sprite-frame" style="width:120px"><img class="sprite" data-species="${res.rival.speciesId}" alt="" /></div>
        <div class="label" style="margin-top:8px">${esc(res.rival.name)}</div></div>
    </div>
    ${res.categories.map((c) => `
      <div class="meter" style="margin-bottom:11px">
        <div class="lab"><span>${esc(c.ja)} ${c.win ? '◯' : '✕'}</span>
          <b>${c.mine} <span style="color:var(--ink-3)">vs ${c.theirs}</span></b></div>
        <div class="track"><span style="--mc:${c.win ? 'var(--leaf)' : 'var(--danger)'};width:${pct(c.mine, Math.max(c.mine, c.theirs))}"></span></div>
      </div>`).join('')}
    <p style="margin-top:18px;font-size:16px">${res.wins} / 5 — <b class="num" style="color:var(--gold)">+${res.reward}</b></p>`);
}

function speciesDialog(speciesId) {
  const sp = SPECIES_BY_ID[speciesId];
  const d = game.state.dex[speciesId];
  const c = game.communityFor(speciesId);
  openModal(`No.${String(sp.no).padStart(3, '0')} ${spName(sp)}`, `
    <div class="row" style="align-items:flex-start;gap:22px">
      <div class="sprite-frame" style="width:170px;--accent:${WORLDS[sp.world].color}">
        <img class="sprite" data-species="${sp.id}" alt="" /></div>
      <div style="flex:1;min-width:220px">
        <div class="label">${esc(spCategory(sp))} · ${esc(worldName(sp.world))}</div>
        <div class="row" style="margin:10px 0">${typeBadges(sp.types)}<span class="chip">${'★'.repeat(sp.rarity)}</span>
          <span class="chip">${d ? esc(t('label.registered')) : esc(t('label.unregistered'))}</span></div>
        <p style="font-size:14px">${esc(spDex(sp))}</p>
      </div>
    </div>
    <h3>${esc(t('sec.stages'))}</h3>
    <div class="chain" style="display:flex;gap:8px;align-items:center;overflow-x:auto">
      ${STAGES.map((st, i) => `
        <div class="evo-node ${d && d.stages && d.stages[i] ? '' : 'locked'}">
          <div class="sprite-frame"><img class="sprite" data-species="${sp.id}" data-stage="${i}" alt="" /></div>
          <div class="nm">${esc(stageName(i))}</div></div>`).join('<span class="evo-arrow">▶</span>')}
    </div>
    <h3>${esc(t('sec.branchComplete'))}</h3>
    <div class="grid g4">
      ${BRANCH_KEYS.map((k) => {
        const has = d && d.forms && d.forms[k];
        return `<div class="panel" style="padding:12px;box-shadow:none;${has ? `border-color:${BRANCHES[k].color}` : 'opacity:.5'}">
          <b style="color:${BRANCHES[k].color}">${esc(branchName(k))}</b>
          <div class="hint" style="margin-top:4px">${esc(BRANCHES[k].ja_desc)}</div></div>`;
      }).join('')}
    </div>
    <h3>Community</h3>
    <div class="row" style="gap:24px">
      <div><div class="label">growers</div><b class="num">${c.growers.toLocaleString()}</b></div>
      <div><div class="label">${esc(t('action.water'))}</div><b class="num">${c.waterMean}d</b></div>
      <div><div class="label">lux</div><b class="num">${c.luxMean.toLocaleString()}</b></div>
    </div>`, null, { width: '840px' });
}

async function handleExport(kind, targetId) {
  try {
    toast(t('msg.generating'));
    let url, name;
    if (kind === 'cover') {
      url = await exportCover(game, game.state.plants);
      name = 'pixagave-shelf.png';
    } else {
      const id = targetId || ($('#strip-plant') && $('#strip-plant').value) || (game.state.plants[0] || {}).id;
      const p = game.plant(id);
      if (!p) { toast(t('msg.noPlants'), 'bad'); return; }
      const sprite = await characterUrl(p);
      if (kind === 'card') { url = await exportSpecCard(game, p, { sprite }); name = `pixagave-card.png`; }
      else if (kind === 'story') { url = await exportStory(game, p, { sprite }); name = `pixagave-story.png`; }
      else if (kind === 'pixel') { url = await exportPixelArt(p, { scale: 12, sprite }); name = `pixagave-pixel.png`; }
      else if (kind === 'strip') { url = await exportGrowthStrip(game, p); name = `pixagave-growth.png`; }
    }
    if (!url) return;
    downloadDataUrl(url, name);
    toast(t('msg.exported'), 'gold');
  } catch (err) {
    toast(err.message, 'bad');
  }
}

/* ---------- 配線 ---------- */

function wireView() {
  const view = $('#view');
  const range = $('#light-range', view);
  if (range) {
    range.addEventListener('input', () => { $('#light-val').textContent = range.value; });
    range.addEventListener('change', () => { game.setLight(range.dataset.light, Number(range.value)); render(); });
  }
  const cmp = $('#compare', view);
  if (cmp) {
    let dragging = false;
    const move = (e) => {
      const r = cmp.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      cmp.style.setProperty('--split', `${clamp((x / r.width) * 100, 0, 100)}%`);
    };
    cmp.addEventListener('pointerdown', (e) => { dragging = true; move(e); });
    window.addEventListener('pointermove', (e) => { if (dragging) move(e); });
    window.addEventListener('pointerup', () => { dragging = false; });
  }
  const lang = $('#set-lang', view);
  if (lang) lang.addEventListener('change', () => { game.state.lang = lang.value; game.save(); render(); });

  // ピクセル変換設定は、その場でプレビューが変わるようにする
  const preview = $('#pixel-preview', view);
  if (preview) {
    const sp = SPECIES_BY_ID[game.state.plants[0]?.speciesId] || SPECIES[0];
    const refresh = async () => {
      const s = game.state.settings;
      const src = proceduralSprite(sp, sp.bias, 'preview', 3);
      const img = await loadImageFromUrl(src);
      // 手続き生成のドット絵を、いまの設定でもう一度ピクセル化して見せる
      const out = pixelizePhoto(img, { species: sp, grid: s.grid, colors: s.colors, dither: s.dither });
      preview.src = out.sprite;
    };
    refresh();
    for (const [id, key] of [['#set-grid', 'grid'], ['#set-colors', 'colors']]) {
      const el = $(id, view);
      if (!el) continue;
      el.addEventListener('input', () => {
        game.state.settings[key] = Number(el.value);
        const lab = $(`#lab-${key}`, view);
        if (lab) lab.textContent = el.value;
        game.save();
        refresh();
      });
    }
    const dith = $('#set-dither', view);
    if (dith) dith.addEventListener('change', () => {
      game.state.settings.dither = dith.checked;
      game.save();
      refresh();
    });
  }
}

export function wireGlobal() {
  document.body.addEventListener('click', async (e) => {
    const pick = (sel) => e.target.closest(sel);
    let el;

    if ((el = pick('[data-nav]'))) return go(el.dataset.nav);
    if ((el = pick('[data-open-plant]'))) return go('plant', el.dataset.openPlant);
    if ((el = pick('[data-open-species]'))) return speciesDialog(el.dataset.openSpecies);
    if (pick('[data-help]')) return helpDialog();
    if (pick('[data-adopt-dialog]')) return adoptDialog();
    if ((el = pick('[data-adopt]'))) {
      const price = Number(el.dataset.price || 0);
      if (game.state.coins < price) return;
      game.state.coins -= price;
      const p = game.adopt(el.dataset.adopt);
      closeModal();
      toast(t('msg.adopted', { name: p.nickname, nature: p.nature.ja }), 'gold');
      return go('plant', p.id);
    }
    if ((el = pick('[data-photo]'))) return photoDialog(el.dataset.photo);
    if ((el = pick('[data-measure]'))) return measureDialog(el.dataset.measure);
    if ((el = pick('[data-light-measure]'))) return lightDialog(el.dataset.lightMeasure);
    if ((el = pick('[data-evolve]'))) return evolveDialog(el.dataset.evolve);
    if ((el = pick('[data-contest]'))) return contestDialog(el.dataset.contest);
    if ((el = pick('[data-export]'))) return handleExport(el.dataset.export, el.dataset.target);

    if ((el = pick('[data-water]'))) {
      const r = game.water(el.dataset.water);
      toast(r.message, r.kind);
      return render();
    }
    if ((el = pick('[data-fert]'))) { const r = game.fertilize(el.dataset.fert); toast(r.message, r.ok ? '' : 'bad'); return render(); }
    if ((el = pick('[data-treat]'))) { const r = game.treat(el.dataset.treat); toast(r.message, r.ok ? '' : 'bad'); charCache.clear(); return render(); }
    if ((el = pick('[data-buy]'))) { const r = game.buy(el.dataset.buy); toast(r.message, r.ok ? 'gold' : 'bad'); return render(); }
    if ((el = pick('[data-sell]'))) {
      const p = game.plant(el.dataset.sell);
      if (!confirm(`${p.nickname}?`)) return;
      const r = game.sell(el.dataset.sell);
      toast(`+${r.price}`, 'gold');
      return go('collection');
    }
    if ((el = pick('[data-rename]'))) {
      const p = game.plant(el.dataset.rename);
      const name = prompt(t('action.rename'), p.nickname);
      if (name) { game.rename(p.id, name); render(); }
      return;
    }
    if ((el = pick('[data-pace]'))) {
      game.setPace(el.dataset.pace);
      toast(t('msg.paceSet', { pace: isJa() ? PACES[el.dataset.pace].ja : PACES[el.dataset.pace].en }), 'gold');
      return render();
    }
    if (pick('[data-cross]')) {
      const r = game.cross($('#cross-a').value, $('#cross-b').value);
      if (!r.ok) return toast(r.message, 'bad');
      toast(`${r.child.nickname}${r.mutation ? ` — ${r.mutation}` : ''}`, 'gold');
      return go('plant', r.child.id);
    }
    if ((el = pick('[data-warp]'))) {
      game.warp(Number(el.dataset.warp));
      charCache.clear();
      return render();
    }
    if (pick('[data-export-data]')) {
      const json = await exportAll(game.state);
      downloadDataUrl(`data:application/json;charset=utf-8,${encodeURIComponent(json)}`, 'pixagave-backup.json');
      return toast(t('msg.exported'), 'gold');
    }
    if (pick('[data-import-data]')) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = async () => {
        try { await importAll(await input.files[0].text()); location.reload(); }
        catch (err) { toast(err.message, 'bad'); }
      };
      input.click();
      return;
    }
    if (pick('[data-reset]')) {
      if (!confirm('reset?')) return;
      clearSave();
      location.reload();
    }
  });
}

export { charCache };
