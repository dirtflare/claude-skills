# claude-skills

Claude Code 用の汎用スキルを集めたリポジトリです。
特定のアプリやリポジトリに紐付かないスキルをここに集約します。

## 収録スキル一覧

| スキル | 説明 |
|---|---|
| [x-post-analysis](.claude/skills/x-post-analysis/SKILL.md) | X (Twitter) の投稿を「取得 → 抽出 → 検証 → 構造化」して、構造化レポートや指定の成果物(設計書・ワークフロー・メモ等)にまとめるスキル。URL・コピペ本文・スクリーンショット・動画の文字起こしなど、あらゆる入力ソースに対応。 |
| [hyperframes-jp](.claude/skills/hyperframes-jp/SKILL.md) | HyperFrames (HeyGen のオープンソース動画レンダリング基盤) を Claude Code で運用するための日本語ガイド。セットアップ、`frame.md` によるブランドの仕込み、5つの実践レシピのプロンプト型、一文リテイクの運用術、Video Agent との使い分け。 |

## 使い方

このリポジトリをクローンするか、必要なスキルの `SKILL.md` を
自分のプロジェクトの `.claude/skills/<スキル名>/SKILL.md` にコピーしてください。

## hyperframes-jp の初回セットアップ

`hyperframes-jp` は上流の HyperFrames スキル群 (25個・約19MB) の
**日本語運用レイヤー**です。上流本体はこのリポジトリにコミットしていないので、
クローン後に一度だけ導入してください。

```bash
# 前提をチェックするだけ (何も変更しない)
bash .claude/skills/hyperframes-jp/scripts/setup.sh

# 足りないものを入れてスキルを導入する
bash .claude/skills/hyperframes-jp/scripts/setup.sh --install
```

必要なのは **Node.js v22 以上** と **FFmpeg** の2つだけ (どちらも無料)。
導入後に Claude Code を開き直すと `/hyperframes` などのコマンドが使えます。

上流本体はバージョンを固定せず常に最新を取り直す方針のため、
`.agents/` `agent/` `skills-lock.json` は `.gitignore` 済みです。
更新したいときは `--install` を再実行してください。
