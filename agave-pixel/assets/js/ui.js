/* PIXAGAVE — UI レイヤ
 * ルーティング / 画面描画 / モーダル / スプライト解決
 * 「次に何をすればいいか」を常に画面上部に出すことを最優先にしている。
 */

import {
  game, SPECIES, SPECIES_BY_ID, STAGES, STAGE_REQUIREMENTS, BRANCHES, BRANCH_KEYS,
  SHOP, QUESTS, STARTERS, PACES, TYPES,
} from './game.js';
import { WORLDS, GENES, GENE_KEYS, I18N } from './data.js';
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
const fmtDate = (t) => new Date(t).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });

export function t(key) {
  const lang = game.state.lang || 'ja';
  return (I18N[lang] && I18N[lang][key]) || I18N.ja[key] || key;
}

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

/** 鉢と演出込みのキャラクター画像。段階を指定すると未来/過去の姿も出せる */
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

function typeBadges(types) {
  return types.map((ty) =>
    `<span class="type-badge" style="background:${TYPES[ty]?.color || '#888'}">${esc(ty)}</span>`).join(' ');
}

function plantCard(p) {
  const accent = accentOf(p);
  const alerts = [];
  if (p.care.hydration < 15) alerts.push('水切れ');
  if (p.pest > 45) alerts.push('害虫');
  if (game.evolveCheck(p).ok) alerts.push('進化可');
  return `<button class="plant-card" data-open-plant="${p.id}" style="--accent:${accent}">
    ${alerts.length ? `<span class="alert">${esc(alerts[0])}</span>` : ''}
    <div class="sprite-frame" style="--accent:${accent}">
      <img class="sprite" data-plant="${p.id}" alt="${esc(game.displayName(p))}" />
    </div>
    <div>
      <div class="name">${esc(p.nickname)}</div>
      <div class="meta">${esc(game.displayName(p))} · ${game.score(p)}pts</div>
    </div>
    <div class="track sm"><span style="--mc:#5fd6ff;width:${pct(p.care.hydration, 110)}"></span></div>
  </button>`;
}

/* 進化系統図 */
function evolutionLine(p) {
  const nodes = STAGES.map((st, i) => {
    const reached = i <= p.stage;
    const showBranch = i >= 3 ? p.branch : null;
    const name = i > p.stage ? '???' : (i >= 3 && p.branch ? `${st.ja}・${BRANCHES[p.branch].ja}` : st.ja);
    return `<div class="evo-node ${i === p.stage ? 'cur' : ''} ${reached ? '' : 'locked'}">
      <div class="sprite-frame" style="--accent:${accentOf(p)}">
        <img class="sprite" data-plant="${p.id}" data-stage="${i}" ${showBranch ? `data-branch="${showBranch}"` : ''} alt="" />
      </div>
      <div class="nm">${esc(name)}</div>
    </div>`;
  }).join('<span class="evo-arrow">▸</span>');

  const lean = p.stage < 3 ? game.branchLean(p) : null;
  return `<div class="evoline">
    <div class="chain">${nodes}</div>
    ${p.branch
      ? `<div class="hint">系統は <b style="color:${BRANCHES[p.branch].color}">${esc(BRANCHES[p.branch].ja)}</b> で確定しています。${esc(BRANCHES[p.branch].ja_desc)}</div>`
      : `<div class="hint">成株になった時点で、下の4系統のうち比重の一番高いものに分岐します。育て方で誘導できます。</div>
         <div class="evo-branches">
           ${Object.entries(lean).sort((a, b) => b[1] - a[1]).map(([k, v]) => `
             <div class="meter">
               <div class="lab"><span style="color:${BRANCHES[k].color}">${esc(BRANCHES[k].ja)}</span><b>${v}%</b></div>
               <div class="track sm"><span style="--mc:${BRANCHES[k].color};width:${v}%"></span></div>
             </div>`).join('')}
         </div>`}
  </div>`;
}

/* ---------- ホーム ---------- */

