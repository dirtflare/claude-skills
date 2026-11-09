#!/usr/bin/env python3
"""Vault の全文検索エンジン。自動想起 (recall) の中核。

日本語は空白で単語を区切らないので、素朴な whitespace tokenize は機能しない。
ここでは CJK を文字 bigram、ASCII を単語に分割し、BM25 で採点する。
外部依存なし。インデックスは mtime 差分で増分更新する。

    python3 vault_search.py index --vault ~/MyVault
    python3 vault_search.py query --vault ~/MyVault "価格改定の判断"
    python3 vault_search.py query --vault ~/MyVault --format context "..."
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
from collections import Counter
from pathlib import Path

INDEX_RELPATH = "90_System/.recall_index.json"
INDEX_VERSION = 2

SKIP_DIRS = {".git", ".obsidian", ".trash", "90_Private", "node_modules", ".agents", ".claude"}

# 想起の対象にする型。daily と inbox は生ログなのでノイズになりやすく、既定では外す。
DEFAULT_TYPES = {"note", "decision", "source", "project", "area", "person", "company", "output"}

CJK_RE = re.compile(r"[぀-ヿ㐀-䶿一-鿿豈-﫿]+")
ASCII_RE = re.compile(r"[a-z0-9_]{2,}")
# ひらがなだけの bigram は「ている」「るか」等の機能語で、内容を表さない。
# 日本語の内容語は漢字・カタカナ・英数に現れるので、そこでの一致を別に数える。
HIRAGANA_ONLY_RE = re.compile("\\A[\u3040-\u309f]+\\Z")
FRONTMATTER_RE = re.compile(r"\A---[ \t]*\n(.*?)\n---[ \t]*(?:\n|$)", re.DOTALL)
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)
WIKILINK_RE = re.compile(r"!?\[\[([^\]]+)\]\]")

# BM25
K1 = 1.5
B = 0.75

# フィールド重み。タイトルと Use When は「未来の検索意図」なので強く効かせる。
WEIGHT_TITLE = 4
WEIGHT_ALIAS = 4
WEIGHT_USEWHEN = 3
WEIGHT_HEADING = 2
WEIGHT_BODY = 1


def tokenize(text: str) -> list[str]:
    """CJK は文字 bigram、ASCII は単語。

    ひらがなの頻出 bigram（「です」「ます」等）はノイズだが、
    BM25 の IDF が自動的に重みを下げるので、ここでは除外しない。
    """
    text = text.lower()
    tokens: list[str] = []

    for match in ASCII_RE.finditer(text):
        tokens.append(match.group())

    for match in CJK_RE.finditer(text):
        chunk = match.group()
        if len(chunk) == 1:
            tokens.append(chunk)
        else:
            for i in range(len(chunk) - 1):
                tokens.append(chunk[i : i + 2])

    return tokens


def parse_frontmatter(raw: str) -> dict[str, object]:
    """依存なしの簡易 YAML。key: value とブロックリストだけ拾う。"""
    properties: dict[str, object] = {}
    current_key: str | None = None

    for line in raw.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        stripped = line.strip()

        if line[:1] in " \t" and stripped.startswith("- "):
            if current_key:
                item = stripped[2:].strip().strip("\"'")
                properties.setdefault(current_key, [])
                if isinstance(properties[current_key], list):
                    properties[current_key].append(item)
            continue

        if ":" not in line:
            continue

        key, _, value = line.partition(":")
        key, value = key.strip(), value.strip()
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


def section_text(body: str, heading_names: list[str]) -> str:
    """指定した見出しの中身だけを取り出す。"""
    out = []
    lines = body.splitlines()
    capturing = False
    for line in lines:
        match = HEADING_RE.match(line)
        if match:
            name = match.group(2).strip()
            capturing = any(name.lower() == h.lower() for h in heading_names)
            continue
        if capturing and line.strip():
            out.append(line.strip())
    return "\n".join(out)


def summarize(body: str, limit: int = 220) -> str:
    """表示用の短い要約。見出しと箇条書き記号を落とす。"""
    for line in body.splitlines():
        text = line.strip()
        if not text or text.startswith(("#", "-", "*", ">", "|", "`")):
            continue
        if len(text) > 8:
            return text[:limit]
    return ""


def build_document(path: Path, vault: Path) -> dict | None:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None

    match = FRONTMATTER_RE.match(text)
    properties: dict[str, object] = {}
    body = text
    if match:
        properties = parse_frontmatter(match.group(1))
        body = text[match.end() :]

    title = path.stem
    aliases = properties.get("aliases") or []
    if isinstance(aliases, str):
        aliases = [aliases]

    headings = [m.group(2) for m in HEADING_RE.finditer(body)]
    use_when = section_text(body, ["Use When", "What Changes If True", "Claim", "Decision"])

    counts: Counter[str] = Counter()
    for token in tokenize(title):
        counts[token] += WEIGHT_TITLE
    for alias in aliases:
        for token in tokenize(str(alias)):
            counts[token] += WEIGHT_ALIAS
    for token in tokenize(use_when):
        counts[token] += WEIGHT_USEWHEN
    for token in tokenize(" ".join(headings)):
        counts[token] += WEIGHT_HEADING
    for token in tokenize(body):
        counts[token] += WEIGHT_BODY

    if not counts:
        return None

    note_type = properties.get("type", "")
    note_type = note_type if isinstance(note_type, str) else ""
    status = properties.get("status", "")
    status = status if isinstance(status, str) else ""

    return {
        "path": path.relative_to(vault).as_posix(),
        "title": title,
        "type": note_type,
        "status": status,
        "aliases": [str(a) for a in aliases],
        "summary": summarize(use_when or body),
        "mtime": path.stat().st_mtime,
        "length": sum(counts.values()),
        "tf": dict(counts),
    }


def index_path(vault: Path) -> Path:
    return vault / INDEX_RELPATH


def load_index(vault: Path) -> dict:
    path = index_path(vault)
    if not path.exists():
        return {"version": INDEX_VERSION, "docs": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"version": INDEX_VERSION, "docs": {}}
    if data.get("version") != INDEX_VERSION:
        return {"version": INDEX_VERSION, "docs": {}}
    return data


def markdown_files(vault: Path):
    for path in vault.rglob("*.md"):
        relative = path.relative_to(vault)
        if any(part in SKIP_DIRS for part in relative.parts):
            continue
        yield path


def build_index(vault: Path, force: bool = False) -> dict:
    """mtime 差分で増分更新する。"""
    index = {"version": INDEX_VERSION, "docs": {}} if force else load_index(vault)
    existing = index.get("docs", {})
    docs: dict[str, dict] = {}

    for path in markdown_files(vault):
        relative = path.relative_to(vault).as_posix()
        try:
            mtime = path.stat().st_mtime
        except OSError:
            continue

        cached = existing.get(relative)
        if cached and abs(cached.get("mtime", 0) - mtime) < 1e-6:
            docs[relative] = cached
            continue

        document = build_document(path, vault)
        if document:
            docs[relative] = document

    index["docs"] = docs
    index["built_at"] = time.time()

    target = index_path(vault)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".tmp")
    tmp.write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    tmp.replace(target)
    return index


def search(
    vault: Path,
    query: str,
    limit: int = 5,
    types: set[str] | None = None,
    auto_index: bool = True,
    min_ratio: float = 0.0,
) -> list[dict]:
    """min_ratio: 最高スコアに対する比率の下限。

    絶対スコアの閾値は Vault の規模で意味が変わるので使えない。
    「一番関連するものに比べて明らかに弱いものは出さない」方が安定する。
    """
    index = load_index(vault)
    if auto_index and not index.get("docs"):
        index = build_index(vault)

    docs = index.get("docs", {})
    if not docs:
        return []

    allowed = types if types is not None else DEFAULT_TYPES
    candidates = {
        key: doc
        for key, doc in docs.items()
        if (not allowed) or (doc.get("type") or "note") in allowed
    }
    if not candidates:
        candidates = docs

    query_tokens = set(tokenize(query))
    if not query_tokens:
        return []

    total = len(candidates)
    avgdl = sum(d["length"] for d in candidates.values()) / max(total, 1)

    document_freq: Counter[str] = Counter()
    for doc in candidates.values():
        tf = doc["tf"]
        for token in query_tokens:
            if token in tf:
                document_freq[token] += 1

    scored = []
    for doc in candidates.values():
        tf = doc["tf"]
        length = doc["length"] or 1
        score = 0.0
        hits = 0
        content_hits = 0
        distinctive = False
        for token in query_tokens:
            freq = tf.get(token)
            if not freq:
                continue
            hits += 1
            is_content = not HIRAGANA_ONLY_RE.match(token)
            if is_content:
                content_hits += 1
            n_q = document_freq[token]
            idf = math.log(1 + (total - n_q + 0.5) / (n_q + 0.5))
            contribution = (
                idf * (freq * (K1 + 1)) / (freq + K1 * (1 - B + B * length / avgdl))
            )
            # 機能語の一致はスコアにほぼ寄与させない。
            score += contribution if is_content else contribution * 0.1
            # 「LTV」のような希少な固有語は、1 回の一致でも強い信号になる。
            # CJK bigram (長さ 2) は単独だとノイズなので、ASCII 3 文字以上に限る。
            if is_content and n_q <= 2 and len(token) >= 3 and not CJK_RE.search(token):
                distinctive = True
        # 内容語が 1 つも一致していないものは、文法の偶然一致。必ず落とす。
        if content_hits == 0:
            continue
        # 一致 1 語だけの採用は誤検出の主因。希少語のときだけ許す。
        if score > 0 and (content_hits >= 2 or distinctive):
            scored.append((score, hits, doc))

    scored.sort(key=lambda item: item[0], reverse=True)
    if scored and min_ratio > 0:
        cutoff = scored[0][0] * min_ratio
        scored = [item for item in scored if item[0] >= cutoff]

    results = []
    for score, hits, doc in scored[:limit]:
        results.append(
            {
                "score": round(score, 3),
                "hits": hits,
                "path": doc["path"],
                "title": doc["title"],
                "type": doc["type"],
                "status": doc["status"],
                "summary": doc["summary"],
            }
        )
    return results


def format_context(results: list[dict], min_score: float = 0.0) -> str:
    """UserPromptSubmit の additionalContext に入れる形。

    短く保つ。長い注入は毎ターンのコストになり、かえって邪魔になる。
    """
    kept = [r for r in results if r["score"] >= min_score]
    if not kept:
        return ""

    lines = [
        "<vault-recall>",
        "あなたの Obsidian Vault に、この話題と関連する既存ノートがあります。",
        "参照する価値があれば読んでください。無関係なら無視して構いません。",
        "",
    ]
    for item in kept:
        label = f"[{item['type']}]" if item["type"] else ""
        lines.append(f"- {label} `{item['path']}`")
        if item["summary"]:
            lines.append(f"  {item['summary']}")
    lines.append("</vault-recall>")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Vault full-text search (CJK-aware BM25).")
    sub = parser.add_subparsers(dest="command", required=True)

    p_index = sub.add_parser("index", help="インデックスを構築・更新する")
    p_index.add_argument("--vault", default=".")
    p_index.add_argument("--force", action="store_true", help="全件再構築")

    p_query = sub.add_parser("query", help="検索する")
    p_query.add_argument("--vault", default=".")
    p_query.add_argument("--limit", type=int, default=5)
    p_query.add_argument("--format", choices=["text", "json", "context"], default="text")
    p_query.add_argument("--all-types", action="store_true", help="daily/inbox も対象にする")
    p_query.add_argument("--min-ratio", type=float, default=0.0,
                         help="最高スコアに対する比率の下限 (想起フックの既定は 0.3)")
    p_query.add_argument("terms", nargs="+")

    args = parser.parse_args()
    vault = Path(args.vault).expanduser().resolve()
    if not vault.is_dir():
        print(f"Not a directory: {vault}", file=sys.stderr)
        return 2

    if args.command == "index":
        started = time.time()
        index = build_index(vault, force=args.force)
        elapsed = time.time() - started
        print(
            f"Indexed {len(index['docs'])} notes in {elapsed:.2f}s -> "
            f"{index_path(vault).relative_to(vault)}"
        )
        return 0

    query = " ".join(args.terms)
    results = search(
        vault,
        query,
        limit=args.limit,
        types=set() if args.all_types else None,
        min_ratio=args.min_ratio,
    )

    if args.format == "json":
        print(json.dumps(results, ensure_ascii=False, indent=2))
    elif args.format == "context":
        print(format_context(results))
    else:
        if not results:
            print("(no match)")
        for item in results:
            print(f"{item['score']:>7.3f}  [{item['type'] or '-'}] {item['path']}")
            if item["summary"]:
                print(f"         {item['summary'][:100]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
