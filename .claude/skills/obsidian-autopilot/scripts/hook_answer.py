#!/usr/bin/env python3
"""Stop フック — Claude の結論を Daily Note へ自動追記する。

Stop は last_assistant_message を直接渡してくれるので、
transcript を解析する必要がない。

SessionEnd は使わない。既定のバジェットが 1.5 秒しかなく、
発火しない事例も報告されているため、記録の取りこぼしが起きる。

**絶対に失敗してはいけない。** 何が起きても exit 0。
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


def main() -> int:
    try:
        from autopilot_lib import (
            append_under_heading, daily_note_path, ensure_daily_note,
            find_vault, load_config, read_hook_input, squash,
        )
    except Exception:
        return 0

    try:
        payload = read_hook_input()
        message = (payload.get("last_assistant_message") or "").strip()
        if not message or len(message) < 40:
            return 0

        override = None
        if "--vault" in sys.argv:
            try:
                override = sys.argv[sys.argv.index("--vault") + 1]
            except IndexError:
                override = None
        vault = find_vault(override or payload.get("cwd"))
        if not vault:
            return 0

        config = load_config(vault)
        if not config.get("capture_answers", True):
            return 0

        path = daily_note_path(vault, config)
        ensure_daily_note(path)
        stamp = datetime.now().strftime("%H:%M")
        line = f"- {stamp} **A** {squash(message, int(config.get('max_capture_chars', 300)))}"
        append_under_heading(
            path, config.get("session_log_heading", "Session Log"), [line]
        )
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
