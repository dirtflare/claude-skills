#!/usr/bin/env python3
"""company/ の実ファイルから、RPG風オフィスの可視化HTMLを生成する。

使い方:
    python3 tools/build_office.py [--company company] [--out company-office.html]

各部署のキャラクターがオフィスを歩き、logs/ に書かれた記録を
時刻順に「秘書への報告」として再生する。登場人物も台詞もファイル由来。
スプライトは外部画像を使わず、キャンバス上にドット単位で描いている。
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

from build_dashboard import collect

# 部署に順に割り当てる席・フロア区画・見た目。
# look: hair(short/cap/hat/bob/pony/long/gray) / glasses / acc(tie/bag/folder/apple)
DESKS = [
    {
        "x": 3, "y": 2, "zone": [1, 1, 7, 3],
        "look": {"hair": "cap", "hair_col": "#7a4a24", "cap_col": "#2f5fb0",
                 "top": "#e08a3c", "bottom": "#3f7d4a", "shoe": "#3a3a44",
                 "skin": "#f6d0a8", "glasses": False, "acc": None},
    },
    {
        "x": 12, "y": 2, "zone": [10, 1, 7, 3],
        "look": {"hair": "short", "hair_col": "#2f2f38",
                 "top": "#46577f", "bottom": "#2b3040", "shoe": "#23262f",
                 "skin": "#f6d0a8", "glasses": True, "acc": "tie", "acc_col": "#c94f4f"},
    },
    {
        "x": 3, "y": 8, "zone": [1, 7, 7, 3],
        "look": {"hair": "gray", "hair_col": "#b9bcc4",
                 "top": "#5a86b8", "bottom": "#6b5f4a", "shoe": "#3d3a34",
                 "skin": "#f2c9a2", "glasses": False, "acc": None},
    },
    {
        "x": 12, "y": 8, "zone": [10, 7, 7, 3],
        "look": {"hair": "pony", "hair_col": "#8a5a2a",
                 "top": "#e6b23c", "bottom": "#3a5a8a", "shoe": "#4a3a2e",
                 "skin": "#f8d6b0", "glasses": False, "acc": "bag", "acc_col": "#3a5a8a"},
    },
    {
        "x": 3, "y": 5, "zone": [1, 4, 5, 2],
        "look": {"hair": "hat", "hair_col": "#2a2a2a", "cap_col": "#26262c",
                 "top": "#3aa0c8", "bottom": "#5a6a48", "shoe": "#33333a",
                 "skin": "#f6d0a8", "glasses": False, "acc": None},
    },
    {
        "x": 13, "y": 5, "zone": [12, 4, 5, 2],
        "look": {"hair": "long", "hair_col": "#5a3550",
                 "top": "#d98aa8", "bottom": "#7a4a68", "shoe": "#4a3040",
                 "skin": "#f8d6b0", "glasses": False, "acc": "apple", "acc_col": "#c94f4f"},
    },
]

# 部署IDが分かっている場合は、その部署らしい見た目を優先する
LOOKS_BY_ID = {
    "marketing": DESKS[0]["look"],   # キャップ＋オレンジ。発信担当
    "research": DESKS[1]["look"],    # メガネ＋スーツ。裏取り担当
    "finance": DESKS[2]["look"],     # 白髪のベテラン。数字担当
    "sales": DESKS[3]["look"],       # ポニーテール＋鞄。外に出る担当
}

SECRETARY_LOOK = {
    "hair": "bob", "hair_col": "#6b4526",
    "top": "#3f4d70", "bottom": "#2b3550", "shoe": "#2a2a33",
    "skin": "#f8d6b0", "glasses": False, "acc": "folder", "acc_col": "#e0b544",
}


def build(data: dict) -> dict:
    cast = []
    di = 0
    for m in data["members"]:
        base = {
            "id": m["id"], "name": m["name_ja"], "emoji": m["emoji"],
            "role": m["role"], "status": m["status"], "entries": m["entry_count"],
            "rules": len(m["rules"]), "idle_days": m["idle_days"],
        }
        if m["is_secretary"]:
            cast.append({**base, "desk": {"x": 8, "y": 6}, "zone": [6, 4, 6, 3],
                         "look": SECRETARY_LOOK, "secretary": True})
            continue
        d = DESKS[di % len(DESKS)]
        di += 1
        look = LOOKS_BY_ID.get(m["id"], d["look"])
        d = {**d, "look": look}
        cast.append({**base, "desk": {"x": d["x"], "y": d["y"]}, "zone": d["zone"],
                     "look": d["look"], "secretary": False})

    events = [
        {
            "date": e["date"], "time": e["time"], "kind": e["kind"],
            "title": e["title"], "body": e["body"], "who": e["member_id"], "name": e["member"],
        }
        for e in reversed(data["entries"])  # 古い順に再生する
    ]

    return {
        "generated": data["generated"],
        "today": data["today"],
        "cast": cast,
        "events": events,
        "dates": sorted({e["date"] for e in events}),
        "inbox": data["inbox_open"],
        "totals": data["totals"],
    }


TEMPLATE = r"""<title>__TITLE__</title>
<style>
:root {
  --bg: #0d1120; --bg-2: #151b2c; --panel: #1b2236; --line: #2c3550;
  --ink: #e9edf7; --ink-2: #a8b2cb; --ink-3: #737f9c;
  --accent: #f2c14e; --accent-2: #63b3ed;
  --ok: #6fd3a0; --warn: #e2b263; --alert: #f0907a;
  --mono: ui-monospace, "SFMono-Regular", "Menlo", "Consolas", monospace;
  --gothic: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic Medium", "Yu Gothic",
            "Noto Sans JP", "Meiryo", system-ui, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--gothic); line-height: 1.7; }
