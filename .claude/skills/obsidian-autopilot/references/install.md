# 導入手順

## 前提

- ローカルに Obsidian Vault がある
- ターミナルで Claude Code が動く
- Python 3.9 以上（外部ライブラリ不要）

## 1. スキルを置く

```bash
git clone https://github.com/dirtflare/claude-skills.git
mkdir -p ~/.claude/skills
cp -r claude-skills/.claude/skills/obsidian-* ~/.claude/skills/
```

## 2. Vault を整える（まだなら）

autopilot は `type` / `status` / `## Use When` といった構造を前提に精度を出す。
Vault がまだ素のままなら先に `obsidian-vault-kit` で骨組みを作る。

```bash
python3 ~/.claude/skills/obsidian-vault-kit/scripts/scaffold_vault.py \
  --vault ~/MyVault --dry-run
```

**既存ノートを全部移行しないこと。** 初回は大量にエラーが出るが放置してよい。
必要になったものだけ直す（Migration on Touch）。

## 3. autopilot を入れる

```bash
python3 ~/.claude/skills/obsidian-autopilot/scripts/install_autopilot.py \
  --vault ~/MyVault --dry-run

python3 ~/.claude/skills/obsidian-autopilot/scripts/install_autopilot.py \
  --vault ~/MyVault
```

やること:

1. `~/MyVault/.claude/settings.json` にフックを**マージ**（既存設定は保持、バックアップ作成）
2. `~/MyVault/90_System/autopilot.json` に既定設定を作成
3. 検索インデックスを構築

### Vault の外からも想起を効かせたい場合

```bash
python3 .../install_autopilot.py --vault ~/MyVault --global
```

`~/.claude/settings.json` に入るので、どのプロジェクトで Claude Code を
起動しても、あなたの Vault から想起が効く。

仕事用リポジトリでの会話まで Daily Note に記録されるのが嫌なら、
`90_System/autopilot.json` の `capture_prompts` を false にして
想起だけ残す運用もできる。

## 4. 定期実行

```bash
crontab -e
```

```cron
# 毎朝 7:00 — Morning Brief を今日の Daily Note へ
0 7 * * * cd "$HOME/MyVault" && python3 "$HOME/.claude/skills/obsidian-autopilot/scripts/daily_rollup.py" --vault "$HOME/MyVault"

# 30 分ごと — インデックス更新（mtime 差分なので軽い）
*/30 * * * * python3 "$HOME/.claude/skills/obsidian-autopilot/scripts/vault_search.py" index --vault "$HOME/MyVault"
```

macOS で cron が動かない場合は launchd か、Obsidian を開いたときに
手で `daily_rollup.py` を叩く運用でもよい。

## 5. 動作確認

Claude Code を Vault で起動し直して、Vault の中身に関係する質問を投げる。

```bash
cd ~/MyVault && claude
```

想起が効いているかは `claude --debug` でフックの出力を見るのが確実。
`<vault-recall>` ブロックが出ていれば成功。

数日使ってから:

```bash
python3 ~/.claude/skills/obsidian-autopilot/scripts/vault_stats.py --vault ~/MyVault
```

## 6. .gitignore

Vault を Git 管理しているなら追加する。

```gitignore
90_System/.recall_index.json
90_System/.recall_log.jsonl
.claude/settings.json.bak-*
```

---

## うまくいかないとき

| 症状 | 原因と対処 |
|---|---|
| 想起が 0 回 | フック未登録。`claude --debug` で確認。`install_autopilot.py --dry-run` が「変更なし」と言うか見る |
| 想起が的外れ | `## Use When` が書かれていない。タイトルが分野名になっている。`recall_min_ratio` を 0.2 に下げる |
| Daily がノイズだらけ | `min_prompt_chars` を上げる。`exclude_patterns` で除外する |
| 新しいノートが出てこない | インデックス未更新。`vault_search.py index --vault ...` を実行。cron を確認 |
| Claude Code が重い | `recall_limit` を 2 に下げる。インデックス更新の cron 間隔を延ばす |
| セッションが壊れた | autopilot が原因ではないはず（常に exit 0）。切り分けは `--uninstall` |

## アンインストール

```bash
python3 .../install_autopilot.py --vault ~/MyVault --uninstall
```

フックだけ外す。あなた自身の他のフックと設定は残る。
Daily Note に記録された内容もそのまま残る。
