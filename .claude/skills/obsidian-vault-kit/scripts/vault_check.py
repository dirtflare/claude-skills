#!/usr/bin/env python3
"""Obsidian Vault の静的検査。

AI が Vault を編集するなら、「見た感じ問題ない」で終わらせてはいけない。
これは完全な検証器ではなく、最初の防波堤である。

    python3 vault_check.py --vault ~/MyVault
    python3 vault_check.py --vault . --strict     # 警告もエラー扱い
    python3 vault_check.py --vault . --quiet      # 集計行だけ

PyYAML があれば使う。無ければ内蔵の簡易パーサへフォールバックする。
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    yaml = None

# --- Schema (references/note-types.md と同期させること) --------------------

MANAGED_FOLDERS = {
    "00_Inbox",
    "10_Daily",
    "20_Projects",
    "30_Areas",
    "40_Notes",
    "50_Sources",
    "60_Entities",
    "70_Outputs",
}

SKIP_DIRS = {".git", ".obsidian", ".trash", "90_Private", "99_Archive", "node_modules"}

ALLOWED_TYPES = {
    "inbox", "daily", "project", "area", "meeting",
    "decision", "source", "note", "person", "company", "output",
}

ALLOWED_STATUSES = {"inbox", "active", "waiting", "done", "archived"}

ALLOWED_CONFIDENCE = {"low", "medium", "high"}

ALLOWED_SENSITIVITY = {"public", "internal", "confidential", "never_ai"}

REQUIRED_BY_TYPE = {
    "inbox": {"type", "created", "status"},
    "daily": {"type", "created"},
    "project": {"type", "created", "status", "next_action"},
    "area": {"type", "created", "status"},
    "meeting": {"type", "created"},
    "decision": {"type", "created", "status"},
    "source": {"type", "created", "status"},
    "note": {"type", "created", "status"},
    "person": {"type", "created"},
    "company": {"type", "created"},
    "output": {"type", "created", "status"},
}

# 本文の構造。欠けていると「後から文脈を復元できない」ノートになる。
REQUIRED_HEADINGS = {
    "decision": ["Decision", "Why This Option", "Reversal Trigger"],
    "source": ["Source Summary", "My Interpretation", "What Changes If True"],
    "note": ["Claim", "Use When"],
    "project": ["Outcome", "Next Actions"],
}

DATE_PROPERTIES = {"created", "due", "revisit", "published"}

# --- Patterns --------------------------------------------------------------

FRONTMATTER_RE = re.compile(r"\A---[ \t]*\n(.*?)\n---[ \t]*(?:\n|$)", re.DOTALL)
WIKILINK_RE = re.compile(r"!?\[\[([^\]]+)\]\]")
HEADING_RE = re.compile(r"^#{1,6}\s+(.+?)\s*$", re.MULTILINE)
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_frontmatter(raw: str) -> dict[str, object]:
    """Frontmatter を dict にする。PyYAML があればそれを使う。"""
    if yaml is not None:
        try:
            loaded = yaml.safe_load(raw)
            return loaded if isinstance(loaded, dict) else {}
        except yaml.YAMLError:
            return {"__parse_error__": True}

    # フォールバック: key: value と、その下のブロックリストだけ拾う。
    properties: dict[str, object] = {}
    current_key: str | None = None

    for line in raw.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue

        stripped = line.strip()

        if line.startswith((" ", "\t")) and stripped.startswith("- "):
            if current_key is not None:
                item = stripped[2:].strip().strip("\"'")
                properties.setdefault(current_key, [])
                if isinstance(properties[current_key], list):
                    properties[current_key].append(item)
            continue

        if ":" not in line:
            continue

        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()

        if not value:
            properties[key] = []
            current_key = key
        elif value in {"[]", "{}"}:
            properties[key] = []
            current_key = None
        else:
            properties[key] = value.strip("\"'")
            current_key = None

    return properties


def is_present(value: object) -> bool:
    """Property が「実際に埋まっている」か。空文字・空リスト・None は未設定。"""
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return bool(value)
    return True


def as_text(value: object) -> str:
    return value.strip() if isinstance(value, str) else str(value)


def find_unquoted_wikilinks(raw_frontmatter: str) -> list[str]:
    """Properties 内の引用符なし Wikilink を検出する。

    `- [[価格戦略]]` は YAML ではネストしたリストとして解釈され、
    Obsidian 側でリンクとして扱われない。
    """
    offenders = []
    for line in raw_frontmatter.splitlines():
        if "[[" not in line:
            continue
        # 値の部分だけを見る（key: の右側、または `- ` の右側）
        if ":" in line and not line.lstrip().startswith("- "):
            value = line.partition(":")[2].strip()
        else:
            value = line.lstrip().removeprefix("- ").strip()
        if not value:
            continue
        quoted = (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        )
        if "[[" in value and not quoted:
            offenders.append(line.strip())
    return offenders


def collect_link_targets(vault: Path) -> tuple[set[str], set[str]]:
    """リンク解決用に、Vault 内の全パスとファイル名を集める。"""
    paths: set[str] = set()
    names: set[str] = set()

    for path in vault.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.relative_to(vault).parts):
            continue
        relative = path.relative_to(vault)
        paths.add(relative.with_suffix("").as_posix())
        names.add(path.stem)

    return paths, names


def check_file(
    path: Path,
    relative: Path,
    known_paths: set[str],
    known_names: set[str],
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        return [f"{relative}: read failed ({exc})"], []

    match = FRONTMATTER_RE.match(text)
    if not match:
        return [f"{relative}: missing YAML frontmatter"], []

    raw_frontmatter = match.group(1)
    properties = parse_frontmatter(raw_frontmatter)

    if properties.get("__parse_error__"):
        return [f"{relative}: invalid YAML frontmatter"], []

    # never_ai は検査対象から外さない（形式は検査する）が、内容は読まない方針。
    note_type = as_text(properties.get("type", ""))
    status = as_text(properties.get("status", ""))

    # -- type
    if note_type not in ALLOWED_TYPES:
        errors.append(f"{relative}: invalid or missing type={note_type!r}")
    else:
        missing = sorted(
            key for key in REQUIRED_BY_TYPE.get(note_type, set())
            if not is_present(properties.get(key))
        )
        if missing:
            errors.append(
                f"{relative}: missing required properties: " + ", ".join(missing)
            )

        # -- 必須見出し
        headings = {h.strip() for h in HEADING_RE.findall(text)}
        missing_headings = [
            h for h in REQUIRED_HEADINGS.get(note_type, []) if h not in headings
        ]
        if missing_headings:
            warnings.append(
                f"{relative}: missing sections: "
                + ", ".join(f"## {h}" for h in missing_headings)
            )

    # -- 制御語彙
    if status and status not in ALLOWED_STATUSES:
        errors.append(f"{relative}: invalid status={status!r}")

    confidence = as_text(properties.get("confidence", ""))
    if confidence and confidence not in ALLOWED_CONFIDENCE:
        errors.append(f"{relative}: invalid confidence={confidence!r}")

    sensitivity = as_text(properties.get("sensitivity", ""))
    if sensitivity and sensitivity not in ALLOWED_SENSITIVITY:
        errors.append(f"{relative}: invalid sensitivity={sensitivity!r}")

    # -- 日付形式
    for key in DATE_PROPERTIES:
        value = properties.get(key)
        if not is_present(value):
            continue
        text_value = as_text(value)
        if not ISO_DATE_RE.match(text_value):
            errors.append(
                f"{relative}: {key}={text_value!r} is not ISO format (YYYY-MM-DD)"
            )

    # -- 手動 updated は持たない方針
    if is_present(properties.get("updated")):
        warnings.append(
            f"{relative}: manual `updated` property — use file.mtime in Bases instead"
        )

    # -- Properties 内の引用符なし Wikilink
    for line in find_unquoted_wikilinks(raw_frontmatter):
        errors.append(f"{relative}: unquoted wikilink in frontmatter: {line}")

    # -- 未解決リンク
    for raw_target in WIKILINK_RE.findall(text):
        target = raw_target.split("|", 1)[0].split("#", 1)[0].strip()
        target = target.removesuffix(".md").replace("\\", "/")
        if not target:
            continue
        if target not in known_paths and Path(target).name not in known_names:
            warnings.append(f"{relative}: unresolved link [[{raw_target}]]")

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate an Obsidian vault.")
    parser.add_argument("--vault", default=".", help="Vault root (default: cwd)")
    parser.add_argument("--strict", action="store_true", help="Treat warnings as errors")
    parser.add_argument("--quiet", action="store_true", help="Print summary only")
    args = parser.parse_args()

    vault = Path(args.vault).expanduser().resolve()
    if not vault.is_dir():
        print(f"Not a directory: {vault}", file=sys.stderr)
        return 2

    known_paths, known_names = collect_link_targets(vault)

    errors: list[str] = []
    warnings: list[str] = []
    checked = 0

    for path in sorted(vault.rglob("*.md")):
        relative = path.relative_to(vault)
        if any(part in SKIP_DIRS for part in relative.parts):
            continue
        if not relative.parts or relative.parts[0] not in MANAGED_FOLDERS:
            continue

        checked += 1
        file_errors, file_warnings = check_file(path, relative, known_paths, known_names)
        errors.extend(file_errors)
        warnings.extend(file_warnings)

    if not args.quiet:
        if errors:
            print("\nERRORS")
            for item in errors:
                print(f"- {item}")
        if warnings:
            print("\nWARNINGS")
            for item in warnings:
                print(f"- {item}")

    parser_note = "" if yaml is not None else "  (PyYAML not installed: using fallback parser)"
    print(
        f"\nChecked {checked} Markdown files in {vault}: "
        f"{len(errors)} errors, {len(warnings)} warnings{parser_note}"
    )

    if errors:
        return 1
    if args.strict and warnings:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
