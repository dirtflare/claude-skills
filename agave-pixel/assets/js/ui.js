/* PIXAGAVE — UI レイヤ
 * ルーティング / 画面描画 / モーダル / スプライトの遅延生成
 */

import {
  game, SPECIES, SPECIES_BY_ID, STAGES, BRANCHES, SHOP, QUESTS, STARTERS,
  seasonOf, isDormant, growthFactor, DAY,
} from './game.js';
import { WORLDS, GENES, GENE_KEYS, I18N } from './data.js';
import { getImage, putImage, uid, exportAll, importAll, clearSave } from './store.js';
import { pixelizePhoto, loadImageFromFile, loadImageFromUrl } from './pixelize.js';
import { proceduralSprite, composeCharacter } from './sprite.js';
import {
  exportSpecCard, exportStory, exportCover, exportGrowthStrip, exportPixelArt, downloadDataUrl,
} from './creator.js';

/* ---------- 基本ヘルパ ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const pct = (v, max = 100) => `${clamp((v / max) * 100, 0, 100).toFixed(1)}%`;

export function t(key) {
  const lang = game.state.lang || 'ja';
  return (I18N[lang] && I18N[lang][key]) || I18N.ja[key] || key;
}

const fmtDate = (t) => new Date(t).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtShort = (t) => new Date(t).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });

export function toast(message, kind = '') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* ---------- モーダル ---------- */

let modalCleanup = null;

