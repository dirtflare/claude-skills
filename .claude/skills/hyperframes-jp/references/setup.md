# セットアップ詳細とトラブルシュート

## 必要なもの

| もの | 条件 | 用途 |
|---|---|---|
| Node.js | **v22 以上** | CLI とレンダラの実行環境 |
| FFmpeg | 特にバージョン指定なし (6系で検証済み) | 撮影したフレームを MP4 に固める |
| Chrome Headless Shell | 自動取得 (約115MB) | HTML を1フレームずつ撮影する |

どれも無料。Chrome は `npx hyperframes browser ensure` が勝手に落としてくるので、
人間が用意するのは実質 Node と FFmpeg の2つだけ。

## 手順

### 1. Node.js を確認する

```bash
node -v
```

`v22.x` 以上が返れば OK。古い / 入っていない場合:

- **公式インストーラ**: nodejs.org から LTS を落とす (一番簡単)
- **nvm 派**: `nvm install 22 && nvm use 22`

### 2. FFmpeg を入れる

```bash
# macOS
brew install ffmpeg

# Linux (Debian / Ubuntu)
sudo apt-get update && sudo apt-get install -y ffmpeg

# Windows
winget install ffmpeg
```

確認:

```bash
ffmpeg -version
```

> **裏技**: 環境構築そのものを Claude Code に任せてよい。
> 「この環境に Node.js の22以上と FFmpeg をセットアップして。終わったら動作確認までやって」
> と頼めば、OS に合わせたコマンドを提案して実行し、確認まで面倒を見る。
> 途中でエラーが出たらエラー文を丸ごと貼り返せばいい。

### 3. スキルを導入する

**グローバル導入 (推奨)** — どのフォルダで Claude Code を開いても使える:

```bash
npx skills add heygen-com/hyperframes \
  --skill '*' --agent claude-code --full-depth -y --global
```

**プロジェクト導入** — 動画用のフォルダを作り、**その中で**実行する。
そのフォルダ限定になる:

```bash
npx skills add heygen-com/hyperframes \
  --skill '*' --agent claude-code --full-depth -y
```

フラグの意味:

- `--full-depth` は**必須級**。付けないとリポジトリの数時間古いコピーが入ることが
  あると公式が案内している
- `--skill '*'` は同梱スキル全部入り。ルーターが必要なものだけ読み込む設計なので、
  全部入れて困ることはない。省くとどれを入れるか選ぶ対話画面が出る
- **`--agent claude-code` は必須。** 省くと「どのエージェントに入れるか」の
  対話式リストが出る。しかもその画面の既定選択に **Claude Code は入っていない**ので、
  気づかず Enter を押すと Amp / Cursor / Codex など使っていないエージェントにだけ
  入って、Claude Code では使えないまま終わる
- `-y` で確認プロンプトを出さない
- `--global` / `-g` でユーザーレベル (`~`) に入る

> `--all` は `--skill '*' --agent '*' -y` の省略形。対話は出ないが、
> **60種類以上のエージェント全部に複製される**ので推奨しない。

導入されるもの:

| もの | グローバル | プロジェクト |
|---|---|---|
| スキル本体 (25個) | `~/.agents/skills/` | `./.agents/skills/` |
| Claude Code 用リンク | `~/.claude/skills/` | `./.claude/skills/` |
| 他エージェント向け複製 | — | `./agent/skills/` |
| 導入マニフェスト | — | `./skills-lock.json` |

**導入後は Claude Code を開き直す。** スラッシュコマンドが登録される。

> `--agent '*'` を使った場合に限り `Eve does not support global skill
> installation` / `PromptScript does not support global skill installation`
> という ✗ が大量に出るが**無害**。グローバル導入に対応していない別エージェント
> 向けの通知で、Claude Code には正しく入っている。
> 上の `--agent claude-code` を使えばそもそも出ない。

導入できたかの確認:

```bash
ls ~/.claude/skills/hyperframes/SKILL.md    # グローバル導入の場合
```

