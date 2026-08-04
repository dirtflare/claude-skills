#!/usr/bin/env python3
"""company/ 配下の実ファイルを走査して、会社ダッシュボードのHTMLを生成する。

使い方:
    python3 tools/build_dashboard.py [--company company] [--out company-dashboard.html]

数字はすべてファイル由来。手入力の値はひとつも無い。
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
from pathlib import Path

LOG_NAME = re.compile(r"^(\d{4}-\d{2}-\d{2})\.md$")
ENTRY = re.compile(r"^##\s+(\d{1,2}:\d{2})\s*(?:\[([^\]]+)\])?\s*(.*)$")
KINDS = ["決定", "学び", "アイデア", "作業", "課題"]


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def front_matter(text: str) -> tuple[dict, str]:
    """先頭の --- ブロックを素朴に key: value として読む。"""
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    meta = {}
    for line in text[3:end].splitlines():
        if ":" in line and not line.strip().startswith("#"):
            k, _, v = line.partition(":")
            meta[k.strip()] = v.strip()
    return meta, text[end + 4 :]


def parse_logs(log_dir: Path) -> list[dict]:
    """logs/YYYY-MM-DD.md 群を、時刻つきエントリの一覧に変換する。"""
    entries: list[dict] = []
    if not log_dir.is_dir():
        return entries
    for f in sorted(log_dir.glob("*.md")):
        m = LOG_NAME.match(f.name)
        if not m:
            continue
        date = m.group(1)
        current: dict | None = None
        for line in read(f).splitlines():
            hit = ENTRY.match(line)
            if hit:
                current = {
                    "date": date,
                    "time": hit.group(1),
                    "kind": (hit.group(2) or "作業").strip(),
                    "title": hit.group(3).strip(),
                    "body": "",
                }
                entries.append(current)
            elif current is not None and line.strip():
                current["body"] = (current["body"] + " " + line.strip()).strip()
    entries.sort(key=lambda e: (e["date"], e["time"]), reverse=True)
    return entries


def parse_rules(rules_dir: Path) -> list[str]:
    rules: list[str] = []
    if not rules_dir.is_dir():
        return rules
    for f in sorted(rules_dir.glob("*.md")):
        for line in read(f).splitlines():
            s = line.strip()
            if s.startswith("- "):
                rules.append(s[2:].strip())
    return rules


def parse_inbox(inbox_dir: Path) -> tuple[list[dict], int]:
    """未処理 inbox の一覧と、done/ の件数を返す。"""
    open_items: list[dict] = []
    if not inbox_dir.is_dir():
        return open_items, 0
    for f in sorted(inbox_dir.glob("*.md")):
        text = read(f)
        title = next((l[2:].strip() for l in text.splitlines() if l.startswith("# ")), f.stem)
        rec = ""
        lines = text.splitlines()
        for i, line in enumerate(lines):
            if "推奨" in line and line.startswith("#"):
                rec = " ".join(l.strip() for l in lines[i + 1 :] if l.strip() and not l.startswith("#"))
                break
        date = f.stem[:10] if LOG_NAME.match(f.stem[:10] + ".md") else ""
        open_items.append({"title": title, "file": f.name, "date": date, "recommend": rec})
    done = len(list((inbox_dir / "done").glob("*.md"))) if (inbox_dir / "done").is_dir() else 0
    return open_items, done


def days_since(date_str: str, today: dt.date) -> int | None:
    if not date_str:
        return None
    try:
        return (today - dt.date.fromisoformat(date_str)).days
    except ValueError:
        return None


def collect(company: Path, today: dt.date) -> dict:
    sec_logs = parse_logs(company / "secretary" / "logs")
    inbox_open, inbox_done = parse_inbox(company / "secretary" / "inbox")
    feedback = parse_logs(company / "secretary" / "feedback")
    feedback_files = sorted((company / "secretary" / "feedback").glob("*.md")) if (
        company / "secretary" / "feedback"
    ).is_dir() else []

    members = [
        {
            "id": "secretary",
            "name_ja": "秘書",
            "emoji": "🗂",
            "role": "オーナーとのやり取りの唯一の窓口。依頼を受けて、担当部署に自分で振り分ける。",
            "kpi": "振り分けの正確さ / inbox の滞留日数",
            "status": "active",
            "is_secretary": True,
            "path": "company/secretary",
            "logs": sec_logs,
            "rules": [
                l.strip()[2:].strip()
                for l in read(company / "secretary" / "CLAUDE.md").splitlines()
                if l.strip().startswith("- ")
            ],
        }
    ]

    dept_dir = company / "departments"
    if dept_dir.is_dir():
        for d in sorted(p for p in dept_dir.iterdir() if p.is_dir()):
            meta, _ = front_matter(read(d / "DEPARTMENT.md"))
            members.append(
                {
                    "id": d.name,
                    "name_ja": meta.get("name_ja", d.name),
                    "emoji": meta.get("emoji", "▪"),
                    "role": meta.get("role", ""),
                    "kpi": meta.get("kpi", ""),
                    "status": meta.get("status", "active"),
                    "is_secretary": False,
                    "path": f"company/departments/{d.name}",
                    "logs": parse_logs(d / "logs"),
                    "rules": parse_rules(d / "rules"),
                }
            )

    all_entries: list[dict] = []
    for m in members:
        last = m["logs"][0]["date"] if m["logs"] else ""
        m["last_active"] = last
        m["idle_days"] = days_since(last, today)
        m["entry_count"] = len(m["logs"])
        m["kind_counts"] = {k: sum(1 for e in m["logs"] if e["kind"] == k) for k in KINDS}
        for e in m["logs"]:
            all_entries.append({**e, "member": m["name_ja"], "member_id": m["id"], "emoji": m["emoji"]})
    all_entries.sort(key=lambda e: (e["date"], e["time"]), reverse=True)

    # 直近 8 週間の日別記録数（ヒートマップ用）
    counts: dict[str, int] = {}
    for e in all_entries:
        counts[e["date"]] = counts.get(e["date"], 0) + 1
    start = today - dt.timedelta(days=today.weekday() + 7 * 7)
    heat = [
        {"date": (start + dt.timedelta(days=i)).isoformat(),
         "count": counts.get((start + dt.timedelta(days=i)).isoformat(), 0),
         "future": start + dt.timedelta(days=i) > today}
        for i in range(56)
    ]

    return {
        "generated": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "today": today.isoformat(),
        "members": members,
        "entries": all_entries,
        "inbox_open": inbox_open,
        "inbox_done": inbox_done,
        "feedback_entries": feedback,
        "feedback_days": len(feedback_files),
        "heat": heat,
        "totals": {
            "members": len(members),
            "active": sum(1 for m in members if m["status"] == "active"),
            "entries": len(all_entries),
            "rules": sum(len(m["rules"]) for m in members),
            "stale": sum(1 for m in members if m["status"] == "active" and (m["idle_days"] is None or m["idle_days"] >= 3)),
        },
    }


TEMPLATE = r"""<title>__TITLE__</title>
<style>
:root {
  --ground: #f4f5f7;
  --panel: #ffffff;
  --panel-2: #eceef2;
  --line: #d5d9e0;
  --line-soft: #e3e6ec;
  --ink: #171a20;
  --ink-2: #4a515e;
  --ink-3: #767f8e;
  --accent: #1f3f8f;
  --accent-soft: #dbe3f7;
  --ok: #1f7a4d;
  --warn: #9a6410;
  --alert: #b13a26;
  --ok-bg: #dff0e5;
  --warn-bg: #f8ecd4;
  --alert-bg: #f7dfd9;
  --heat-0: #e5e8ee;
  --shadow: 0 1px 2px rgba(20,26,40,.06), 0 8px 24px -18px rgba(20,26,40,.5);
  --mono: ui-monospace, "SFMono-Regular", "Menlo", "Consolas", monospace;
  --gothic: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic Medium", "Yu Gothic",
            "Noto Sans JP", "Meiryo", system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ground: #101319; --panel: #171b23; --panel-2: #1e232d; --line: #2b323e;
    --line-soft: #232935; --ink: #eef1f6; --ink-2: #b0b8c6; --ink-3: #7c8697;
    --accent: #8fabf0; --accent-soft: #22304f;
    --ok: #6fd3a0; --warn: #e2b263; --alert: #f0907a;
    --ok-bg: #16302a; --warn-bg: #322815; --alert-bg: #38201c; --heat-0: #232935;
    --shadow: 0 1px 2px rgba(0,0,0,.4), 0 10px 30px -20px #000;
  }
}
:root[data-theme="dark"] {
  --ground: #101319; --panel: #171b23; --panel-2: #1e232d; --line: #2b323e;
  --line-soft: #232935; --ink: #eef1f6; --ink-2: #b0b8c6; --ink-3: #7c8697;
  --accent: #8fabf0; --accent-soft: #22304f;
  --ok: #6fd3a0; --warn: #e2b263; --alert: #f0907a;
  --ok-bg: #16302a; --warn-bg: #322815; --alert-bg: #38201c; --heat-0: #232935;
  --shadow: 0 1px 2px rgba(0,0,0,.4), 0 10px 30px -20px #000;
}
:root[data-theme="light"] {
  --ground: #f4f5f7; --panel: #ffffff; --panel-2: #eceef2; --line: #d5d9e0;
  --line-soft: #e3e6ec; --ink: #171a20; --ink-2: #4a515e; --ink-3: #767f8e;
  --accent: #1f3f8f; --accent-soft: #dbe3f7;
  --ok: #1f7a4d; --warn: #9a6410; --alert: #b13a26;
  --ok-bg: #dff0e5; --warn-bg: #f8ecd4; --alert-bg: #f7dfd9; --heat-0: #e5e8ee;
  --shadow: 0 1px 2px rgba(20,26,40,.06), 0 8px 24px -18px rgba(20,26,40,.5);
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--ground); color: var(--ink);
  font-family: var(--gothic); line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 1120px; margin: 0 auto; padding: 32px 20px 96px; display: flex; flex-direction: column; gap: 34px; }
