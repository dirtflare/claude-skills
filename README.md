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

> ⚠️ **貼る場所に注意。** 以下は**ターミナル(zsh / bash)に打つコマンド**です。
> Claude Code の中ではありません。日本語の文章をターミナルに貼ると
> `command not found` になるので、**コマンド行だけ**をコピーしてください。

## 手順

macOS なら先に FFmpeg を入れておくのが確実です (未導入の場合のみ):

```bash
brew install ffmpeg
```

そのうえで、この2つを**1つずつ**実行します。クローンは不要です。

```bash
npx skills add dirtflare/claude-skills --skill hyperframes-jp --agent claude-code --global -y
```

初回は `Need to install the following packages: skills@x.y.z` /
`Ok to proceed? (y)` と聞かれるので **y** で進めます。

`--agent claude-code` は必須です。省くと「どのエージェントに入れるか」の
対話式リストが出て、**Claude Code が未選択のまま**進んでしまいます。

```bash
bash ~/.claude/skills/hyperframes-jp/scripts/setup.sh --install
```

必要なのは **Node.js v22 以上** と **FFmpeg** の2つだけ (どちらも無料)。
レンダリング用の Chrome (約115MB) は自動で落ちてきます。
`whisper-cpp` / `Kokoro` / `MusicGen` / `Docker` が ✗ でも**問題ありません**
(任意項目。詳細は下の「つまずいたら」)。

**導入後は Claude Code を開き直してください。**
これで**どのフォルダで開いても** `/hyperframes` が使えます。

## Claude Code に代わりにやらせる場合

**先に `claude` と打って Claude Code を起動してください**
(`claud` ではありません。起動していないと、以下がただの文字列として
zsh に流れてエラーになります)。

Claude Code のプロンプトが出てから、以下を貼ります:

```
npx skills add dirtflare/claude-skills --skill hyperframes-jp --agent claude-code --global -y を実行して、
そのあと bash ~/.claude/skills/hyperframes-jp/scripts/setup.sh --install も実行してください。

前提の Node.js 22以上 と FFmpeg が入っていなければ、
僕のOSに合った方法で入れてから進めてください。
途中でエラーが出たら、直してから続けてください。

導入が終わったら Claude Code の再起動が必要かどうか教えてください。
```

## 何がどこに入るか

| 入るもの | 入れるコマンド | 場所 |
|---|---|---|
| `hyperframes-jp` ガイド本体 | 1行目 (`npx skills add`) | `~/.claude/skills/hyperframes-jp/` |
| HyperFrames 上流スキル 25個 | 2行目 (`setup.sh --install`) | `~/.claude/skills/` (+ `~/.agents/skills/`) |
| Chrome Headless Shell | 2行目 (`setup.sh --install`) | `~/.cache/hyperframes/` |

## オプション

```bash
S=~/.claude/skills/hyperframes-jp/scripts/setup.sh

bash $S                      # 前提をチェックするだけ (何も変更しない)
bash $S --help               # 使い方を表示
bash $S --install --project  # いま居るフォルダ限定で導入
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

### `zsh: command not found: claud`
`claude` のタイプミスです。Claude Code が起動していないので、
そのあとに貼った文章は**すべて zsh のコマンドとして解釈されます**。

### 日本語の指示文をターミナルに貼ってしまった
`Ctrl+C` で中断し、`Enter` を2〜3回押して入力バッファを流してから、
上の「手順」のコマンド行だけをやり直してください。
`npx ... --global を実行して、` のように日本語が引数として付いた状態では
正しく動きません。

### `Ok to proceed? (y)` で止まっている
`npx` が `skills` パッケージを初めて取得するときの確認です。**y** で進めます。

### エージェントを選ぶリストが出た (Amp / Cursor / Codex ... が並ぶ画面)
`--agent claude-code` を付け忘れています。その画面のまま進めるなら、
`Search:` に `claude` と入力 → `Claude Code (~/.claude/skills)` に矢印キーで
合わせて**スペース**で選択 (`●` になる) → **Enter** で確定します。

### `Eve does not support global skill installation`
**無害です。** グローバル導入に対応していない別エージェント向けの通知で、
Claude Code には正しく入っています。
`ls ~/.claude/skills/hyperframes` で確認できます。

### そのほか
`--install` の出力や赤いエラーメッセージを**丸ごと** Claude Code に貼って
「これを直して」と言えば済みます。エラーを自分で解読する必要はありません。

OS別の手順・`doctor` のどの ✗ を無視してよいか・よくある詰まりどころは
[references/setup.md](.claude/skills/hyperframes-jp/references/setup.md) にあります。

## 更新するには

上流は活発に更新されています。冪等なので、そのまま再実行するだけです。

```bash
npx skills add dirtflare/claude-skills --skill hyperframes-jp --agent claude-code --global -y   # ガイド
bash ~/.claude/skills/hyperframes-jp/scripts/setup.sh --install          # 上流本体
```

上流本体はバージョンを固定せず常に最新を取り直す方針のため、
このリポジトリにはコミットしていません (`.agents/` `agent/`
`skills-lock.json` は `.gitignore` 済み)。

---

## そのほかのスキルの使い方

必要なスキルの `SKILL.md` があるフォルダを、
`~/.claude/skills/<スキル名>/` (全体で使う) か
プロジェクトの `.claude/skills/<スキル名>/` (そのプロジェクトだけ) に
コピーしてください。
