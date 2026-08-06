/* PIXAGAVE — UI レイヤ(8bit ゲーム機ふう)
 *
 * 設計の柱:
 *  1. 画面下に必ずメッセージ窓がある。次にやることを常に日本語で言い続ける
 *  2. 移動はメニューだけ。▶ カーソルつきの大きな項目を選ぶ
 *  3. 主役は「そだてる」画面。モンスターが大きく出て、進化までのゲージが常に見える
 *  4. 押せるものは 56px 以上、文字は大きく、選択肢は一度に少なく
 */

import {
  game, SPECIES, SPECIES_BY_ID, STAGES, BRANCHES, BRANCH_KEYS,
  SHOP, QUESTS, STARTERS, PACES, TYPES,
} from './game.js';
import { WORLDS, GENES, GENE_KEYS, I18N, SPECIES_EN } from './data.js';
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

const isJa = () => (game.state.lang || 'ja') === 'ja';

/* 子どもでも読めるように、画面の言葉はかな中心にする */
const LB = {
  raise: ['そだてる', 'RAISE'], party: ['なかま', 'PARTY'], dex: ['ずかん', 'DEX'],
  menu: ['メニュー', 'MENU'], contest: ['たいかい', 'CONTEST'], shop: ['ショップ', 'SHOP'],
  lab: ['こうはい', 'BREED'], log: ['きろく', 'LOG'], settings: ['せってい', 'OPTION'],
  water: ['みずやり', 'WATER'], photo: ['しゃしん', 'PHOTO'], food: ['ごはん', 'FEED'],
  medicine: ['くすり', 'CURE'], measure: ['はかる', 'MEASURE'], light: ['ひかり', 'LIGHT'],
  evolve: ['しんか！', 'EVOLVE!'], back: ['もどる', 'BACK'], close: ['とじる', 'CLOSE'],
  yes: ['はい', 'YES'], save: ['きろくする', 'SAVE'], cancel: ['やめる', 'CANCEL'],
  toEvolve: ['しんかまで', 'TO EVOLVE'], help: ['あそびかた', 'HOW TO PLAY'],
  hp: ['みず', 'WATER'], food2: ['えいよう', 'FOOD'], genki: ['げんき', 'HEALTH'],
  bug: ['むし', 'BUGS'], start: ['はじめる', 'START'], buy: ['かう', 'BUY'],
  enter: ['でる', 'ENTER'], sell: ['てばなす', 'RELEASE'], nature: ['せいかく', 'NATURE'],
  type: ['タイプ', 'TYPE'], have: ['もってる', 'OWNED'], coins: ['コイン', 'COINS'],
  day: ['にちめ', 'DAY'], all: ['ぜんぶ', 'ALL'], now: ['いま', 'NOW'],
};
const L = (k) => (LB[k] ? LB[k][isJa() ? 0 : 1] : k);