export function openModal(title, bodyHtml, onMount, opts = {}) {
  closeModal();
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="${opts.width ? `width:min(${opts.width},100%)` : ''}">
      <header>
        <h2>${esc(title)}</h2>
        <button class="btn sm" data-close>${esc(t('action.close'))}</button>
      </header>
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

/* ---------- スプライト解決 ---------- */

const charCache = new Map();

async function ensureSprite(p) {
  if (p.spriteId) {
    const existing = await getImage(p.spriteId);
    if (existing) return existing;
  }
  const sp = game.species(p);
  const data = proceduralSprite(sp, p.genes, p.id);
  const key = uid('spr');
  await putImage(key, data);
  p.spriteId = key;
  game.save();
  return data;
}

export async function characterUrl(p) {
  const key = `${p.id}:${p.spriteId}:${p.stage}:${p.branch}:${Math.round(p.pest / 25)}`;
  if (charCache.has(key)) return charCache.get(key);
  const data = await ensureSprite(p);
  const img = await loadImageFromUrl(data);
  const sp = game.species(p);
  const c = composeCharacter(img, {
    stage: p.stage, branch: p.branch, genes: p.genes,
    world: sp.world, pest: p.pest, seed: p.id,
  });
  const url = c.toDataURL('image/png');
  charCache.set(key, url);
  return url;
}

/* data-plant / data-species を持つ img に非同期でスプライトを流し込む */
export async function mountSprites(root = document) {
  for (const el of $$('img[data-plant]', root)) {
    const p = game.plant(el.dataset.plant);
    if (!p) continue;
    try { el.src = await characterUrl(p); } catch { /* noop */ }
  }
  for (const el of $$('img[data-species]', root)) {
    const sp = SPECIES_BY_ID[el.dataset.species];
    if (!sp) continue;
    const key = `sp:${sp.id}`;
    if (!charCache.has(key)) {
      const data = proceduralSprite(sp, sp.bias, `dex:${sp.id}`);
      const img = await loadImageFromUrl(data);
      charCache.set(key, composeCharacter(img, {
        stage: 3, branch: null, genes: sp.bias, world: sp.world, pest: 0, seed: sp.id,
      }).toDataURL('image/png'));
    }
    el.src = charCache.get(key);
  }
  for (const el of $$('img[data-image]', root)) {
    const data = await getImage(el.dataset.image);
    if (data) el.src = data;
  }
}

const accentOf = (p) => (p.branch ? BRANCHES[p.branch].color : WORLDS[game.species(p).world].color);

/* ---------- 部品 ---------- */

function meter(label, value, max, color) {
  return `<div class="meter">
    <div class="lab"><span>${esc(label)}</span><b>${Math.round(value)}${max === 100 ? '' : ` / ${max}`}</b></div>
    <div class="track"><span style="--mc:${color};width:${pct(value, max)}"></span></div>
  </div>`;
}

function plantCard(p) {
  const sp = game.species(p);
  const accent = accentOf(p);
  const alert = p.care.hydration < 10 || p.pest > 40 || p.care.health < 45;
  return `<button class="plant-card" data-open-plant="${p.id}" style="--accent:${accent};position:relative">
    ${alert ? '<span class="badge-alert" aria-label="要対応"></span>' : ''}
    <div class="sprite-frame" style="--accent:${accent}">
      <img class="sprite" data-plant="${p.id}" alt="${esc(game.displayName(p))}" />
    </div>
    <div>
      <div class="name">${esc(p.nickname)}</div>
      <div class="meta">${esc(game.displayName(p))} · ${game.score(p)}pts</div>
    </div>
    <div class="bars">
      <div class="mini" style="--mc:#5fd6ff"><span style="width:${pct(p.care.hydration, 110)}"></span></div>
      <div class="mini" style="--mc:${accent}"><span style="width:${pct(p.exp, Math.max(200, p.exp))}"></span></div>
    </div>
  </button>`;
}

function seasonBanner() {
  const s = seasonOf(new Date(game.now()));
  const dormant = game.state.plants.filter((p) => isDormant(game.species(p), s));
  return `<div class="card" style="--accent:${s.key === 'winter' ? '#8ab6ff' : 'var(--agave)'}">
    <div class="row">
      <div style="font-size:26px">${s.icon}</div>
      <div>
        <div class="tag">SEASON</div>
        <div><b>${s.ja}</b> — 平均 ${s.temp}℃ 想定</div>
      </div>
      <div class="spacer"></div>
      <div style="text-align:right">
        <div class="tag">DORMANT</div>
        <div>${dormant.length} 株が休眠期</div>
      </div>
    </div>
    ${dormant.length ? `<p class="hint" style="margin:10px 0 0">休眠中の株は水の消費が落ち、進化判定も止まります: ${dormant.map((p) => esc(p.nickname)).join(' / ')}</p>` : ''}
  </div>`;
}

/* ---------- 画面: ホーム ---------- */

function viewHome() {
  const st = game.state;
  const plants = st.plants;
  const needs = plants
    .map((p) => ({ p, urgency: (p.care.hydration < 14 ? 3 : 0) + (p.pest > 35 ? 2 : 0) + (p.care.health < 50 ? 2 : 0) }))
    .filter((x) => x.urgency > 0)
    .sort((a, b) => b.urgency - a.urgency);
  const evolvable = plants.filter((p) => game.evolveCheck(p).ok);
  const totals = game.communityTotals();
  const questsDone = Object.keys(st.quests).length;

  return `
  <div class="topbar">
    <div>
      <div class="tag">${esc(t('home.today'))}</div>
      <h1>おかえりなさい</h1>
      <div class="sub">${st.stats.streak} 日連続 / 総育成 ${st.stats.days} 日 / ${plants.length} 株</div>
    </div>
    <div class="row">
      <button class="btn primary" data-nav="collection">コレクションを見る</button>
      <button class="btn" data-adopt-dialog>株を迎える</button>
    </div>
  </div>

  <div class="grid g2" style="margin-bottom:16px">
    ${seasonBanner()}
    <div class="card">
      <h2>ミッション</h2>
      <div class="meter" style="margin-bottom:10px">
        <div class="lab"><span>達成</span><b>${questsDone} / ${QUESTS.length}</b></div>
        <div class="track"><span style="--mc:var(--gold);width:${pct(questsDone, QUESTS.length)}"></span></div>
      </div>
      ${QUESTS.filter((q) => !st.quests[q.id]).slice(0, 3).map((q) =>
        `<div class="row" style="justify-content:space-between;font-size:13px;padding:4px 0">
          <span>${esc(q.ja)}</span><span class="mono" style="color:var(--gold)">+${q.reward}</span>
        </div>`).join('') || '<p class="hint">すべて達成しました。</p>'}
    </div>
  </div>

  ${evolvable.length ? `<div class="card" style="margin-bottom:16px;--accent:var(--gold);border-color:#ffd16644">
    <h2 style="color:var(--gold)">進化できる株が ${evolvable.length} 株います</h2>
    <div class="row">${evolvable.map((p) =>
      `<button class="btn gold sm" data-open-plant="${p.id}">${esc(p.nickname)} → ${esc(STAGES[p.stage + 1].ja)}</button>`).join('')}</div>
  </div>` : ''}

  <div class="card" style="margin-bottom:16px">
    <h2>今日のケア</h2>
    ${needs.length
      ? `<div class="grid g4">${needs.map((x) => plantCard(x.p)).join('')}</div>`
      : plants.length
        ? '<p class="hint">対応が必要な株はありません。良い管理です。</p>'
        : `<div class="dropzone" data-adopt-dialog>${esc(t('home.noplant'))} — ${esc(t('home.start'))}</div>`}
  </div>

  <div class="grid g2">
    <div class="card">
      <h2>コミュニティシグナル</h2>
      <div class="row" style="gap:22px">
        <div><div class="tag">SPECIES</div><b class="mono" style="font-size:22px">${totals.species}</b></div>
        <div><div class="tag">PHOTOS</div><b class="mono" style="font-size:22px">${totals.photos.toLocaleString()}</b></div>
        <div><div class="tag">TRAINERS</div><b class="mono" style="font-size:22px">${totals.trainers.toLocaleString()}</b></div>
      </div>
      <p class="hint" style="margin-top:10px">
        コミュニティ値はサーバを持たないため、品種ごとに再現可能な擬似コホートを端末内で生成した<b>推定値</b>です。
        自分の記録 (${totals.myPhotos} 枚 / ${totals.mySpecies} 品種) だけが実データです。
      </p>
    </div>
    <div class="card">
      <h2>最近の出来事</h2>
      ${st.log.slice(0, 7).map((l) =>
        `<div style="font-size:13px;padding:4px 0;border-bottom:1px solid var(--line)">
          <span class="mono" style="color:var(--dim-2)">${fmtShort(l.t)}</span> ${esc(l.text)}
        </div>`).join('') || '<p class="hint">まだ記録がありません。</p>'}
    </div>
  </div>`;
}

/* ---------- 画面: コレクション ---------- */

function viewCollection() {
  const plants = [...game.state.plants].sort((a, b) => game.score(b) - game.score(a));
  return `
  <div class="topbar">
    <div>
      <div class="tag">COLLECTION</div>
      <h1>棚</h1>
      <div class="sub">${plants.length} 株 / 合計スコア ${plants.reduce((a, p) => a + game.score(p), 0)}</div>
    </div>
    <div class="row">
      <button class="btn" data-export="cover">コレクションカバーを書き出す</button>
      <button class="btn primary" data-adopt-dialog>株を迎える</button>
    </div>
  </div>
  ${plants.length
    ? `<div class="grid g3">${plants.map(plantCard).join('')}</div>`
    : '<div class="card"><p class="hint">まだ株がありません。「株を迎える」から始めてください。</p></div>'}`;
}

/* ---------- 画面: 図鑑 ---------- */

function viewDex() {
  const prog = game.dexProgress();
  const sections = Object.entries(WORLDS).map(([key, w]) => {
    const list = SPECIES.filter((s) => s.world === key);
    return `<div class="card" style="--accent:${w.color};margin-bottom:16px">
      <h2 style="color:${w.color}">${w.ja} <span class="tag">${w.en}</span></h2>
      <div class="grid g4">
        ${list.map((sp, i) => {
          const d = game.state.dex[sp.id];
          const forms = d ? Object.keys(d.forms || {}) : [];
          return `<div class="dex-cell ${d ? '' : 'locked'}" data-open-species="${sp.id}">
            <div class="no">No.${String(SPECIES.indexOf(sp) + 1).padStart(3, '0')}</div>
            <div class="sprite-frame" style="--accent:${w.color};margin:6px 0">
              <img class="sprite" data-species="${sp.id}" alt="" />
            </div>
            <div class="nm">${d ? esc(sp.ja) : '???'}</div>
            <div class="tag">${'★'.repeat(sp.rarity)}</div>
            <div class="forms">${Object.keys(BRANCHES).map((b) =>
              `<i style="background:${forms.includes(b) ? BRANCHES[b].color : '#ffffff14'}" title="${BRANCHES[b].ja}"></i>`).join('')}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  return `
  <div class="topbar">
    <div>
      <div class="tag">LIVING INDEX</div>
      <h1>図鑑</h1>
      <div class="sub">${prog.seen} / ${prog.total} 品種 · 系統 ${prog.forms} / ${prog.maxForms}</div>
    </div>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="meter">
      <div class="lab"><span>登録率</span><b>${prog.percent}%</b></div>
      <div class="track"><span style="--mc:var(--agave);width:${prog.percent}%"></span></div>
    </div>
    <p class="hint" style="margin:10px 0 0">
      1品種につき 4 系統(締型・錦・鬼爪・巨大)が存在します。同じ品種でも育て方を変えると別の系統に分岐します。
    </p>
  </div>
  ${sections}`;
}

/* ---------- 画面: 記録 ---------- */

function viewLog() {
  const events = [];
  for (const p of game.state.plants) {
    for (const e of p.events) events.push({ ...e, plant: p });
    for (const a of p.album) events.push({ t: a.t, type: 'photo', text: '記録写真を追加', plant: p, album: a });
  }
  events.sort((a, b) => b.t - a.t);
  const icon = { evolve: '⇧', photo: '◎', measure: '⌗', contest: '♜', birth: '✿', mutation: '✷' };

  return `
  <div class="topbar">
    <div>
      <div class="tag">GROWTH LOG</div>
      <h1>記録</h1>
      <div class="sub">${events.length} 件のイベント</div>
    </div>
    ${game.state.plants.length ? `<div class="row">
      <select class="btn" id="strip-plant">
        ${game.state.plants.map((p) => `<option value="${p.id}">${esc(p.nickname)}</option>`).join('')}
      </select>
      <button class="btn" data-export="strip">成長ストリップを書き出す</button>
    </div>` : ''}
  </div>
  <div class="card">
    <div class="timeline">
      ${events.slice(0, 80).map((e) => `
        <div class="item">
          <div>
            <div class="when">${fmtDate(e.t)}</div>
            ${e.album && e.album.photoId
              ? `<img class="thumb" data-image="${e.album.photoId}" alt="" />`
              : `<div class="sprite-frame" style="--accent:${accentOf(e.plant)};width:64px">
                   <img class="sprite" data-plant="${e.plant.id}" alt="" /></div>`}
          </div>
          <div>
            <div style="font-size:13px"><span style="color:var(--agave)">${icon[e.type] || '·'}</span>
              <b>${esc(e.plant.nickname)}</b> — ${esc(e.text)}</div>
            ${e.album && e.album.note ? `<div class="hint">${esc(e.album.note)}</div>` : ''}
            <button class="btn sm" style="margin-top:6px" data-open-plant="${e.plant.id}">個体を開く</button>
          </div>
        </div>`).join('') || '<p class="hint">まだ記録がありません。</p>'}
    </div>
  </div>`;
}

/* ---------- 画面: 品評会 ---------- */

function viewContest() {
  const plants = game.state.plants;
  const unlocked = game.state.stats.league;
  return `
  <div class="topbar">
    <div>
      <div class="tag">EXHIBITION</div>
      <h1>品評会</h1>
      <div class="sub">${game.state.stats.contestWins} 勝 / ${game.state.stats.contests} 回出品</div>
    </div>
  </div>
  ${plants.length ? `
  <div class="card" style="margin-bottom:16px">
    <h2>出品する株</h2>
    <select class="btn" id="contest-plant" style="width:100%;max-width:340px">
      ${plants.map((p) => `<option value="${p.id}">${esc(p.nickname)} — ${game.score(p)}pts</option>`).join('')}
    </select>
  </div>
  <div class="grid g2">
    ${game.LEAGUES.map((lg, i) => {
      const locked = i > unlocked;
      return `<div class="card" style="--accent:${locked ? 'var(--dim-2)' : 'var(--gold)'};${locked ? 'opacity:.5' : ''}">
        <h2>${esc(lg.ja)}</h2>
        <div class="row" style="justify-content:space-between">
          <span class="tag">必要スコア ${lg.min}</span>
          <span class="mono" style="color:var(--gold)">優勝 +${lg.reward}</span>
        </div>
        <button class="btn ${locked ? '' : 'primary'}" style="margin-top:12px;width:100%"
          data-contest="${i}" ${locked ? 'disabled' : ''}>
          ${locked ? '未解放(前の大会で優勝すると解放)' : '出品する'}
        </button>
      </div>`;
    }).join('')}
  </div>
  <div class="card" style="margin-top:16px">
    <h3>審査基準</h3>
    <p class="hint">姿(締まり・葉幅) / 気迫(棘) / 色(斑・白粉) / 貫禄(成長力・段階) / 管理(潅水の安定性・日照の適正・記録量)
    の5部門で審査し、3部門以上を取れば優勝です。管理部門は<b>実際のケア記録</b>から算出されるため、記録を残すほど有利になります。</p>
  </div>`
  : '<div class="card"><p class="hint">出品できる株がありません。</p></div>'}`;
}

/* ---------- 画面: ラボ ---------- */

function viewLab() {
  const mature = game.state.plants.filter((p) => p.stage >= 3);
  const lineage = game.state.plants.filter((p) => p.parents);
  return `
  <div class="topbar">
    <div>
      <div class="tag">HYBRID LAB</div>
      <h1>ラボ</h1>
      <div class="sub">交配用種子 ${game.state.items.seed} 個 / 成株 ${mature.length} 株</div>
    </div>
  </div>
  <div class="card" style="margin-bottom:16px">
    <h2>交配</h2>
    ${mature.length >= 2 ? `
      <div class="grid g2">
        <div class="field"><label>親 A</label>
          <select id="cross-a">${mature.map((p) => `<option value="${p.id}">${esc(p.nickname)} (${esc(game.displayName(p))})</option>`).join('')}</select>
        </div>
        <div class="field"><label>親 B</label>
          <select id="cross-b">${mature.map((p) => `<option value="${p.id}">${esc(p.nickname)} (${esc(game.displayName(p))})</option>`).join('')}</select>
        </div>
      </div>
      <button class="btn primary" data-cross ${game.state.items.seed <= 0 ? 'disabled' : ''}>交配する(種子 1 個)</button>
      <p class="hint" style="margin-top:10px">
        子株は両親の個性値の中間値に揺らぎを加えて生まれます。約 20% の確率で突然変異(斑の覚醒・巨大化・極端な矮性)が発現します。
      </p>`
      : '<p class="hint">交配には成株(段階4)以上が2株必要です。</p>'}
  </div>
  <div class="card">
    <h2>系統樹</h2>
    ${lineage.length ? lineage.map((p) => `
      <div style="padding:10px 0;border-bottom:1px solid var(--line)">
        <div class="row">
          <div class="sprite-frame" style="width:56px;--accent:${accentOf(p)}"><img class="sprite" data-plant="${p.id}" alt="" /></div>
          <div>
            <b>${esc(p.nickname)}</b> <span class="tag">F${p.gen}</span>
            <div class="hint">${esc(p.parents[0].name)} × ${esc(p.parents[1].name)}</div>
          </div>
          <div class="spacer"></div>
          <button class="btn sm" data-open-plant="${p.id}">開く</button>
        </div>
      </div>`).join('')
      : '<p class="hint">まだ交配個体はいません。</p>'}
  </div>`;
}

/* ---------- 画面: ショップ ---------- */

function viewShop() {
  const inv = game.state.items;
  return `
  <div class="topbar">
    <div>
      <div class="tag">SUPPLY</div>
      <h1>ショップ</h1>
      <div class="sub">所持 ${game.state.coins} コイン</div>
    </div>
  </div>
  <div class="grid g2" style="margin-bottom:16px">
    ${SHOP.map((item) => `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <h2 style="margin:0">${item.icon} ${esc(item.ja)}</h2>
          <span class="chip on" style="--accent:var(--gold)">所持 ${inv[item.id] || 0}</span>
        </div>
        <p class="hint" style="margin:8px 0 12px">${esc(item.ja_desc)}</p>
        <button class="btn ${game.state.coins >= item.price ? 'primary' : ''}" data-buy="${item.id}"
          ${game.state.coins < item.price ? 'disabled' : ''}>${item.price} コインで購入</button>
      </div>`).join('')}
  </div>
  <div class="card">
    <h2>譲渡(売却)</h2>
    <p class="hint">総合スコアとレア度に応じた価格で譲渡します。記録とアルバムも一緒に手放すことになります。</p>
    <div class="grid g4" style="margin-top:12px">
      ${game.state.plants.map((p) => `
        <div class="card" style="padding:10px">
          <div class="sprite-frame" style="--accent:${accentOf(p)}"><img class="sprite" data-plant="${p.id}" alt="" /></div>
          <div style="font-size:13px;margin-top:8px">${esc(p.nickname)}</div>
          <div class="tag">${Math.round(game.score(p) * 1.1 + game.species(p).rarity * 40)} コイン</div>
          <button class="btn danger sm" style="margin-top:8px;width:100%" data-sell="${p.id}">譲渡する</button>
        </div>`).join('') || '<p class="hint">株がありません。</p>'}
    </div>
  </div>`;
}

/* ---------- 画面: 設定 ---------- */

function viewSettings() {
  const s = game.state.settings;
  return `
  <div class="topbar">
    <div><div class="tag">SETTINGS</div><h1>設定</h1></div>
  </div>
  <div class="grid g2">
    <div class="card">
      <h2>表示</h2>
      <div class="field">
        <label>言語 / Language</label>
        <select id="set-lang">
          ${Object.keys(I18N).map((l) =>
            `<option value="${l}" ${game.state.lang === l ? 'selected' : ''}>${
              { ja: '日本語', en: 'English', 'zh-Hant': '繁體中文', 'zh-Hans': '简体中文', ko: '한국어', es: 'Español', fr: 'Français' }[l] || l
            }</option>`).join('')}
        </select>
        <span class="hint">ナビゲーションと操作ラベルに適用されます。</span>
      </div>
    </div>

    <div class="card">
      <h2>ピクセル変換</h2>
      <div class="field">
        <label>グリッド解像度: <b class="mono" id="lab-grid">${s.grid}</b> px</label>
        <input type="range" id="set-grid" min="24" max="72" step="4" value="${s.grid}" />
      </div>
      <div class="field">
        <label>色数: <b class="mono" id="lab-colors">${s.colors}</b></label>
        <input type="range" id="set-colors" min="4" max="16" step="1" value="${s.colors}" />
      </div>
      <div class="field">
        <label><input type="checkbox" id="set-dither" ${s.dither ? 'checked' : ''} /> ディザリングを使う</label>
        <span class="hint">階調の境目に細かい模様を入れて、色数を抑えたまま質感を残します。</span>
      </div>
    </div>

    <div class="card">
      <h2>データ</h2>
      <p class="hint">写真も記録もすべて端末内(localStorage / IndexedDB)に保存され、外部へは送信されません。</p>
      <div class="row" style="margin-top:12px">
        <button class="btn" data-export-data>書き出す(JSON)</button>
        <button class="btn" data-import-data>読み込む</button>
        <button class="btn danger" data-reset>すべて初期化</button>
      </div>
    </div>

    <div class="card">
      <h2>体験用ツール</h2>
      <p class="hint">進化条件は実際の育成期間(最大120日)を要求します。動作を確認したいときだけ時間を進めてください。</p>
      <div class="row" style="margin-top:12px">
        <button class="btn" data-warp="7">+7日</button>
        <button class="btn" data-warp="30">+30日</button>
        <button class="btn" data-warp="120">+120日</button>
      </div>
      <p class="hint" style="margin-top:10px">現在のオフセット: +${game.state.warpDays} 日</p>
    </div>

    <div class="card">
      <h2>このアプリについて</h2>
      <p class="hint">
        PIXAGAVE は「実物の写真をドット絵に変換し、実際の育成の進み方でキャラクターが進化する」という
        コンセプトのオリジナル実装です。特定の既存アプリの画像・コード・ブランドは使用していません。
        品種データと栽培の目安は一般的な園芸情報に基づく簡易モデルであり、実際の栽培判断は現物を見て行ってください。
      </p>
    </div>
  </div>`;
}

/* ---------- 画面: 個体詳細 ---------- */

function requirementRow(m) {
  return `<div class="meter" style="margin-bottom:8px">
    <div class="lab"><span>${esc(m.label)}</span><b>${m.have} / ${m.need}</b></div>
    <div class="track"><span style="--mc:var(--gold);width:${pct(m.have, m.need)}"></span></div>
  </div>`;
}

function viewPlant(id) {
  const p = game.plant(id);
  if (!p) return '<div class="card">株が見つかりません。</div>';
  const sp = game.species(p);
  const accent = accentOf(p);
  const check = game.evolveCheck(p);
  const lean = game.branchLean(p);
  const community = game.communityFor(sp.id);
  const iv = game.avgWaterInterval(p);
  const days = Math.floor(game.ageDays(p));
  const season = seasonOf(new Date(game.now()));
  const advice = game.advice(p);

  const compareA = p.album[p.album.length - 1];
  const compareB = p.album[0];

  return `
  <div class="topbar">
    <div>
      <button class="btn sm" data-nav="collection">← コレクション</button>
      <h1 style="margin-top:8px">${esc(p.nickname)}</h1>
      <div class="sub">${esc(game.displayName(p))} · ${esc(sp.en)} · ${days} 日目 · ${p.album.length} 記録</div>
    </div>
    <div class="row">
      <button class="btn" data-rename="${p.id}">名前を変える</button>
      <button class="btn primary" data-photo="${p.id}">${esc(t('action.photo'))}</button>
    </div>
  </div>

  <div class="card detail-hero" style="--accent:${accent};margin-bottom:16px">
    <div>
      <div class="sprite-frame" style="--accent:${accent}">
        <img class="sprite" data-plant="${p.id}" alt="${esc(game.displayName(p))}" style="width:82%" />
      </div>
      <div class="stage-track">
        ${STAGES.map((s, i) => `<div class="node ${i < p.stage ? 'done' : ''} ${i === p.stage ? 'cur done' : ''}">${esc(s.ja)}</div>`).join('')}
      </div>
      <div class="row" style="justify-content:center;margin-top:8px">
        <span class="chip on" style="--accent:${accent}">${esc(WORLDS[sp.world].ja)}</span>
        ${p.branch ? `<span class="chip on" style="--accent:${BRANCHES[p.branch].color}">${esc(BRANCHES[p.branch].ja)}系統</span>` : ''}
        <span class="chip">${'★'.repeat(sp.rarity)}</span>
        ${p.hybrid ? '<span class="chip on" style="--accent:var(--gold)">交配個体</span>' : ''}
      </div>
    </div>

    <div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
        ${meter(t('stat.hydration'), p.care.hydration, 110, '#5fd6ff')}
        ${meter(t('stat.nutrition'), p.care.nutrition, 100, '#a8e063')}
        ${meter(t('stat.health'), p.care.health, 100, accent)}
        ${meter('害虫', p.pest, 100, '#ff9f6a')}
      </div>

      <div class="field" style="margin-top:16px">
        <label>日照設定: <b class="mono" id="light-val">${p.light}</b> / 適正 ${sp.light}
          <span class="hint">(推定 ${game.estimatedLux(p).toLocaleString()} lx)</span></label>
        <input type="range" id="light-range" min="0" max="100" value="${p.light}" data-light="${p.id}" />
      </div>

      <div class="row">
        <button class="btn primary" data-water="${p.id}">${esc(t('action.water'))}</button>
        <button class="btn" data-fert="${p.id}">${esc(t('action.fert'))} (${game.state.items.fertilizer})</button>
        <button class="btn" data-treat="${p.id}">${esc(t('action.pest'))} (${game.state.items.medicine})</button>
        <button class="btn" data-measure="${p.id}">${esc(t('action.measure'))}</button>
      </div>

      <div class="row" style="margin-top:14px;gap:18px">
        <div><div class="tag">SCORE</div><b class="mono" style="font-size:20px">${game.score(p)}</b></div>
        <div><div class="tag">CARE</div><b class="mono" style="font-size:20px">${game.careQuality(p)}</b></div>
        <div><div class="tag">EXP</div><b class="mono" style="font-size:20px">${p.exp}</b></div>
        <div><div class="tag">SEASON</div><b style="font-size:16px">${season.icon} ${season.ja}
          ${isDormant(sp, season) ? '<span style="color:var(--gold)">休眠</span>' : `×${growthFactor(sp, season)}`}</b></div>
      </div>
    </div>
  </div>

  <div class="grid g2" style="margin-bottom:16px">
    <div class="card" style="--accent:var(--gold)">
      <h2>進化</h2>
      ${check.done
        ? '<p class="hint">完成株です。これ以上の段階はありません。</p>'
        : check.ok
          ? `<p style="color:var(--gold)">条件を満たしています。</p>
             <button class="btn gold" style="width:100%" data-evolve="${p.id}">${esc(STAGES[p.stage + 1].ja)} へ進化させる</button>`
          : `<p class="hint" style="margin-bottom:12px">${esc(STAGES[p.stage + 1].ja)} まであと:</p>
             ${check.missing.map(requirementRow).join('')}`}
      ${p.stage < 3 ? `
        <h3 style="margin-top:18px">系統の傾き</h3>
        <p class="hint" style="margin-bottom:10px">成株になった時点で最も比重の高い軸に確定します。育て方で誘導できます。</p>
        ${Object.entries(lean).sort((a, b) => b[1] - a[1]).map(([k, v]) => `
          <div class="meter" style="margin-bottom:6px">
            <div class="lab"><span style="color:${BRANCHES[k].color}">${esc(BRANCHES[k].ja)}</span><b>${v}%</b></div>
            <div class="track"><span style="--mc:${BRANCHES[k].color};width:${v}%"></span></div>
          </div>`).join('')}`
        : p.branch ? `<p class="hint" style="margin-top:14px">${esc(BRANCHES[p.branch].ja_desc)}</p>` : ''}
    </div>

    <div class="card">
      <h2>個性値</h2>
      <div class="gene-list">
        ${GENE_KEYS.map((k) => {
          const v = p.genes[k];
          const d = v - p.baseGenes[k];
          return `<div class="gene-row">
            <span>${GENES[k].icon} ${esc(GENES[k].ja)}</span>
            <div class="track"><span style="--mc:${accent};width:${pct(v)}"></span></div>
            <span class="val">${Math.round(v)}${d ? `<span class="delta" style="color:${d > 0 ? 'var(--agave)' : 'var(--danger)'}"> ${d > 0 ? '+' : ''}${Math.round(d)}</span>` : ''}</span>
          </div>`;
        }).join('')}
      </div>
      <p class="hint" style="margin-top:12px">
        個性値は写真の解析(輪郭・色分布・充填率)と品種バイアスから決まり、その後は<b>実際の管理内容</b>で少しずつ動きます。
        差分は初期値からの変化量です。
      </p>
    </div>
  </div>

  <div class="grid g2" style="margin-bottom:16px">
    <div class="card">
      <h2>棚メイトの所見</h2>
      <ul class="advice" style="margin:0;padding:0">
        ${advice.map((a) => `<li class="${a.level}">${esc(a.text)}</li>`).join('') || '<li class="info">特に問題はありません。</li>'}
      </ul>
    </div>

    <div class="card">
      <h2>ケア記録とコミュニティ比較</h2>
      ${[
        ['平均潅水間隔', iv ? `${iv} 日` : '—', `${community.waterMean} 日`, iv, community.waterMean],
        ['推定照度', `${game.estimatedLux(p).toLocaleString()} lx`, `${community.luxMean.toLocaleString()} lx`, game.estimatedLux(p), community.luxMean],
        ['日照時間', p.lightHours ? `${p.lightHours} h` : '—', `${community.hoursMean} h`, p.lightHours, community.hoursMean],
      ].map(([label, mine, theirs, mv, tv]) => `
        <div style="margin-bottom:12px">
          <div class="lab" style="display:flex;justify-content:space-between;font-size:12px;color:var(--dim)">
            <span>${esc(label)}</span><b style="color:var(--ink)">${mine} <span style="color:var(--dim-2)">/ 平均 ${theirs}</span></b>
          </div>
          <div class="track" style="margin-top:4px">
            <span style="--mc:var(--agave);width:${mv ? pct(mv, Math.max(mv, tv) * 1.25) : 0}"></span>
          </div>
          <div class="track" style="margin-top:3px;height:5px">
            <span style="--mc:var(--dim-2);width:${pct(tv, Math.max(mv || 0, tv) * 1.25)}"></span>
          </div>
        </div>`).join('')}
      <button class="btn sm" data-light-measure="${p.id}">照度・日照時間を入力</button>
      <p class="hint" style="margin-top:10px">平均値は端末内で生成した推定コホートです(${community.growers.toLocaleString()} 人規模を想定)。</p>
    </div>
  </div>

  ${p.parents ? `<div class="card" style="margin-bottom:16px">
    <h2>交種構造</h2>
    <div class="row">
      <span class="chip on" style="--accent:var(--gold)">F${p.gen}</span>
      <span>${esc(p.parents[0].name)}</span><span style="color:var(--dim)">×</span><span>${esc(p.parents[1].name)}</span>
    </div>
  </div>` : ''}

  <div class="card" style="margin-bottom:16px">
    <div class="row" style="justify-content:space-between">
      <h2 style="margin:0">アルバム</h2>
      <div class="row">
        <button class="btn sm" data-export="card" data-target="${p.id}">個体カード</button>
        <button class="btn sm" data-export="story" data-target="${p.id}">IG ストーリー</button>
        <button class="btn sm" data-export="pixel" data-target="${p.id}">ピクセルPNG</button>
        <button class="btn sm" data-export="strip" data-target="${p.id}">成長ストリップ</button>
      </div>
    </div>
    ${compareA && compareB && compareA.id !== compareB.id ? `
      <div class="grid g2" style="margin-top:14px">
        <div>
          <div class="tag" style="margin-bottom:6px">最初 ↔ 最新</div>
          <div class="compare" id="compare" style="--split:50%">
            <img data-image="${compareA.photoId}" alt="最初の記録" />
            <img class="after" data-image="${compareB.photoId}" alt="最新の記録" />
            <div class="handle"></div>
            <div class="cap l">${fmtShort(compareA.t)}</div>
            <div class="cap r">${fmtShort(compareB.t)}</div>
          </div>
        </div>
        <div>
          <div class="tag" style="margin-bottom:6px">ドット絵の変遷</div>
          <div class="grid g4">
            ${p.album.slice(0, 8).reverse().map((a) => `
              <div>
                <div class="sprite-frame" style="--accent:${accent}"><img class="sprite" data-image="${a.spriteId}" alt="" /></div>
                <div class="tag" style="text-align:center;margin-top:4px">${fmtShort(a.t)}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>` : ''}
    <div class="grid g4" style="margin-top:14px">
      ${p.album.map((a) => `
        <div class="card" style="padding:8px">
          <img data-image="${a.photoId}" alt="" style="border-radius:6px" />
          <div class="tag" style="margin-top:6px">${fmtDate(a.t)} · ${esc(STAGES[a.stage].ja)}</div>
          ${a.note ? `<div class="hint">${esc(a.note)}</div>` : ''}
        </div>`).join('') || '<p class="hint">まだ写真がありません。実物を1枚撮ると、そこからドット絵と個性値が生成されます。</p>'}
    </div>
  </div>

  <div class="card">
    <h2>出来事</h2>
    ${p.events.slice(0, 20).map((e) =>
      `<div style="font-size:13px;padding:5px 0;border-bottom:1px solid var(--line)">
        <span class="mono" style="color:var(--dim-2)">${fmtDate(e.t)}</span> ${esc(e.text)}</div>`).join('')}
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
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function renderNav() {
  const rail = $('#rail-nav');
  rail.innerHTML = NAV.map((n) => `
    <button data-nav="${n.key}" aria-current="${route.view === n.key}">
      <span class="ico">${n.icon}</span><span>${esc(t(n.label))}</span>
    </button>`).join('');
  const tabs = NAV.filter((n) => ['home', 'collection', 'dex', 'log', 'contest'].includes(n.key));
  $('#tabbar').innerHTML = tabs.map((n) => `
    <button data-nav="${n.key}" aria-current="${route.view === n.key}">
      <span class="ico">${n.icon}</span><span>${esc(t(n.label))}</span>
    </button>`).join('');
}

export function render() {
  const views = {
    home: viewHome, collection: viewCollection, dex: viewDex, log: viewLog,
    contest: viewContest, lab: viewLab, shop: viewShop, settings: viewSettings,
  };
  const html = route.view === 'plant' ? viewPlant(route.param) : (views[route.view] || viewHome)();
  $('#view').innerHTML = html;
  $('#coin-rail').textContent = game.state.coins.toLocaleString();
  $('#coin-mobile').textContent = `${game.state.coins.toLocaleString()} ⧫`;
  const s = seasonOf(new Date(game.now()));
  $('#season-rail').textContent = `${s.icon} ${s.ja} · ${game.state.plants.length} 株`;
  renderNav();
  mountSprites($('#view'));
  wireView();
}

/* ---------- ダイアログ ---------- */

function adoptDialog() {
  const list = SPECIES.filter((s) => STARTERS.includes(s.id) || game.state.coins >= s.rarity * 260);
  openModal('株を迎える', `
    <p class="hint">レア度が高いほど価格が上がります。迎えた直後は個性値が品種バイアスから仮生成され、
    最初の写真を記録した時点で実物の姿に同期します。</p>
    <div class="grid g3" style="margin-top:14px">
      ${SPECIES.map((sp) => {
        const price = STARTERS.includes(sp.id) ? 0 : sp.rarity * 260;
        const afford = game.state.coins >= price;
        return `<div class="card" style="padding:12px;--accent:${WORLDS[sp.world].color};${afford ? '' : 'opacity:.45'}">
          <div class="sprite-frame" style="--accent:${WORLDS[sp.world].color}"><img class="sprite" data-species="${sp.id}" alt="" /></div>
          <div style="margin-top:8px"><b>${esc(sp.ja)}</b> <span class="tag">${'★'.repeat(sp.rarity)}</span></div>
          <div class="hint" style="margin:4px 0 8px">${esc(sp.ja_note)}</div>
          <div class="tag">潅水 ${sp.water}日 / 日照 ${sp.light}</div>
          <button class="btn ${afford ? 'primary' : ''} sm" style="width:100%;margin-top:8px"
            data-adopt="${sp.id}" data-price="${price}" ${afford ? '' : 'disabled'}>
            ${price ? `${price} コインで迎える` : '無償で迎える'}
          </button>
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
        toast(`${p.nickname} を迎えました`, 'gold');
        go('plant', p.id);
      });
    }, { width: '900px' });
}

function photoDialog(plantId) {
  const p = game.plant(plantId);
  if (!p) return;
  const s = game.state.settings;
  let current = null;
  let sourceImg = null;

  openModal(`${p.nickname} の記録を追加`, `
    <div class="dropzone" id="drop">
      写真を選ぶ / ここにドロップ
      <div class="hint" style="margin-top:6px">端末内で処理され、外部には送信されません。株が中央に大きく写った写真ほど綺麗に変換できます。</div>
      <input type="file" accept="image/*" id="file" hidden />
    </div>
    <div id="preview" style="display:none;margin-top:16px">
      <div class="grid g2">
        <div>
          <div class="tag" style="margin-bottom:6px">元写真</div>
          <img id="prev-photo" style="border-radius:var(--r-sm);border:1px solid var(--line)" alt="" />
        </div>
        <div>
          <div class="tag" style="margin-bottom:6px">ドット絵</div>
          <div class="sprite-frame" style="--accent:${accentOf(p)}"><img class="sprite" id="prev-sprite" alt="" /></div>
        </div>
      </div>
      <div class="grid g2" style="margin-top:14px">
        <div class="field">
          <label>解像度 <b class="mono" id="v-grid">${s.grid}</b></label>
          <input type="range" id="o-grid" min="24" max="72" step="4" value="${s.grid}" />
        </div>
        <div class="field">
          <label>色数 <b class="mono" id="v-colors">${s.colors}</b></label>
          <input type="range" id="o-colors" min="4" max="16" value="${s.colors}" />
        </div>
      </div>
      <div class="field">
        <label><input type="checkbox" id="o-dither" ${s.dither ? 'checked' : ''} /> ディザリング</label>
      </div>
      <div class="field">
        <label>メモ(任意)</label>
        <input type="text" id="o-note" placeholder="植え替え後 / 遮光を外した など" />
      </div>
      <div id="analysis" class="hint"></div>
      <div class="row" style="margin-top:14px">
        <button class="btn primary" id="save-photo">この姿で記録する</button>
        <button class="btn" data-close>${esc(t('action.cancel'))}</button>
      </div>
    </div>`, (body) => {
    const drop = $('#drop', body);
    const file = $('#file', body);
    const preview = $('#preview', body);

    const run = () => {
      if (!sourceImg) return;
      const grid = Number($('#o-grid', body).value);
      const colors = Number($('#o-colors', body).value);
      const dither = $('#o-dither', body).checked;
      $('#v-grid', body).textContent = grid;
      $('#v-colors', body).textContent = colors;
      current = pixelizePhoto(sourceImg, { species: game.species(p), grid, colors, dither });
      $('#prev-sprite', body).src = current.sprite;
      $('#prev-photo', body).src = current.thumb;
      const raw = current.analysis.raw || {};
      $('#analysis', body).innerHTML = `解析結果 — ${GENE_KEYS
        .map((k) => `${GENES[k].ja} ${Math.round(raw[k] ?? 50)}`).join(' / ')}`;
    };

    const handleFile = async (f) => {
      if (!f) return;
      try {
        sourceImg = await loadImageFromFile(f);
        preview.style.display = 'block';
        drop.style.display = 'none';
        run();
      } catch (err) {
        toast(err.message || '画像を読み込めませんでした', 'bad');
      }
    };

    drop.addEventListener('click', () => file.click());
    file.addEventListener('change', () => handleFile(file.files[0]));
    ['dragover', 'dragenter'].forEach((ev) =>
      drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) =>
      drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));

    for (const id of ['#o-grid', '#o-colors', '#o-dither']) {
      $(id, body).addEventListener('input', run);
    }

    $('#save-photo', body).addEventListener('click', async () => {
      if (!current) return;
      const spriteId = uid('spr');
      const photoId = uid('ph');
      await putImage(spriteId, current.sprite);
      await putImage(photoId, current.thumb);
      game.addPhoto(p.id, {
        photoId, spriteId, analysis: current.analysis,
        note: $('#o-note', body).value.trim(),
      });
      charCache.clear();
      closeModal();
      toast('記録を追加しました (+25 EXP)', 'gold');
      render();
    });
  }, { width: '820px' });
}