.wrap { max-width: 1200px; margin: 0 auto; padding: 24px 16px 72px; display: flex; flex-direction: column; gap: 20px; }
.eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--ink-3); margin: 0; }
h1 { font-size: clamp(22px, 4vw, 34px); margin: 6px 0 0; letter-spacing: -.01em; text-wrap: balance; }
.lede { color: var(--ink-2); font-size: 13.5px; margin: 8px 0 0; max-width: 64ch; }

.frame { border: 3px solid var(--ink); background: var(--bg-2); padding: 8px; box-shadow: 0 0 0 3px var(--bg), 0 18px 40px -24px #000; }
canvas { display: block; width: 100%; height: auto; image-rendering: pixelated; background: #0b0f1c; }

.hud { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; padding: 10px 12px; border-top: 1px solid var(--line); font-family: var(--mono); font-size: 12px; color: var(--ink-2); }
.hud .clock { color: var(--accent); font-size: 15px; font-variant-numeric: tabular-nums; }
button, select {
  font-family: var(--mono); font-size: 12px; color: var(--ink); background: var(--panel);
  border: 2px solid var(--line); padding: 6px 12px; cursor: pointer;
}
button:hover, select:hover { border-color: var(--accent); }
button:focus-visible, select:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 2px; }
button[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }

.cols { display: grid; grid-template-columns: 1.6fr 1fr; gap: 16px; align-items: start; }
@media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }

