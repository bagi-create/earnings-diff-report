# 引き継ぎ書：決算差分レポート（earnings-diff-report）

作成：2026-10-27（モカ → Claude Code への引き継ぎ）

## 概要
前期・当期の決算資料（PDFアップロード／テキスト貼り付け）を比較し、文単位の追加・削除・言い換え、トーン変化（強気／慎重など）、事業環境カテゴリ別の変化を表示するWebアプリ。AI要約は Gemini Flash が担当し、未設定時はルールベース分析のみで動作する。
位置づけは「資料の整理」ツール。投資助言に当たらないよう、売買推奨は出さない設計（docs/MONETIZATION.md 参照）。

## リポジトリ・公開先
- GitHub：https://github.com/bagi-create/earnings-diff-report （private、ブランチ main）
- 公開URL：https://earnings-diff-report.m-shibahagi.workers.dev/ （Cloudflare Workers、GitHub連携で push → 自動デプロイ）
- Cloudflare側のビルド設定：build = `npx opennextjs-cloudflare build`、deploy = `npx opennextjs-cloudflare deploy`

## 技術構成
- Next.js 15 / React 19 / TypeScript
- Cloudflare Workers 向け OpenNext アダプタ（@opennextjs/cloudflare、wrangler）
- wrangler.jsonc：name = earnings-diff-report、main = .open-next/worker.js、ASSETS バインディング、nodejs_compat
- 主要ファイル
  - `src/lib/diff.ts`：文分割→類似度判定（追加／削除／言い換え）、キーワード重み付きトーン判定、環境カテゴリ分類
  - `src/lib/gemini.ts`：Gemini（gemini-2.5-flash、GEMINI_MODEL で上書き可）へ差分結果だけを渡して要約。事実の捏造と売買推奨を禁止する指示付き
  - `src/app/api/summarize/route.ts`：ルールベース分析を先に実行し、キーがあれば AI 要約を付与、失敗時はルールベースにフォールバック
  - `src/components/EarningsDiffApp.tsx`：UI（PDF抽出はブラウザ側 pdf.js）

## 現在の状態
- デプロイ済み・動作確認済み（トップページ HTTP 200、POST /api/summarize 応答OK、トーン変化の判定も正常）
- AI要約は未稼働：APIレスポンスの `aiStatus` が `not_configured`（= GEMINI_API_KEY 未登録）

## 未完了タスク（引き継ぎの本題）
1. **GEMINI_API_KEY を Cloudflare Worker に Secret として登録する**
   - ユーザーは無料枠の Gemini API キーを取得済み（キーの値はユーザー本人に確認すること）
   - ユーザーがダッシュボードの Variables and Secrets で追加を試みたが、保存できていない模様。再デプロイ後も `not_configured` のままだった
   - 確実な方法：`npx wrangler login` が通る環境で `npx wrangler secret put GEMINI_API_KEY`
   - ダッシュボードでやる場合は Settings → Variables and Secrets（実行時用。Build 側の変数ではない）に Secret として登録し、Deploy まで完了させる
   - 完了確認：`curl -X POST https://earnings-diff-report.m-shibahagi.workers.dev/api/summarize` に2文書を送り、`aiStatus` が `generated` になればOK。`fallback` の場合はキー不正や Gemini 側エラーを疑う
2. 登録後、実際の決算PDF（2期分）での通し確認は未実施

## 注意点
- GEMINI_API_KEY は絶対にリポジトリへコミットしない（.env.local か Cloudflare Secret で管理）
- Gemini 無料枠はレート制限あり（プロトタイプ用途の前提）
- 参考ドキュメント：docs/MONETIZATION.md（料金案・法務上の位置づけ）、docs/ROADMAP.md

## 経緯メモ
- 前任環境では `wrangler login` の OAuth コールバック（localhost:8976）が届かず認可できなかったため、デプロイはユーザーが Chrome 上で GitHub 連携プロジェクトを作成して実施した。CLI 操作はその制約のない環境で進めてほしい。
