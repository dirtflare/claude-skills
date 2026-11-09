#!/usr/bin/env python3
"""autopilot 共通処理。Vault の解決、設定、Daily Note への追記。

フックから呼ばれるため、**例外を外へ出さない**ことを最優先にする。
ここで失敗しても、ユーザーの Claude Code セッションは止まってはいけない。
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime
from pathlib import Path

CONFIG_RELPATH = "90_System/autopilot.json"

DEFAULT_CONFIG = {
    "capture_prompts": True,
    "capture_answers": True,
    "recall": True,
    "recall_limit": 3,
    "recall_min_score": 3.0,
    "recall_min_ratio": 0.3,
    "min_prompt_chars": 12,
    "max_capture_chars": 300,
    "daily_dir": "10_Daily",
    "session_log_heading": "Session Log",
    "log_queries": False,
    "exclude_patterns": [],
}

HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")


def find_vault(start: str | None = None) -> Path | None:
    """Vault を探す。環境変数 OBSIDIAN_VAULT が最優先。

    次に cwd から上へ遡り、.obsidian か 90_System を持つディレクトリを探す。
    """
    env = os.environ.get("OBSIDIAN_VAULT")
    if env:
        path = Path(env).expanduser()
        if path.is_dir():
            return path.resolve()

    current = Path(start or os.getcwd()).expanduser().resolve()
    if not current.is_dir():
        current = Path(os.getcwd()).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / ".obsidian").is_dir() or (candidate / "90_System").is_dir():
            return candidate
    return None


def load_config(vault: Path) -> dict:
    config = dict(DEFAULT_CONFIG)
    path = vault / CONFIG_RELPATH
    if path.exists():
        try:
            config.update(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            pass
    return config


def daily_note_path(vault: Path, config: dict, when: datetime | None = None) -> Path:
    when = when or datetime.now()
    directory = vault / config.get("daily_dir", "10_Daily")
    return directory / f"{when:%Y-%m-%d}.md"


def ensure_daily_note(path: Path) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    date = path.stem
    path.write_text(
        f"---\ntype: daily\ncreated: {date}\nstatus: active\n---\n\n# {date}\n",
        encoding="utf-8",
    )


def append_under_heading(path: Path, heading: str, lines: list[str]) -> None:
    """指定見出しの末尾へ追記する。見出しが無ければ作る。

    既存の本文は書き換えない。追記だけなので、ユーザーの編集と衝突しにくい。
    """
    if not lines:
        return

    text = path.read_text(encoding="utf-8")
    body = text.splitlines()

    target_index = None
    target_level = 2
    for i, line in enumerate(body):
        match = HEADING_RE.match(line)
        if match and match.group(2).strip().lower() == heading.lower():
            target_index = i
            target_level = len(match.group(1))
            break

    if target_index is None:
        if body and body[-1].strip():
            body.append("")
        body.append(f"## {heading}")
        body.append("")
        body.extend(lines)
    else:
        insert_at = len(body)
        for i in range(target_index + 1, len(body)):
            match = HEADING_RE.match(body[i])
            if match and len(match.group(1)) <= target_level:
                insert_at = i
                break
        while insert_at > target_index + 1 and not body[insert_at - 1].strip():
            insert_at -= 1
        body[insert_at:insert_at] = lines

    path.write_text("\n".join(body).rstrip() + "\n", encoding="utf-8")


def squash(text: str, limit: int) -> str:
    """改行とコードブロックを畳んで 1 行にする。"""
    text = re.sub(r"```.*?```", "[code]", text, flags=re.DOTALL)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > limit:
        text = text[:limit].rstrip() + "…"
    return text


def should_skip(prompt: str, config: dict) -> bool:
    """記録する価値のない入力を落とす。

    記録しすぎは Daily Note をノイズで埋め、結局読まれなくなる。
    """
    stripped = prompt.strip()
    if len(stripped) < int(config.get("min_prompt_chars", 12)):
        return True
    if stripped.startswith("/"):
        return True
    if stripped.lower() in {
        "continue", "go", "ok", "yes", "no", "next", "thanks",
        "続けて", "はい", "いいえ", "お願いします", "ありがとう",
    }:
        return True
    for pattern in config.get("exclude_patterns", []):
        try:
            if re.search(pattern, stripped):
                return True
        except re.error:
            continue
    return False


def read_hook_input() -> dict:
    import sys

    try:
        raw = sys.stdin.read()
        return json.loads(raw) if raw.strip() else {}
    except (json.JSONDecodeError, OSError, ValueError):
        return {}
