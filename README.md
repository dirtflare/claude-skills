# claude-skills

Claude Code 用の汎用スキルを集めたリポジトリです。
特定のアプリやリポジトリに紐付かないスキルをここに集約します。

## 収録スキル一覧

| スキル | 説明 |
|---|---|
| [x-post-analysis](.claude/skills/x-post-analysis/SKILL.md) | X (Twitter) の投稿を「取得 → 抽出 → 検証 → 構造化」して、構造化レポートや指定の成果物(設計書・ワークフロー・メモ等)にまとめるスキル。URL・コピペ本文・スクリーンショット・動画の文字起こしなど、あらゆる入力ソースに対応。 |
| [hyperframes-jp](.claude/skills/hyperframes-jp/SKILL.md) | HyperFrames (HeyGen のオープンソース動画レンダリング基盤) を Claude Code で運用するための日本語ガイド。セットアップ、`frame.md` によるブランドの仕込み、5つの実践レシピのプロンプト型、一文リテイクの運用術、Video Agent との使い分け。 |

---

# hyperframes-jp の入れ方

## いちばん簡単な方法 — Claude Code に丸投げする

**手元のターミナルで Claude Code を開いて、以下をそのままコピペしてください。**
コマンドを自分で組み立てる必要はありません。

```
https://github.com/dirtflare/claude-skills の
claude/implement-article-content-9lznxy ブランチを一時フォルダにクローンして、
.claude/skills/hyperframes-jp/scripts/setup.sh --install を実行してください。

前提の Node.js 22以上 と FFmpeg が入っていなければ、
僕のOSに合った方法で入れてから進めてください。
途中でエラーが出たら、直してから続けてください。

導入が終わったら Claude Code の再起動が必要かどうか教えてください。
```

これで `~/.claude/skills/` に導入され、**どのフォルダで Claude Code を開いても**
`/hyperframes` が使えるようになります。

## 自分でコマンドを打つ場合

```bash
# 1. クローン (ブランチ名にスラッシュが入っているので -b で明示する)
git clone -b claude/implement-article-content-9lznxy \
  https://github.com/dirtflare/claude-skills.git
cd claude-skills

# 2. 前提だけチェックする (何も変更しない)
bash .claude/skills/hyperframes-jp/scripts/setup.sh

# 3. 導入する (~/.claude/skills に入る = どこからでも使える)
bash .claude/skills/hyperframes-jp/scripts/setup.sh --install
```

必要なのは **Node.js v22 以上** と **FFmpeg** の2つだけ (どちらも無料)。
レンダリング用の Chrome (約115MB) は自動で落ちてきます。

`--install` が入れるもの:

| 入るもの | 場所 |
|---|---|
| HyperFrames 上流スキル 25個 | `~/.claude/skills/` (+ `~/.agents/skills/`) |
| `hyperframes-jp` ガイド本体 | `~/.claude/skills/hyperframes-jp/` |
| Chrome Headless Shell | `~/.cache/hyperframes/` |

### オプション

```bash
bash .claude/skills/hyperframes-jp/scripts/setup.sh --help              # 使い方を表示
bash .claude/skills/hyperframes-jp/scripts/setup.sh --install --project # このフォルダ限定で導入
```

## 導入できたか確かめる

動画用のフォルダを新しく作って Claude Code を開き、こう投げてください:

```
/hyperframes を使って、10秒のプロダクト紹介動画を作ってください。
黒背景にタイトルがフェードインして、控えめなBGMが流れる構成で。
サイズは1920x1080でお願いします。
```

`renders/` に MP4 が出れば成功です。X にも note にもそのまま貼れます。

## つまずいたら

`--install` の出力や赤いエラーメッセージを**丸ごと** Claude Code に貼って
「これを直して」と言えば済みます。エラーを自分で解読する必要はありません。

OS別の手順・`doctor` のどの ✗ を無視してよいか・よくある詰まりどころは
[references/setup.md](.claude/skills/hyperframes-jp/references/setup.md) にあります。

## 更新するには

上流は活発に更新されています。`--install` を再実行するだけです (冪等)。

上流本体はバージョンを固定せず常に最新を取り直す方針のため、
`.agents/` `agent/` `skills-lock.json` は `.gitignore` 済みです。

---

## そのほかのスキルの使い方

必要なスキルの `SKILL.md` があるフォルダを、
`~/.claude/skills/<スキル名>/` (全体で使う) か
プロジェクトの `.claude/skills/<スキル名>/` (そのプロジェクトだけ) に
コピーしてください。