.eyebrow {
  font-family: var(--mono); font-size: 11px; letter-spacing: .16em; text-transform: uppercase;
  color: var(--ink-3); margin: 0;
}
h1 { font-size: clamp(26px, 4.4vw, 40px); line-height: 1.25; letter-spacing: -.02em; margin: 6px 0 0; text-wrap: balance; }
h2 { font-size: 17px; letter-spacing: .01em; margin: 0; }
section > header { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
section > header .note { font-size: 12.5px; color: var(--ink-3); }
.masthead { border-bottom: 1px solid var(--line); padding-bottom: 22px; display: flex; gap: 20px; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; }
.masthead .sub { color: var(--ink-2); font-size: 14px; margin: 10px 0 0; max-width: 62ch; }
.stamp {
  font-family: var(--mono); font-size: 11.5px; color: var(--ink-3);
  border: 1px solid var(--line); border-radius: 2px; padding: 8px 12px; background: var(--panel);
  white-space: nowrap;
}
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); }
.tile { background: var(--panel); padding: 16px 18px; display: flex; flex-direction: column; gap: 2px; }
.tile .k { font-family: var(--mono); font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); }
.tile .v { font-size: 30px; font-weight: 700; letter-spacing: -.02em; font-variant-numeric: tabular-nums; line-height: 1.2; }
.tile .u { font-size: 12px; color: var(--ink-3); }
.tile.flag .v { color: var(--alert); }
.panel { background: var(--panel); border: 1px solid var(--line); box-shadow: var(--shadow); }