function measureDialog(plantId) {
  const p = game.plant(plantId);
  if (!p) return;
  openModal(`${p.nickname} の実測`, `
    <p class="hint">株の実寸を入れると進化条件の「実測の伸び」が有効になり、伸びた分だけ経験値が増えます。</p>
    <div class="grid g2" style="margin-top:12px">
      <div class="field"><label>株幅 (cm)</label>
        <input type="number" id="m-d" step="0.1" min="0" value="${p.metrics.diameter || ''}" /></div>
      <div class="field"><label>葉数 (枚)</label>
        <input type="number" id="m-l" step="1" min="0" value="${p.metrics.leaves || ''}" /></div>
      <div class="field"><label>草丈 / 塊根径 (cm)</label>
        <input type="number" id="m-h" step="0.1" min="0" value="${p.metrics.height || ''}" /></div>
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
    <div class="grid g2" style="margin-top:12px">
      <div class="field"><label>照度 (lux)</label><input type="number" id="l-lux" value="${p.lux || ''}" /></div>
      <div class="field"><label>日照時間 (h)</label><input type="number" id="l-h" step="0.5" value="${p.lightHours || ''}" /></div>
    </div>
    <button class="btn primary" id="save-l">${esc(t('action.save'))}</button>`, (body) => {
    $('#save-l', body).addEventListener('click', () => {
      game.setLightMeasure(p.id, {
        lux: parseFloat($('#l-lux', body).value),
        hours: parseFloat($('#l-h', body).value),
      });
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
  flash.className = 'evolve-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1200);

  openModal('進化', `
    <div class="evolve-stage">
      <div class="evolve-sprites">
        <div>
          <div class="sprite-frame"><img class="sprite" src="${before}" alt="" /></div>
          <div class="tag" style="text-align:center;margin-top:6px">${esc(beforeName)}</div>
        </div>
        <div class="arrow-evolve">➜</div>
        <div>
          <div class="sprite-frame" style="--accent:${accentOf(p)}"><img class="sprite" src="${after}" alt="" /></div>
          <div class="tag" style="text-align:center;margin-top:6px;color:${accentOf(p)}">${esc(res.after)}</div>
        </div>
      </div>
      <h3 style="margin:6px 0 0">${esc(beforeName)} は ${esc(res.after)} に進化した！</h3>
      ${res.branch ? `<p class="hint" style="max-width:460px">
        <b style="color:${res.branch.color}">${esc(res.branch.ja)}系統</b>が確定しました。${esc(res.branch.ja_desc)}</p>` : ''}
      <div class="row" style="justify-content:center">
        <button class="btn primary" data-export="card" data-target="${p.id}">個体カードを書き出す</button>
        <button class="btn" data-close>${esc(t('action.close'))}</button>
      </div>
    </div>`, (body) => {
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-export]');
      if (b) handleExport(b.dataset.export, b.dataset.target);
    });
  });
}

function contestDialog(leagueIndex) {
  const sel = $('#contest-plant');
  const plantId = sel ? sel.value : (game.state.plants[0] || {}).id;
  const res = game.contest(plantId, Number(leagueIndex));
  if (!res.ok) { toast(res.message || '出品できません', 'bad'); return; }
  const p = game.plant(plantId);
  openModal(`${res.league.ja} — ${res.won ? '優勝' : '入賞ならず'}`, `
    <div class="row" style="justify-content:space-around;margin-bottom:16px">
      <div style="text-align:center">
        <div class="sprite-frame" style="width:110px;--accent:${accentOf(p)}"><img class="sprite" data-plant="${p.id}" alt="" /></div>
        <div class="tag" style="margin-top:6px">${esc(p.nickname)}</div>
      </div>
      <div style="font-size:24px;align-self:center;color:var(--dim)">VS</div>
      <div style="text-align:center">
        <div class="sprite-frame" style="width:110px"><img class="sprite" data-species="${res.rival.speciesId}" alt="" /></div>
        <div class="tag" style="margin-top:6px">${esc(res.rival.name)}</div>
      </div>
    </div>
    ${res.categories.map((c) => `
      <div class="meter" style="margin-bottom:10px">
        <div class="lab"><span>${esc(c.ja)} ${c.win ? '<span style="color:var(--agave)">◯</span>' : '<span style="color:var(--danger)">✕</span>'}</span>
          <b>${c.mine} <span style="color:var(--dim-2)">vs ${c.theirs}</span></b></div>
        <div class="track"><span style="--mc:${c.win ? 'var(--agave)' : 'var(--danger)'};width:${pct(c.mine, Math.max(c.mine, c.theirs))}"></span></div>
      </div>`).join('')}
    <p style="margin-top:14px">${res.wins} / 5 部門で勝利 — 報酬 <b class="mono" style="color:var(--gold)">+${res.reward} コイン</b></p>`,
  () => {});
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
      await ensureSprite(p);
      const sprite = await characterUrl(p);
      if (kind === 'card') { url = await exportSpecCard(game, p, { sprite }); name = `pixagave-card-${p.nickname}.png`; }
      else if (kind === 'story') { url = await exportStory(game, p, { sprite }); name = `pixagave-story-${p.nickname}.png`; }
      else if (kind === 'pixel') { url = await exportPixelArt(p, { scale: 16, sprite }); name = `pixagave-pixel-${p.nickname}.png`; }
      else if (kind === 'strip') { url = await exportGrowthStrip(game, p); name = `pixagave-growth-${p.nickname}.png`; }
    }
    if (!url) return;
    downloadDataUrl(url, name);
    toast('書き出しました', 'gold');
  } catch (err) {
    toast(err.message || '書き出しに失敗しました', 'bad');
  }
}

