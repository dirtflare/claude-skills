#!/usr/bin/env python3
"""新しく着任した部署に「記憶」を持たせる。

    python3 tools/backfill_from_git.py           # 実行
    python3 tools/backfill_from_git.py --dry-run # 何が書かれるか見るだけ

やること:
  1. 各部署に「着任メモ」を1本入れる。担当している実ファイル（スキル・ツール・規則）を
     数えて、何を引き継いだのかを書く。作り話はしない。
  2. git のコミット履歴を、触ったファイルから担当部署に振り分けて logs に復元する。
     コミット日時をそのまま使うので、着任前の出来事も部署の記憶として残る。

同じコミットが既に書かれていれば飛ばす。書き込みは追記のみ。
"""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPANY = ROOT / "company"

# 触ったファイル → 担当部署（上から順に最初に当たったもの）
OWNERSHIP = [
    ("video", [".claude/skills/hyperframes-jp", "renders/", "frames/"]),
    ("sns", [".claude/skills/x-post-analysis"]),
    ("secretary", ["company/CLAUDE.md", "company/secretary"]),
    ("docs", ["README.md", "docs/"]),
    ("dev", ["tools/", ".claude/settings.json", ".gitignore", ".claude/skills/"]),
]

# 着任メモに書く「担当している実物」
ASSETS = {
    "video": [".claude/skills/hyperframes-jp"],
    "sns": [".claude/skills/x-post-analysis"],
    "dev": ["tools", ".claude/settings.json"],
    "docs": ["README.md"],
}


def sh(*args: str) -> str:
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True).stdout


def owner_of(path: str) -> str | None:
    for dept, prefixes in OWNERSHIP:
        if any(path.startswith(p) for p in prefixes):
            if dept == "secretary" or (COMPANY / "departments" / dept).is_dir():
                return dept
    if path.startswith("company/departments/"):
        dept = path.split("/")[2]
        return dept if (COMPANY / "departments" / dept).is_dir() else None
    return None


def log_file(dept: str, day: str) -> Path:
    base = COMPANY / "secretary" if dept == "secretary" else COMPANY / "departments" / dept
    return base / "logs" / f"{day}.md"


def append(dept: str, day: str, time: str, kind: str, title: str, body: str, dry: bool) -> bool:
    path = log_file(dept, day)
    if path.exists() and title in path.read_text(encoding="utf-8"):
        return False
    if dry:
        print(f"  + {dept:<10} {day} {time} [{kind}] {title}")
        return True
    path.parent.mkdir(parents=True, exist_ok=True)
    head = "" if path.exists() else f"# {day}\n"
    chunk = f"\n## {time} [{kind}] {title}\n" + (f"{body}\n" if body else "")
    with path.open("a", encoding="utf-8") as f:
        f.write(head + chunk)
    return True


def count_files(rel: str) -> int:
    p = ROOT / rel
    if p.is_file():
        return 1
    return sum(1 for _ in p.rglob("*") if _.is_file()) if p.is_dir() else 0


def onboarding(dept: str, dry: bool) -> bool:
    """着任メモ。担当している実ファイルを数えて、引き継いだものを書く。"""
    d = COMPANY / "departments" / dept
    meta = (d / "DEPARTMENT.md").read_text(encoding="utf-8") if (d / "DEPARTMENT.md").exists() else ""
    hired = next((l.split(":", 1)[1].strip() for l in meta.splitlines() if l.startswith("hired:")), None)
    if not hired:
        return False
    rules = (d / "rules" / "rules.md")
    n_rules = sum(1 for l in rules.read_text(encoding="utf-8").splitlines() if l.strip().startswith("- ")) if rules.exists() else 0

    lines = [f"引き継いだルール {n_rules} 条（rules/rules.md）。"]
    for asset in ASSETS.get(dept, []):
        n = count_files(asset)
        if n:
            lines.append(f"担当する実物: `{asset}`（{n} ファイル）。")
    if len(lines) == 1:
        lines.append("担当する実物はまだ無い。最初の依頼で作るところから始める。")
    lines.append("この部署の担当範囲と担当外は DEPARTMENT.md に書いてある。迷ったら inbox へ。")

    return append(dept, hired, "09:00", "学び", "着任：担当範囲と引き継ぎを確認した",
                  " ".join(lines), dry)


def from_git(dry: bool, limit: int) -> int:
    raw = sh("git", "log", f"-{limit}", "--date=format:%Y-%m-%d %H:%M",
             "--pretty=@@%h|%ad|%s", "--name-only")
    written = 0
    for block in raw.split("@@"):
        if not block.strip():
            continue
        header, *files = [l for l in block.splitlines() if l.strip()]
        sha, when, subject = (header.split("|", 2) + ["", ""])[:3]
        day, time = when.split(" ")
        depts: dict[str, list[str]] = {}
        for f in files:
            dept = owner_of(f)
            if dept:
                depts.setdefault(dept, []).append(f)
        for dept, touched in depts.items():
            body = f"触ったファイル {len(touched)} 件（{touched[0]} ほか）。git {sha} より復元。"
            if append(dept, day, time, "作業", subject, body, dry):
                written += 1
    return written


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=60, help="さかのぼるコミット数")
    args = ap.parse_args()

    print("着任メモ:")
    n1 = sum(onboarding(d.name, args.dry_run)
             for d in sorted((COMPANY / "departments").iterdir()) if d.is_dir())
    print(f"  {n1} 件")
    print("git 履歴からの復元:")
    n2 = from_git(args.dry_run, args.limit)
    print(f"  {n2} 件")
    if args.dry_run:
        print("\n（--dry-run なので書き込んでいません）")


if __name__ == "__main__":
    main()