### 4. レンダリング用 Chrome を取得する

```bash
npx hyperframes browser ensure
```

初回のみ。約115MB。

### 5. 総合診断する

```bash
npx hyperframes doctor
```

`whisper-cpp` / `TTS (Kokoro)` / `BGM (MusicGen)` / `Docker` は**任意**。
これらが ✗ でもレンダリングはできる。必須なのは Node / FFmpeg / FFprobe / Chrome。

### ナレーションと BGM は pip ではなくサインインで入手する

`doctor` が `TTS (Kokoro)` / `BGM (MusicGen)` に `pip install ...` を提示するが、
**これは最短経路ではない。** 上流の提供元一覧が指しているのは HeyGen の無料枠:

| 用途 | 実際の供給元 | Kokoro / MusicGen の位置 |
|---|---|---|
| BGM / 効果音 | HeyGen 音源カタログ (1万曲以上) の無料枠 | MusicGen は提供元一覧に載っていない |
| ナレーション | HeyGen TTS (**単語タイムスタンプ付き**) | Kokoro は「ローカルのフォールバック」 |
| 画像 / アイコン | HeyGen カタログ検索の無料枠 | mflux が任意のローカル代替 |

HeyGen TTS は単語タイムスタンプを返すので、**字幕同期で whisper を1回走らせる
工程が省ける**。Kokoro は返さない。

```bash
npx hyperframes auth login    # OAuth が既定
npx hyperframes auth status   # 確認
```

⚠️ **OAuth で入ること。** 無料枠は OAuth セッションに紐づく。
API キーで入れると API クレジットが課金される、と上流が明記している。

`media-use` 経由で BGM や画像を取る場合は、別体の HeyGen CLI も要求される
(`heygen update` → `heygen auth login --oauth`、v0.3.0 以上)。
資格情報は `~/.heygen/credentials` を共有するので、片方で入れば足りることが多い。
インストール手順は developers.heygen.com/cli。

### それでもローカルで完結させたい場合の任意依存

| 任意依存 | 要る場面 | 入れ方 |
|---|---|---|
| whisper-cpp | ローカルで文字起こし | macOS は `brew install whisper-cpp` |
| Kokoro | 完全オフラインのナレーション。日本語は `jf_` 系の声 (`jf_alpha` 等) | `pip3 install kokoro-onnx soundfile` |
| MusicGen | 完全オフラインの BGM 生成。`torch` が数GB | `pip3 install transformers torch soundfile numpy` |
| Docker | コンテナでレンダリングする場合 | 通常のローカルレンダには不要 |

macOS で `zsh: command not found: pip` が出るのは正常。**`pip` ではなく `pip3`**。
それでも `externally-managed-environment` で拒否される場合は Homebrew Python の
保護機能なので、`python3 -m venv` で仮想環境を作るか `pipx` を使う。
ただし仮想環境に入れると `hyperframes` から見えないことがあるため、
**そもそも上のサインイン経路を先に試すのが確実。**

## 最初の1本

Claude Code に投げる:

```
/hyperframes を使って、10秒のプロダクト紹介動画を作ってください。
黒背景にタイトルがフェードインして、控えめなBGMが流れる構成で。
サイズは1920x1080でお願いします。
```

途中経過を見る / 書き出す:

```bash
npx hyperframes preview   # ブラウザでプレビュー。保存すると即反映
npx hyperframes render    # MP4 を書き出す
```

書き出し先は `renders/<プロジェクト名>_<日時>.mp4`。
X にも note にもそのまま貼れる普通の MP4。特別な変換は不要。

## プロジェクトを手で作る場合

ルーター経由なら不要だが、素の雛形が欲しいときは:

```bash
npx hyperframes init <名前> --example blank --resolution landscape
```

- `--resolution`: `landscape` (1920x1080) / `portrait` (1080x1920) /
  `square` (1080x1080) / `landscape-4k` / `portrait-4k` / `square-4k`