/* --- ドラクエ風コマンドウィンドウ --- */
.window {
  background: #0a0e1c; border: 4px solid #f4f6ff; border-radius: 6px;
  box-shadow: 0 0 0 4px #0a0e1c, inset 0 0 0 2px #0a0e1c;
  padding: 14px 18px; margin-top: 14px;
}
.window .wtitle {
  font-family: var(--mono); font-size: 11px; letter-spacing: .18em; color: #9fb6ea;
  display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
}
.window .wtitle::after { content: ""; flex: 1; height: 2px; background: #26304d; }
.tasks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.tasks li { display: grid; grid-template-columns: 18px 150px 1fr; gap: 10px; align-items: baseline; font-size: 14px; letter-spacing: .01em; }
.tasks .cur { color: var(--accent); font-weight: 700; }
.tasks .cur.blink { animation: blink 1.05s steps(2, jump-none) infinite; }
@keyframes blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .tasks .cur.blink { animation: none; } }
.tasks .who { color: #cfe0ff; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tasks .what { color: #e8eeff; }
.tasks li.dim .who, .tasks li.dim .what { color: #6e7ba0; }
.tasks .tag { font-family: var(--mono); font-size: 11px; padding: 1px 6px; border: 1px solid currentColor; margin-right: 8px; }
.t-報告中 { color: var(--accent); } .t-移動中 { color: var(--accent-2); }
.t-待機中 { color: #7f8caf; } .t-休止中 { color: var(--warn); } .t-停滞 { color: var(--alert); }

.log { padding: 0; max-height: 300px; overflow-y: auto; }
.log h2, .party h2, .inbox h2 { font-size: 13px; margin: 0; padding: 12px 14px; border-bottom: 1px solid var(--line); font-family: var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); position: sticky; top: 0; background: var(--bg-2); }
.log ul { list-style: none; margin: 0; padding: 6px 0; display: flex; flex-direction: column; }
.log li { padding: 9px 14px; border-bottom: 1px dashed var(--line); font-size: 12.5px; display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; }
.log li:last-child { border-bottom: none; }
.log .meta { font-family: var(--mono); font-size: 10.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.log .body { grid-column: 2; color: var(--ink-2); font-size: 11.5px; }
.log li.fresh { background: #212b46; }
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
      <div class="frame">
        <canvas id="cv" width="864" height="528" role="img" aria-label="オフィスの俯瞰マップ。各部署のキャラクターが席と受付の間を行き来する。"></canvas>
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

      <div class="window">
        <div class="wtitle">▼ 現在行われているタスク</div>
        <ul class="tasks" id="tasks" aria-live="polite"></ul>
      </div>
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
const TS = 48;                 // タイルの一辺（px）
const COLS = 18, ROWS = 11;
const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
ctx.imageSmoothingEnabled = false;
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- マップ ---------- */
// 0=床 1=壁 2=デスク 3=受付カウンター 4=観葉植物 5=会議テーブル 6=決裁棚 7=ホワイトボード 8=椅子
const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
for (let x = 0; x < COLS; x++) { grid[0][x] = 1; grid[ROWS - 1][x] = 1; }
for (let y = 0; y < ROWS; y++) { grid[y][0] = 1; grid[y][COLS - 1] = 1; }
const COUNTER = { x0: 7, x1: 10, y: 5 };
for (let x = COUNTER.x0; x <= COUNTER.x1; x++) grid[COUNTER.y][x] = 3;
DATA.cast.forEach(c => { if (!c.secretary) { grid[c.desk.y][c.desk.x] = 2; grid[c.desk.y][c.desk.x + 1] = 2; } });
grid[1][8] = 5; grid[1][9] = 5;          // 会議テーブル
grid[0][8] = 7; grid[0][9] = 7;          // ホワイトボード
grid[COUNTER.y][11] = 6;                 // 決裁棚
grid[4][1] = 9; grid[4][16] = 10;
[[1, 9], [16, 9], [16, 1]].forEach(([x, y]) => { if (grid[y][x] === 0) grid[y][x] = 4; });

const walkable = (x, y) => x > 0 && y > 0 && x < COLS - 1 && y < ROWS - 1 && grid[y][x] === 0;

function bfs(from, to) {
  if (from.x === to.x && from.y === to.y) return [];
  const key = p => p.y * COLS + p.x;
  const prev = new Map(); const q = [from]; const seen = new Set([key(from)]);
  while (q.length) {
    const cur = q.shift();
    if (cur.x === to.x && cur.y === to.y) {
      const path = []; let node = cur; let k = key(cur);
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
const KIND_COLOR = { "決定": "#6fd3a0", "課題": "#f0907a", "学び": "#f2c14e", "アイデア": "#63b3ed", "作業": "#c3ccE4" };
const homeOf = c => ({ x: c.desk.x, y: c.desk.y + 1 });

const actors = DATA.cast.map(c => {
  const h = c.secretary ? { x: 8, y: 6 } : homeOf(c);
  return {
    ...c, home: h, tx: h.x, ty: h.y, px: h.x * TS, py: h.y * TS,
    dir: "down", path: [], state: "idle", bubble: null, bubbleUntil: 0,
    wait: 400 + Math.random() * 2500, task: null, report: false, goHome: false,
  };
});
const secretary = actors.find(a => a.secretary);
const byId = Object.fromEntries(actors.map(a => [a.id, a]));
actors.forEach(a => {
  if (!a.secretary && a.status !== "active") a.mark = "zzz";
  else if (!a.secretary && (a.idle_days === null || a.idle_days >= 3)) a.mark = "!";
  else a.mark = null;
});
const DESK_FRONT = { x: 10, y: 6 };

/* ---------- 描画ヘルパ ---------- */
function px(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }

/* ---------- 人物スプライト（16×24ドットを2倍で描く） ---------- */
const P = 3;                                     // 1ドットの大きさ
function drawPerson(ox, oy, look, dir, frame, sitting) {
  const d = (x, y, w, h, c) => px(ox + x * P, oy + y * P, w * P, h * P, c);
  const skin = look.skin, hair = look.hair_col, top = look.top, bottom = look.bottom, shoe = look.shoe;
  const back = dir === "up";
  const side = dir === "left" || dir === "right";
  const flip = dir === "left";
  const sx = v => flip ? 15 - v : v;             // 左右反転用

  d(3, 23, 10, 1, "rgba(20,20,40,.20)");         // 影

  // 脚と靴
  const step = frame % 2;
  const legY = 17;
  if (sitting) {
    d(4, legY, 8, 4, bottom);
    d(4, legY + 4, 8, 2, shoe);
  } else if (side) {
    d(6, legY, 4, 5, bottom);
    d(sx(4), legY + 5, 5, 2, shoe);
    d(sx(7), legY + 5 - step, 5, 2, shoe);
  } else {
    d(5, legY, 3, 5 - step, bottom); d(8, legY, 3, 5 - (1 - step), bottom);
    d(5, legY + 5 - step, 3, 2, shoe); d(8, legY + 5 - (1 - step), 3, 2, shoe);
  }

  // 胴と腕
  d(4, 10, 8, 8, top);
  if (side) { d(sx(4), 11, 2, 6, top); d(sx(5), 16, 2, 2, skin); }
  else {
    d(3, 11, 2, 6, top); d(12, 11, 2, 6, top);
    d(3, 17, 2, 2, skin); d(12, 17, 2, 2, skin);
  }
  if (look.acc === "tie" && !back) { d(7, 10, 2, 5, look.acc_col); d(7, 9, 2, 1, "#f2f4fa"); }
  if (!back && (look.hair === "bob" || look.hair === "pony" || look.hair === "long")) {
    d(4, 10, 8, 2, "#ffffff22");                 // 襟もと
  }

  // 頭
  d(4, 2, 8, 8, skin);
  // 髪型
  if (look.hair === "cap" || look.hair === "hat") {
    d(3, 2, 10, 3, look.cap_col);
    if (look.hair === "hat") d(2, 4, 12, 2, look.cap_col);
    else d(sx(11), 4, 4, 2, look.cap_col);       // つば
    d(4, 5, 2, 2, hair); d(10, 5, 2, 2, hair);
  } else if (look.hair === "bob") {
    d(3, 1, 10, 5, hair); d(3, 5, 2, 5, hair); d(11, 5, 2, 5, hair);
  } else if (look.hair === "pony") {
    d(3, 1, 10, 4, hair); d(3, 4, 2, 3, hair); d(11, 4, 2, 3, hair);
    d(flip ? 1 : 13, 4, 2, 6, hair); d(flip ? 1 : 13, 9, 3, 2, hair);
  } else if (look.hair === "long") {
    d(3, 1, 10, 5, hair); d(2, 4, 2, 9, hair); d(12, 4, 2, 9, hair);
  } else {
    d(4, 1, 8, 3, hair); d(3, 2, 2, 4, hair); d(11, 2, 2, 4, hair);
    if (look.hair === "gray") d(5, 1, 6, 1, "#e7e9ee");
  }

  // 顔
  if (!back) {
    const eyeY = 6;
    if (side) {
      d(sx(9), eyeY, 2, 2, "#2a2f3d");
      d(sx(11), 8, 1, 1, "#d99a86");
    } else {
      d(5, eyeY, 2, 2, "#2a2f3d"); d(9, eyeY, 2, 2, "#2a2f3d");
      d(7, 8, 2, 1, "#d99a86");
    }
    if (look.glasses) {
      const c = "#3c4356";
      if (side) { d(sx(8), eyeY - 1, 4, 4, "#ffffff55"); d(sx(8), eyeY - 1, 4, 1, c); d(sx(8), eyeY + 2, 4, 1, c); }
      else {
        d(4, eyeY - 1, 4, 4, "#ffffff55"); d(8, eyeY - 1, 4, 4, "#ffffff55");
        d(4, eyeY - 1, 8, 1, c); d(4, eyeY + 2, 8, 1, c); d(7, eyeY, 2, 1, c);
        d(3, eyeY, 1, 1, c); d(12, eyeY, 1, 1, c);
      }
    }
  }

  // 持ち物
  if (look.acc === "bag") { d(flip ? 1 : 12, 14, 4, 5, look.acc_col); d(flip ? 2 : 13, 13, 2, 1, "#5a4a34"); }
  if (look.acc === "folder") { d(flip ? 1 : 12, 13, 4, 5, look.acc_col); d(flip ? 1 : 12, 15, 4, 1, "#8a6a20"); }
  if (look.acc === "apple") { d(flip ? 2 : 12, 14, 3, 3, look.acc_col); d(flip ? 3 : 13, 13, 1, 1, "#3f7d4a"); }
}

/* ---------- 内装（すべて TS を基準に描く） ---------- */
const u = TS / 16;                                  // 内装ドットの単位
const D = (X, Y) => (x, y, w, h, c) => px(X + x * u, Y + y * u, w * u, h * u, c);

function drawFloor() {
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const X = x * TS, Y = y * TS;
    px(X, Y, TS, TS, (x + y) % 2 ? "#ece2cd" : "#e6dbc2");    // 明るいフローリング
    px(X, Y + TS - 3, TS, 2, "#d8cbaa");
    px(X + TS - 2, Y, 2, TS, "#dccfae");
  }
}

function drawZone(c) {
  const [zx, zy, zw, zh] = c.zone;
  const X = zx * TS, Y = zy * TS, W = zw * TS, H = zh * TS;
  ctx.globalAlpha = .26; px(X, Y, W, H, c.look.top);
  ctx.globalAlpha = .5; ctx.strokeStyle = c.look.top; ctx.lineWidth = 3;
  ctx.strokeRect(X + 2, Y + 2, W - 4, H - 4);
  ctx.globalAlpha = 1;
}

function drawTile(x, y) {
  const t = grid[y][x], X = x * TS, Y = y * TS, d = D(X, Y);
  if (t === 1) {                                    // 壁
    px(X, Y, TS, TS, "#c9d2e2");
    d(0, 0, 16, 4, "#aeb9cf"); d(0, 12, 16, 4, "#b7c1d5");
    if (y === 0) { d(0, 2, 16, 9, "#9fb6d8"); d(1, 3, 14, 7, "#c9dcf3"); d(1, 3, 6, 7, "#dceaf9"); d(7, 3, 2, 7, "#9fb6d8"); }
  } else if (t === 2) {                             // デスク＋モニタ＋椅子
    d(0, 9, 16, 2, "#a9b2c4");
    d(0, 3, 16, 7, "#f4f6fa"); d(0, 2, 16, 2, "#dfe5f0");
    d(1, 11, 2, 4, "#b6bccb"); d(13, 11, 2, 4, "#b6bccb");
    d(3, 4, 9, 5, "#39415a"); d(4, 5, 7, 3, "#87bde3"); d(6, 9, 3, 1, "#7d8598");
    d(12, 4, 3, 4, "#e6eaf3"); d(12, 4, 3, 1, "#c3cbdb");
  } else if (t === 3) {                             // 受付カウンター
    d(0, 1, 16, 3, "#c9a26a"); d(0, 4, 16, 9, "#eef1f7");
    d(0, 13, 16, 2, "#cdd4e2"); d(2, 7, 12, 4, "#dfe5f0");
  } else if (t === 4) {                             // 観葉植物
    d(5, 11, 6, 4, "#c08d5c"); d(5, 11, 6, 1, "#d6a878");
    d(2, 3, 12, 8, "#3f9166"); d(5, 1, 7, 4, "#4fa876"); d(4, 5, 3, 2, "#63c290");
  } else if (t === 5) {                             // 会議テーブル
    d(0, 3, 16, 9, "#dcbc8d"); d(0, 2, 16, 2, "#ecd3ab"); d(0, 12, 16, 2, "#c4a074");
    d(4, 6, 8, 3, "#fafbfe");
  } else if (t === 6) {                             // 決裁棚
    d(1, 2, 14, 13, "#c08d5c"); d(1, 1, 14, 2, "#d6a878"); d(2, 6, 12, 1, "#a97a4c");
    for (let i = 0; i < Math.min(6, DATA.inbox.length); i++)
      d(3, 12 - i * 2, 10, 1.4, i === 0 ? "#f2c14e" : "#fbfaf3");
  } else if (t === 9) {                             // ウォーターサーバー
    d(4, 8, 8, 7, "#dfe6f1"); d(4, 14, 8, 1, "#b6bccb");
    d(5, 2, 6, 6, "#8fd0e8"); d(5, 2, 6, 1, "#cfe9f5"); d(6, 9, 4, 2, "#7f8aa2");
  } else if (t === 10) {                            // コピー機
    d(2, 4, 12, 11, "#c7cede"); d(2, 3, 12, 2, "#9aa5bd"); d(4, 7, 8, 3, "#eef1f7");
    d(4, 11, 8, 2, "#f7f9fd"); d(11, 5, 2, 1, "#6fd3a0");
  } else if (t === 7) {                             // ホワイトボード
    d(1, 3, 14, 10, "#f8faff"); d(1, 2, 14, 2, "#aab5cb"); d(1, 13, 14, 1, "#aab5cb");
    d(3, 6, 9, 1, "#8fa4c8"); d(3, 9, 6, 1, "#c0846f");
  }
}

function plate(text, cx, cy, color, align) {
  ctx.font = "700 12px " + getComputedStyle(document.body).fontFamily;
  ctx.textAlign = align || "center";
  const w = ctx.measureText(text).width + 14;
  const x = align === "left" ? cx - 8 : cx - w / 2;
  px(x, cy - 14, w, 19, "rgba(12,16,28,.80)");
  px(x, cy - 14, 3, 19, color);
  ctx.fillStyle = "#eaf0ff"; ctx.fillText(text, align === "left" ? cx + 2 : cx, cy);
}

function drawBubble(a) {
  if (!a.bubble) return;
  ctx.font = "600 13px " + getComputedStyle(document.body).fontFamily;
  const maxW = 250; const lines = []; let line = "";
  for (const ch of a.bubble.text) {
    if (ctx.measureText(line + ch).width > maxW) { lines.push(line); line = ch; } else line += ch;
  }
  lines.push(line);
  const w = Math.min(maxW, Math.max(...lines.map(l => ctx.measureText(l).width))) + 22;
  const h = lines.length * 18 + 18;
  let bx = a.px + TS / 2 - w / 2, by = a.py - h + 4;
  bx = Math.max(6, Math.min(cv.width - w - 6, bx)); by = Math.max(6, by);
  px(bx, by, w, h, "#0b1020"); px(bx + 3, by + 3, w - 6, h - 6, "#131b30");
  ctx.strokeStyle = a.bubble.color; ctx.lineWidth = 2; ctx.strokeRect(bx + 1.5, by + 1.5, w - 3, h - 3);
  px(a.px + TS / 2 - 4, by + h - 2, 8, 8, "#131b30");
  ctx.textAlign = "left";
  lines.forEach((l, i) => { ctx.fillStyle = i === 0 ? a.bubble.color : "#e3e9fa"; ctx.fillText(l, bx + 11, by + 22 + i * 18); });
}

/* ---------- 再生 ---------- */
let events = [], cursor = 0, playing = !reduce, speed = 1, nextAt = 0;
const SPEEDS = [1, 2, 4]; let speedIdx = 0;
const eventsFor = date => date === "all" ? DATA.events : DATA.events.filter(e => e.date === date);

function resetPlayback() {
  cursor = 0; nextAt = performance.now() + 900;
  document.getElementById("loglist").innerHTML = "";
  document.getElementById("clock").textContent = events.length ? events[0].time : "--:--";
  actors.forEach(a => {
    a.bubble = null; a.path = []; a.state = "idle"; a.task = null; a.report = false;
    a.tx = a.home.x; a.ty = a.home.y; a.px = a.tx * TS; a.py = a.ty * TS; a.dir = "down";
  });
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
  a.bubble = { text: `[${e.kind}] ${e.title}`, color: KIND_COLOR[e.kind] || "#e3e9fa" };
  a.bubbleUntil = performance.now() + 4600 / speed;
  a.task = { kind: e.kind, title: e.title };
  if (a !== secretary) {
    a.path = bfs({ x: a.tx, y: a.ty }, DESK_FRONT);
    a.state = a.path.length ? "walk" : "idle";
    a.report = true;
    secretary.dir = "up";
  }
  renderTasks();
}

function stepActors(dt, now) {
  let changed = false;
  actors.forEach(a => {
    if (a.bubble && now > a.bubbleUntil) { a.bubble = null; if (a.task) { a.task = null; changed = true; } }
    if (a.state === "walk") {
      const next = a.path[0];
      if (!next) { a.state = "idle"; a.wait = 700; changed = true; return; }
      const gx = next.x * TS, gy = next.y * TS;
      const sp = 105 * speed * dt / 1000 * 1.6;
      if (Math.abs(gx - a.px) > 0.5) { a.dir = gx > a.px ? "right" : "left"; a.px += Math.sign(gx - a.px) * Math.min(sp, Math.abs(gx - a.px)); }
      else if (Math.abs(gy - a.py) > 0.5) { a.dir = gy > a.py ? "down" : "up"; a.py += Math.sign(gy - a.py) * Math.min(sp, Math.abs(gy - a.py)); }
      if (Math.abs(gx - a.px) < 1 && Math.abs(gy - a.py) < 1) {
        a.px = gx; a.py = gy; a.tx = next.x; a.ty = next.y; a.path.shift();
        if (!a.path.length) {
          a.state = "idle"; changed = true;
          a.wait = a.report ? 1800 / speed : 700 + Math.random() * 2200;
          if (a.report) { a.dir = "down"; a.report = false; a.goHome = true; }
        }
      }
    } else {
      a.wait -= dt * speed;
      if (a.wait > 0) return;
      if (a.secretary) {
        const t = { x: 7 + Math.floor(Math.random() * 2), y: 6 };
        if (walkable(t.x, t.y)) { a.path = bfs({ x: a.tx, y: a.ty }, t); a.state = a.path.length ? "walk" : "idle"; }
        a.wait = 1800 + Math.random() * 2600; return;
      }
      if (a.status !== "active") { a.wait = 2500; return; }
      let t;
      if (a.goHome) { t = a.home; a.goHome = false; }
      else { const [zx, zy, zw, zh] = a.zone; t = { x: zx + 1 + Math.floor(Math.random() * (zw - 2)), y: zy + 1 + Math.floor(Math.random() * (zh - 2)) }; }
      if (walkable(t.x, t.y)) { a.path = bfs({ x: a.tx, y: a.ty }, t); a.state = a.path.length ? "walk" : "idle"; changed = true; }
      a.wait = 900 + Math.random() * 2600;
    }
  });
  if (changed) renderTasks();
}

function render(now) {
  ctx.clearRect(0, 0, cv.width, cv.height);
  drawFloor();
  DATA.cast.forEach(c => { if (!c.secretary) drawZone(c); });
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (grid[y][x] !== 0) drawTile(x, y);

  DATA.cast.forEach(c => { if (!c.secretary) plate(`${c.emoji} ${c.name}`, c.zone[0] * TS + 12, c.zone[1] * TS + 24, c.look.top, "left"); });
  plate("受付 ／ 窓口は秘書ひとり", (COUNTER.x0 + COUNTER.x1 + 1) / 2 * TS, COUNTER.y * TS - 6, "#f2c14e");
  plate(`決裁箱 ${DATA.inbox.length}`, 11.5 * TS, COUNTER.y * TS - 6, "#e2b263");

  const frame = Math.floor(now / 150);
  [...actors].sort((a, b) => a.py - b.py).forEach(a => {
    const sitting = false;
    drawPerson(a.px + (TS - 16 * P) / 2, a.py + TS - 24 * P, a.look, a.dir, a.state === "walk" ? frame : 0, sitting);
    if (a.mark === "zzz" && a.state === "idle") {
      ctx.font = "700 13px " + getComputedStyle(document.body).fontFamily; ctx.textAlign = "center";
      ctx.fillStyle = "#5d6b8c"; ctx.fillText("z z Z".slice(0, 1 + (Math.floor(now / 500) % 3) * 2), a.px + TS / 2, a.py - 14);
    } else if (a.mark === "!") {
      ctx.font = "800 16px " + getComputedStyle(document.body).fontFamily; ctx.textAlign = "center";
      ctx.fillStyle = "#e0553a"; ctx.fillText("!", a.px + TS / 2, a.py - 14 - (Math.floor(now / 400) % 2) * 2);
    }
    if (a.secretary || a.task || a.report) plate(a.name, a.px + TS / 2, a.py + TS + 12, a.secretary ? "#f2c14e" : a.look.top);
  });
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
      nextAt = now + 5600 / speed;
    }
  }
  render(now);
  requestAnimationFrame(loop);
}

/* ---------- 「現在行われているタスク」ウィンドウ ---------- */
function taskOf(a) {
  if (a.task) return ["報告中", `「${a.task.title}」を秘書に報告`];
  if (a.report || (a.state === "walk" && a.goHome === false && a.path.length && a.report))
    return ["移動中", "受付へ向かっている"];
  if (!a.secretary && a.status !== "active") return ["休止中", "案件が来るまで席で待機（paused）"];
  if (!a.secretary && a.mark === "!") return ["停滞", `${a.idle_days === null ? "記録なし" : a.idle_days + "日"}動いていない`];
  if (a.state === "walk") return ["移動中", a.goHome ? "自席へ戻っている" : "フロアを巡回中"];
  if (a.secretary) return ["待機中", `受付で待機／決裁待ち ${DATA.inbox.length}件`];
  return ["待機中", "自席で作業中"];
}
const tasksEl = document.getElementById("tasks");
function renderTasks() {
  tasksEl.replaceChildren();
  actors.forEach(a => {
    const [tag, text] = taskOf(a);
    const li = document.createElement("li");
    if (tag === "待機中" || tag === "休止中") li.className = "dim";
    const cur = document.createElement("span");
    cur.className = "cur" + (tag === "報告中" ? " blink" : "");
    cur.textContent = tag === "報告中" ? "▶" : "";
    const who = document.createElement("span"); who.className = "who"; who.textContent = `${a.emoji} ${a.name}`;
    const what = document.createElement("span"); what.className = "what";
    const t = document.createElement("span"); t.className = "tag t-" + tag; t.textContent = tag;
    what.append(t, document.createTextNode(text));
    li.append(cur, who, what);
    tasksEl.append(li);
  });
}

/* ---------- 操作 ---------- */
const datesel = document.getElementById("datesel");
DATA.dates.forEach(d => { const o = document.createElement("option"); o.value = d; o.textContent = d; datesel.append(o); });
{ const o = document.createElement("option"); o.value = "all"; o.textContent = "全期間"; datesel.append(o); }
datesel.value = DATA.dates.length ? DATA.dates[DATA.dates.length - 1] : "all";
function loadDate() {
  events = eventsFor(datesel.value);
  document.getElementById("daylabel").textContent = `記録 ${events.length} 件`;
  resetPlayback(); renderTasks();
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
speedBtn.addEventListener("click", () => { speedIdx = (speedIdx + 1) % SPEEDS.length; speed = SPEEDS[speedIdx]; speedBtn.textContent = `速度 ×${speed}`; });
document.getElementById("restart").addEventListener("click", loadDate);

/* ---------- 右側パネル ---------- */
const maxEntries = Math.max(1, ...DATA.cast.map(c => c.entries));
const party = document.getElementById("party");
DATA.cast.forEach(c => {
  const li = document.createElement("li");
  const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = `${c.emoji} ${c.name}`;
  const st = document.createElement("span");
  const stale = !c.secretary && c.status === "active" && (c.idle_days === null || c.idle_days >= 3);
  st.className = "st " + (c.status !== "active" ? "warn" : stale ? "alert" : "ok");
  st.textContent = c.status !== "active" ? "paused" : stale ? "停滞" : "稼働中";
  const g = document.createElement("span"); g.className = "gauge";
  const i = document.createElement("i"); i.style.width = Math.round(c.entries / maxEntries * 100) + "%"; g.append(i);
  const sub = document.createElement("span"); sub.className = "sub";
  sub.textContent = `記録 ${c.entries} ／ ルール ${c.rules}条 ／ 最終稼働 ${c.idle_days === null ? "—" : c.idle_days === 0 ? "今日" : c.idle_days + "日前"}`;
  li.append(nm, document.createElement("span"), st, g, sub);
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
