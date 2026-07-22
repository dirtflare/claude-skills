# claude-skills

Claude Code 用の汎用スキルを集めたリポジトリです。
特定のアプリやリポジトリに紐付かないスキルをここに集約します。

## 収録スキル一覧

| スキル | 説明 |
|---|---|
| [x-post-analysis](.claude/skills/x-post-analysis/SKILL.md) | X (Twitter) の投稿を「取得 → 抽出 → 検証 → 構造化」して、構造化レポートや指定の成果物(設計書・ワークフロー・メモ等)にまとめるスキル。URL・コピペ本文・スクリーンショット・動画の文字起こしなど、あらゆる入力ソースに対応。 |
| [hallmark](.claude/skills/hallmark/SKILL.md) | AI っぽい定番デザイン(AI-slop)を排除するデザインスキル。新規ページの生成(build)、既存コードの診断(audit)、作り直し(redesign)、URL やスクショからのデザイン抽出(study)に対応。マクロ構造の選択・テーマ適用・slop テストで、量産型テンプレに見えない UI を作る。[Nutlope/hallmark](https://github.com/Nutlope/hallmark) を MIT ライセンスで収録。 |

## 使い方

このリポジトリをクローンするか、必要なスキルの `SKILL.md` を
自分のプロジェクトの `.claude/skills/<スキル名>/SKILL.md` にコピーしてください。