/* 組織図 */
.org { padding: 22px 20px; display: grid; grid-template-columns: 200px 1fr; gap: 22px; align-items: center; }
.org .owner { display: flex; flex-direction: column; gap: 10px; }
.node {
  border: 1px solid var(--line); background: var(--panel-2); padding: 10px 12px;
  display: flex; gap: 10px; align-items: center; font-size: 13.5px;
}
.node.owner-node { border-color: var(--accent); background: var(--accent-soft); font-weight: 700; }
.node.sec { border-left: 3px solid var(--accent); }
.node .em { font-size: 16px; }
.org .fan { display: flex; flex-direction: column; gap: 8px; border-left: 1px solid var(--line); padding-left: 22px; position: relative; }
.org .fan .rail { position: absolute; left: -1px; top: 50%; width: 22px; height: 1px; background: var(--line); }
.branch { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.branch::before { content: ""; width: 14px; height: 1px; background: var(--line); flex: none; }
.branch .nm { font-weight: 600; }
.branch .rl { color: var(--ink-3); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 社員カード */
.staff { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.card { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-top: 3px solid var(--line); }
.card.is-secretary { border-top-color: var(--accent); }
.card.is-stale { border-top-color: var(--alert); }
.card.is-paused { opacity: .82; }
.card .top { display: flex; gap: 12px; align-items: flex-start; }
.card .em { font-size: 24px; line-height: 1; }
.card .nm { font-size: 17px; font-weight: 700; letter-spacing: -.01em; }
.card .pathline { font-family: var(--mono); font-size: 11px; color: var(--ink-3); word-break: break-all; }
.card .role { font-size: 13px; color: var(--ink-2); margin: 0; }
.pill {
  font-family: var(--mono); font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase;
  padding: 3px 8px; border-radius: 999px; white-space: nowrap;
}
.pill.ok { background: var(--ok-bg); color: var(--ok); }
.pill.warn { background: var(--warn-bg); color: var(--warn); }
.pill.alert { background: var(--alert-bg); color: var(--alert); }
.metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--line-soft); border: 1px solid var(--line-soft); }
.metrics div { background: var(--panel); padding: 8px 10px; }
.metrics .k { font-family: var(--mono); font-size: 10px; letter-spacing: .1em; color: var(--ink-3); text-transform: uppercase; }
.metrics .v { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
.bars { display: flex; gap: 6px; flex-wrap: wrap; }
.bar { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--ink-2); }
.bar i { width: 8px; height: 8px; display: block; border-radius: 2px; background: var(--accent); opacity: .85; }
.bar.k-課題 i { background: var(--alert); }
.bar.k-決定 i { background: var(--ok); }
.bar.k-学び i { background: var(--warn); }
.recent { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; border-top: 1px dashed var(--line); padding-top: 12px; }
.recent li { display: grid; grid-template-columns: 88px 1fr; gap: 10px; font-size: 12.5px; align-items: baseline; }
.recent .when { font-family: var(--mono); font-size: 10.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.recent .kd { font-weight: 700; }
.empty { font-size: 12.5px; color: var(--ink-3); font-style: normal; }

/* 決裁箱 */
.inbox { display: flex; flex-direction: column; }
.inbox-item { padding: 16px 18px; border-bottom: 1px solid var(--line-soft); display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; }
.inbox-item:last-child { border-bottom: none; }
.inbox-item .t { font-weight: 700; font-size: 14.5px; }
.inbox-item .rec { grid-column: 1 / -1; font-size: 12.5px; color: var(--ink-2); }
.inbox-item .rec b { color: var(--ink); }
.inbox-item .f { font-family: var(--mono); font-size: 10.5px; color: var(--ink-3); }

/* 稼働ヒートマップ */
.heat-wrap { padding: 18px; overflow-x: auto; }
.heat { display: grid; grid-auto-flow: column; grid-template-rows: repeat(7, 14px); gap: 3px; width: max-content; }
.heat i { width: 14px; height: 14px; background: var(--heat-0); border-radius: 2px; display: block; }
.heat i.f { opacity: .35; }
.legend { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--ink-3); margin-top: 12px; font-family: var(--mono); }
.legend i { width: 12px; height: 12px; border-radius: 2px; display: block; }

/* ルール台帳 */
.ledger { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); }
.ledger > div { background: var(--panel); padding: 16px 18px; }
.ledger h3 { font-size: 13px; margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
.ledger ol { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--ink-2); }
.ledger li::marker { font-family: var(--mono); font-size: 11px; color: var(--ink-3); }
footer { border-top: 1px solid var(--line); padding-top: 18px; font-size: 12.5px; color: var(--ink-3); }
footer code { font-family: var(--mono); background: var(--panel-2); padding: 2px 6px; }
</style>