function speciesDialog(speciesId) {
  const sp = SPECIES_BY_ID[speciesId];
  const d = game.state.dex[speciesId];
  const c = game.communityFor(speciesId);
  openModal(`${sp.ja} / ${sp.en}`, `
    <div class="row" style="align-items:flex-start;gap:18px">
      <div class="sprite-frame" style="width:150px;--accent:${WORLDS[sp.world].color}">
        <img class="sprite" data-species="${sp.id}" alt="" /></div>
      <div style="flex:1;min-width:220px">
        <div class="row"><span class="chip on" style="--accent:${WORLDS[sp.world].color}">${WORLDS[sp.world].ja}</span>
          <span class="chip">${'★'.repeat(sp.rarity)}</span>
          ${d ? '<span class="chip on" style="--accent:var(--gold)">登録済み</span>' : '<span class="chip">未登録</span>'}</div>
        <p style="margin:10px 0">${esc(sp.ja_note)}</p>
        <div class="tag">適正潅水間隔 ${sp.water} 日 / 適正日照 ${sp.light} / 成長係数 ${sp.growth}</div>
      </div>
    </div>
    <h3 style="margin-top:18px">系統コンプリート</h3>
    <div class="grid g4">
      ${Object.entries(BRANCHES).map(([k, b]) => {
        const has = d && d.forms && d.forms[k];
        return `<div class="card" style="padding:10px;${has ? `border-color:${b.color}66` : 'opacity:.5'}">
          <b style="color:${b.color}">${esc(b.ja)}</b>
          <div class="hint" style="margin-top:4px">${esc(b.ja_desc)}</div>
          <div class="tag" style="margin-top:6px">${has ? '達成' : '未達成'}</div>
        </div>`;
      }).join('')}
    </div>
    <h3 style="margin-top:18px">この品種のコミュニティ傾向(推定)</h3>
    <div class="row" style="gap:22px">
      <div><div class="tag">育てている人</div><b class="mono">${c.growers.toLocaleString()}</b></div>
      <div><div class="tag">平均潅水間隔</div><b class="mono">${c.waterMean} 日</b></div>
      <div><div class="tag">平均照度</div><b class="mono">${c.luxMean.toLocaleString()} lx</b></div>
      <div><div class="tag">平均日照</div><b class="mono">${c.hoursMean} h</b></div>
    </div>
    ${c.myWater ? `<p class="hint" style="margin-top:10px">あなたの平均潅水間隔は ${c.myWater} 日で、
      平均より ${c.myWater > c.waterMean ? '長め(締める方向)' : '短め(growing 寄り)'}です。</p>` : ''}`,
  () => {}, { width: '760px' });
}

