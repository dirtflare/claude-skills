#!/usr/bin/env python3
"""Claude Code の稼働を company/ に記録するフック。

settings.json の hooks から、標準入力にフックのJSONを受け取って呼ばれる。

    python3 tools/company_hook.py start     # SessionStart
    python3 tools/company_hook.py prompt    # UserPromptSubmit
    python3 tools/company_hook.py tool      # PostToolUse
    python3 tools/company_hook.py stop      # Stop
    python3 tools/company_hook.py end       # SessionEnd

やること:
  1. company/.state/sessions.json に「いま誰が何をしているか」を書く（上書き可の状態ファイル）
  2. 依頼と完了を logs/YYYY-MM-DD.md に**追記のみ**で残す（company/CLAUDE.md の規則どおり）

失敗しても Claude Code の動作を止めないよう、例外は握りつぶして常に exit 0。
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPANY = Path(os.environ.get("COMPANY_DIR", ROOT / "company"))
STATE = COMPANY / ".state" / "sessions.json"

# 秘書の振り分け表と同じ考え方で、依頼文から担当部署を推定する。
ROUTING = [
    # 具体的な道具の名前を先に見る（曖昧な語より強い手がかりなので優先度が高い）
    ("video", ["hyperframes", "動画", "レンダ", "render", "ffmpeg", "字幕", "テロップ",
               "モーション", "尺", "カット", "higgsfield", "リール", "shorts", "音ハメ"]),
    ("audio", ["suno", "bgm", "音楽", "ナレーション", "音声", "ボイス", "効果音", "ジングル"]),
    ("design", ["figma", "canva", "サムネ", "デザイン", "画像生成", "バナー", "配色",
                "フォント", "ロゴ", "図解", "モックアップ", "comfy", "イラスト"]),
    ("dev", ["リポジトリ", "コード", "実装", "リファクタ", "バグ", "テスト", "pr", "プルリク",
             "commit", "コミット", "git", "スキル", "フック", "hook", "レビュー", "ビルド",
             "デプロイ", "エラー", "python", "javascript", "型", "api"]),
    ("sns", ["x投稿", "ツイート", "ポスト", "インスタ", "instagram", "tiktok", "スレッド",
             "投稿", "リプ", "フォロワー", "バズ", "sns"]),
    ("docs", ["notion", "drive", "ドキュメント", "資料", "スライド", "スプレッドシート",
              "議事録", "手順書", "pdf", "docx", "xlsx", "pptx", "まとめて", "整理"]),
    ("comms", ["gmail", "メール", "slack", "返信", "下書き", "問い合わせ対応", "連絡"]),
    ("marketing", ["発信", "note", "訴求", "lp", "コピー", "集客", "マーケ", "ブログ",
                   "記事", "見出し", "キャッチ"]),
    ("research", ["調べ", "調査", "リサーチ", "競合", "トレンド", "裏取り", "出典", "検証",
                  "比較", "仕様", "research", "search", "ファクト"]),
    ("finance", ["売上", "経費", "単価", "値付け", "価格", "料金", "請求", "税", "見積",
                 "コスト", "収支", "利益", "予算"]),
    ("sales", ["商談", "dm", "見込み", "顧客", "契約", "提案書", "営業"]),
]



def infer_department(text: str) -> str:
    low = (text or "").lower()
    for dept, words in ROUTING:
        if any(w.lower() in low for w in words):
            if (COMPANY / "departments" / dept).is_dir():
                return dept
    return "secretary"


def log_path(dept: str, day: str) -> Path:
    base = COMPANY / "secretary" if dept == "secretary" else COMPANY / "departments" / dept
    return base / "logs" / f"{day}.md"


def append_entry(dept: str, kind: str, title: str, body: str = "") -> None:
    """同じ日付のファイルがあれば追記。無ければ見出しつきで新規作成。上書きはしない。"""
    now = dt.datetime.now()
    path = log_path(dept, now.strftime("%Y-%m-%d"))
    path.parent.mkdir(parents=True, exist_ok=True)
    head = "" if path.exists() else f"# {now:%Y-%m-%d}\n"
    chunk = f"\n## {now:%H:%M} [{kind}] {title}\n"
    if body:
        chunk += f"{body}\n"
    with path.open("a", encoding="utf-8") as f:
        f.write(head + chunk)


def load_state() -> dict:
    try:
        return json.loads(STATE.read_text(encoding="utf-8"))
    except Exception:
        return {"sessions": {}}


def save_state(state: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    state["updated"] = dt.datetime.now().isoformat(timespec="seconds")
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(STATE)


def touch_session(sid: str, **fields) -> dict:
    state = load_state()
    s = state["sessions"].get(sid, {"id": sid, "tools": 0})
    s.update(fields)
    s["updated"] = dt.datetime.now().isoformat(timespec="seconds")
    state["sessions"][sid] = s
    # 6時間以上更新の無いセッションは掃除する
    cutoff = dt.datetime.now() - dt.timedelta(hours=6)
    state["sessions"] = {
        k: v for k, v in state["sessions"].items()
        if v.get("updated", "") >= cutoff.isoformat(timespec="seconds")
    }
    save_state(state)
    return s


def summarize(text: str, limit: int = 60) -> str:
    one = re.sub(r"\s+", " ", (text or "").strip())
    one = re.sub(r"^/\S+\s*", "", one)          # スラッシュコマンドの頭を落とす
    return one[:limit] + ("…" if len(one) > limit else "")


def main() -> None:
    event = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}
    sid = str(payload.get("session_id") or "local")[:12]
    cwd = payload.get("cwd") or os.getcwd()

    if event == "start":
        touch_session(sid, state="出勤", who="secretary", task="セッション開始", cwd=cwd,
                      started=dt.datetime.now().isoformat(timespec="seconds"), tools=0)

    elif event == "prompt":
        text = payload.get("prompt") or ""
        dept = infer_department(text)
        touch_session(sid, state="作業中", who=dept, task=summarize(text), cwd=cwd, tools=0)
        append_entry(dept, "作業", f"依頼: {summarize(text, 80)}",
                     f"（{Path(cwd).name} / session {sid}）")

    elif event == "tool":
        tool = payload.get("tool_name") or "作業"
        target = ""
        ti = payload.get("tool_input") or {}
        if isinstance(ti, dict):
            target = str(ti.get("file_path") or ti.get("command") or ti.get("pattern") or "")
        state = load_state()
        prev = state["sessions"].get(sid, {})
        touch_session(sid, state="作業中", tools=int(prev.get("tools", 0)) + 1,
                      tool=tool, target=summarize(target, 48), cwd=cwd,
                      who=prev.get("who", "secretary"), task=prev.get("task", ""))

    elif event in ("stop", "end"):
        state = load_state()
        s = state["sessions"].get(sid)
        if s:
            if event == "stop" and s.get("task"):
                append_entry(s.get("who", "secretary"), "作業",
                             f"完了: {s['task']}", f"（ツール実行 {s.get('tools', 0)} 回）")
            if event == "end":
                state["sessions"].pop(sid, None)
                save_state(state)
            else:
                touch_session(sid, state="待機", tool="", target="")

    print(json.dumps({"suppressOutput": True}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