function viewHome() {
  const s = game.state;
  const next = game.nextAction();
  const season = game.season();
  const tut = s.tutorial;
  const steps = [
    { k: 'adopt', ja: '株を迎える' },
    { k: 'photo', ja: '写真を1枚記録する' },
    { k: 'water', ja: '水をやる' },
    { k: 'evolve', ja: '進化させる' },
  ];
  const tutorialDone = steps.every((x) => tut[x.k]);
  const attention = [...s.plants].filter((p) => game.urgency(p) > 0)
    .sort((a, b) => game.urgency(b) - game.urgency(a));

  const ctaAttr = {
    adopt: 'data-adopt-dialog',
    plant: `data-open-plant="${next.cta.param}"`,
    water: `data-water="${next.cta.param}"`,
    evolve: `data-evolve="${next.cta.param}"`,
    photo: `data-photo="${next.cta.param}"`,
    nav: `data-nav="${next.cta.param}"`,
  }[next.cta.action] || '';
  const tone = { danger: 'var(--danger)', warn: 'var(--gold)', gold: 'var(--gold)' }[next.tone] || 'var(--agave)';

  return `
  <div class="page-head">
    <div>
      <div class="label">${season.icon} ${season.ja} · ${s.plants.length}株 · ゲーム内 ${Math.floor(s.clock)}日目</div>
      <h1>棚のようす</h1>
    </div>
    <div class="actions">
      <button class="btn ghost" data-nav="collection">コレクション</button>
      <button class="btn" data-adopt-dialog>株を迎える</button>
    </div>
  </div>

  <div class="stack">
    <section class="next" style="--accent:${tone}">
      ${next.cta.param && game.plant(next.cta.param)
        ? `<div class="n-sprite"><div class="sprite-frame" style="--accent:${tone}">
             <img class="sprite" data-plant="${next.cta.param}" alt="" /></div></div>`
        : ''}
      <div class="n-body">
        <div class="label n-kicker">次にやること</div>
        <h2>${esc(next.title)}</h2>
        <p>${esc(next.body)}</p>
      </div>
      <button class="btn ${next.tone === 'danger' ? 'danger' : next.tone === 'gold' ? 'gold' : 'primary'} big"
        ${ctaAttr}>${esc(next.cta.label)}</button>
    </section>

    ${!tutorialDone ? `<section class="panel" style="--accent:var(--gold)">
      <h2>はじめの4ステップ</h2>
      <ul class="checks">
        ${steps.map((x) => `<li class="${tut[x.k] ? 'done' : ''}">
          <span class="box">${tut[x.k] ? '✓' : ''}</span><span>${esc(x.ja)}</span></li>`).join('')}
      </ul>
      <p class="hint" style="margin-top:12px">
        進化は「経験値・ゲーム内の育成日数・記録写真の枚数」が揃うと起きます。
        いまのペースは <b>${esc(game.pace.ja)}</b>(${esc(game.pace.note)})。設定でいつでも変えられます。
      </p>
    </section>` : ''}

    ${attention.length ? `<section class="panel" style="--accent:var(--gold)">
      <h2>手が必要な株</h2>
      <div class="grid g4">${attention.map(plantCard).join('')}</div>
    </section>` : ''}

    <div class="grid g2">
      <section class="panel">
        <h2>進化までの残り</h2>
        ${s.plants.length ? s.plants.map((p) => {
          const c = game.evolveCheck(p);
          if (c.done) return `<div class="row" style="justify-content:space-between;padding:6px 0">
            <span>${esc(p.nickname)}</span><span class="label">完成株</span></div>`;
          if (c.ok) return `<div class="row" style="justify-content:space-between;padding:6px 0">
            <span>${esc(p.nickname)}</span>
            <button class="btn gold sm" data-evolve="${p.id}">進化できる！</button></div>`;
          const eta = game.evolveEta(p);
          const worst = c.missing[0];
          return `<div style="padding:8px 0;border-bottom:2px solid var(--line)">
            <div class="row" style="justify-content:space-between">
              <span>${esc(p.nickname)} <span class="label">→ ${esc(STAGES[p.stage + 1].ja)}</span></span>
              <span class="num" style="color:var(--dim)">残り ${eta.days}日 / ${esc(eta.real)}</span>
            </div>
            <div class="track sm" style="margin-top:5px">
              <span style="--mc:var(--gold);width:${pct(worst.have, worst.need)}"></span>
            </div>
            <div class="hint">${esc(c.missing.map((m) => `${m.label} ${m.have}/${m.need}`).join(' · '))}</div>
          </div>`;
        }).join('') : '<p class="hint">まだ株がありません。</p>'}
      </section>

      <section class="panel" style="--accent:var(--gold)">
        <h2>ミッション</h2>
        <div class="meter" style="margin-bottom:12px">
          <div class="lab"><span>達成</span><b>${Object.keys(s.quests).length} / ${QUESTS.length}</b></div>
          <div class="track"><span style="--mc:var(--gold);width:${pct(Object.keys(s.quests).length, QUESTS.length)}"></span></div>
        </div>
        ${QUESTS.filter((q) => !s.quests[q.id]).slice(0, 4).map((q) =>
          `<div class="row" style="justify-content:space-between;font-size:13px;padding:3px 0">
            <span>${esc(q.ja)}</span><span class="num" style="color:var(--gold)">+${q.reward}</span></div>`).join('')
          || '<p class="hint">すべて達成しました。</p>'}
      </section>
    </div>

    <section class="panel">
      <h2>最近の出来事</h2>
      ${s.log.slice(0, 6).map((l) =>
        `<div style="font-size:13px;padding:4px 0;border-bottom:2px solid var(--line)">
          <span class="num" style="color:var(--dim-2)">${fmtDate(l.t)}</span> ${esc(l.text)}</div>`).join('')
        || '<p class="hint">まだ記録がありません。</p>'}
    </section>
  </div>`;
}

/* ---------- コレクション ---------- */

function viewCollection() {
  const plants = [...game.state.plants].sort((a, b) => game.score(b) - game.score(a));
  return `
  <div class="page-head">
    <div>
      <div class="label">COLLECTION</div>
      <h1>棚</h1>
      <p class="lead">${plants.length} 株 / 合計スコア ${plants.reduce((a, p) => a + game.score(p), 0)}</p>
    </div>
    <div class="actions">
      <button class="btn ghost" data-export="cover">カバー画像を書き出す</button>
      <button class="btn primary" data-adopt-dialog>株を迎える</button>
    </div>
  </div>
  ${plants.length
    ? `<div class="grid g3">${plants.map(plantCard).join('')}</div>`
    : `<section class="panel"><h2>まだ株がありません</h2>
       <p class="hint">無償で迎えられる品種が4つあります。</p>
       <button class="btn primary" style="margin-top:12px" data-adopt-dialog>株を迎える</button></section>`}`;
}

/* ---------- 図鑑 ---------- */

