#!/usr/bin/env python3
"""UserPromptSubmit フック — 自動取り込み と 自動想起 を同時に行う。

1. あなたが Claude に投げた問いを、今日の Daily Note へ追記する（自動記憶）
2. Vault からその話題に関連する既存ノートを探し、Claude の文脈へ注入する（自動想起）

2 が「第二の脳」の核心。あなたが「あのノートどこだっけ」と探さなくても、
関連する過去の自分の結論が、毎回勝手に会話へ入ってくる。

**このフックは絶対に失敗してはいけない。** 何が起きても exit 0 を返す。
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


def main() -> int:
    try:
        from autopilot_lib import (
            append_under_heading, daily_note_path, ensure_daily_note,
            find_vault, load_config, read_hook_input, should_skip, squash,
        )
    except Exception:
        return 0

    try:
        payload = read_hook_input()
        prompt = (payload.get("prompt") or "").strip()
        if not prompt:
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
        skip = should_skip(prompt, config)

        # --- 1. 自動取り込み
        if config.get("capture_prompts", True) and not skip:
            try:
                path = daily_note_path(vault, config)
                ensure_daily_note(path)
                stamp = datetime.now().strftime("%H:%M")
                line = f"- {stamp} **Q** {squash(prompt, int(config.get('max_capture_chars', 300)))}"
                append_under_heading(
                    path, config.get("session_log_heading", "Session Log"), [line]
                )
            except Exception:
                pass

        # --- 2. 自動想起
        if config.get("recall", True) and not skip:
            try:
                from vault_search import format_context, search

                results = search(
                    vault,
                    prompt,
                    limit=int(config.get("recall_limit", 3)),
                    min_ratio=float(config.get("recall_min_ratio", 0.3)),
                )
                context = format_context(
                    results, min_score=float(config.get("recall_min_score", 3.0))
                )
                if context:
                    print(json.dumps({
                        "hookSpecificOutput": {
                            "hookEventName": "UserPromptSubmit",
                            "additionalContext": context,
                        }
                    }, ensure_ascii=False))

                # 想起が実際に効いているかを測れるようにログを残す。
                # 「役に立っているのか」は主観ではなく回数で判断する。
                try:
                    import time
                    record = {
                        "ts": time.time(),
                        "n": len(results),
                        "paths": [r["path"] for r in results],
                        "top": results[0]["score"] if results else 0,
                    }
                    if config.get("log_queries"):
                        record["q"] = prompt[:200]
                    log = vault / "90_System" / ".recall_log.jsonl"
                    log.parent.mkdir(parents=True, exist_ok=True)
                    with log.open("a", encoding="utf-8") as fh:
                        fh.write(json.dumps(record, ensure_ascii=False) + "\n")
                except Exception:
                    pass
            except Exception:
                pass
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
