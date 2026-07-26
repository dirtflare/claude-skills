#!/usr/bin/env bash
# HyperFrames の前提環境チェックとスキル導入。
#
#   bash scripts/setup.sh           # 前提をチェックするだけ (何も変更しない)
#   bash scripts/setup.sh --install # Chrome とスキル群を導入する
#
# Node.js と FFmpeg はこのスクリプトでは入れない (OS とパッケージ管理の
# 選択がユーザー依存なため)。不足していればヒントを出して停止する。
#
# 冪等。何度実行しても壊れない。

set -uo pipefail

INSTALL=0
[ "${1:-}" = "--install" ] && INSTALL=1

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

MISSING=0

head_ "1. Node.js (v22 以上が必須)"
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -v | sed 's/^v\([0-9]*\).*/\1/')
  if [ "$NODE_MAJOR" -ge 22 ]; then
    ok "Node.js $(node -v)"
  else
    bad "Node.js $(node -v) — v22 以上が必要"
    warn "nodejs.org の公式インストーラ、または nvm install 22 で更新してください"
    MISSING=1
  fi
else
  bad "Node.js が見つかりません"
  warn "nodejs.org からインストールしてください"
  MISSING=1
fi

head_ "2. FFmpeg (MP4 書き出しに必須)"
if command -v ffmpeg >/dev/null 2>&1; then
  ok "$(ffmpeg -version 2>&1 | head -1 | cut -c1-60)"
else
  bad "FFmpeg が見つかりません"
  case "$(uname -s)" in
    Darwin) warn "brew install ffmpeg" ;;
    Linux)  warn "sudo apt-get update && sudo apt-get install -y ffmpeg" ;;
    *)      warn "winget install ffmpeg (Windows) か公式配布版" ;;
  esac
  MISSING=1
fi

# Node / FFmpeg が無い状態で先に進んでも、後段が分かりにくく失敗するだけなので
# --install でもここで止める。
if [ "$MISSING" -eq 1 ]; then
  head_ "結果"
  bad "前提が足りません。上のヒントに従って入れてから再実行してください。"
  warn "分からなければ、この出力ごと Claude に貼って「これを直して」と頼めば済みます。"
  exit 1
fi

head_ "3. レンダリング用 Chrome (初回のみ約115MBのダウンロード)"
if [ "$INSTALL" -eq 1 ]; then
  npx -y hyperframes@latest browser ensure || {
    bad "Chrome Headless Shell の取得に失敗しました"
    exit 1
  }
  ok "Chrome Headless Shell 準備完了"
else
  warn "未確認 (--install で取得します)"
fi

head_ "4. HyperFrames スキル群の導入"
if [ "$INSTALL" -eq 1 ]; then
  # --full-depth: リポジトリの最新版から取る。付けないと数時間古いコピーが入る。
  # --all: 25個すべて入れる。ルーターが必要なものだけ読み込むので全部入れて問題ない。
  npx -y skills@latest add heygen-com/hyperframes --all --full-depth || {
    bad "スキルの導入に失敗しました"
    exit 1
  }
  ok "スキル導入完了 (.agents/skills/ 配下 + Claude Code 用シンボリックリンク)"
else
  if [ -d ".agents/skills/hyperframes" ]; then
    ok "導入済み ($(ls .agents/skills | wc -l | tr -d ' ') 個)"
  else
    warn "未導入 (--install で導入します)"
  fi
fi

head_ "5. 総合診断"
npx -y hyperframes@latest doctor || true

head_ "結果"
if [ "$INSTALL" -eq 1 ]; then
  ok "セットアップ完了。Claude Code を開き直すと /hyperframes が使えます。"
  printf '\n  次の一手 — Claude Code にこう投げてください:\n\n'
  printf '    /hyperframes を使って、10秒のプロダクト紹介動画を作ってください。\n'
  printf '    黒背景にタイトルがフェードインして、控えめなBGMが流れる構成で。\n'
  printf '    サイズは1920x1080でお願いします。\n\n'
else
  ok "チェックのみ完了。導入するには --install を付けて再実行してください。"
fi

# doctor が任意項目 (whisper / Kokoro / MusicGen / Docker) で落ちても
# セットアップとしては成功なので 0 を返す。
exit 0
