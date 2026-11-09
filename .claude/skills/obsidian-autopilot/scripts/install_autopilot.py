#!/usr/bin/env python3
"""autopilot を Vault へ導入する。

やること:
  1. <vault>/.claude/settings.json に UserPromptSubmit / Stop フックを追記（マージ）
  2. <vault>/90_System/autopilot.json に既定設定を作成
  3. 検索インデックスを構築
  4. 定期実行（Morning Brief）の設定方法を表示

既存の settings.json は壊さない。既に入っている場合は二重登録しない。

    python3 install_autopilot.py --vault ~/MyVault --dry-run
    python3 install_autopilot.py --vault ~/MyVault
    python3 install_autopilot.py --vault ~/MyVault --uninstall
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

SCRIPTS = Path(__file__).resolve().parent
MARKER = "obsidian-autopilot"


def hook_entry(script: str, vault: Path, event: str) -> dict:
    return {
        "matcher": "*",
        "hooks": [
            {
                "type": "command",
                "command": f'python3 "{SCRIPTS / script}" --vault "{vault}"',
                "timeout": 20,
            }
        ],
    }


def is_ours(group: dict) -> bool:
    for hook in group.get("hooks", []):
        if MARKER in str(hook.get("command", "")):
            return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Install autopilot hooks into a vault.")
    parser.add_argument("--vault", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--uninstall", action="store_true")
    parser.add_argument(
        "--global", dest="global_scope", action="store_true",
        help="~/.claude/settings.json に入れる（Vault 外からも想起を効かせる）",
    )
    args = parser.parse_args()

    vault = Path(args.vault).expanduser().resolve()
    if not vault.is_dir():
        print(f"Not a directory: {vault}", file=sys.stderr)
        return 2

    settings_path = (
        Path.home() / ".claude" / "settings.json"
        if args.global_scope
        else vault / ".claude" / "settings.json"
    )

    settings: dict = {}
    if settings_path.exists():
        try:
            settings = json.loads(settings_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print(f"⚠ {settings_path} が壊れた JSON です。中断します。", file=sys.stderr)
            return 1

    hooks = settings.setdefault("hooks", {})
    wanted = {
        "UserPromptSubmit": "hook_capture.py",
        "Stop": "hook_answer.py",
    }

    changes: list[str] = []
    for event, script in wanted.items():
        groups = hooks.setdefault(event, [])
        existing = [g for g in groups if is_ours(g)]

        if args.uninstall:
            if existing:
                hooks[event] = [g for g in groups if not is_ours(g)]
                changes.append(f"- remove {event} ({script})")
            continue

        if existing:
            # パスや Vault が変わっている可能性があるので入れ替える
            hooks[event] = [g for g in groups if not is_ours(g)]
            changes.append(f"~ update {event} -> {script}")
        else:
            changes.append(f"+ add    {event} -> {script}")
        hooks[event].append(hook_entry(script, vault, event))

    if args.uninstall:
        hooks_clean = {k: v for k, v in hooks.items() if v}
        if hooks_clean:
            settings["hooks"] = hooks_clean
        else:
            settings.pop("hooks", None)

    config_path = vault / "90_System" / "autopilot.json"
    if not args.uninstall and not config_path.exists():
        changes.append(f"+ create {config_path.relative_to(vault)}")

    print(f"Target settings: {settings_path}")
    print(f"Vault:           {vault}\n")
    if not changes:
        print("変更なし（既に導入済み）。")
        return 0
    for line in changes:
        print(f"  {line}")

    if args.dry_run:
        print("\n--dry-run のため書き込んでいません。")
        return 0

    if settings_path.exists():
        backup = settings_path.with_suffix(
            f".json.bak-{datetime.now():%Y%m%d%H%M%S}"
        )
        shutil.copy2(settings_path, backup)
        print(f"\nBackup: {backup}")

    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings_path.write_text(
        json.dumps(settings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Wrote:  {settings_path}")

    if args.uninstall:
        print("\nアンインストールしました。autopilot.json とインデックスは残しています。")
        return 0

    if not config_path.exists():
        from autopilot_lib import DEFAULT_CONFIG

        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text(
            json.dumps(DEFAULT_CONFIG, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Wrote:  {config_path}")

    from vault_search import build_index

    index = build_index(vault, force=True)
    print(f"Indexed {len(index['docs'])} notes")

    print(f"""
次の 2 つを設定してください。

1. インデックスの自動更新と Morning Brief（crontab -e）

   0 7 * * *  cd "{vault}" && python3 "{SCRIPTS / 'daily_rollup.py'}" --vault "{vault}"
   */30 * * * * python3 "{SCRIPTS / 'vault_search.py'}" index --vault "{vault}"

2. 効いているかの確認（週 1 回でいい）

   python3 "{SCRIPTS / 'vault_stats.py'}" --vault "{vault}"

Claude Code を Vault で起動し直すと、次のプロンプトから想起が効きます。
うまく動かないときは `claude --debug` でフックの出力を確認してください。
""")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
