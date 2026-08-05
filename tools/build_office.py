#!/usr/bin/env python3
"""company/ の実ファイルから、RPG風オフィスの可視化HTMLを生成する。

使い方:
    python3 tools/build_office.py [--company company] [--out company-office.html]

各部署のキャラクターがオフィスを歩き、logs/ に書かれた記録を
時刻順に「秘書への報告」として再生する。登場人物も台詞もファイル由来。
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

from build_dashboard import collect

# 部署ID → 立ち位置（席）とキャラの色。未知の部署にはフォールバックを順に割り当てる。
DESKS = [
    {"x": 4, "y": 3, "zone": [1, 1, 9, 6], "hair": "#7a4a24", "cloth": "#c2603a"},
    {"x": 21, "y": 3, "zone": [16, 1, 9, 6], "hair": "#2f2f38", "cloth": "#2f7d6b"},
    {"x": 4, "y": 12, "zone": [1, 10, 9, 5], "hair": "#8a6a2a", "cloth": "#4a5aa8"},
    {"x": 21, "y": 12, "zone": [16, 10, 9, 5], "hair": "#5a3550", "cloth": "#a04a7a"},
    {"x": 12, "y": 3, "zone": [10, 1, 6, 6], "hair": "#3a3a3a", "cloth": "#7a7a3a"},
    {"x": 12, "y": 12, "zone": [10, 10, 6, 5], "hair": "#6a3a3a", "cloth": "#3a7a9a"},
]


def build(data: dict) -> dict:
    cast = []
    di = 0
    for m in data["members"]:
        if m["is_secretary"]:
            cast.append(
                {
                    "id": m["id"], "name": m["name_ja"], "emoji": m["emoji"],
                    "role": m["role"], "status": m["status"], "entries": m["entry_count"],
                    "rules": len(m["rules"]), "idle_days": m["idle_days"],
                    "desk": {"x": 12, "y": 9}, "zone": [9, 7, 8, 3],
                    "hair": "#3a2a22", "cloth": "#2b3f7a", "secretary": True,
                }
            )
            continue
        d = DESKS[di % len(DESKS)]
        di += 1
        cast.append(
            {
                "id": m["id"], "name": m["name_ja"], "emoji": m["emoji"],
                "role": m["role"], "status": m["status"], "entries": m["entry_count"],
                "rules": len(m["rules"]), "idle_days": m["idle_days"],
                "desk": {"x": d["x"], "y": d["y"]}, "zone": d["zone"],
                "hair": d["hair"], "cloth": d["cloth"], "secretary": False,
            }
        )

    events = [
        {
            "date": e["date"], "time": e["time"], "kind": e["kind"],
            "title": e["title"], "body": e["body"], "who": e["member_id"], "name": e["member"],
        }
        for e in reversed(data["entries"])  # 古い順に再生する
    ]
    dates = sorted({e["date"] for e in events})

    return {
        "generated": data["generated"],
        "today": data["today"],
        "cast": cast,
        "events": events,
        "dates": dates,
        "inbox": data["inbox_open"],
        "totals": data["totals"],
    }


TEMPLATE = r"""<title>__TITLE__</title>
<style>
:root {
  --bg: #101423; --bg-2: #171d31; --panel: #1c2338; --line: #2e3852;
  --ink: #e9edf7; --ink-2: #a8b2cb; --ink-3: #737f9c;
  --accent: #f2c14e; --accent-2: #63b3ed;
  --ok: #6fd3a0; --warn: #e2b263; --alert: #f0907a;
  --mono: ui-monospace, "SFMono-Regular", "Menlo", "Consolas", monospace;
  --gothic: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic Medium", "Yu Gothic",
            "Noto Sans JP", "Meiryo", system-ui, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--gothic); line-height: 1.7; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 24px 16px 72px; display: flex; flex-direction: column; gap: 20px; }
.eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--ink-3); margin: 0; }
h1 { font-size: clamp(22px, 4vw, 34px); margin: 6px 0 0; letter-spacing: -.01em; text-wrap: balance; }
.lede { color: var(--ink-2); font-size: 13.5px; margin: 8px 0 0; max-width: 64ch; }

