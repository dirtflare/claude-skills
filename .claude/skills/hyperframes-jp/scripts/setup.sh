#!/usr/bin/env bash
# HyperFrames の前提環境チェックとスキル導入。
#
#   bash scripts/setup.sh                     # 前提をチェックするだけ (何も変更しない)
#   bash scripts/setup.sh --install           # ~/.claude/skills に導入 (推奨)
#   bash scripts/setup.sh --install --project # いま居るフォルダにだけ導入
#
# --install (グローバル) を推奨する理由: どのフォルダで Claude Code を開いても
# /hyperframes が使える。--project はそのフォルダ限定になる。
#
# Node.js と FFmpeg はこのスクリプトでは入れない (OS とパッケージ管理の
# 選択がユーザー依存なため)。不足していればヒントを出して停止する。
#
# 冪等。何度実行しても壊れない。

set -uo pipefail

INSTALL=0
SCOPE=global
for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=1 ;;
    --project|--local) SCOPE=project ;;
    --global) SCOPE=global ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) printf '不明な引数: %s (--help を見てください)\n' "$arg" >&2; exit 2 ;;
  esac
done

# このスクリプトが入っているスキルのルート (.../hyperframes-jp)
SKILL_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SKILL_NAME=$(basename "$SKILL_DIR")

if [ "$SCOPE" = "global" ]; then
  SKILLS_FLAG="--global"
  SKILLS_HOME="$HOME/.claude/skills"
else
  SKILLS_FLAG=""
  SKILLS_HOME="$(pwd)/.claude/skills"
fi

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

head_ "4. HyperFrames スキル群の導入 (導入先: $SKILLS_HOME)"
if [ "$INSTALL" -eq 1 ]; then
  # --full-depth: リポジトリの最新版から取る。付けないと数時間古いコピーが入る。
  # --all: 25個すべて入れる。ルーターが必要なものだけ読み込むので全部入れて問題ない。
  # Eve / PromptScript が「global 非対応」と出すのは無害 (Claude Code には入る)。
  npx -y skills@latest add heygen-com/hyperframes --all --full-depth $SKILLS_FLAG || {
    bad "スキルの導入に失敗しました"
    exit 1
  }
  if [ -d "$SKILLS_HOME/hyperframes" ]; then
    ok "スキル導入完了"
  else
    bad "導入したはずの $SKILLS_HOME/hyperframes が見つかりません"
    exit 1
  fi
else
  if [ -d "$SKILLS_HOME/hyperframes" ]; then
    ok "導入済み"
  else
    warn "未導入 (--install で導入します)"
  fi
fi

head_ "5. このガイドスキル自体の導入"
if [ "$INSTALL" -eq 1 ] && [ "$SCOPE" = "global" ]; then
  # クローンしたリポジトリの中から実行された場合、ガイド本体も
  # ~/.claude/skills にコピーしてどこからでも参照できるようにする。
  if [ "$SKILL_DIR" != "$SKILLS_HOME/$SKILL_NAME" ]; then
    mkdir -p "$SKILLS_HOME"
    rm -rf "$SKILLS_HOME/$SKILL_NAME"
    cp -R "$SKILL_DIR" "$SKILLS_HOME/$SKILL_NAME" && \
      ok "$SKILL_NAME を $SKILLS_HOME/$SKILL_NAME にコピーしました" || {
        bad "$SKILL_NAME のコピーに失敗しました"
        exit 1
      }
  else
    ok "$SKILL_NAME はすでに $SKILLS_HOME にあります"
  fi
else
  warn "スキップ (--install かつグローバル導入のときだけコピーします)"
fi

head_ "6. 総合診断"
npx -y hyperframes@latest doctor || true

head_ "結果"
if [ "$INSTALL" -eq 1 ]; then
  ok "セットアップ完了。Claude Code を開き直すと /hyperframes が使えます。"
  if [ "$SCOPE" = "global" ]; then
    ok "グローバル導入なので、どのフォルダで開いても使えます。"
  else
    warn "このフォルダ限定の導入です。他の場所で使うには --install (グローバル) を。"
  fi
  printf '\n  次の一手 — 動画用のフォルダを作って Claude Code を開き、こう投げてください:\n\n'
  printf '    /hyperframes を使って、10秒のプロダクト紹介動画を作ってください。\n'
  printf '    黒背景にタイトルがフェードインして、控えめなBGMが流れる構成で。\n'
  printf '    サイズは1920x1080でお願いします。\n\n'
else
  ok "チェックのみ完了。導入するには --install を付けて再実行してください。"
fi

# doctor が任意項目 (whisper / Kokoro / MusicGen / Docker) で落ちても
# セットアップとしては成功なので 0 を返す。
exit 0
