# claude-skills

Claude Code 用の汎用スキルを集めたリポジトリです。
特定のアプリやリポジトリに紐付かないスキルをここに集約します。

## 収録スキル一覧

| スキル | 説明 |
|---|---|
| [x-post-analysis](.claude/skills/x-post-analysis/SKILL.md) | X (Twitter) の投稿を「取得 → 抽出 → 検証 → 構造化」して、構造化レポートや指定の成果物(設計書・ワークフロー・メモ等)にまとめるスキル。URL・コピペ本文・スクリーンショット・動画の文字起こしなど、あらゆる入力ソースに対応。 |
| [lenis-gsap-integration](.claude/skills/lenis-gsap-integration/SKILL.md) | Lenis(スムーススクロール)と GSAP ScrollTrigger(スクロール連動アニメーション)を正しく連携させるスキル。RAF を GSAP ticker に一本化し、`ScrollTrigger.update` と同期する定型手順、pin / scrub / snap の注意点、React(`lenis/react` + `useGSAP`)版、desync・カクつきのデバッグまでを収録。 |

## 使い方

このリポジトリをクローンするか、必要なスキルの `SKILL.md` を
自分のプロジェクトの `.claude/skills/<スキル名>/SKILL.md` にコピーしてください。