<div class="wrap">
  <header class="masthead">
    <div>
      <p class="eyebrow">One-person company · operations board</p>
      <h1>__TITLE__</h1>
      <p class="sub">社員は0人。<b>company/</b> 配下の実ファイルだけを走査して出しています。数字は手入力ではなく、記録そのものです。</p>
    </div>
    <div class="stamp" id="stamp"></div>
  </header>

  <section class="tiles" id="tiles"></section>

  <section>
    <header><h2>組織図</h2><span class="note">私が話しかける相手は秘書ひとり。部署が増えてもこの線は変わらない。</span></header>
    <div class="panel org" id="org"></div>
  </section>

  <section>
    <header><h2>社員</h2><span class="note">3日以上記録が無い部署は、赤い上辺で「止まっている」ことを示す。</span></header>
    <div class="staff" id="staff"></div>
  </section>

  <section>
    <header><h2>決裁箱（秘書が判断を保留したもの）</h2><span class="note" id="inbox-note"></span></header>
    <div class="panel inbox" id="inbox"></div>
  </section>

  <section>
    <header><h2>稼働（直近8週）</h2><span class="note">1マス＝1日。濃さは記録の件数。</span></header>
    <div class="panel heat-wrap">
      <div class="heat" id="heat"></div>
      <div class="legend">少 <i style="background:var(--heat-0)"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> 多</div>
    </div>
  </section>

  <section>
    <header><h2>ルール台帳</h2><span class="note">フィードバックのたびに増える。ここが会社の資産。</span></header>
    <div class="ledger" id="ledger"></div>
  </section>

  <footer>
    更新は <code>python3 tools/build_dashboard.py</code>。会社の規則は <code>company/CLAUDE.md</code>。
  </footer>
