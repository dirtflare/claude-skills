#!/usr/bin/env python3
"""オフィスビューを「実況」で動かすローカルサーバー。

    python3 tools/serve_office.py            # http://127.0.0.1:8787 を開く
    python3 tools/serve_office.py --port 9000

/            … オフィスビューのHTML（毎回その場で生成し直す）
/state.json  … いま company/ に何が書かれているか＋稼働中セッションの状態

画面は /state.json を数秒ごとに読みに行くので、別のセッションで作業した内容が
そのままキャラクターの動きと「現在行われているタスク」に出る。
サーバーを立てずにHTMLを直接開いた場合は、生成時点のスナップショットとして動く。
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from build_dashboard import collect
from build_office import TEMPLATE, build

ROOT = Path(__file__).resolve().parent.parent


def live_sessions(company: Path) -> list[dict]:
    """company/.state/sessions.json を読んで、稼働中セッションの一覧にする。"""
    path = company / ".state" / "sessions.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    out = []
    now = dt.datetime.now()
    for s in raw.get("sessions", {}).values():
        try:
            updated = dt.datetime.fromisoformat(s.get("updated", ""))
        except ValueError:
            continue
        idle = (now - updated).total_seconds()
        if idle > 3600:                       # 1時間触られていないものは出さない
            continue
        out.append({
            "id": s.get("id", ""),
            "who": s.get("who", "secretary"),
            "task": s.get("task", ""),
            "state": "待機" if s.get("state") == "待機" or idle > 90 else "作業中",
            "tool": s.get("tool", ""),
            "target": s.get("target", ""),
            "tools": s.get("tools", 0),
            "cwd": Path(s.get("cwd", "")).name,
            "idle_sec": int(idle),
        })
    out.sort(key=lambda s: s["idle_sec"])
    return out


def snapshot(company: Path) -> dict:
    data = build(collect(company, dt.date.today()))
    data["live"] = {
        "now": dt.datetime.now().strftime("%H:%M"),
        "sessions": live_sessions(company),
    }
    return data


def make_handler(company: Path):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, body: bytes, ctype: str) -> None:
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):                      # noqa: N802
            path = self.path.split("?")[0]
            if path == "/state.json":
                self._send(json.dumps(snapshot(company), ensure_ascii=False).encode(), "application/json; charset=utf-8")
            elif path in ("/", "/index.html"):
                html = TEMPLATE.replace("__DATA__", json.dumps(snapshot(company), ensure_ascii=False))
                html = html.replace("__TITLE__", "ひとり会社 オフィスビュー")
                page = "<!doctype html><meta charset='utf-8'>" + html
                self._send(page.encode(), "text/html; charset=utf-8")
            elif path == "/favicon.ico":
                self.send_response(204); self.end_headers()
            else:
                self.send_error(404)

        def log_message(self, *_args):         # アクセスログは黙らせる
            pass

    return Handler


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--company", default="company")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()

    company = (ROOT / args.company) if not Path(args.company).is_absolute() else Path(args.company)
    srv = ThreadingHTTPServer((args.host, args.port), make_handler(company))
    print(f"オフィスビュー（実況）: http://{args.host}:{args.port}")
    print(f"監視対象: {company}   停止は Ctrl+C")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n終了しました。")


if __name__ == "__main__":
    main()
