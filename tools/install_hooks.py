#!/usr/bin/env python3
"""稼働記録のフックを、どのプロジェクトで作業しても効くように入れる。

    python3 tools/install_hooks.py            # ~/.claude/settings.json に入れる
    python3 tools/install_hooks.py --check    # 入っているか／今の状態はどうかを見る
    python3 tools/install_hooks.py --remove   # 外す

プロジェクト設定（.claude/settings.json）は、そのリポジトリで作業したときにしか
読まれない。日常の作業はいろいろな場所で走るので、ユーザー設定
（~/.claude/settings.json）に絶対パスで入れておく必要がある。
COMPANY_DIR を環境変数で固定するので、どこで働いても記録先はこの会社ひとつになる。
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import socket
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "tools" / "company_hook.py"
COMPANY = ROOT / "company"
USER_SETTINGS = Path.home() / ".claude" / "settings.json"
PROJECT_SETTINGS = ROOT / ".claude" / "settings.json"

EVENTS = [
    ("SessionStart", "start", None),
    ("UserPromptSubmit", "prompt", None),
    ("PostToolUse", "tool", "Write|Edit|Bash|Read|Glob|Grep|WebSearch|WebFetch|Task"),
    ("Stop", "stop", None),
    ("SessionEnd", "end", None),
]
MARK = "company_hook.py"


def command(sub: str) -> str:
    return f'COMPANY_DIR="{COMPANY}" python3 "{HOOK}" {sub} 2>/dev/null || true'


def load(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def install(path: Path) -> None:
    cfg = load(path)
    hooks = cfg.setdefault("hooks", {})
    for event, sub, matcher in EVENTS:
        entries = [e for e in hooks.get(event, [])
                   if not any(MARK in (h.get("command") or "") for h in e.get("hooks", []))]
        entry: dict = {"hooks": [{"type": "command", "command": command(sub), "async": True}]}
        if matcher:
            entry["matcher"] = matcher
        entries.append(entry)
        hooks[event] = entries
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"入れました: {path}")
    print(f"記録先 COMPANY_DIR = {COMPANY}")
    print("※ 反映には Claude Code の再起動（または /hooks を一度開く）が要ります。")


def remove(path: Path) -> None:
    cfg = load(path)
    hooks = cfg.get("hooks", {})
    for event, _sub, _m in EVENTS:
        kept = [e for e in hooks.get(event, [])
                if not any(MARK in (h.get("command") or "") for h in e.get("hooks", []))]
        if kept:
            hooks[event] = kept
        else:
            hooks.pop(event, None)
    if not hooks:
        cfg.pop("hooks", None)
    path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"外しました: {path}")


def installed_in(path: Path) -> list[str]:
    cfg = load(path)
    found = []
    for event, entries in (cfg.get("hooks") or {}).items():
        for e in entries:
            if any(MARK in (h.get("command") or "") for h in e.get("hooks", [])):
                found.append(event)
    return sorted(set(found))


def check() -> None:
    print("== 稼働記録フックの状態 ==")
    print(f"ホスト        : {socket.gethostname()}")
    print(f"フック本体    : {HOOK}  {'あり' if HOOK.exists() else '見つからない'}")
    print(f"記録先        : {COMPANY}")
    u, p = installed_in(USER_SETTINGS), installed_in(PROJECT_SETTINGS)
    print(f"ユーザー設定  : {USER_SETTINGS}")
    print(f"  → {', '.join(u) if u else '未設定（どのプロジェクトでも記録されません）'}")
    print(f"プロジェクト設定: {PROJECT_SETTINGS}")
    print(f"  → {', '.join(p) if p else '未設定'}")

    state = COMPANY / ".state" / "sessions.json"
    print(f"状態ファイル  : {state}")
    if not state.exists():
        print("  → まだ一度も書かれていません（フックが動いていない可能性が高い）")
        return
    data = json.loads(state.read_text(encoding="utf-8"))
    print(f"  → 最終更新 {data.get('updated', '不明')} / セッション {len(data.get('sessions', {}))}件")
    now = dt.datetime.now()
    for s in data.get("sessions", {}).values():
        try:
            idle = int((now - dt.datetime.fromisoformat(s.get("updated", ""))).total_seconds())
        except ValueError:
            idle = -1
        print(f"     [{s.get('who', '?'):<10}] {s.get('state', '?')} "
              f"{s.get('task', '')[:34]!r} {idle}秒前 ({Path(s.get('cwd', '')).name})")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="状態を見るだけ")
    ap.add_argument("--remove", action="store_true", help="フックを外す")
    ap.add_argument("--scope", choices=["user", "project"], default="user")
    args = ap.parse_args()

    target = USER_SETTINGS if args.scope == "user" else PROJECT_SETTINGS
    if args.check:
        check()
    elif args.remove:
        remove(target)
    else:
        install(target)
        print()
        check()


if __name__ == "__main__":
    main()
