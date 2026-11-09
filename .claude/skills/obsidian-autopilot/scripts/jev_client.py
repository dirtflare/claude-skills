#!/usr/bin/env python3
"""TypeSafe Jev の最小クライアント。依存ゼロ（urllib のみ）。

Jev は文章を生成しない。型付きの判断だけを返す。
だから「分類する」「点数をつける」「成り立つか判定する」用途では、
Claude に文章を書かせるより桁違いに安い。

  公式: POST https://api.typesafe.ai/v1/systemone
  認証: Authorization: Bearer $TYPESAFE_API_KEY
  価格: 入力 $0.042 / 1M トークン、出力無料（2026-11 時点の公開値）

**Jev に向かないこと**（ここを間違えると「使えない」と感じる）
  - 要約・返信・文章生成     → Claude の仕事
  - 計算・日付比較・件数集計  → コードの仕事
  - 厳密な検索・実行         → コードの仕事

**向くこと**
  - 振り分け / トリアージ
  - こちらが用意した選択肢から 1 つ選ぶ
  - 文章に対する yes/no 判定
  - 壊れやすいパース処理の置き換え
  - 自信度が低いものを人間へエスカレーションする

    python3 jev_client.py --selftest
    python3 jev_client.py --ask "これは請求に関する内容か" --state "二重請求された"
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_ENDPOINT = os.environ.get(
    "TYPESAFE_ENDPOINT", "https://api.typesafe.ai/v1/systemone"
)
DEFAULT_MODEL = os.environ.get("TYPESAFE_MODEL", "jev-latest")
PRICE_PER_INPUT_TOKEN = 0.042 / 1_000_000


class JevError(RuntimeError):
    pass


class JevUnavailable(JevError):
    """キー未設定・ネットワーク不通など。呼び出し側はフォールバックすること。"""


def noul(instructions: str, criteria: dict | None = None) -> dict:
    """yes/no 判定。答えは 0〜1 の確率で返る。"""
    question: dict = {"type": "noul", "instructions": instructions}
    if criteria:
        question["criteria"] = criteria
    return question


def choice(instructions: str, criteria: dict) -> dict:
    """選択肢から 1 つ選ぶ。criteria は {選択肢名: 説明 or None}。

    当てはまらない場合に備えて other を必ず入れること。
    """
    return {"type": "choice", "instructions": instructions, "criteria": criteria}


def score(instructions: str, criteria: list[str]) -> dict:
    """順序のあるラベル（1〜10 個）で採点する。位置が 0 始まりのスコアになる。"""
    return {"type": "score", "instructions": instructions, "criteria": criteria}


class JevClient:
    def __init__(
        self,
        api_key: str | None = None,
        endpoint: str | None = None,
        model: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        self.api_key = api_key or os.environ.get("TYPESAFE_API_KEY")
        self.endpoint = endpoint or DEFAULT_ENDPOINT
        self.model = model or DEFAULT_MODEL
        self.timeout = timeout
        self.input_tokens = 0

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def ask(self, state: object, questions: dict[str, dict]) -> dict:
        """1 リクエストで複数の問いを投げる。

        同じ state への独立した問いは必ずまとめること。
        質問ごとに並列評価されるので、まとめても応答時間はほぼ変わらない。
        """
        if not self.api_key:
            raise JevUnavailable("TYPESAFE_API_KEY が設定されていません")
        if not questions:
            raise JevError("questions が空です")

        body = json.dumps(
            {"model": self.model, "state": state, "questions": questions},
            ensure_ascii=False,
        ).encode("utf-8")

        request = urllib.request.Request(
            self.endpoint,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:400]
            if exc.code in (401, 403):
                raise JevUnavailable(f"認証エラー {exc.code}: {detail}") from exc
            raise JevError(f"HTTP {exc.code}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise JevUnavailable(f"到達できません: {exc}") from exc
        except json.JSONDecodeError as exc:
            raise JevError(f"不正な JSON 応答: {exc}") from exc

        self.input_tokens += int(payload.get("usage", {}).get("input_tokens", 0))
        return payload.get("answers", {})

    # --- answers の読み取り。型ごとに形が違うのでここで吸収する。
    @staticmethod
    def noul_value(answers: dict, name: str, default: float = 0.0) -> float:
        answer = answers.get(name) or {}
        value = answer.get("noul")
        return float(value) if isinstance(value, (int, float)) else default

    @staticmethod
    def choice_value(answers: dict, name: str) -> tuple[str, float]:
        answer = answers.get(name) or {}
        return str(answer.get("choice", "")), float(answer.get("confidence", 0.0))

    @staticmethod
    def score_value(answers: dict, name: str) -> tuple[float, float]:
        answer = answers.get(name) or {}
        return float(answer.get("score", 0.0)), float(answer.get("confidence", 0.0))

    @property
    def cost_usd(self) -> float:
        return self.input_tokens * PRICE_PER_INPUT_TOKEN

    def report(self) -> str:
        return (
            f"Jev usage: {self.input_tokens:,} input tokens "
            f"(≈ ${self.cost_usd:.6f})"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Minimal Jev client.")
    parser.add_argument("--ask", help="noul で投げる問い")
    parser.add_argument("--state", help="判断対象のテキスト")
    parser.add_argument("--selftest", action="store_true", help="接続と鍵の確認")
    args = parser.parse_args()

    client = JevClient()

    if args.selftest:
        print(f"endpoint : {client.endpoint}")
        print(f"model    : {client.model}")
        print(f"api key  : {'設定済み' if client.available else '未設定 (TYPESAFE_API_KEY)'}")
        if not client.available:
            print("\nTYPESAFE_API_KEY を設定してください。console.typesafe.ai で作成できます。")
            return 1
        try:
            answers = client.ask(
                "二重に請求されました。返金してください。",
                {"billing": noul("これは請求に関する内容か")},
            )
            print(f"\n疎通 OK  noul={client.noul_value(answers, 'billing'):.2f}")
            print(client.report())
        except JevError as exc:
            print(f"\n失敗: {exc}", file=sys.stderr)
            return 1
        return 0

    if not args.ask or not args.state:
        parser.error("--ask と --state を両方指定してください（または --selftest）")

    try:
        answers = client.ask(args.state, {"q": noul(args.ask)})
    except JevError as exc:
        print(f"失敗: {exc}", file=sys.stderr)
        return 1

    print(f"noul = {client.noul_value(answers, 'q'):.3f}")
    print(client.report())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