/* ---------- イベント配線 ---------- */

function wireView() {
  const view = $('#view');

  // 日照スライダー
  const range = $('#light-range', view);
  if (range) {
    range.addEventListener('input', () => { $('#light-val').textContent = range.value; });
    range.addEventListener('change', () => {
      game.setLight(range.dataset.light, Number(range.value));
      render();
    });
  }

  // 比較スライダー
  const cmp = $('#compare', view);
  if (cmp) {
    const move = (e) => {
      const rect = cmp.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      cmp.style.setProperty('--split', `${clamp((x / rect.width) * 100, 0, 100)}%`);
    };
    let dragging = false;
    cmp.addEventListener('pointerdown', (e) => { dragging = true; move(e); });
    window.addEventListener('pointermove', (e) => { if (dragging) move(e); });
    window.addEventListener('pointerup', () => { dragging = false; });
  }

  // 設定
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
    const target = (sel) => e.target.closest(sel);
    let el;

    if ((el = target('[data-nav]'))) return go(el.dataset.nav);
    if ((el = target('[data-open-plant]'))) return go('plant', el.dataset.openPlant);
    if ((el = target('[data-open-species]'))) return speciesDialog(el.dataset.openSpecies);
    if (target('[data-adopt-dialog]')) return adoptDialog();
    if ((el = target('[data-photo]'))) return photoDialog(el.dataset.photo);
    if ((el = target('[data-measure]'))) return measureDialog(el.dataset.measure);
    if ((el = target('[data-light-measure]'))) return lightDialog(el.dataset.lightMeasure);
    if ((el = target('[data-evolve]'))) return evolveDialog(el.dataset.evolve);
    if ((el = target('[data-contest]'))) return contestDialog(el.dataset.contest);
    if ((el = target('[data-export]'))) return handleExport(el.dataset.export, el.dataset.target);

    if ((el = target('[data-water]'))) {
      const r = game.water(el.dataset.water);
      toast(r.message, r.exp >= 8 ? 'gold' : 'bad');
      return render();
    }
    if ((el = target('[data-fert]'))) {
      const r = game.fertilize(el.dataset.fert);
      toast(r.message || '施肥しました', r.ok ? '' : 'bad');
      return render();
    }
    if ((el = target('[data-treat]'))) {
      const r = game.treat(el.dataset.treat);
      toast(r.message, r.ok ? '' : 'bad');
      charCache.clear();
      return render();
    }
    if ((el = target('[data-buy]'))) {
      const r = game.buy(el.dataset.buy);
      toast(r.ok ? '購入しました' : r.message, r.ok ? 'gold' : 'bad');
      return render();
    }
    if ((el = target('[data-sell]'))) {
      const p = game.plant(el.dataset.sell);
      if (!confirm(`${p.nickname} を譲渡します。記録も削除されます。よろしいですか?`)) return;
      const r = game.sell(el.dataset.sell);
      toast(`+${r.price} コイン`, 'gold');
      return go('collection');
    }
    if ((el = target('[data-rename]'))) {
      const p = game.plant(el.dataset.rename);
      const name = prompt('新しい名前', p.nickname);
      if (name) { game.rename(p.id, name); render(); }
      return;
    }
    if (target('[data-cross]')) {
      const a = $('#cross-a').value, b = $('#cross-b').value;
      const r = game.cross(a, b);
      if (!r.ok) return toast(r.message, 'bad');
      toast(`交配成功: ${r.child.nickname}${r.mutation ? ` — ${r.mutation}` : ''}`, 'gold');
      return go('plant', r.child.id);
    }
    if ((el = target('[data-warp]'))) {
      game.warp(Number(el.dataset.warp));
      toast(`${el.dataset.warp} 日進めました`);
      return render();
    }
    if (target('[data-export-data]')) {
      const json = await exportAll(game.state);
      downloadDataUrl(`data:application/json;charset=utf-8,${encodeURIComponent(json)}`, 'pixagave-backup.json');
      return toast('バックアップを書き出しました', 'gold');
    }
    if (target('[data-import-data]')) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = async () => {
        try {
          const text = await input.files[0].text();
          await importAll(text);
          location.reload();
        } catch (err) {
          toast(err.message || '読み込みに失敗しました', 'bad');
        }
      };
      input.click();
      return;
    }
    if (target('[data-reset]')) {
      if (!confirm('すべてのデータを削除して初期化します。よろしいですか?')) return;
      clearSave();
      location.reload();
    }
  });
}

export { charCache };