</div>

<script>
const DATA = __DATA__;
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

/* ---- 見出しの刻印 ---- */
$("stamp").textContent = `生成 ${DATA.generated} ／ 基準日 ${DATA.today}`;

/* ---- サマリー ---- */
const t = DATA.totals;
[
  ["社員", t.members, `稼働中 ${t.active}`],
  ["記録", t.entries, "件（全部署の累計）"],
  ["ルール", t.rules, "条（明文化済み）"],
  ["決裁待ち", DATA.inbox_open.length, `処理済み ${DATA.inbox_done}`],
  ["止まっている部署", t.stale, "3日以上 記録なし"],
].forEach(([k, v, u], i) => {
  const tile = el("div", "tile" + (i === 4 && v > 0 ? " flag" : ""));
  tile.append(el("span", "k", k), el("span", "v", String(v)), el("span", "u", u));
  $("tiles").append(tile);
});

/* ---- 組織図 ---- */
const sec = DATA.members.find(m => m.is_secretary);
const depts = DATA.members.filter(m => !m.is_secretary);
const org = $("org");
const left = el("div", "owner");
const owner = el("div", "node owner-node");
owner.append(el("span", "em", "🧍"), el("span", null, "私（オーナー）"));
const secNode = el("div", "node sec");
secNode.append(el("span", "em", sec ? sec.emoji : "🗂"), el("span", null, "秘書 ／ 唯一の窓口"));
left.append(owner, secNode);
const fan = el("div", "fan");
fan.append(el("span", "rail"));
depts.forEach(d => {
  const b = el("div", "branch");
  b.append(el("span", "em", d.emoji), el("span", "nm", d.name_ja),
           el("span", "pill " + (d.status === "active" ? "ok" : "warn"), d.status),
           el("span", "rl", d.role));
  fan.append(b);
});
org.append(left, fan);