function viewDex() {
  const prog = game.dexProgress();
  return `
  <div class="page-head">
    <div>
      <div class="label">LIVING INDEX</div>
      <h1>図鑑</h1>
      <p class="lead">全 ${prog.total} 品種 × 4 系統 = ${prog.maxForms} フォーム。同じ品種でも育て方を変えると別の系統になります。</p>
    </div>
  </div>
  <section class="panel" style="margin-bottom:18px">
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div><div class="label">品種登録</div><b class="num" style="font-size:26px">${prog.seen}/${prog.total}</b></div>
      <div><div class="label">系統コンプ</div><b class="num" style="font-size:26px">${prog.forms}/${prog.maxForms}</b></div>
      <div><div class="label">達成率</div><b class="num" style="font-size:26px">${prog.percent}%</b></div>
    </div>
    <div class="track" style="margin-top:12px"><span style="--mc:var(--agave);width:${prog.percent}%"></span></div>
  </section>
  ${Object.entries(WORLDS).map(([key, w]) => `
    <section class="panel" style="--accent:${w.color};margin-bottom:18px">
      <h2 style="color:${w.color}">${w.ja} / ${w.en}</h2>
      <div class="grid g4">
        ${SPECIES.filter((s) => s.world === key).map((sp) => {
          const d = game.state.dex[sp.id];
          const forms = d ? Object.keys(d.forms || {}) : [];
          return `<button class="dex-cell ${d ? '' : 'locked'}" data-open-species="${sp.id}">
            <div class="no">No.${String(sp.no).padStart(3, '0')}</div>
            <div class="sprite-frame" style="--accent:${w.color};margin:6px 0">
              <img class="sprite" data-species="${sp.id}" alt="" />
            </div>
            <div class="nm">${d ? esc(sp.ja) : '???'}</div>
            <div class="label">${'★'.repeat(sp.rarity)}</div>
            <div class="forms">${BRANCH_KEYS.map((b) =>
              `<i style="background:${forms.includes(b) ? BRANCHES[b].color : '#ffffff14'}" title="${BRANCHES[b].ja}"></i>`).join('')}</div>
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
    for (const a of p.album) events.push({ t: a.t, type: 'photo', text: '写真を記録', plant: p, album: a });
  }
  events.sort((a, b) => b.t - a.t);
  const icon = { evolve: '⇧', photo: '◎', measure: '⌗', contest: '♜', birth: '✿', mutation: '✷' };
  return `
  <div class="page-head">
    <div><div class="label">GROWTH LOG</div><h1>記録</h1>
      <p class="lead">${events.length} 件。写真・実測・進化・品評会がすべて1本の時系列に並びます。</p></div>
    ${game.state.plants.length ? `<div class="actions">
      <select id="strip-plant" class="btn ghost">
        ${game.state.plants.map((p) => `<option value="${p.id}">${esc(p.nickname)}</option>`).join('')}
      </select>
      <button class="btn" data-export="strip">成長ストリップを書き出す</button>
    </div>` : ''}
  </div>
  <section class="panel">
    <div class="timeline">
      ${events.slice(0, 60).map((e) => `
        <div class="item">
          <div>
            <div class="when">${fmtDate(e.t)}${e.day !== undefined ? ` / ${Math.floor(e.day)}日目` : ''}</div>
            ${e.album && e.album.photoId
              ? `<img class="thumb" data-image="${e.album.photoId}" alt="" />`
              : `<div class="sprite-frame" style="--accent:${accentOf(e.plant)}">
                   <img class="sprite" data-plant="${e.plant.id}" alt="" /></div>`}
          </div>
          <div>
            <div><span style="color:var(--agave)">${icon[e.type] || '·'}</span>
              <b>${esc(e.plant.nickname)}</b> — ${esc(e.text)}</div>
            ${e.album && e.album.note ? `<div class="hint">${esc(e.album.note)}</div>` : ''}
            <button class="btn sm ghost" style="margin-top:8px" data-open-plant="${e.plant.id}">個体を開く</button>
          </div>
        </div>`).join('') || '<p class="hint">まだ記録がありません。</p>'}
    </div>
  </section>`;
}

/* ---------- 品評会 ---------- */

function viewContest() {
  const plants = game.state.plants;
  const unlocked = game.state.stats.league;
  if (!plants.length) {
    return `<div class="page-head"><div><div class="label">EXHIBITION</div><h1>品評会</h1></div></div>
      <section class="panel"><p class="hint">出品できる株がありません。</p></section>`;
  }
  return `
  <div class="page-head">
    <div><div class="label">EXHIBITION</div><h1>品評会</h1>
      <p class="lead">審査員には好みのタイプがあります。相性が合えば評価が 1.35 倍、苦手なタイプだと 0.78 倍になります。</p></div>
  </div>
  <section class="panel" style="margin-bottom:18px">
    <h2>出品する株</h2>
    <select id="contest-plant" class="btn ghost" style="width:100%;max-width:380px">
      ${plants.map((p) => `<option value="${p.id}">${esc(p.nickname)} — ${game.score(p)}pts [${game.typesOf(p).join('/')}]</option>`).join('')}
    </select>
  </section>
  <div class="grid g2">
    ${game.LEAGUES.map((lg, i) => {
      const locked = i > unlocked;
      return `<section class="panel" style="--accent:${locked ? 'var(--dim-2)' : 'var(--gold)'};${locked ? 'opacity:.55' : ''}">
        <h2>${esc(lg.ja)}</h2>
        <div class="row" style="justify-content:space-between">
          <span class="label">必要スコア ${lg.min}</span>
          <span class="num" style="color:var(--gold)">優勝 +${lg.reward}</span>
        </div>
        <button class="btn ${locked ? '' : 'gold'} block" style="margin-top:14px" data-contest="${i}" ${locked ? 'disabled' : ''}>
          ${locked ? '前の大会で優勝すると解放' : '出品する'}</button>
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
    <div><div class="label">HYBRID LAB</div><h1>ラボ</h1>
      <p class="lead">成株以上の2株から実生を作ります。約20%で突然変異(斑の覚醒・巨大化・極端な矮性)が出ます。</p></div>
    <div class="actions"><span class="chip">種子 ${game.state.items.seed}</span></div>
  </div>
  <section class="panel" style="margin-bottom:18px">
    <h2>交配</h2>
    ${mature.length >= 2 ? `
      <div class="grid g2">
        <div class="field"><label>親 A</label><select id="cross-a">
          ${mature.map((p) => `<option value="${p.id}">${esc(p.nickname)}(${esc(game.displayName(p))})</option>`).join('')}</select></div>
        <div class="field"><label>親 B</label><select id="cross-b">
          ${mature.map((p) => `<option value="${p.id}">${esc(p.nickname)}(${esc(game.displayName(p))})</option>`).join('')}</select></div>
      </div>
      <button class="btn primary" data-cross ${game.state.items.seed <= 0 ? 'disabled' : ''}>交配する(種子1個)</button>
      ${game.state.items.seed <= 0 ? '<p class="hint" style="margin-top:8px">種子はショップで購入できます。</p>' : ''}`
      : '<p class="hint">交配には成株(段階4)以上が2株必要です。</p>'}
  </section>
  <section class="panel">
    <h2>系統樹</h2>
    ${lineage.length ? lineage.map((p) => `
      <div class="row" style="padding:10px 0;border-bottom:2px solid var(--line)">
        <div class="sprite-frame" style="width:64px;--accent:${accentOf(p)}"><img class="sprite" data-plant="${p.id}" alt="" /></div>
        <div><b>${esc(p.nickname)}</b> <span class="chip">F${p.gen}</span>
          <div class="hint">${esc(p.parents[0].name)} × ${esc(p.parents[1].name)}</div></div>
        <div style="margin-left:auto"><button class="btn sm ghost" data-open-plant="${p.id}">開く</button></div>
      </div>`).join('') : '<p class="hint">まだ交配個体はいません。</p>'}
  </section>`;
}

/* ---------- ショップ ---------- */

function viewShop() {
  const inv = game.state.items;
  return `
  <div class="page-head">
    <div><div class="label">SUPPLY</div><h1>ショップ</h1>
      <p class="lead">所持 ${game.state.coins.toLocaleString()} コイン</p></div>
  </div>
  <div class="grid g2" style="margin-bottom:18px">
    ${SHOP.map((item) => `
      <section class="panel">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">${item.icon} ${esc(item.ja)}</h2>
          <span class="chip on" style="--accent:var(--gold)">所持 ${inv[item.id] || 0}</span>
        </div>
        <p class="hint" style="margin:10px 0 14px">${esc(item.ja_desc)}</p>
        <button class="btn ${game.state.coins >= item.price ? 'primary' : ''} block" data-buy="${item.id}"
          ${game.state.coins < item.price ? 'disabled' : ''}>${item.price} コイン</button>
      </section>`).join('')}
  </div>
  <section class="panel">
    <h2>譲渡</h2>
    <p class="hint">スコアとレア度に応じた価格で手放します。記録も一緒に消えます。</p>
    <div class="grid g4" style="margin-top:14px">
      ${game.state.plants.map((p) => `
        <div class="panel" style="padding:10px;box-shadow:none">
          <div class="sprite-frame" style="--accent:${accentOf(p)}"><img class="sprite" data-plant="${p.id}" alt="" /></div>
          <div style="font-size:13px;margin-top:8px">${esc(p.nickname)}</div>
          <div class="label">${Math.round(game.score(p) * 1.1 + game.species(p).rarity * 40)} コイン</div>
          <button class="btn danger sm block" style="margin-top:8px" data-sell="${p.id}">譲渡</button>
        </div>`).join('') || '<p class="hint">株がありません。</p>'}
    </div>
  </section>`;
}

/* ---------- 設定 ---------- */

function viewSettings() {
  const s = game.state.settings;
  return `
  <div class="page-head"><div><div class="label">SETTINGS</div><h1>設定</h1></div></div>
  <div class="grid g2">
    <section class="panel" style="--accent:var(--gold)">
      <h2>時間の進み方</h2>
      <p class="hint" style="margin-bottom:12px">
        育成日数はすべて「ゲーム日」で数えます。ここでリアル時間との換算を決めます。
        変更してもそれまでの進み具合は失われません。
      </p>
      <div class="pick">
        ${Object.entries(PACES).map(([k, p]) => `
          <button data-pace="${k}" aria-pressed="${s.pace === k}">
            <b>${esc(p.ja)}</b><span>${esc(p.note)}</span>
          </button>`).join('')}
      </div>
    </section>

    <section class="panel">
      <h2>ピクセル変換</h2>
      <div class="field">
        <label>グリッド解像度 <b class="num" id="lab-grid">${s.grid}</b></label>
        <input type="range" id="set-grid" min="24" max="72" step="4" value="${s.grid}" />
      </div>
      <div class="field">
        <label>色数 <b class="num" id="lab-colors">${s.colors}</b></label>
        <input type="range" id="set-colors" min="4" max="16" value="${s.colors}" />
      </div>
      <div class="field">
        <label><input type="checkbox" id="set-dither" ${s.dither ? 'checked' : ''} /> ディザリングを使う</label>
      </div>
    </section>

    <section class="panel">
      <h2>言語</h2>
      <div class="field">
        <select id="set-lang">
          ${Object.keys(I18N).map((l) => `<option value="${l}" ${game.state.lang === l ? 'selected' : ''}>${
            { ja: '日本語', en: 'English', 'zh-Hant': '繁體中文', 'zh-Hans': '简体中文', ko: '한국어', es: 'Español', fr: 'Français' }[l]
          }</option>`).join('')}
        </select>
      </div>
    </section>

    <section class="panel">
      <h2>データ</h2>
      <p class="hint">写真も記録も端末内(localStorage / IndexedDB)にだけ保存され、外部へ送信されません。</p>
      <div class="row" style="margin-top:14px">
        <button class="btn ghost" data-export-data>書き出す</button>
        <button class="btn ghost" data-import-data>読み込む</button>
        <button class="btn danger" data-reset>初期化</button>
      </div>
    </section>

    <section class="panel">
      <h2>時間を進める(体験用)</h2>
      <p class="hint">進化や季節の変化を今すぐ確認したいときに使います。</p>
      <div class="row" style="margin-top:12px">
        <button class="btn ghost" data-warp="1">+1日</button>
        <button class="btn ghost" data-warp="3">+3日</button>
        <button class="btn ghost" data-warp="8">+8日</button>
        <button class="btn ghost" data-warp="20">+20日</button>
      </div>
      <p class="hint" style="margin-top:10px">現在: ゲーム内 ${Math.floor(game.state.clock)} 日目 / ${esc(game.season().ja)}</p>
    </section>
  </div>`;
}

/* ---------- 個体詳細 ---------- */

function viewPlant(id) {
  const p = game.plant(id);
  if (!p) return '<section class="panel"><p>株が見つかりません。</p></section>';
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
      <button class="btn sm ghost" data-nav="collection">← 棚に戻る</button>
      <div class="label" style="margin-top:10px">No.${String(sp.no).padStart(3, '0')} · ${esc(sp.category)}</div>
      <h1>${esc(p.nickname)}</h1>
      <div class="row" style="margin-top:6px">
        ${typeBadges(game.typesOf(p))}
        <span class="chip">性格: ${esc(p.nature.ja)}</span>
        <span class="chip">${'★'.repeat(sp.rarity)}</span>
      </div>
    </div>
    <div class="actions">
      <button class="btn ghost" data-rename="${p.id}">名前</button>
      <button class="btn primary" data-photo="${p.id}">${esc(t('action.photo'))}</button>
    </div>
  </div>

  <div class="stack">
    <section class="panel detail-hero" id="plant-hero" style="--accent:${accent}">
      <div class="grid" style="grid-template-columns:minmax(200px,270px) minmax(0,1fr);align-items:start">
        <div>
          <div class="sprite-frame hero" style="--accent:${accent}">
            <img class="sprite" data-plant="${p.id}" alt="${esc(game.displayName(p))}" />
          </div>
          <div style="text-align:center;margin-top:10px">
            <b style="font-size:17px">${esc(game.displayName(p))}</b>
            <div class="label">${esc(sp.en)} · ${Math.floor(game.ageDays(p))}日目 · ${p.album.length}記録</div>
          </div>
        </div>
        <div>
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
            ${meter(t('stat.hydration'), p.care.hydration, 110, '#5fd6ff')}
            ${meter(t('stat.nutrition'), p.care.nutrition, 100, '#a8e063')}
            ${meter(t('stat.health'), p.care.health, 100, accent)}
            ${meter(t('stat.pest'), p.pest, 100, '#ff9f6a')}
          </div>
          <div class="field" style="margin-top:16px">
            <label>日照 <b class="num" id="light-val">${p.light}</b> / 適正 ${sp.light}
              <span class="hint">(推定 ${game.estimatedLux(p).toLocaleString()} lx)</span></label>
            <input type="range" id="light-range" min="0" max="100" value="${p.light}" data-light="${p.id}" />
          </div>
          <div class="row">
            <button class="btn primary" data-water="${p.id}">${esc(t('action.water'))}</button>
            <button class="btn" data-fert="${p.id}">${esc(t('action.fert'))}(${game.state.items.fertilizer})</button>
            <button class="btn" data-treat="${p.id}">${esc(t('action.pest'))}(${game.state.items.medicine})</button>
            <button class="btn ghost" data-measure="${p.id}">${esc(t('action.measure'))}</button>
          </div>
          <div class="row" style="margin-top:16px;gap:22px">
            <div><div class="label">総合</div><b class="num" style="font-size:22px">${game.score(p)}</b></div>
            <div><div class="label">管理</div><b class="num" style="font-size:22px">${game.careQuality(p)}</b></div>
            <div><div class="label">EXP</div><b class="num" style="font-size:22px">${Math.floor(p.exp)}</b></div>
          </div>
        </div>
      </div>
    </section>

    <section class="panel" style="--accent:var(--gold)">
      <h2>進化</h2>
      ${check.done ? '<p class="hint">完成株です。これ以上の段階はありません。</p>'
        : check.ok ? `<p style="color:var(--gold);font-size:16px"><b>条件を満たしています。</b></p>
            <button class="btn gold big" data-evolve="${p.id}">${esc(STAGES[p.stage + 1].ja)} へ進化させる</button>`
        : `<div class="row" style="justify-content:space-between;margin-bottom:12px">
             <span>${esc(STAGES[p.stage + 1].ja)} まで</span>
             <span class="num" style="color:var(--gold)">残り ${eta.days}日(実時間 ${esc(eta.real)})</span>
           </div>
           ${check.missing.map((m) => `
             <div class="meter" style="margin-bottom:8px">
               <div class="lab"><span>${esc(m.label)}</span><b>${m.have} / ${m.need}${m.unit || ''}</b></div>
               <div class="track"><span style="--mc:var(--gold);width:${pct(m.have, m.need)}"></span></div>
             </div>`).join('')}
           <p class="hint">水やり(適正タイミングで +20)や実測(+18〜)で経験値が入り、その分だけ進化が早まります。</p>`}
      <h3>系統図</h3>
      ${evolutionLine(p)}
    </section>

    <div class="grid g2">
      <section class="panel">
        <h2>個性値</h2>
        ${GENE_KEYS.map((k) => {
          const v = p.genes[k], d = v - p.baseGenes[k];
          const nat = p.nature.up === k ? ' ↑' : p.nature.down === k ? ' ↓' : '';
          return `<div class="gene-row">
            <span>${GENES[k].icon} ${esc(GENES[k].ja)}<span style="color:var(--gold)">${nat}</span></span>
            <div class="track sm"><span style="--mc:${accent};width:${pct(v)}"></span></div>
            <span class="val">${Math.round(v)}${d ? `<span class="delta" style="color:${d > 0 ? 'var(--agave)' : 'var(--danger)'}">${d > 0 ? '+' : ''}${Math.round(d)}</span>` : ''}</span>
          </div>`;
        }).join('')}
        <p class="hint" style="margin-top:10px">
          写真の解析と品種バイアスで決まり、その後は管理内容で動きます。
          性格「${esc(p.nature.ja)}」は${p.nature.up ? `${GENES[p.nature.up].ja}が伸びやすく、${GENES[p.nature.down].ja}が伸びにくい` : 'どの個性値も素直に伸びる'}。
        </p>
      </section>

      <section class="panel">
        <h2>棚メイトの所見</h2>
        <ul class="advice">
          ${game.advice(p).map((x) => `<li class="${x.level}">${esc(x.text)}</li>`).join('') || '<li class="info">特に問題はありません。</li>'}
        </ul>
      </section>
    </div>

    <div class="grid g2">
      <section class="panel">
        <h2>図鑑説明</h2>
        <p style="font-size:14px">${esc(sp.dex)}</p>
        <div class="row" style="margin-top:12px">
          <span class="chip">適正潅水 ${sp.water}日</span>
          <span class="chip">適正日照 ${sp.light}</span>
          <span class="chip">成長 ×${sp.growth}</span>
        </div>
        ${p.parents ? `<h3>交種構造</h3><div class="row">
          <span class="chip on" style="--accent:var(--gold)">F${p.gen}</span>
          <span>${esc(p.parents[0].name)}</span><span style="color:var(--dim)">×</span><span>${esc(p.parents[1].name)}</span>
        </div>` : ''}
      </section>

      <section class="panel">
        <h2>ケア記録とコミュニティ比較</h2>
        ${[['平均潅水間隔', iv ? `${iv} 日` : '—', `${community.waterMean} 日`, iv, community.waterMean],
           ['推定照度', `${game.estimatedLux(p).toLocaleString()} lx`, `${community.luxMean.toLocaleString()} lx`, game.estimatedLux(p), community.luxMean],
           ['日照時間', p.lightHours ? `${p.lightHours} h` : '—', `${community.hoursMean} h`, p.lightHours, community.hoursMean],
        ].map(([label, mine, theirs, mv, tv]) => `
          <div style="margin-bottom:12px">
            <div class="lab" style="display:flex;justify-content:space-between;font-size:12px;color:var(--dim)">
              <span>${esc(label)}</span><b style="color:var(--ink)">${mine} <span style="color:var(--dim-2)">/ 平均 ${theirs}</span></b>
            </div>
            <div class="track sm" style="margin-top:4px"><span style="--mc:var(--agave);width:${mv ? pct(mv, Math.max(mv, tv) * 1.25) : 0}"></span></div>
            <div class="track sm" style="margin-top:3px"><span style="--mc:var(--dim-2);width:${pct(tv, Math.max(mv || 0, tv) * 1.25)}"></span></div>
          </div>`).join('')}
        <button class="btn sm ghost" data-light-measure="${p.id}">照度・日照時間を入力</button>
      </section>
    </div>

    <section class="panel">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">アルバム</h2>
        <div class="row">
          <button class="btn sm ghost" data-export="card" data-target="${p.id}">個体カード</button>
          <button class="btn sm ghost" data-export="story" data-target="${p.id}">ストーリー</button>
          <button class="btn sm ghost" data-export="pixel" data-target="${p.id}">ピクセルPNG</button>
          <button class="btn sm ghost" data-export="strip" data-target="${p.id}">成長ストリップ</button>
        </div>
      </div>
      ${a && b && a.id !== b.id ? `
        <div class="grid g2" style="margin-top:16px">
          <div>
            <div class="label" style="margin-bottom:6px">最初 ↔ 最新</div>
            <div class="compare" id="compare" style="--split:50%">
              <img data-image="${a.photoId}" alt="最初" />
              <img class="after" data-image="${b.photoId}" alt="最新" />
              <div class="handle"></div>
              <div class="cap l">${fmtDate(a.t)}</div><div class="cap r">${fmtDate(b.t)}</div>
            </div>
          </div>
          <div>
            <div class="label" style="margin-bottom:6px">ドット絵の変遷</div>
            <div class="grid g4">
              ${p.album.slice(0, 8).reverse().map((x) => `
                <div><div class="sprite-frame" style="--accent:${accent}"><img class="sprite" data-image="${x.spriteId}" alt="" /></div>
                <div class="label" style="text-align:center;margin-top:4px">${fmtDate(x.t)}</div></div>`).join('')}
            </div>
          </div>
        </div>` : ''}
      <div class="grid g4" style="margin-top:16px">
        ${p.album.map((x) => `
          <div class="panel" style="padding:8px;box-shadow:none">
            <img data-image="${x.photoId}" alt="" style="border:2px solid var(--line)" />
            <div class="label" style="margin-top:6px">${fmtDate(x.t)} · ${esc(STAGES[x.stage].ja)}</div>
            ${x.note ? `<div class="hint">${esc(x.note)}</div>` : ''}
          </div>`).join('')
          || '<p class="hint">まだ写真がありません。実物を1枚撮ると、そこからドット絵と個性値が生成されます。</p>'}
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
    ${withBadge && n.key === 'home' && alerts ? `<span class="badge">${alerts}</span>` : ''}
  </button>`;
  $('#rail-nav').innerHTML = NAV.map((n) => item(n, true)).join('');
  $('#tabbar').innerHTML = NAV.filter((n) => ['home', 'collection', 'dex', 'contest', 'settings'].includes(n.key))
    .map((n) => item(n, false)).join('');
}

export function render() {
  const views = {
    home: viewHome, collection: viewCollection, dex: viewDex, log: viewLog,
    contest: viewContest, lab: viewLab, shop: viewShop, settings: viewSettings,
  };
  $('#view').innerHTML = route.view === 'plant' ? viewPlant(route.param) : (views[route.view] || viewHome)();
  $('#coin-rail').textContent = game.state.coins.toLocaleString();
  $('#coin-mobile').textContent = `⧫ ${game.state.coins.toLocaleString()}`;
  const s = game.season();
  $('#season-rail').textContent = `${s.icon} ${s.ja} / ${Math.floor(game.state.clock)}日目`;
  renderNav();
  mountSprites($('#view'));
  wireView();
}

/* ---------- ダイアログ ---------- */

function adoptDialog() {
  openModal('株を迎える', `
    <p class="hint">レア度が高いほど価格が上がります。迎えた時点で性格と個性値が決まり、
    最初の写真を記録すると実物の姿に同期します。</p>
    <div class="grid g3" style="margin-top:16px">
      ${SPECIES.map((sp) => {
        const price = STARTERS.includes(sp.id) ? 0 : sp.rarity * 260;
        const afford = game.state.coins >= price;
        return `<div class="panel" style="padding:12px;--accent:${WORLDS[sp.world].color};${afford ? '' : 'opacity:.45'}">
          <div class="sprite-frame" style="--accent:${WORLDS[sp.world].color}"><img class="sprite" data-species="${sp.id}" alt="" /></div>
          <div style="margin-top:8px"><b>${esc(sp.ja)}</b> <span class="label">No.${String(sp.no).padStart(3, '0')}</span></div>
          <div class="row" style="margin:6px 0">${typeBadges(sp.types)}</div>
          <div class="hint">${esc(sp.dex)}</div>
          <div class="label" style="margin-top:6px">潅水 ${sp.water}日 / 日照 ${sp.light} / ${'★'.repeat(sp.rarity)}</div>
          <button class="btn ${afford ? 'primary' : ''} sm block" style="margin-top:10px"
            data-adopt="${sp.id}" data-price="${price}" ${afford ? '' : 'disabled'}>
            ${price ? `${price} コイン` : '無償で迎える'}</button>
        </div>`;
      }).join('')}
    </div>`, (body) => {
    body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-adopt]');
      if (!btn) return;
      const price = Number(btn.dataset.price);
      if (game.state.coins < price) return;
      game.state.coins -= price;
      const p = game.adopt(btn.dataset.adopt);
      closeModal();
      toast(`${p.nickname} を迎えました。性格は「${p.nature.ja}」`, 'gold');
      go('plant', p.id);
    });
  }, { width: '980px' });
}

function photoDialog(plantId) {
  const p = game.plant(plantId);
  if (!p) return;
  const s = game.state.settings;
  let current = null, sourceImg = null;

  openModal(`${p.nickname} の写真を記録`, `
    <div class="dropzone" id="drop">
      <b>写真を選ぶ / ここにドロップ</b>
      <div class="hint" style="margin-top:8px">端末内で処理され、外部には送信されません。<br>
      株が中央に大きく写り、背景が単純な写真ほど綺麗に変換できます。</div>
      <input type="file" accept="image/*" id="file" hidden />
    </div>
    <div id="preview" style="display:none;margin-top:16px">
      <div class="grid g2">
        <div><div class="label" style="margin-bottom:6px">元写真</div>
          <img id="prev-photo" style="border:2px solid var(--line)" alt="" /></div>
        <div><div class="label" style="margin-bottom:6px">ドット絵</div>
          <div class="sprite-frame" style="--accent:${accentOf(p)}"><img class="sprite" id="prev-sprite" alt="" /></div></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="field"><label>解像度 <b class="num" id="v-grid">${s.grid}</b></label>
          <input type="range" id="o-grid" min="24" max="72" step="4" value="${s.grid}" /></div>
        <div class="field"><label>色数 <b class="num" id="v-colors">${s.colors}</b></label>
          <input type="range" id="o-colors" min="4" max="16" value="${s.colors}" /></div>
      </div>
      <div class="field"><label><input type="checkbox" id="o-dither" ${s.dither ? 'checked' : ''} /> ディザリング</label></div>
      <div class="field"><label>メモ(任意)</label><input type="text" id="o-note" placeholder="植え替え後 / 遮光を外した など" /></div>
      <div id="analysis" class="hint"></div>
      <div class="row" style="margin-top:16px">
        <button class="btn primary" id="save-photo">この姿で記録する(+30 EXP)</button>
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
      $('#analysis', body).innerHTML = `この写真から読み取った個性値 — ${
        GENE_KEYS.map((k) => `${GENES[k].ja} <b class="num">${Math.round(raw[k] ?? 50)}</b>`).join(' / ')}`;
    };
    const handle = async (f) => {
      if (!f) return;
      try {
        sourceImg = await loadImageFromFile(f);
        preview.style.display = 'block';
        drop.style.display = 'none';
        run();
      } catch (err) { toast(err.message || '画像を読み込めませんでした', 'bad'); }
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
      toast('写真を記録しました (+30 EXP)', 'gold');
      render();
    });
  }, { width: '860px' });
}

function measureDialog(plantId) {
  const p = game.plant(plantId);
  if (!p) return;
  openModal(`${p.nickname} の実測`, `
    <p class="hint">実寸を入れると経験値が入り、伸びた分だけ追加でもらえます。</p>
    <div class="grid g2" style="margin-top:14px">
      <div class="field"><label>株幅 (cm)</label><input type="number" id="m-d" step="0.1" min="0" value="${p.metrics.diameter || ''}" /></div>
      <div class="field"><label>葉数 (枚)</label><input type="number" id="m-l" step="1" min="0" value="${p.metrics.leaves || ''}" /></div>
      <div class="field"><label>草丈 / 塊根径 (cm)</label><input type="number" id="m-h" step="0.1" min="0" value="${p.metrics.height || ''}" /></div>
    </div>
    <button class="btn primary" id="save-m">${esc(t('action.save'))}</button>`, (body) => {
    $('#save-m', body).addEventListener('click', () => {
      const r = game.measure(p.id, {
        diameter: parseFloat($('#m-d', body).value),
        leaves: parseFloat($('#m-l', body).value),
        height: parseFloat($('#m-h', body).value),
      });
      closeModal();
      toast(`実測を記録しました (+${r.exp} EXP)`, 'gold');
      render();
    });
  });
}

function lightDialog(plantId) {
  const p = game.plant(plantId);
  openModal('照度・日照時間', `
    <p class="hint">照度計アプリなどで測った値を入れると、コミュニティ平均との比較が実測ベースになります。</p>
    <div class="grid g2" style="margin-top:14px">
      <div class="field"><label>照度 (lux)</label><input type="number" id="l-lux" value="${p.lux || ''}" /></div>
      <div class="field"><label>日照時間 (h)</label><input type="number" id="l-h" step="0.5" value="${p.lightHours || ''}" /></div>
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
  const beforeName = game.displayName(p);
  const res = game.evolve(plantId);
  if (!res.ok) { toast(res.message || '進化できません', 'bad'); return; }
  charCache.clear();
  const after = await characterUrl(p);

  const flash = document.createElement('div');
  flash.className = 'flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1100);

  openModal('進化', `
    <div class="evolve-scene">
      <div class="label">株のかたちが変わりはじめた…！</div>
      <div class="evolve-pair">
        <div>
          <div class="sprite-frame"><img class="sprite" src="${before}" alt="" /></div>
          <div class="label" style="text-align:center;margin-top:6px">${esc(beforeName)}</div>
        </div>
        <div class="arrow">➜</div>
        <div>
          <div class="sprite-frame" style="--accent:${accentOf(p)}"><img class="sprite" src="${after}" alt="" /></div>
          <div class="label" style="text-align:center;margin-top:6px;color:${accentOf(p)}">${esc(res.after)}</div>
        </div>
      </div>
      <h3 style="margin:0;font-size:20px">${esc(beforeName)} は ${esc(res.after)} に進化した！</h3>
      ${res.branch ? `<p class="hint" style="max-width:480px">
        <b style="color:${res.branch.color}">${esc(res.branch.ja)}系統</b>が確定。${esc(res.branch.ja_desc)}<br>
        タイプに <b>${esc(res.branch.type)}</b> が加わりました。</p>` : ''}
      <div class="row" style="justify-content:center">
        <button class="btn gold" data-export="card" data-target="${p.id}">個体カードを書き出す</button>
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
  if (!res.ok) { toast(res.message || '出品できません', 'bad'); return; }
  const p = game.plant(plantId);
  openModal(`${res.league.ja} — ${res.won ? '優勝！' : '入賞ならず'}`, `
    <div class="panel" style="--accent:var(--gold);margin-bottom:16px;box-shadow:none">
      <div class="label">審査員</div>
      <b>${esc(res.judge.ja)}</b> — ${esc(res.judge.comment)}
      <div class="row" style="margin-top:8px">
        <span>好みのタイプ:</span>${typeBadges([res.judge.likes])}
        <span class="chip ${res.myBonus > 1 ? 'on' : ''}" style="--accent:var(--gold)">
          あなたの補正 ×${res.myBonus}</span>
      </div>
    </div>
    <div class="row" style="justify-content:space-around;margin-bottom:18px">
      <div style="text-align:center">
        <div class="sprite-frame" style="width:120px;--accent:${accentOf(p)}"><img class="sprite" data-plant="${p.id}" alt="" /></div>
        <div class="label" style="margin-top:6px">${esc(p.nickname)}</div>
      </div>
      <div style="align-self:center;font-size:24px;color:var(--dim)">VS</div>
      <div style="text-align:center">
        <div class="sprite-frame" style="width:120px"><img class="sprite" data-species="${res.rival.speciesId}" alt="" /></div>
        <div class="label" style="margin-top:6px">${esc(res.rival.name)}</div>
      </div>
    </div>
    ${res.categories.map((c) => `
      <div class="meter" style="margin-bottom:10px">
        <div class="lab"><span>${esc(c.ja)} ${c.win ? '<span style="color:var(--agave)">◯</span>' : '<span style="color:var(--danger)">✕</span>'}</span>
          <b>${c.mine} <span style="color:var(--dim-2)">vs ${c.theirs}</span></b></div>
        <div class="track"><span style="--mc:${c.win ? 'var(--agave)' : 'var(--danger)'};width:${pct(c.mine, Math.max(c.mine, c.theirs))}"></span></div>
      </div>`).join('')}
    <p style="margin-top:16px;font-size:16px">${res.wins} / 5 部門 — 報酬 <b class="num" style="color:var(--gold)">+${res.reward}</b> コイン</p>`);
}

function speciesDialog(speciesId) {
  const sp = SPECIES_BY_ID[speciesId];
  const d = game.state.dex[speciesId];
  const c = game.communityFor(speciesId);
  openModal(`No.${String(sp.no).padStart(3, '0')} ${sp.ja}`, `
    <div class="row" style="align-items:flex-start;gap:20px">
      <div class="sprite-frame" style="width:170px;--accent:${WORLDS[sp.world].color}">
        <img class="sprite" data-species="${sp.id}" alt="" /></div>
      <div style="flex:1;min-width:220px">
        <div class="label">${esc(sp.category)} · ${esc(sp.en)}</div>
        <div class="row" style="margin:8px 0">${typeBadges(sp.types)}<span class="chip">${'★'.repeat(sp.rarity)}</span></div>
        <p style="font-size:14px">${esc(sp.dex)}</p>
        <div class="label">適正潅水 ${sp.water}日 / 適正日照 ${sp.light} / 成長 ×${sp.growth}</div>
      </div>
    </div>
    <h3>成長段階</h3>
    <div class="chain" style="display:flex;gap:6px;align-items:center;overflow-x:auto">
      ${STAGES.map((st, i) => `
        <div class="evo-node ${d && d.stages && d.stages[i] ? '' : 'locked'}">
          <div class="sprite-frame"><img class="sprite" data-species="${sp.id}" data-stage="${i}" alt="" /></div>
          <div class="nm">${esc(st.ja)}</div>
        </div>`).join('<span class="evo-arrow">▸</span>')}
    </div>
    <h3>系統コンプリート</h3>
    <div class="grid g4">
      ${BRANCH_KEYS.map((k) => {
        const has = d && d.forms && d.forms[k];
        return `<div class="panel" style="padding:10px;box-shadow:none;${has ? `border-color:${BRANCHES[k].color}` : 'opacity:.5'}">
          <b style="color:${BRANCHES[k].color}">${esc(BRANCHES[k].ja)}</b>
          <div class="hint" style="margin-top:4px">${esc(BRANCHES[k].ja_desc)}</div>
          <div class="label" style="margin-top:6px">${has ? '達成済み' : '未達成'}</div>
        </div>`;
      }).join('')}
    </div>
    <h3>コミュニティ傾向(端末内で生成した推定値)</h3>
    <div class="row" style="gap:22px">
      <div><div class="label">育てている人</div><b class="num">${c.growers.toLocaleString()}</b></div>
      <div><div class="label">平均潅水間隔</div><b class="num">${c.waterMean}日</b></div>
      <div><div class="label">平均照度</div><b class="num">${c.luxMean.toLocaleString()}lx</b></div>
    </div>`, () => {}, { width: '820px' });
}

async function handleExport(kind, targetId) {
  try {
    toast('画像を生成しています…');
    let url, name;
    if (kind === 'cover') {
      url = await exportCover(game, game.state.plants);
      name = 'pixagave-shelf.png';
    } else {
      const id = targetId || ($('#strip-plant') && $('#strip-plant').value) || (game.state.plants[0] || {}).id;
      const p = game.plant(id);
      if (!p) { toast('対象の株がありません', 'bad'); return; }
      const sprite = await characterUrl(p);
      if (kind === 'card') { url = await exportSpecCard(game, p, { sprite }); name = `pixagave-card-${p.nickname}.png`; }
      else if (kind === 'story') { url = await exportStory(game, p, { sprite }); name = `pixagave-story-${p.nickname}.png`; }
      else if (kind === 'pixel') { url = await exportPixelArt(p, { scale: 12, sprite }); name = `pixagave-pixel-${p.nickname}.png`; }
      else if (kind === 'strip') { url = await exportGrowthStrip(game, p); name = `pixagave-growth-${p.nickname}.png`; }
    }
    if (!url) return;
    downloadDataUrl(url, name);
    toast('書き出しました', 'gold');
  } catch (err) {
    toast(err.message || '書き出しに失敗しました', 'bad');
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
  for (const [id, key] of [['#set-grid', 'grid'], ['#set-colors', 'colors']]) {
    const el = $(id, view);
    if (!el) continue;
    el.addEventListener('input', () => {
      game.state.settings[key] = Number(el.value);
      const lab = $(`#lab-${key}`, view);
      if (lab) lab.textContent = el.value;
      game.save();
    });
  }
  const dith = $('#set-dither', view);
  if (dith) dith.addEventListener('change', () => { game.state.settings.dither = dith.checked; game.save(); });
}

export function wireGlobal() {
  document.body.addEventListener('click', async (e) => {
    const pick = (sel) => e.target.closest(sel);
    let el;

    if ((el = pick('[data-nav]'))) return go(el.dataset.nav);
    if ((el = pick('[data-open-plant]'))) return go('plant', el.dataset.openPlant);
    if ((el = pick('[data-open-species]'))) return speciesDialog(el.dataset.openSpecies);
    if (pick('[data-adopt-dialog]')) return adoptDialog();
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
    if ((el = pick('[data-fert]'))) {
      const r = game.fertilize(el.dataset.fert);
      toast(r.message, r.ok ? '' : 'bad');
      return render();
    }
    if ((el = pick('[data-treat]'))) {
      const r = game.treat(el.dataset.treat);
      toast(r.message, r.ok ? '' : 'bad');
      charCache.clear();
      return render();
    }
    if ((el = pick('[data-buy]'))) {
      const r = game.buy(el.dataset.buy);
      toast(r.message, r.ok ? 'gold' : 'bad');
      return render();
    }
    if ((el = pick('[data-sell]'))) {
      const p = game.plant(el.dataset.sell);
      if (!confirm(`${p.nickname} を譲渡します。記録も消えます。よろしいですか?`)) return;
      const r = game.sell(el.dataset.sell);
      toast(`+${r.price} コイン`, 'gold');
      return go('collection');
    }
    if ((el = pick('[data-rename]'))) {
      const p = game.plant(el.dataset.rename);
      const name = prompt('新しい名前', p.nickname);
      if (name) { game.rename(p.id, name); render(); }
      return;
    }
    if ((el = pick('[data-pace]'))) {
      game.setPace(el.dataset.pace);
      toast(`ペースを「${PACES[el.dataset.pace].ja}」にしました`);
      return render();
    }
    if (pick('[data-cross]')) {
      const r = game.cross($('#cross-a').value, $('#cross-b').value);
      if (!r.ok) return toast(r.message, 'bad');
      toast(`交配成功: ${r.child.nickname}${r.mutation ? ` — ${r.mutation}` : ''}`, 'gold');
      return go('plant', r.child.id);
    }
    if ((el = pick('[data-warp]'))) {
      game.warp(Number(el.dataset.warp));
      charCache.clear();
      toast(`ゲーム内で ${el.dataset.warp} 日進めました`);
      return render();
    }
    if (pick('[data-export-data]')) {
      const json = await exportAll(game.state);
      downloadDataUrl(`data:application/json;charset=utf-8,${encodeURIComponent(json)}`, 'pixagave-backup.json');
      return toast('バックアップを書き出しました', 'gold');
    }
    if (pick('[data-import-data]')) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = async () => {
        try { await importAll(await input.files[0].text()); location.reload(); }
        catch (err) { toast(err.message || '読み込みに失敗しました', 'bad'); }
      };
      input.click();
      return;
    }
    if (pick('[data-reset]')) {
      if (!confirm('すべてのデータを削除して初期化します。よろしいですか?')) return;
      clearSave();
      location.reload();
    }
  });
}

export { charCache };