export function t(key, vars) {
  const lang = game.state.lang || 'ja';
  let s = (I18N[lang] && I18N[lang][key]) || I18N.ja[key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

const spName = (sp) => (isJa() ? sp.ja : sp.en);
const spDex = (sp) => (isJa() ? sp.dex : (SPECIES_EN[sp.id]?.dex || sp.dex));
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
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
}

/* ---------- モーダル ---------- */

let modalCleanup = null;

export function openModal(title, bodyHtml, onMount, opts = {}) {
  closeModal();
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"
      ${opts.width ? `style="width:min(${opts.width},100%)"` : ''}>
    <header><h2>${esc(title)}</h2><button class="btn sm" data-close>${esc(L('close'))}</button></header>
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
  return proceduralSprite(game.species(p), p.genes, p.seed || p.id, stage, { mood: moodOf(p) });
}

function moodOf(p) {
  if (p.care.health < 45 || p.pest > 45 || p.care.hydration < 12) return 'sad';
  if (p.care.health > 80 && p.care.hydration > 35) return 'happy';
  return 'normal';
}

export async function characterUrl(p, stage = p.stage, branch = p.branch) {
  const key = `${p.id}:${p.spriteId || 'proc'}:${stage}:${branch}:${moodOf(p)}:${Math.round(p.pest / 25)}`;
  if (charCache.has(key)) return charCache.get(key);
  const img = await loadImageFromUrl(await plantSpriteData(p, stage));
  const url = composeCharacter(img, {
    stage, branch, genes: p.genes, world: game.species(p).world, pest: p.pest,
    seed: p.seed || p.id, mood: moodOf(p),
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

/* ---------- 選択中の株 ---------- */

function activePlant() {
  const s = game.state;
  if (s.activeId) {
    const p = game.plant(s.activeId);
    if (p) return p;
  }
  return s.plants[0] || null;
}
function setActive(id) {
  game.state.activeId = id;
  game.save();
}

/* ---------- 共通パーツ ---------- */

function gauge(label, value, max, color) {
  return `<div class="gauge">
    <div class="lab"><span>${esc(label)}</span><b>${Math.round(value)}</b></div>
    <div class="bar"><span style="--mc:${color};width:${pct(value, max)}"></span></div>
  </div>`;
}

const typeBadges = (types) => types.map((ty) =>
  `<span class="badge" style="background:${TYPES[ty]?.color || '#ccc'};color:#111">${esc(ty)}</span>`).join(' ');

function evolutionChain(p) {
  return `<div class="chain">${STAGES.map((st, i) => {
    const reached = i <= p.stage;
    const showBranch = i >= 3 ? p.branch : null;
    return `<div class="node ${i === p.stage ? 'cur' : ''} ${reached ? '' : 'locked'}">
      <div class="sprite-frame">
        <img class="sprite" data-plant="${p.id}" data-stage="${i}" ${showBranch ? `data-branch="${showBranch}"` : ''} alt="" />
      </div>
      <div class="nm">${i > p.stage ? '？？？' : esc(stageName(i))}</div>
    </div>`;
  }).join('<span class="arrow">▶</span>')}</div>`;
}

/* ---------- タイトル ---------- */

function viewTitle() {
  return `<div class="title-screen">
    <div class="logo">PIXAGAVE</div>
    <div class="sub">${isJa() ? 'そだてる ピクセル ずかん' : 'A PIXEL PLANT MONSTER GAME'}</div>
    <div class="win" style="max-width:460px;margin:0 auto 24px">
      <p style="margin:0;font-weight:700">${isJa()
        ? 'アガベや たにくしょくぶつを そだてて、ドットえの モンスターに しんかさせる ゲームです。'
        : 'Raise agaves and succulents, and evolve them into pixel monsters.'}</p>
    </div>
    <button class="btn green big" data-nav="start">${esc(L('start'))}</button>
    <p class="press" style="margin-top:18px">▼</p>
  </div>`;
}

/* ---------- さいしょの1ぴき ---------- */

function viewStart() {
  const choices = STARTERS.slice(0, 3).map((id) => SPECIES_BY_ID[id]);
  return `
  <div class="head">
    <h1>${isJa() ? 'さいしょの 1ぽんを えらぼう' : 'CHOOSE YOUR FIRST PLANT'}</h1>
    <p>${isJa() ? 'えらんだ こが きみの さいしょの なかまに なります' : 'Your first partner'}</p>
  </div>
  <div class="starter-grid">
    ${choices.map((sp) => `
      <button class="starter-card" data-adopt="${sp.id}" data-price="0">
        <div class="mon" style="aspect-ratio:1"><img data-species="${sp.id}" alt="" /></div>
        <h3>${esc(spName(sp))}</h3>
        <div>${typeBadges(sp.types)}</div>
        <p class="tiny" style="margin-top:8px;text-align:left">${esc(spDex(sp))}</p>
      </button>`).join('')}
  </div>
  <div class="btn-row" style="justify-content:center;margin-top:20px">
    <button class="btn sm" data-adopt-dialog>${isJa() ? 'ほかの こも みる' : 'SEE ALL'}</button>
    <button class="btn sm" data-help>${esc(L('help'))}</button>
  </div>`;
}

/* ---------- そだてる(メイン) ---------- */

function viewRaise() {
  const s = game.state;
  if (!s.plants.length) return viewStart();
  const p = activePlant();
  const sp = game.species(p);
  const check = game.evolveCheck(p);
  const eta = game.evolveEta(p);
  const need = check.missing[0];

  return `
  <div class="win mon-win" style="padding:0;border:0;box-shadow:none">
    <div class="mon">
      <span class="nameplate">${esc(p.nickname)}</span>
      <span class="lv">${esc(stageName(p.stage))}${p.branch ? `・${esc(branchName(p.branch))}` : ''}</span>
      <img data-plant="${p.id}" alt="${esc(p.nickname)}" />
    </div>
  </div>

  <div class="win">
    <span class="win-title">${esc(L('toEvolve'))}</span>
    ${check.done
      ? `<p style="margin:0;font-weight:800">${isJa() ? 'もう これいじょうは しんかしません！' : 'Fully evolved!'}</p>`
      : check.ok
        ? `<p style="margin:0 0 12px;font-weight:800;color:var(--red)">${isJa() ? 'しんかの じゅんびが できた！' : 'Ready to evolve!'}</p>
           <button class="btn yellow big block" data-evolve="${p.id}">${esc(L('evolve'))}</button>`
        : `<div class="gauge">
             <div class="lab"><span>${esc(need.label)}</span><b>${need.have} / ${need.need}</b></div>
             <div class="bar big"><span style="--mc:var(--yellow);width:${pct(need.have, need.need)}"></span></div>
           </div>
           <p class="tiny" style="margin:6px 0 0">${isJa() ? 'のこり' : 'left'} ${eta.days}${isJa() ? 'にち' : 'd'}(${esc(eta.real)}) ·
             ${esc(check.missing.map((m) => `${m.label} ${m.have}/${m.need}`).join(' / '))}</p>`}
    ${evolutionChain(p)}
  </div>

  <div class="win">
    <span class="win-title">${isJa() ? 'ようす' : 'STATUS'}</span>
    ${gauge(L('hp'), p.care.hydration, 110, 'var(--blue)')}
    ${gauge(L('food2'), p.care.nutrition, 100, 'var(--green)')}
    ${gauge(L('genki'), p.care.health, 100, 'var(--yellow)')}
    ${p.pest > 3 ? gauge(L('bug'), p.pest, 100, 'var(--red)') : ''}
  </div>

  <div class="win">
    <span class="win-title">${isJa() ? 'コマンド' : 'COMMAND'}</span>
    <div class="cmd-grid">
      <button class="btn blue" data-water="${p.id}">💧 ${esc(L('water'))}</button>
      <button class="btn green" data-photo="${p.id}">📷 ${esc(L('photo'))}</button>
      <button class="btn" data-fert="${p.id}">🍚 ${esc(L('food'))}(${s.items.fertilizer})</button>
      <button class="btn" data-treat="${p.id}">💊 ${esc(L('medicine'))}(${s.items.medicine})</button>
    </div>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn sm" data-measure="${p.id}">📏 ${esc(L('measure'))}</button>
      <button class="btn sm" data-light="${p.id}">☀ ${esc(L('light'))} ${p.light}</button>
      <button class="btn sm" data-status="${p.id}">📋 ${isJa() ? 'ステータス' : 'STATUS'}</button>
    </div>
  </div>

  ${s.plants.length > 1 ? `<div class="win">
    <span class="win-title">${esc(L('party'))}</span>
    <div class="dex-grid">
      ${s.plants.map((x) => `<button class="dex-cell ${x.id === p.id ? '' : ''}" data-select="${x.id}"
        style="${x.id === p.id ? 'background:var(--yellow)' : ''}">
        <div class="sprite-frame"><img class="sprite" data-plant="${x.id}" alt="" /></div>
        <div class="nm">${esc(x.nickname)}</div>
      </button>`).join('')}
    </div>
  </div>` : ''}`;
}

/* ---------- なかま ---------- */

function viewParty() {
  const plants = game.state.plants;
  return `
  <div class="head"><h1>${esc(L('party'))}</h1><p>${plants.length} ${isJa() ? 'ぽん' : ''}</p></div>
  <div class="win">
    <div class="list">
      ${plants.map((p) => {
        const c = game.evolveCheck(p);
        return `<button class="list-item" data-select-open="${p.id}">
          <div class="sprite-frame thumb"><img class="sprite" data-plant="${p.id}" alt="" /></div>
          <div>
            <div class="nm">${esc(p.nickname)}</div>
            <div class="meta">${esc(stageName(p.stage))}${p.branch ? `・${esc(branchName(p.branch))}` : ''} · ${game.score(p)}pts</div>
          </div>
          <div class="right">
            ${c.ok ? `<span class="badge red">${isJa() ? 'しんか！' : 'READY'}</span>`
              : p.care.hydration < 15 ? `<span class="badge blue">${isJa() ? 'みず' : 'DRY'}</span>`
              : p.pest > 45 ? `<span class="badge red">${isJa() ? 'むし' : 'BUGS'}</span>` : ''}
          </div>
        </button>`;
      }).join('') || `<p>${isJa() ? 'まだ いません' : 'None'}</p>`}
    </div>
    <button class="btn green block" style="margin-top:14px" data-adopt-dialog>${isJa() ? '＋ なかまを ふやす' : '+ ADOPT'}</button>
  </div>`;
}

/* ---------- ずかん ---------- */

function viewDex() {
  const prog = game.dexProgress();
  return `
  <div class="head"><h1>${esc(L('dex'))}</h1>
    <p>${prog.seen} / ${prog.total} ${isJa() ? 'しゅるい' : 'species'}</p></div>
  <div class="win">
    <div class="bar big"><span style="--mc:var(--green);width:${prog.percent}%"></span></div>
  </div>
  ${Object.entries(WORLDS).map(([key, w]) => `
    <div class="win">
      <span class="win-title">${esc(isJa() ? w.ja : w.en)}</span>
      <div class="dex-grid">
        ${SPECIES.filter((s) => s.world === key).map((sp) => {
          const d = game.state.dex[sp.id];
          const forms = d ? Object.keys(d.forms || {}) : [];
          return `<button class="dex-cell ${d ? '' : 'locked'}" data-open-species="${sp.id}">
            <div class="no">No.${String(sp.no).padStart(3, '0')}</div>
            <div class="sprite-frame"><img class="sprite" data-species="${sp.id}" alt="" /></div>
            <div class="nm">${d ? esc(spName(sp)) : '？？？'}</div>
            <div class="dots">${BRANCH_KEYS.map((b) =>
              `<i style="background:${forms.includes(b) ? BRANCHES[b].color : 'var(--win)'}"></i>`).join('')}</div>
          </button>`;
        }).join('')}
      </div>
    </div>`).join('')}`;
}

/* ---------- メニュー ---------- */

function viewMenu() {
  const items = [
    { key: 'raise', ico: '🌱', sub: activePlant()?.nickname || '' },
    { key: 'party', ico: '👥', sub: `${game.state.plants.length}` },
    { key: 'dex', ico: '📖', sub: `${game.dexProgress().seen}/${game.dexProgress().total}` },
    { key: 'contest', ico: '🏆', sub: `${game.state.stats.contestWins}${isJa() ? 'しょう' : 'W'}` },
    { key: 'shop', ico: '🛒', sub: `${game.state.coins}` },
    { key: 'lab', ico: '🧪', sub: `${game.state.items.seed}` },
    { key: 'log', ico: '📜', sub: '' },
    { key: 'settings', ico: '⚙', sub: isJa() ? game.pace.ja : game.pace.en },
  ];
  return `
  <div class="head"><h1>${esc(L('menu'))}</h1></div>
  <div class="win">
    <div class="menu" id="main-menu">
      ${items.map((it, i) => `<button data-nav="${it.key}" class="${i === 0 ? 'on' : ''}">
        <span class="ico">${it.ico}</span><span>${esc(L(it.key))}</span>
        <span class="sub">${esc(it.sub)}</span></button>`).join('')}
    </div>
  </div>
  <div class="win">
    <button class="btn block" data-help>❓ ${esc(L('help'))}</button>
  </div>`;
}

/* ---------- ショップ ---------- */

function viewShop() {
  const inv = game.state.items;
  const icons = { shade: '🧢', fertilizer: '🍚', medicine: '💊', pot: '🪴', seed: '🌰' };
  const names = {
    shade: ['ひよけネット', 'SHADE'], fertilizer: ['ごはん', 'FOOD'], medicine: ['くすり', 'CURE'],
    pot: ['いいはち', 'GOOD POT'], seed: ['たね', 'SEED'],
  };
  return `
  <div class="head"><h1>${esc(L('shop'))}</h1>
    <p>${esc(L('coins'))}: <b class="num">${game.state.coins.toLocaleString()}</b></p></div>
  <div class="win">
    <div class="list">
      ${SHOP.map((item) => `
        <div class="list-item">
          <div style="font-size:30px;width:44px;text-align:center">${icons[item.id]}</div>
          <div>
            <div class="nm">${esc(names[item.id][isJa() ? 0 : 1])}</div>
            <div class="meta">${esc(L('have'))} ${inv[item.id] || 0}</div>
            <div class="tiny">${esc(item.ja_desc)}</div>
          </div>
          <div class="right">
            <button class="btn sm ${game.state.coins >= item.price ? 'green' : ''}" data-buy="${item.id}"
              ${game.state.coins < item.price ? 'disabled' : ''}>
              ${item.price}<br>${esc(L('buy'))}</button>
          </div>
        </div>`).join('')}
    </div>
  </div>
  <div class="win">
    <span class="win-title">${esc(L('sell'))}</span>
    <div class="list">
      ${game.state.plants.map((p) => `
        <div class="list-item">
          <div class="sprite-frame thumb"><img class="sprite" data-plant="${p.id}" alt="" /></div>
          <div><div class="nm">${esc(p.nickname)}</div>
            <div class="meta">${Math.round(game.score(p) * 1.1 + game.species(p).rarity * 40)} ${esc(L('coins'))}</div></div>
          <div class="right"><button class="btn sm red" data-sell="${p.id}">${esc(L('sell'))}</button></div>
        </div>`).join('') || `<p>${isJa() ? 'いません' : 'None'}</p>`}
    </div>
  </div>`;
}

/* ---------- たいかい ---------- */

function viewContest() {
  const plants = game.state.plants;
  if (!plants.length) return `<div class="win"><p>${isJa() ? 'なかまが いません' : 'No plants'}</p></div>`;
  const p = activePlant();
  const unlocked = game.state.stats.league;
  return `
  <div class="head"><h1>${esc(L('contest'))}</h1>
    <p>${isJa() ? 'しんさいんの すきな タイプに あうと ゆうり！' : 'Match the judge’s favourite type!'}</p></div>
  <div class="win">
    <span class="win-title">${isJa() ? 'だすこ' : 'ENTRY'}</span>
    <div class="list-item" style="background:var(--yellow)">
      <div class="sprite-frame thumb"><img class="sprite" data-plant="${p.id}" alt="" /></div>
      <div><div class="nm">${esc(p.nickname)}</div>
        <div class="meta">${game.score(p)}pts</div>
        <div>${typeBadges(game.typesOf(p))}</div></div>
      <div class="right"><button class="btn sm" data-nav="party">${isJa() ? 'かえる' : 'CHANGE'}</button></div>
    </div>
  </div>
  <div class="win">
    <div class="list">
      ${game.LEAGUES.map((lg, i) => {
        const locked = i > unlocked;
        return `<div class="list-item" style="${locked ? 'opacity:.5' : ''}">
          <div style="font-size:26px;width:40px;text-align:center">${['🥉', '🥈', '🥇', '👑', '🌏'][i]}</div>
          <div><div class="nm">${esc(lg.ja)}</div>
            <div class="meta">${lg.min}pts〜 / +${lg.reward}</div></div>
          <div class="right"><button class="btn sm ${locked ? '' : 'yellow'}" data-contest="${i}" ${locked ? 'disabled' : ''}>
            ${locked ? '🔒' : esc(L('enter'))}</button></div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

/* ---------- こうはい ---------- */

function viewLab() {
  const mature = game.state.plants.filter((p) => p.stage >= 3);
  return `
  <div class="head"><h1>${esc(L('lab'))}</h1>
    <p>${isJa() ? 'せいかぶ 2ほんで あたらしい こが うまれる' : 'Cross two adults'}</p></div>
  <div class="win">
    ${mature.length >= 2 ? `
      <div class="field"><label>A</label><select id="cross-a">
        ${mature.map((p) => `<option value="${p.id}">${esc(p.nickname)}</option>`).join('')}</select></div>
      <div class="field"><label>B</label><select id="cross-b">
        ${mature.map((p) => `<option value="${p.id}">${esc(p.nickname)}</option>`).join('')}</select></div>
      <button class="btn green block" data-cross ${game.state.items.seed <= 0 ? 'disabled' : ''}>
        🌰 ${isJa() ? 'こうはいする' : 'CROSS'}(${game.state.items.seed})</button>
      ${game.state.items.seed <= 0 ? `<p class="tiny" style="margin-top:8px">${isJa() ? 'たねは ショップで かえます' : 'Buy seeds in the shop'}</p>` : ''}`
      : `<p>${isJa() ? 'せいかぶ(4だんかいめ)が 2ほん ひつようです' : 'Need two adult plants'}</p>`}
  </div>
  ${game.state.plants.filter((p) => p.parents).length ? `<div class="win">
    <span class="win-title">${isJa() ? 'かけあわせ' : 'FAMILY'}</span>
    <div class="list">
      ${game.state.plants.filter((p) => p.parents).map((p) => `
        <button class="list-item" data-select-open="${p.id}">
          <div class="sprite-frame thumb"><img class="sprite" data-plant="${p.id}" alt="" /></div>
          <div><div class="nm">${esc(p.nickname)}</div>
            <div class="meta">${esc(p.parents[0].name)} × ${esc(p.parents[1].name)}</div></div>
        </button>`).join('')}
    </div>
  </div>` : ''}`;
}

/* ---------- きろく ---------- */

function viewLog() {
  const events = [];
  for (const p of game.state.plants) {
    for (const e of p.events) events.push({ ...e, plant: p });
    for (const a of p.album) events.push({ t: a.t, type: 'photo', text: L('photo'), plant: p, album: a });
  }
  events.sort((a, b) => b.t - a.t);
  const icon = { evolve: '⬆', photo: '📷', measure: '📏', contest: '🏆', birth: '🌱', mutation: '✨' };
  return `
  <div class="head"><h1>${esc(L('log'))}</h1></div>
  <div class="win">
    <div class="list">
      ${events.slice(0, 40).map((e) => `
        <div class="list-item">
          <div style="font-size:22px;width:36px;text-align:center">${icon[e.type] || '·'}</div>
          <div><div class="nm" style="font-size:14px">${esc(e.plant.nickname)}</div>
            <div class="meta">${fmtDate(e.t)} — ${esc(e.text)}</div></div>
        </div>`).join('') || `<p>${isJa() ? 'まだ ありません' : 'Empty'}</p>`}
    </div>
    ${game.state.plants.length ? `<button class="btn sm block" style="margin-top:12px" data-export="strip">
      ${isJa() ? 'せいちょうの きろくを がぞうにする' : 'EXPORT GROWTH STRIP'}</button>` : ''}
  </div>`;
}

/* ---------- せってい ---------- */

function viewSettings() {
  const s = game.state.settings;
  const langNames = {
    ja: '日本語', en: 'English', 'zh-Hant': '繁體中文', 'zh-Hans': '简体中文',
    ko: '한국어', es: 'Español', fr: 'Français',
  };
  return `
  <div class="head"><h1>${esc(L('settings'))}</h1></div>
  <div class="win">
    <span class="win-title">${isJa() ? 'じかんの すすみかた' : 'PACE'}</span>
    <div class="pick">
      ${Object.entries(PACES).map(([k, p]) => `
        <button data-pace="${k}" aria-pressed="${s.pace === k}">
          <b>${esc(isJa() ? p.ja : p.en)}</b><span>${esc(p.note)}</span></button>`).join('')}
    </div>
  </div>
  <div class="win">
    <span class="win-title">${isJa() ? 'ことば' : 'LANGUAGE'}</span>
    <div class="field"><select id="set-lang">
      ${Object.keys(I18N).map((l) => `<option value="${l}" ${game.state.lang === l ? 'selected' : ''}>${langNames[l]}</option>`).join('')}
    </select></div>
  </div>
  <div class="win">
    <span class="win-title">${isJa() ? 'ドットえの こまかさ' : 'PIXEL'}</span>
    <div style="display:grid;grid-template-columns:110px 1fr;gap:14px;align-items:start">
      <div class="sprite-frame"><img class="sprite" id="pixel-preview" alt="" /></div>
      <div>
        <div class="field"><label>${isJa() ? 'あらさ' : 'GRID'} <b class="num" id="lab-grid">${s.grid}</b></label>
          <input type="range" id="set-grid" min="24" max="72" step="4" value="${s.grid}" /></div>
        <div class="field"><label>${isJa() ? 'いろのかず' : 'COLORS'} <b class="num" id="lab-colors">${s.colors}</b></label>
          <input type="range" id="set-colors" min="4" max="16" value="${s.colors}" /></div>
      </div>
    </div>
  </div>
  <div class="win">
    <span class="win-title">${isJa() ? 'じかんを すすめる' : 'SKIP TIME'}</span>
    <div class="btn-row">
      ${[1, 3, 8, 20].map((d) => `<button class="btn sm" data-warp="${d}">+${d}${isJa() ? 'にち' : 'd'}</button>`).join('')}
    </div>
    <p class="tiny" style="margin-top:8px">${isJa() ? 'いま' : 'now'} ${Math.floor(game.state.clock)} ${esc(L('day'))}</p>
  </div>
  <div class="win">
    <span class="win-title">${isJa() ? 'データ' : 'DATA'}</span>
    <div class="btn-row">
      <button class="btn sm" data-export-data>${isJa() ? 'ほぞん' : 'EXPORT'}</button>
      <button class="btn sm" data-import-data>${isJa() ? 'よみこみ' : 'IMPORT'}</button>
      <button class="btn sm red" data-reset>${isJa() ? 'さいしょから' : 'RESET'}</button>
    </div>
  </div>`;
}

/* ---------- ステータス(詳細) ---------- */

function statusDialog(id) {
  const p = game.plant(id);
  if (!p) return;
  const sp = game.species(p);
  const community = game.communityFor(sp.id);
  openModal(`${p.nickname}`, `
    <div class="mon" style="aspect-ratio:1;max-width:220px;margin:0 auto 14px">
      <img data-plant="${p.id}" alt="" /></div>
    <div class="win tight" style="box-shadow:none">
      <div class="tiny">No.${String(sp.no).padStart(3, '0')} · ${esc(spName(sp))}</div>
      <div style="margin:8px 0">${typeBadges(game.typesOf(p))}
        <span class="badge yellow">${esc(L('nature'))}: ${esc(p.nature.ja)}</span></div>
      <p class="tiny" style="margin:0">${esc(spDex(sp))}</p>
    </div>
    <div class="win tight" style="box-shadow:none">
      <b>${isJa() ? 'のうりょく' : 'TRAITS'}</b>
      ${GENE_KEYS.map((k) => {
        const v = p.genes[k], d = v - p.baseGenes[k];
        const nat = p.nature.up === k ? ' ▲' : p.nature.down === k ? ' ▼' : '';
        return `<div class="gauge" style="margin-top:8px">
          <div class="lab"><span>${esc(geneName(k))}${nat}</span><b>${Math.round(v)}${d ? (d > 0 ? ` +${Math.round(d)}` : ` ${Math.round(d)}`) : ''}</b></div>
          <div class="bar"><span style="--mc:var(--green);width:${pct(v)}"></span></div></div>`;
      }).join('')}
    </div>
    <div class="win tight" style="box-shadow:none">
      <b>${isJa() ? 'おせわの きろく' : 'CARE'}</b>
      <p class="tiny" style="margin:6px 0 0">
        ${isJa() ? 'みずやりの かんかく' : 'watering'}: ${game.avgWaterInterval(p) ?? '—'} /
        ${isJa() ? 'みんなの へいきん' : 'average'}: ${community.waterMean}<br>
        ${isJa() ? 'そうごう' : 'score'}: ${game.score(p)} · ${isJa() ? 'おせわ' : 'care'}: ${game.careQuality(p)} · EXP ${Math.floor(p.exp)}
      </p>
    </div>
    ${p.album.length ? `<div class="win tight" style="box-shadow:none">
      <b>${isJa() ? 'しゃしん' : 'PHOTOS'}</b>
      <div class="dex-grid" style="margin-top:8px">
        ${p.album.slice(0, 8).map((x) => `<div><img data-image="${x.photoId}" alt=""
          style="border:3px solid var(--ink)" /><div class="tiny">${fmtDate(x.t)}</div></div>`).join('')}
      </div></div>` : ''}
    <div class="btn-row" style="margin-top:12px">
      <button class="btn sm" data-rename="${p.id}">${isJa() ? 'なまえ' : 'RENAME'}</button>
      <button class="btn sm" data-export="card" data-target="${p.id}">${isJa() ? 'カードにする' : 'CARD'}</button>
    </div>`, (body) => {
    body.addEventListener('click', (e) => {
      const el = e.target.closest('[data-export]');
      if (el) handleExport(el.dataset.export, el.dataset.target);
    });
  });
}

/* ---------- メッセージ窓 ---------- */

function messageBox() {
  const s = game.state;
  if (!s.plants.length && route.view !== 'raise') {
    return { text: isJa() ? 'メニューから えらんでね。' : 'Pick from the menu.', cta: '' };
  }
  if (!s.plants.length) {
    return {
      text: isJa() ? 'まずは さいしょの 1ぽんを えらぼう！' : 'Choose your first plant!',
      cta: `<button class="btn green" data-nav="start">${esc(L('start'))}</button>`,
    };
  }
  const next = game.nextAction();
  const attr = {
    adopt: 'data-adopt-dialog', plant: `data-select-open="${next.cta.param}"`,
    water: `data-water="${next.cta.param}"`, evolve: `data-evolve="${next.cta.param}"`,
    photo: `data-photo="${next.cta.param}"`, nav: `data-nav="${next.cta.param === 'contest' ? 'contest' : next.cta.param}"`,
  }[next.cta.action] || '';
  return {
    text: next.title,
    sub: next.body,
    cta: attr ? `<button class="btn ${next.tone === 'gold' ? 'yellow' : 'green'}" ${attr}>${esc(next.cta.label)}</button>` : '',
  };
}

/* ---------- ルーティング ---------- */

const TABS = [
  { key: 'raise', ico: '🌱' },
  { key: 'party', ico: '👥' },
  { key: 'dex', ico: '📖' },
  { key: 'menu', ico: '☰' },
];

export const route = { view: 'raise', param: null };

export function go(view, param = null) {
  route.view = view;
  route.param = param;
  render();
  window.scrollTo(0, 0);
}

export function render() {
  const s = game.state;
  if (!s.tutorial.adopt && !s.plants.length && route.view !== 'start' && route.view !== 'title') {
    route.view = s.seenTitle ? 'start' : 'title';
  }
  const views = {
    title: viewTitle, start: viewStart, raise: viewRaise, party: viewParty, dex: viewDex,
    menu: viewMenu, shop: viewShop, contest: viewContest, lab: viewLab, log: viewLog,
    settings: viewSettings,
  };
  const isGameScreen = route.view !== 'title' && route.view !== 'start';

  $('#view').innerHTML = `
    ${isGameScreen ? `<div class="hud">
      <span class="logo">PIXAGAVE</span>
      <span>${game.season().icon} ${Math.floor(s.clock)}${esc(L('day'))}</span>
      <span class="coins">◆ ${s.coins.toLocaleString()}</span>
    </div>` : ''}
    ${(views[route.view] || viewRaise)()}`;

  const msg = messageBox();
  $('#msgbox').innerHTML = `<div class="inner">
    <p>${esc(msg.text)}</p>
    ${msg.sub ? `<p class="tiny sub">${esc(msg.sub)}</p>` : ''}
    ${msg.cta ? `<div class="go">${msg.cta}</div>` : ''}
    <span class="arrow">▼</span>
  </div>`;

  $('#tabbar').innerHTML = `<div class="tabbar-inner">
    ${TABS.map((tb) => `<button data-nav="${tb.key}" aria-current="${route.view === tb.key}">
      <span class="ico">${tb.ico}</span><span>${esc(L(tb.key))}</span></button>`).join('')}
  </div>`;

  mountSprites($('#view'));
  wireView();
}

/* ---------- ダイアログ ---------- */

function helpDialog() {
  openModal(L('help'), `
    <ol style="padding-left:22px;line-height:2.2;font-weight:700">
      <li>${isJa() ? 'なかまを 1ぽん えらぶ' : 'Choose a plant'}</li>
      <li>${isJa() ? '「みずやり」で みずを あげる' : 'Water it'}</li>
      <li>${isJa() ? '「しゃしん」で ほんものの しゃしんを いれる' : 'Add a photo of the real plant'}</li>
      <li>${isJa() ? 'ゲージが いっぱいに なったら「しんか！」' : 'Evolve when the gauge is full'}</li>
      <li>${isJa() ? '「たいかい」に でて コインを あつめる' : 'Enter contests for coins'}</li>
    </ol>
    <div class="win tight" style="box-shadow:none;margin-top:12px">
      <b>${isJa() ? 'しんかって？' : 'Evolution'}</b>
      <p class="tiny" style="margin:6px 0 0">${isJa()
        ? 'そだてると 5だんかいまで すがたが かわります。4だんかいめで、そだてかたに あわせて 4しゅるいの けいとうの どれかに わかれます。'
        : 'Five stages. At the fourth, it branches into one of four forms depending on how you raised it.'}</p>
    </div>
    <div class="btn-row" style="margin-top:14px"><button class="btn green" data-close>${esc(L('close'))}</button></div>`);
}

function adoptDialog() {
  openModal(isJa() ? 'なかまを えらぶ' : 'ADOPT', `
    <div class="dex-grid">
      ${SPECIES.map((sp) => {
        const price = STARTERS.includes(sp.id) ? 0 : sp.rarity * 260;
        const afford = game.state.coins >= price;
        return `<button class="dex-cell" data-adopt="${sp.id}" data-price="${price}" ${afford ? '' : 'disabled'}
          style="${afford ? '' : 'opacity:.45'}">
          <div class="no">No.${String(sp.no).padStart(3, '0')}</div>
          <div class="sprite-frame"><img class="sprite" data-species="${sp.id}" alt="" /></div>
          <div class="nm">${esc(spName(sp))}</div>
          <div class="tiny">${price ? `${price}◆` : (isJa() ? 'ただ' : 'FREE')}</div>
        </button>`;
      }).join('')}
    </div>`, null, { width: '720px' });
}

function photoDialog(plantId) {
  const p = game.plant(plantId);
  if (!p) return;
  const s = game.state.settings;
  let current = null, sourceImg = null;

  openModal(`${p.nickname} — ${L('photo')}`, `
    <div class="dropzone" id="drop">
      📷 ${esc(isJa() ? 'しゃしんを えらぶ' : 'CHOOSE A PHOTO')}
      <div class="tiny" style="margin-top:8px">${esc(t('photo.note'))}</div>
      <input type="file" accept="image/*" id="file" hidden />
    </div>
    <div id="preview" style="display:none;margin-top:14px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><div class="tiny">${esc(t('photo.original'))}</div>
          <img id="prev-photo" style="border:3px solid var(--ink)" alt="" /></div>
        <div><div class="tiny">${esc(t('photo.pixel'))}</div>
          <div class="sprite-frame"><img class="sprite" id="prev-sprite" alt="" /></div></div>
      </div>
      <div class="field" style="margin-top:12px"><label>${isJa() ? 'あらさ' : 'GRID'} <b class="num" id="v-grid">${s.grid}</b></label>
        <input type="range" id="o-grid" min="24" max="72" step="4" value="${s.grid}" /></div>
      <div class="field"><label>${isJa() ? 'いろのかず' : 'COLORS'} <b class="num" id="v-colors">${s.colors}</b></label>
        <input type="range" id="o-colors" min="4" max="16" value="${s.colors}" /></div>
      <input type="checkbox" id="o-dither" ${s.dither ? 'checked' : ''} hidden />
      <div id="analysis" class="tiny"></div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn green" id="save-photo">${esc(L('save'))}</button>
        <button class="btn sm" data-close>${esc(L('cancel'))}</button>
      </div>
    </div>`, (body) => {
    const drop = $('#drop', body), file = $('#file', body), preview = $('#preview', body);
    const run = () => {
      if (!sourceImg) return;
      const grid = Number($('#o-grid', body).value);
      const colors = Number($('#o-colors', body).value);
      $('#v-grid', body).textContent = grid;
      $('#v-colors', body).textContent = colors;
      current = pixelizePhoto(sourceImg, { species: game.species(p), grid, colors, dither: $('#o-dither', body).checked });
      $('#prev-sprite', body).src = current.sprite;
      $('#prev-photo', body).src = current.thumb;
      const raw = current.analysis.raw || {};
      $('#analysis', body).textContent = `${t('photo.result')} — ${
        GENE_KEYS.map((k) => `${geneName(k)} ${Math.round(raw[k] ?? 50)}`).join(' / ')}`;
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
    for (const id of ['#o-grid', '#o-colors']) $(id, body).addEventListener('input', run);

    $('#save-photo', body).addEventListener('click', async () => {
      if (!current) return;
      const spriteId = uid('spr'), photoId = uid('ph');
      await putImage(spriteId, current.sprite);
      await putImage(photoId, current.thumb);
      game.addPhoto(p.id, { photoId, spriteId, analysis: current.analysis });
      charCache.clear();
      closeModal();
      toast(`${t('msg.photoSaved')} +30 EXP`, 'gold');
      render();
    });
  }, { width: '760px' });
}

function measureDialog(plantId) {
  const p = game.plant(plantId);
  if (!p) return;
  openModal(L('measure'), `
    <p class="tiny">${isJa() ? 'ほんものの おおきさを いれると けいけんちが もらえます' : 'Enter the real size for EXP'}</p>
    <div class="field"><label>${isJa() ? 'よこはば (cm)' : 'width (cm)'}</label>
      <input type="number" id="m-d" step="0.1" min="0" value="${p.metrics.diameter || ''}" /></div>
    <div class="field"><label>${isJa() ? 'はっぱの かず' : 'leaves'}</label>
      <input type="number" id="m-l" step="1" min="0" value="${p.metrics.leaves || ''}" /></div>
    <button class="btn green block" id="save-m">${esc(L('save'))}</button>`, (body) => {
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
  const sp = game.species(p);
  openModal(L('light'), `
    <p class="tiny">${isJa() ? `この こに ちょうどいい ひかりは ${sp.light} くらい` : `Ideal light: ${sp.light}`}</p>
    <div class="field">
      <label>${esc(L('light'))} <b class="num" id="lv">${p.light}</b></label>
      <input type="range" id="l-range" min="0" max="100" value="${p.light}" />
    </div>
    <button class="btn green block" id="save-light">${esc(L('save'))}</button>`, (body) => {
    const r = $('#l-range', body);
    r.addEventListener('input', () => { $('#lv', body).textContent = r.value; });
    $('#save-light', body).addEventListener('click', () => {
      game.setLight(p.id, Number(r.value));
      closeModal();
      render();
    });
  });
}

async function evolveDialog(plantId) {
  const p = game.plant(plantId);
  if (!p) return;
  const before = await characterUrl(p);
  const beforeName = stageName(p.stage);
  const res = game.evolve(plantId);
  if (!res.ok) { toast(res.message, 'bad'); return; }
  charCache.clear();
  const after = await characterUrl(p);

  const flash = document.createElement('div');
  flash.className = 'flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1200);

  openModal(isJa() ? 'しんか！' : 'EVOLUTION!', `
    <div class="evo-scene">
      <p style="font-weight:800;margin:0">${isJa() ? 'からだが ひかりだした！' : 'Its body starts to glow!'}</p>
      <div class="evo-pair">
        <div><div class="sprite-frame"><img class="sprite" src="${before}" alt="" /></div>
          <div class="tiny">${esc(beforeName)}</div></div>
        <div class="arrow">▶</div>
        <div><div class="sprite-frame" style="border-color:var(--red)"><img class="sprite" src="${after}" alt="" /></div>
          <div class="tiny">${esc(stageName(p.stage))}</div></div>
      </div>
      <h3 style="font-size:19px">${esc(p.nickname)} は ${esc(stageName(p.stage))}${res.branch ? `・${esc(branchName(p.branch))}` : ''} ${isJa() ? 'に しんかした！' : 'evolved!'}</h3>
      ${res.branch ? `<p class="tiny" style="max-width:440px">${esc(BRANCHES[p.branch].ja_desc)}</p>` : ''}
      <button class="btn green" data-close>${esc(L('close'))}</button>
    </div>`);
}

function contestDialog(leagueIndex) {
  const p = activePlant();
  const res = game.contest(p.id, Number(leagueIndex));
  if (!res.ok) { toast(res.message, 'bad'); return; }
  openModal(`${res.league.ja}`, `
    <div class="win tight" style="box-shadow:none">
      <b>${isJa() ? 'しんさいん' : 'JUDGE'}: ${esc(res.judge.ja)}</b>
      <div style="margin-top:6px">${isJa() ? 'すきな タイプ' : 'likes'}: ${typeBadges([res.judge.likes])}
        <span class="badge ${res.myBonus > 1 ? 'green' : ''}">×${res.myBonus}</span></div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-around;margin:14px 0">
      <div style="text-align:center"><div class="sprite-frame" style="width:110px"><img class="sprite" data-plant="${p.id}" alt="" /></div>
        <div class="tiny">${esc(p.nickname)}</div></div>
      <b style="font-size:20px">VS</b>
      <div style="text-align:center"><div class="sprite-frame" style="width:110px"><img class="sprite" data-species="${res.rival.speciesId}" alt="" /></div>
        <div class="tiny">${esc(res.rival.name)}</div></div>
    </div>
    ${res.categories.map((c) => `
      <div class="gauge">
        <div class="lab"><span>${esc(c.ja)} ${c.win ? '◯' : '✕'}</span><b>${c.mine} / ${c.theirs}</b></div>
        <div class="bar"><span style="--mc:${c.win ? 'var(--green)' : 'var(--red)'};width:${pct(c.mine, Math.max(c.mine, c.theirs))}"></span></div>
      </div>`).join('')}
    <h3 style="text-align:center;margin-top:14px">${res.won ? (isJa() ? 'ゆうしょう！' : 'WIN!') : (isJa() ? 'まけた…' : 'LOSE')}
      ＋${res.reward}◆</h3>`);
}

function speciesDialog(speciesId) {
  const sp = SPECIES_BY_ID[speciesId];
  const d = game.state.dex[speciesId];
  openModal(`No.${String(sp.no).padStart(3, '0')} ${d ? spName(sp) : '？？？'}`, `
    <div class="mon" style="aspect-ratio:1;max-width:200px;margin:0 auto 12px">
      <img data-species="${sp.id}" alt="" /></div>
    <div style="text-align:center;margin-bottom:10px">${typeBadges(sp.types)}</div>
    <p class="tiny">${esc(spDex(sp))}</p>
    <div class="win tight" style="box-shadow:none;margin-top:12px">
      <b>${isJa() ? 'せいちょう' : 'STAGES'}</b>
      <div class="chain">${STAGES.map((st, i) => `
        <div class="node ${d && d.stages && d.stages[i] ? '' : 'locked'}">
          <div class="sprite-frame"><img class="sprite" data-species="${sp.id}" data-stage="${i}" alt="" /></div>
          <div class="nm">${esc(stageName(i))}</div></div>`).join('<span class="arrow">▶</span>')}</div>
    </div>
    <div class="win tight" style="box-shadow:none">
      <b>${isJa() ? 'けいとう' : 'FORMS'}</b>
      <div class="dots" style="justify-content:flex-start;margin-top:8px">
        ${BRANCH_KEYS.map((k) => `<span class="badge" style="background:${d?.forms?.[k] ? BRANCHES[k].color : 'var(--win)'}">
          ${esc(branchName(k))}</span>`).join(' ')}
      </div>
    </div>`, null, { width: '620px' });
}

async function handleExport(kind, targetId) {
  try {
    toast(t('msg.generating'));
    let url, name;
    const p = game.plant(targetId) || activePlant();
    if (!p) { toast(t('msg.noPlants'), 'bad'); return; }
    if (kind === 'cover') { url = await exportCover(game, game.state.plants); name = 'pixagave-shelf.png'; }
    else {
      const sprite = await characterUrl(p);
      if (kind === 'card') { url = await exportSpecCard(game, p, { sprite }); name = 'pixagave-card.png'; }
      else if (kind === 'story') { url = await exportStory(game, p, { sprite }); name = 'pixagave-story.png'; }
      else if (kind === 'pixel') { url = await exportPixelArt(p, { scale: 12, sprite }); name = 'pixagave-pixel.png'; }
      else if (kind === 'strip') { url = await exportGrowthStrip(game, p); name = 'pixagave-growth.png'; }
    }
    if (!url) return;
    downloadDataUrl(url, name);
    toast(t('msg.exported'), 'gold');
  } catch (err) { toast(err.message, 'bad'); }
}

/* ---------- 配線 ---------- */

function wireView() {
  const view = $('#view');
  const lang = $('#set-lang', view);
  if (lang) lang.addEventListener('change', () => { game.state.lang = lang.value; game.save(); render(); });

  const preview = $('#pixel-preview', view);
  if (preview) {
    const sp = SPECIES_BY_ID[activePlant()?.speciesId] || SPECIES[0];
    const refresh = async () => {
      const s = game.state.settings;
      const img = await loadImageFromUrl(proceduralSprite(sp, sp.bias, 'preview', 3));
      preview.src = pixelizePhoto(img, { species: sp, grid: s.grid, colors: s.colors, dither: s.dither }).sprite;
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
  }

  // メニューは十字キーでも動かせるようにする
  const menu = $('#main-menu', view);
  if (menu) {
    const items = $$('button', menu);
    let idx = items.findIndex((b) => b.classList.contains('on'));
    const onKey = (e) => {
      if (!$('#main-menu')) { document.removeEventListener('keydown', onKey); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[idx]?.classList.remove('on');
        idx = (idx + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
        items[idx].classList.add('on');
        items[idx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        items[idx]?.click();
      }
    };
    document.addEventListener('keydown', onKey);
  }
}

export function wireGlobal() {
  document.body.addEventListener('click', async (e) => {
    const pick = (sel) => e.target.closest(sel);
    let el;

    if ((el = pick('[data-nav]'))) {
      if (el.dataset.nav === 'start') game.state.seenTitle = true;
      return go(el.dataset.nav);
    }
    if ((el = pick('[data-select]'))) { setActive(el.dataset.select); return render(); }
    if ((el = pick('[data-select-open]'))) { setActive(el.dataset.selectOpen); return go('raise'); }
    if ((el = pick('[data-open-species]'))) return speciesDialog(el.dataset.openSpecies);
    if ((el = pick('[data-status]'))) return statusDialog(el.dataset.status);
    if (pick('[data-help]')) return helpDialog();
    if (pick('[data-adopt-dialog]')) return adoptDialog();
    if ((el = pick('[data-adopt]'))) {
      const price = Number(el.dataset.price || 0);
      if (game.state.coins < price) return;
      game.state.coins -= price;
      const p = game.adopt(el.dataset.adopt);
      setActive(p.id);
      closeModal();
      toast(isJa() ? `${p.nickname} が なかまに なった！` : `${p.nickname} joined!`, 'gold');
      return go('raise');
    }
    if ((el = pick('[data-photo]'))) return photoDialog(el.dataset.photo);
    if ((el = pick('[data-measure]'))) return measureDialog(el.dataset.measure);
    if ((el = pick('[data-light]'))) return lightDialog(el.dataset.light);
    if ((el = pick('[data-evolve]'))) return evolveDialog(el.dataset.evolve);
    if ((el = pick('[data-contest]'))) return contestDialog(el.dataset.contest);
    if ((el = pick('[data-export]'))) return handleExport(el.dataset.export, el.dataset.target);

    if ((el = pick('[data-water]'))) { const r = game.water(el.dataset.water); toast(r.message, r.kind); charCache.clear(); return render(); }
    if ((el = pick('[data-fert]'))) { const r = game.fertilize(el.dataset.fert); toast(r.message, r.ok ? '' : 'bad'); return render(); }
    if ((el = pick('[data-treat]'))) { const r = game.treat(el.dataset.treat); toast(r.message, r.ok ? '' : 'bad'); charCache.clear(); return render(); }
    if ((el = pick('[data-buy]'))) { const r = game.buy(el.dataset.buy); toast(r.message, r.ok ? 'gold' : 'bad'); return render(); }
    if ((el = pick('[data-sell]'))) {
      const p = game.plant(el.dataset.sell);
      if (!confirm(`${p.nickname}?`)) return;
      const r = game.sell(el.dataset.sell);
      toast(`+${r.price}◆`, 'gold');
      return go('party');
    }
    if ((el = pick('[data-rename]'))) {
      const p = game.plant(el.dataset.rename);
      const name = prompt(isJa() ? 'あたらしい なまえ' : 'New name', p.nickname);
      if (name) { game.rename(p.id, name); closeModal(); render(); }
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
      setActive(r.child.id);
      toast(`${r.child.nickname}${r.mutation ? ` — ${r.mutation}` : ''}`, 'gold');
      return go('raise');
    }
    if ((el = pick('[data-warp]'))) { game.warp(Number(el.dataset.warp)); charCache.clear(); return render(); }
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