/* ---- 社員カード ---- */
function statusOf(m) {
  if (m.status !== "active") return ["warn", "paused"];
  if (m.idle_days === null || m.idle_days >= 3) return ["alert", "止まっている"];
  return ["ok", "稼働中"];
}
DATA.members.forEach(m => {
  const [tone, label] = statusOf(m);
  const card = el("div", "panel card" + (m.is_secretary ? " is-secretary" : "") +
    (tone === "alert" ? " is-stale" : "") + (m.status !== "active" ? " is-paused" : ""));

  const top = el("div", "top");
  const names = el("div");
  names.append(el("div", "nm", m.name_ja), el("div", "pathline", m.path));
  top.append(el("span", "em", m.emoji), names);
  const sp = el("span", "pill " + tone, label);
  sp.style.marginLeft = "auto";
  top.append(sp);
  card.append(top);
  if (m.role) card.append(el("p", "role", m.role));

  const metrics = el("div", "metrics");
  [["記録", m.entry_count], ["ルール", m.rules.length],
   ["最終稼働", m.idle_days === null ? "—" : (m.idle_days === 0 ? "今日" : m.idle_days + "日前")]
  ].forEach(([k, v]) => {
    const c = el("div"); c.append(el("div", "k", k), el("div", "v", String(v))); metrics.append(c);
  });
  card.append(metrics);

  const kinds = Object.entries(m.kind_counts).filter(([, n]) => n > 0);
  if (kinds.length) {
    const bars = el("div", "bars");
    kinds.forEach(([k, n]) => {
      const b = el("div", "bar k-" + k);
      b.append(el("i"), el("span", null, `${k} ${n}`));
      bars.append(b);
    });
    card.append(bars);
  }

  const ul = el("ul", "recent");
  if (m.logs.length === 0) {
    ul.append(el("li", "empty", "まだ記録がありません。"));
  } else {
    m.logs.slice(0, 3).forEach(e => {
      const li = el("li");
      li.append(el("span", "when", `${e.date.slice(5)} ${e.time}`));
      const body = el("span");
      body.append(el("span", "kd", `[${e.kind}] `), document.createTextNode(e.title));
      li.append(body);
      ul.append(li);
    });
  }
  card.append(ul);
  $("staff").append(card);
});

/* ---- 決裁箱 ---- */
$("inbox-note").textContent = `未処理 ${DATA.inbox_open.length} 件 ／ 処理済み ${DATA.inbox_done} 件`;
if (DATA.inbox_open.length === 0) {
  const d = el("div", "inbox-item");
  d.append(el("div", "t", "未処理はありません"));
  $("inbox").append(d);
} else {
  DATA.inbox_open.forEach(it => {
    const d = el("div", "inbox-item");
    d.append(el("div", "t", it.title), el("div", "f", it.file));
    if (it.recommend) {
      const r = el("div", "rec");
      r.append(el("b", null, "秘書の推奨： "), document.createTextNode(it.recommend));
      d.append(r);
    }
    $("inbox").append(d);
  });
}

/* ---- ヒートマップ ---- */
const max = Math.max(1, ...DATA.heat.map(h => h.count));
DATA.heat.forEach(h => {
  const i = el("i");
  if (h.future) i.className = "f";
  if (h.count > 0) {
    const a = 0.25 + 0.75 * (h.count / max);
    i.style.background = `color-mix(in srgb, var(--accent) ${Math.round(a * 100)}%, var(--heat-0))`;
  }
  i.title = `${h.date}：${h.count}件`;
  $("heat").append(i);
});
[1, 2, 3, 4].forEach(n => {
  const sw = document.querySelector(".legend .l" + n);
  if (sw) sw.style.background = `color-mix(in srgb, var(--accent) ${n * 25}%, var(--heat-0))`;
});

/* ---- ルール台帳 ---- */
DATA.members.forEach(m => {
  if (!m.rules.length) return;
  const box = el("div");
  const h = el("h3");
  h.append(el("span", null, m.emoji), el("span", null, m.name_ja),
           el("span", "pill ok", m.rules.length + "条"));
  box.append(h);
  const ol = el("ol");
  m.rules.forEach(r => ol.append(el("li", null, r)));
  box.append(ol);
  $("ledger").append(box);
});
</script>
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--company", default="company")
    ap.add_argument("--out", default="company-dashboard.html")
    ap.add_argument("--title", default="ひとり会社 稼働ボード")
    args = ap.parse_args()

    root = Path(__file__).resolve().parent.parent
    company = (root / args.company) if not Path(args.company).is_absolute() else Path(args.company)
    data = collect(company, dt.date.today())

    html = TEMPLATE.replace("__DATA__", json.dumps(data, ensure_ascii=False)).replace("__TITLE__", args.title)
    out = (root / args.out) if not Path(args.out).is_absolute() else Path(args.out)
    out.write_text(html, encoding="utf-8")

    tt = data["totals"]
    print(f"生成: {out}")
    print(f"社員 {tt['members']}／記録 {tt['entries']}件／ルール {tt['rules']}条／"
          f"決裁待ち {len(data['inbox_open'])}件／止まっている部署 {tt['stale']}")


if __name__ == "__main__":
    main()