/* --- ドット絵まわりは枠でウィンドウ感を出す --- */
.frame {
  border: 3px solid var(--ink); background: var(--bg-2); padding: 8px;
  box-shadow: 0 0 0 3px var(--bg), 0 18px 40px -24px #000;
}
.stage { position: relative; }
canvas { display: block; width: 100%; height: auto; image-rendering: pixelated; background: #0d1120; }

.hud { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; padding: 10px 12px; border-top: 1px solid var(--line); font-family: var(--mono); font-size: 12px; color: var(--ink-2); }
.hud .clock { color: var(--accent); font-size: 15px; font-variant-numeric: tabular-nums; }
button, select {
  font-family: var(--mono); font-size: 12px; color: var(--ink); background: var(--panel);
  border: 2px solid var(--line); padding: 6px 12px; cursor: pointer;
}
button:hover, select:hover { border-color: var(--accent); }
button:focus-visible, select:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 2px; }
button[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }

.cols { display: grid; grid-template-columns: 1.55fr 1fr; gap: 16px; align-items: start; }
@media (max-width: 880px) { .cols { grid-template-columns: 1fr; } }

.log { padding: 0; max-height: 340px; overflow-y: auto; }
.log h2, .party h2, .inbox h2 { font-size: 13px; margin: 0; padding: 12px 14px; border-bottom: 1px solid var(--line); font-family: var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); position: sticky; top: 0; background: var(--bg-2); }
.log ul { list-style: none; margin: 0; padding: 6px 0; display: flex; flex-direction: column; }
.log li { padding: 9px 14px; border-bottom: 1px dashed var(--line); font-size: 12.5px; display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; }
.log li:last-child { border-bottom: none; }
.log .meta { font-family: var(--mono); font-size: 10.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.log .body { grid-column: 2; color: var(--ink-2); font-size: 11.5px; }
.log li.fresh { background: #232c46; }
.kind { font-weight: 700; }
.kind.k-決定 { color: var(--ok); } .kind.k-課題 { color: var(--alert); }
.kind.k-学び { color: var(--accent); } .kind.k-アイデア { color: var(--accent-2); }
.kind.k-作業 { color: var(--ink-2); }

.party ul { list-style: none; margin: 0; padding: 0; }
.party li { padding: 11px 14px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: auto 1fr auto; gap: 4px 10px; align-items: center; }
.party li:last-child { border-bottom: none; }
.party .nm { font-size: 13.5px; font-weight: 700; }
.party .st { font-family: var(--mono); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; }
.st.ok { background: #16302a; color: var(--ok); } .st.warn { background: #322815; color: var(--warn); } .st.alert { background: #38201c; color: var(--alert); }
.party .gauge { grid-column: 1 / -1; height: 6px; background: #0f1424; border: 1px solid var(--line); }
.party .gauge i { display: block; height: 100%; background: var(--accent-2); }
.party .sub { grid-column: 1 / -1; font-family: var(--mono); font-size: 10.5px; color: var(--ink-3); }
.inbox ol { margin: 0; padding: 10px 14px 14px 30px; font-size: 12.5px; color: var(--ink-2); display: flex; flex-direction: column; gap: 8px; }
footer { font-size: 12px; color: var(--ink-3); font-family: var(--mono); border-top: 1px solid var(--line); padding-top: 14px; }
footer b { color: var(--ink-2); font-weight: 400; }
</style>

<div class="wrap">
  <header>
    <p class="eyebrow">Office RPG · driven by company/</p>
    <h1>__TITLE__</h1>
    <p class="lede">キャラクターも台詞も <b>company/</b> の実ファイルから読んでいます。記録が1件書かれるたびに、担当が席を立って秘書の受付まで報告に来ます。話しかける相手が秘書ひとりなのは、この画面でも同じです。</p>
  </header>

  <div class="cols">
    <div>
      <div class="frame stage">
        <canvas id="cv" width="832" height="512" role="img" aria-label="オフィスの俯瞰マップ。各部署のキャラクターが席と受付の間を行き来する。"></canvas>
        <div class="hud">
          <span class="clock" id="clock">--:--</span>
          <span id="daylabel"></span>
          <span style="flex:1"></span>
          <select id="datesel" aria-label="再生する日付"></select>
          <button id="play" aria-pressed="true">⏸ 一時停止</button>
          <button id="speed">速度 ×1</button>
          <button id="restart">↺ 最初から</button>
        </div>
      </div>
      <p class="lede" style="margin-top:10px">
        席で <b>Zzz</b> は paused の部署、頭上の <b>!</b> は3日以上記録が無い部署です。歩いている線が、そのまま「今どこが動いているか」になります。
      </p>
    </div>

    <div style="display:flex; flex-direction:column; gap:16px;">
      <div class="frame party"><h2>Party</h2><ul id="party"></ul></div>
      <div class="frame log"><h2>Battle log ／ 稼働記録</h2><ul id="loglist"></ul></div>
      <div class="frame inbox"><h2>決裁待ち</h2><ol id="inboxlist"></ol></div>
    </div>
  </div>

  <footer>
    更新は <b>python3 tools/build_office.py</b> ／ 就業規則は <b>company/CLAUDE.md</b> ／ 生成 <span id="gen"></span>
  </footer>
</div>

<script>
const DATA = __DATA__;
const TS = 32;                 // タイルの一辺（px）
const COLS = 26, ROWS = 16;
const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
ctx.imageSmoothingEnabled = false;
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- マップ ---------- */
// 0=床 1=壁 2=机 3=受付カウンター 4=観葉植物
const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
for (let x = 0; x < COLS; x++) { grid[0][x] = 1; grid[ROWS - 1][x] = 1; }
for (let y = 0; y < ROWS; y++) { grid[y][0] = 1; grid[y][COLS - 1] = 1; }
// 受付の島（秘書のカウンター）
const COUNTER = { x0: 10, x1: 15, y: 7 };
for (let x = COUNTER.x0; x <= COUNTER.x1; x++) grid[COUNTER.y][x] = 3;
// 各キャラの机
DATA.cast.forEach(c => { if (!c.secretary) { grid[c.desk.y][c.desk.x] = 2; grid[c.desk.y][c.desk.x + 1] = 2; } });
// 中央上部の会議スペースと、受付脇の決裁棚
for (let x = 11; x <= 14; x++) grid[3][x] = 5;
grid[7][16] = 6;
// 観葉植物（角の彩り）
[[2, 14], [23, 14], [2, 1], [23, 1]].forEach(([x, y]) => { if (grid[y][x] === 0) grid[y][x] = 4; });

const walkable = (x, y) => x > 0 && y > 0 && x < COLS - 1 && y < ROWS - 1 && grid[y][x] === 0;

function bfs(from, to) {
  if (from.x === to.x && from.y === to.y) return [];
  const key = p => p.y * COLS + p.x;
  const prev = new Map(); const q = [from]; const seen = new Set([key(from)]);
  while (q.length) {
    const cur = q.shift();
    if (cur.x === to.x && cur.y === to.y) {
      const path = []; let k = key(cur); let node = cur;
      while (prev.has(k)) { path.unshift(node); node = prev.get(k); k = key(node); }
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy, nk = ny * COLS + nx;
      if (!walkable(nx, ny) || seen.has(nk)) continue;
      seen.add(nk); prev.set(nk, cur); q.push({ x: nx, y: ny });
    }
  }
  return [];
}

/* ---------- 登場人物 ---------- */
const KIND_COLOR = { "決定": "#6fd3a0", "課題": "#f0907a", "学び": "#f2c14e", "アイデア": "#63b3ed", "作業": "#a8b2cb" };
const homeOf = c => ({ x: c.desk.x, y: c.desk.y + 1 });

const actors = DATA.cast.map(c => {
  const h = c.secretary ? { x: 12, y: 8 } : homeOf(c);
  return {
    ...c, home: h, tx: h.x, ty: h.y, px: h.x * TS, py: h.y * TS,
    dir: "down", path: [], state: "idle", bubble: null, bubbleUntil: 0,
    wait: 400 + Math.random() * 2500, step: 0, mark: null,
  };
});
const secretary = actors.find(a => a.secretary);
const byId = Object.fromEntries(actors.map(a => [a.id, a]));
actors.forEach(a => {
  if (!a.secretary && a.status !== "active") a.mark = "zzz";
  else if (!a.secretary && (a.idle_days === null || a.idle_days >= 3)) a.mark = "!";
});
// カウンターの手前（報告に立つ位置）
const DESK_FRONT = { x: 12, y: 6 };

/* ---------- ドット絵 ---------- */
function px(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }

function drawTile(x, y) {
  const t = grid[y][x], X = x * TS, Y = y * TS;
  // 床はチェッカー
  px(X, Y, TS, TS, (x + y) % 2 ? "#1a2138" : "#1d2540");
  if (t === 1) {
    px(X, Y, TS, TS, "#2b3550"); px(X, Y, TS, 6, "#3a4668");
    px(X + 2, Y + 10, TS - 4, 3, "#232b44"); px(X + 2, Y + 20, TS - 4, 3, "#232b44");
  } else if (t === 2) {
    px(X, Y + 8, TS, TS - 12, "#6b4a2e"); px(X, Y + 6, TS, 4, "#8a6238");
    px(X + 4, Y + 12, TS - 8, 8, "#c9d3ea");          // 書類
    px(X + 6, Y + 14, TS - 16, 2, "#6b7797");
  } else if (t === 3) {
    px(X, Y + 6, TS, TS - 8, "#3d4f7a"); px(X, Y + 2, TS, 6, "#596ea8");
    px(X + 3, Y + 14, TS - 6, 6, "#2a3860");
  } else if (t === 4) {
    px(X + 10, Y + 20, 12, 8, "#7a5236");
    px(X + 6, Y + 6, 20, 16, "#2f7d5b"); px(X + 12, Y + 2, 8, 10, "#3f9c72");
  } else if (t === 5) {                       // 会議テーブル
    px(X, Y + 4, TS, TS - 10, "#4a3a5e"); px(X, Y + 2, TS, 5, "#63507d");
    px(X + 8, Y + 12, TS - 16, 6, "#cdd6ee");
  } else if (t === 6) {                       // 決裁棚（未処理の枚数だけ紙が積まれる）
    px(X + 2, Y + 6, TS - 4, TS - 8, "#5a4a3a"); px(X + 2, Y + 4, TS - 4, 4, "#7a6647");
    for (let i = 0; i < Math.min(5, DATA.inbox.length); i++) {
      px(X + 6, Y + 22 - i * 4, TS - 12, 3, i === 0 ? "#f2c14e" : "#e8e2cf");
    }
  }
}

function drawZones() {
  DATA.cast.forEach(c => {
    const [zx, zy, zw, zh] = c.zone;
    ctx.globalAlpha = 0.13;
    px(zx * TS, zy * TS, zw * TS, zh * TS, c.cloth);
    ctx.globalAlpha = 1;
  });
}

function label(text, cx, cy, color) {
  ctx.font = "600 13px " + getComputedStyle(document.body).fontFamily;
  ctx.textAlign = "center";
  const w = ctx.measureText(text).width + 12;
  px(cx - w / 2, cy - 13, w, 18, "rgba(10,14,26,.78)");
  ctx.fillStyle = color; ctx.fillText(text, cx, cy);
}

function drawActor(a, t) {
  const X = Math.round(a.px), Y = Math.round(a.py);
  const moving = a.state === "walk";
  const bob = moving ? (Math.floor(t / 130) % 2) : 0;
  const legs = moving ? Math.floor(t / 130) % 2 : 0;
  const skin = "#f0c9a0";
  px(X + 6, Y + 26 + bob, 20, 4, "rgba(0,0,0,.35)");        // 影
  px(X + 9, Y + 20 - bob, 6, 8, "#26304a");                  // 脚
  px(X + 17, Y + 20 - bob, 6, 8, "#26304a");
  if (legs && moving) { px(X + 9, Y + 24 - bob, 6, 4, a.cloth); }
  px(X + 7, Y + 10 - bob, 18, 12, a.cloth);                  // 胴
  px(X + 5, Y + 12 - bob, 4, 8, a.cloth);                    // 腕
  px(X + 23, Y + 12 - bob, 4, 8, a.cloth);
  px(X + 8, Y + 2 - bob, 16, 10, skin);                      // 顔
  px(X + 7, Y - bob, 18, 5, a.hair);                         // 髪
  px(X + 7, Y + 2 - bob, 3, 5, a.hair);
  px(X + 22, Y + 2 - bob, 3, 5, a.hair);
  if (a.dir === "down") {
    px(X + 11, Y + 6 - bob, 3, 3, "#20263a"); px(X + 18, Y + 6 - bob, 3, 3, "#20263a");
  } else if (a.dir === "left") {
    px(X + 9, Y + 6 - bob, 3, 3, "#20263a");
  } else if (a.dir === "right") {
    px(X + 20, Y + 6 - bob, 3, 3, "#20263a");
  }
  if (a.secretary) { px(X + 6, Y - 4 - bob, 20, 4, "#f2c14e"); }  // 秘書だけ差し色の帯

  if (a.mark === "zzz" && a.state === "idle") {
    ctx.font = "700 12px " + getComputedStyle(document.body).fontFamily;
    ctx.fillStyle = "#8fa0c4"; ctx.textAlign = "center";
    ctx.fillText("z z Z".slice(0, 1 + (Math.floor(t / 500) % 3) * 2), X + 16, Y - 8);
  } else if (a.mark === "!" ) {
    ctx.font = "800 15px " + getComputedStyle(document.body).fontFamily;
    ctx.fillStyle = "#f0907a"; ctx.textAlign = "center";
    ctx.fillText("!", X + 16, Y - 8 - (Math.floor(t / 400) % 2) * 2);
  }
  label(a.name, X + 16, Y + 44, a.secretary ? "#f2c14e" : "#dfe6f6");
}

function drawBubble(a) {
  if (!a.bubble) return;
  const text = a.bubble.text;
  ctx.font = "600 13px " + getComputedStyle(document.body).fontFamily;
  const maxW = 260;
  const words = text.split("");
  const lines = []; let line = "";
  for (const ch of words) {
    if (ctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch; } else line += ch;
  }
  lines.push(line);
  const w = Math.min(maxW, Math.max(...lines.map(l => ctx.measureText(l).width))) + 22;
  const h = lines.length * 18 + 18;
  let bx = a.px + 16 - w / 2, by = a.py - h - 14;
  bx = Math.max(6, Math.min(cv.width - w - 6, bx)); by = Math.max(6, by);
  px(bx, by, w, h, "#0e1526");
  ctx.strokeStyle = a.bubble.color; ctx.lineWidth = 2; ctx.strokeRect(bx + 1, by + 1, w - 2, h - 2);
  px(a.px + 12, by + h, 8, 8, "#0e1526");
  ctx.textAlign = "left";
  lines.forEach((l, i) => {
    ctx.fillStyle = i === 0 ? a.bubble.color : "#dfe6f6";
    ctx.fillText(l, bx + 11, by + 22 + i * 18);
  });
}

/* ---------- 再生 ---------- */
let events = [], cursor = 0, playing = !reduce, speed = 1, lastTick = 0, nextAt = 0;
const SPEEDS = [1, 2, 4];
let speedIdx = 0;

function eventsFor(date) {
  return date === "all" ? DATA.events : DATA.events.filter(e => e.date === date);
}

function resetPlayback() {
  cursor = 0; nextAt = performance.now() + 900;
  document.getElementById("loglist").innerHTML = "";
  document.getElementById("clock").textContent = events.length ? events[0].time : "--:--";
  actors.forEach(a => { a.bubble = null; a.path = []; a.state = "idle"; a.tx = a.home.x; a.ty = a.home.y; a.px = a.tx * TS; a.py = a.ty * TS; });
}

function pushLog(e) {
  const ul = document.getElementById("loglist");
  const li = document.createElement("li"); li.className = "fresh";
  const meta = document.createElement("span"); meta.className = "meta"; meta.textContent = `${e.date.slice(5)} ${e.time}`;
  const main = document.createElement("span");
  const k = document.createElement("span"); k.className = "kind k-" + e.kind; k.textContent = `[${e.kind}] `;
  main.append(k, document.createTextNode(`${e.name}：${e.title}`));
  li.append(meta, main);
  if (e.body) { const b = document.createElement("span"); b.className = "body"; b.textContent = e.body; li.append(b); }
  ul.prepend(li);
  setTimeout(() => li.classList.remove("fresh"), 1200);
  while (ul.children.length > 40) ul.lastChild.remove();
}

function fire(e) {
  const a = byId[e.who] || secretary;
  document.getElementById("clock").textContent = e.time;
  pushLog(e);
  a.bubble = { text: `[${e.kind}] ${e.title}`, color: KIND_COLOR[e.kind] || "#dfe6f6" };
  a.bubbleUntil = performance.now() + 4200 / speed;
  if (a !== secretary) {
    a.path = bfs({ x: a.tx, y: a.ty }, DESK_FRONT);
    a.state = a.path.length ? "walk" : "talk";
    a.report = true;
    secretary.dir = "up";
    secretary.bubble = null;
  }
}

function stepActors(dt, now) {
  actors.forEach(a => {
    if (a.bubble && now > a.bubbleUntil) a.bubble = null;
    if (a.state === "walk") {
      const next = a.path[0];
      if (!next) { a.state = "idle"; a.wait = 700 + Math.random() * 2000; return; }
      const gx = next.x * TS, gy = next.y * TS;
      const sp = (reduce ? 260 : 78) * speed * dt / 1000 * (reduce ? 1 : 1.6);
      if (Math.abs(gx - a.px) > 0.5) { a.px += Math.sign(gx - a.px) * Math.min(sp, Math.abs(gx - a.px)); a.dir = gx > a.px ? "right" : "left"; }
      if (Math.abs(gy - a.py) > 0.5) { a.py += Math.sign(gy - a.py) * Math.min(sp, Math.abs(gy - a.py)); a.dir = gy > a.py ? "down" : "up"; }
      if (Math.abs(gx - a.px) < 1 && Math.abs(gy - a.py) < 1) {
        a.px = gx; a.py = gy; a.tx = next.x; a.ty = next.y; a.path.shift();
        if (!a.path.length) {
          a.state = "idle";
          a.wait = a.report ? 1600 / speed : 700 + Math.random() * 2200;
          if (a.report) { a.dir = "down"; a.report = false; a.goHome = true; }
        }
      }
    } else {
      a.wait -= dt * speed;
      if (a.wait > 0) return;
      if (a.secretary) {              // 秘書は受付の裏を小さく往復する
        const t = { x: 11 + Math.floor(Math.random() * 3), y: 8 + Math.floor(Math.random() * 2) };
        if (walkable(t.x, t.y)) { a.path = bfs({ x: a.tx, y: a.ty }, t); a.state = a.path.length ? "walk" : "idle"; }
        a.wait = 1800 + Math.random() * 2600;
        return;
      }
      if (a.status !== "active") { a.wait = 2500; return; }   // paused は席で寝ている
      let t;
      if (a.goHome) { t = a.home; a.goHome = false; }
      else {
        const [zx, zy, zw, zh] = a.zone;
        t = { x: zx + 1 + Math.floor(Math.random() * (zw - 2)), y: zy + 1 + Math.floor(Math.random() * (zh - 2)) };
      }
      if (walkable(t.x, t.y)) { a.path = bfs({ x: a.tx, y: a.ty }, t); a.state = a.path.length ? "walk" : "idle"; }
      a.wait = 900 + Math.random() * 2600;
    }
  });
}

function render(now) {
  ctx.clearRect(0, 0, cv.width, cv.height);
  drawZones();
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (grid[y][x] !== 0) drawTile(x, y);
  // 部屋のプレート（ゾーンの左上に貼る）
  ctx.font = "700 12px " + getComputedStyle(document.body).fontFamily;
  ctx.textAlign = "left";
  DATA.cast.forEach(c => {
    if (c.secretary) return;
    const [zx, zy] = c.zone;
    const text = `${c.emoji} ${c.name}`;
    const w = ctx.measureText(text).width + 14;
    px(zx * TS + 6, zy * TS + 4, w, 20, "rgba(10,14,26,.72)");
    px(zx * TS + 6, zy * TS + 4, 3, 20, c.cloth);
    ctx.fillStyle = "#c7d2ea"; ctx.fillText(text, zx * TS + 15, zy * TS + 18);
  });
  label("受付 ／ 窓口は秘書ひとり", (COUNTER.x0 + COUNTER.x1 + 1) / 2 * TS, COUNTER.y * TS - 6, "#f2c14e");
  label(`決裁箱 ${DATA.inbox.length}`, 16.5 * TS + 16, 7 * TS - 6, "#e2b263");
  [...actors].sort((a, b) => a.py - b.py).forEach(a => drawActor(a, now));
  actors.forEach(drawBubble);
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(64, now - last); last = now;
  if (playing) {
    stepActors(dt, now);
    if (events.length && now > nextAt) {
      fire(events[cursor % events.length]);
      cursor = (cursor + 1) % events.length;
      nextAt = now + 5200 / speed;
    }
  }
  render(now);
  requestAnimationFrame(loop);
}

/* ---------- 操作 ---------- */
const datesel = document.getElementById("datesel");
DATA.dates.forEach(d => { const o = document.createElement("option"); o.value = d; o.textContent = d; datesel.append(o); });
{ const o = document.createElement("option"); o.value = "all"; o.textContent = "全期間"; datesel.append(o); }
datesel.value = DATA.dates.length ? DATA.dates[DATA.dates.length - 1] : "all";
function loadDate() {
  events = eventsFor(datesel.value);
  document.getElementById("daylabel").textContent = `記録 ${events.length} 件`;
  resetPlayback();
}
datesel.addEventListener("change", loadDate);

const playBtn = document.getElementById("play");
playBtn.textContent = playing ? "⏸ 一時停止" : "▶ 再生";
playBtn.setAttribute("aria-pressed", String(playing));
playBtn.addEventListener("click", () => {
  playing = !playing;
  playBtn.textContent = playing ? "⏸ 一時停止" : "▶ 再生";
  playBtn.setAttribute("aria-pressed", String(playing));
  last = performance.now(); nextAt = last + 600;
});
const speedBtn = document.getElementById("speed");
speedBtn.addEventListener("click", () => {
  speedIdx = (speedIdx + 1) % SPEEDS.length; speed = SPEEDS[speedIdx];
  speedBtn.textContent = `速度 ×${speed}`;
});
document.getElementById("restart").addEventListener("click", loadDate);

/* ---------- 右側のパネル ---------- */
const maxEntries = Math.max(1, ...DATA.cast.map(c => c.entries));
const party = document.getElementById("party");
DATA.cast.forEach(c => {
  const li = document.createElement("li");
  const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = `${c.emoji} ${c.name}`;
  const spacer = document.createElement("span");
  const st = document.createElement("span");
  const stale = !c.secretary && c.status === "active" && (c.idle_days === null || c.idle_days >= 3);
  st.className = "st " + (c.status !== "active" ? "warn" : stale ? "alert" : "ok");
  st.textContent = c.status !== "active" ? "paused" : stale ? "停滞" : "稼働中";
  const g = document.createElement("span"); g.className = "gauge";
  const i = document.createElement("i"); i.style.width = Math.round(c.entries / maxEntries * 100) + "%"; g.append(i);
  const sub = document.createElement("span"); sub.className = "sub";
  sub.textContent = `記録 ${c.entries} ／ ルール ${c.rules}条 ／ 最終稼働 ${c.idle_days === null ? "—" : c.idle_days === 0 ? "今日" : c.idle_days + "日前"}`;
  li.append(nm, spacer, st, g, sub);
  party.append(li);
});
const inboxlist = document.getElementById("inboxlist");
if (!DATA.inbox.length) { const li = document.createElement("li"); li.textContent = "未処理はありません"; inboxlist.append(li); }
DATA.inbox.forEach(it => { const li = document.createElement("li"); li.textContent = it.title; inboxlist.append(li); });
document.getElementById("gen").textContent = DATA.generated;

loadDate();
requestAnimationFrame(loop);
</script>
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--company", default="company")
    ap.add_argument("--out", default="company-office.html")
    ap.add_argument("--title", default="ひとり会社 オフィスビュー")
    args = ap.parse_args()

    root = Path(__file__).resolve().parent.parent
    company = (root / args.company) if not Path(args.company).is_absolute() else Path(args.company)
    data = build(collect(company, dt.date.today()))

    html = TEMPLATE.replace("__DATA__", json.dumps(data, ensure_ascii=False)).replace("__TITLE__", args.title)
    out = (root / args.out) if not Path(args.out).is_absolute() else Path(args.out)
    out.write_text(html, encoding="utf-8")
    print(f"生成: {out}")
    print(f"登場人物 {len(data['cast'])}人／再生イベント {len(data['events'])}件／日付 {len(data['dates'])}日分")


if __name__ == "__main__":
    main()