- 非対話環境 (CI・エージェント) では `--non-interactive` と
  `--example` / `--video` / `--audio` のいずれかが必須
- `--example blank` 以外の雛形もある (`warm-grain`, `swiss-grid` 等)

## トラブルシュート

### `ffmpeg: command not found`
FFmpeg が未導入。§2 を実行する。Linux で `404 Not Found` が並んだら
パッケージインデックスが古いので `sudo apt-get update` を**先に**通す。

### `Chrome Headless Shell is required for local rendering`
`npx hyperframes browser ensure` を実行する。

### Node が v22 未満
CLI が起動しない、または不明なエラーで落ちる。Node を上げる。

### `frame.md` が効いていない気がする
**ファイル名が大文字になっていないか確認する。** 上流は
`frame.md` → `design.md` → `DESIGN.md` の順に探し、
`FRAME.md` は探索対象に入っていない。
Linux では大文字だと完全に無視される。macOS は大文字小文字を区別しない
ファイルシステムなので偶然動いてしまい、Linux や CI に持っていった瞬間に壊れる。

置き場所はプロジェクトフォルダの直下。

### `Non-interactive init requires --example, --video, or --audio`
`npx hyperframes init` を非対話で走らせたときに出る。
`--example blank` を明示的に付ける。

### `N HyperFrames skills out of date or missing. Run: npx hyperframes skills update`

`doctor` の末尾に出ることがある。**レンダリングは問題なくできる**ので、
急いで対処する必要はない。

⚠️ **`npx hyperframes skills update` を安易に実行しないこと。**
このコマンドは「もう公開されていない」と判定したスキルを**削除する**。
実測では以下の6個が消えた:

```
captions-overlay, changelog-video, cut-the-curve,
motion-doctrine, oversized-cursor, seam-craft
```

これらは公式 README のスキル一覧には載っていないが、リポジトリには存在し、
モーションの品質を決める中身を持っている
(`motion-doctrine` は自身を「アニメーションを組む前に最初に読むゲートウェイ。
ここのルールは上流の一般的なモーション指針を上書きする」と宣言している)。
消すと動画の動きの質が落ちる可能性がある。

警告を消したいだけなら、**セットアップを流し直せばよい**:

```bash
bash ~/.claude/skills/hyperframes-jp/scripts/setup.sh --install
```

実測では、入れ直した直後は警告が出ない状態になった。

### プロジェクトの CLI バージョンが古い
雛形は `package.json` に `hyperframes@<版>` をピン留めするため、
放っておくと古いまま走り続ける。確認と更新:

```bash
npx hyperframes@latest upgrade --project . --check   # 読み取りのみ
npx hyperframes@latest upgrade --project .           # 適用
npx hyperframes check                                # 検証
```

`--project` の後の `.` は省略しない (古い CLI では次のフラグを
ディレクトリ名として食う)。

### レンダリングが遅い
CPU コア数に比例する。4コアで 10秒 / 300フレームの単純な構成が約23秒。
凝った構成や長尺は伸びる。プレビューで詰めてから最後に1回 render するのが定石。

### `zsh: command not found: pip`
macOS では正常。`pip` ではなく **`pip3`**。
ただし Kokoro / MusicGen は最短経路ではないので、
まず `npx hyperframes auth login` を試す (上の「ナレーションと BGM は〜」)。

### `externally-managed-environment` で pip3 が拒否される
Homebrew Python の保護機能。`python3 -m venv` か `pipx` を使う。
ただし仮想環境に入れた依存は `hyperframes` から見えないことがある。

### それ以外
**赤いエラーメッセージを丸ごと Claude Code に貼る。** 解読は仕事ではない。

## 更新

上流は活発に更新されている。取り直すだけ:

```bash
bash ~/.claude/skills/hyperframes-jp/scripts/setup.sh --install
```

このリポジトリは上流スキル本体をコミットしていない (`.gitignore` 済み)。
バージョンを固定せず常に最新を取り直す方針なので、
ローカルで上書きされても差分は出ない。
