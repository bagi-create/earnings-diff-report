# DeltaLens 開発ガイド

> 旧称：決算差分レポート（Earnings Diff Report）。リポジトリ名・Worker名は `earnings-diff-report` のまま。

## 1. プロジェクト概要
上場企業の決算短信・説明資料における四半期ごとの「差分」「消えた言葉」「前提条件の変化」を可視化し、投資家・アナリストが異変を即座に検知できるWebサービス。

- **サービス名**: DeltaLens
- **キャッチコピー**: 会社の変化（Δ）を決算からすばやく読み解く
- **URL**: https://earnings-diff-report.m-shibahagi.workers.dev/
- **主要機能**: TOPIX Core30等の8期分差分レポート閲覧、PDF比較機能
- **スタック**: Next.js (App Router), TypeScript, Tailwind CSS, Cloudflare Workers / Cloudflare Pages

## 2. 開発・設計思想 (Guiding Principles)
1. **単なる要約ではなく「異変」の抽出に特化**
   - 「新しく書かれたこと」だけでなく、「密かに削除されたポジティブ表現」「追加されたリスク但し書き」「前提レートの微変更」を最優先で可視化する。
2. **直感的・高密度なUI (Financial Data Density)**
   - 冗長な文章を避け、タグ、バッジ、差分ハイライト（Diff表示）を用いて数秒で気づきを与えるデザイン。
3. **ハルシネーションゼロ & 原文参照の徹底**
   - AIの推測だけで語らせず、必ず原文PDFの該当箇所や変更前後の対比根拠に紐づける。

## 3. コーディング規約 & 技術スタック
- **TypeScript**: 厳格な型定義（`strict: true`）。`any` の使用禁止。
- **Styling**: Tailwind CSS を使用。カラーパレットは投資・金融ツールにふさわしいダーク/シックなトーン（Slate, Zinc, Emerald/Rose等の差分カラー）。
- **Component**: Client Component (`'use client'`) はインタラクティブ要素（フィルタ、モーダル、ファイルアップロード等）のみに留め、基本は Server Component で構成してSEO・高速化を担保する。
- **Edge Compatible**: Cloudflare Workers / Pages 上で動作するため、Node.js 固有モジュール（`fs` や `path` など）への直接依存を避け、Web Standard API を使用する。

## 4. コマンドラインワークフロー
- `npm run dev`: ローカル開発サーバーの起動
- `npm run build`: ビルド確認（Cloudflare Workers 互換性の検証）
- `npm run lint`: コード品質のチェック

## 5. 実装メモ（このリポジトリ固有）
- ソースは `src/` 配下（`src/app`, `src/components`, `src/lib`）。
- Tailwind v4 は preflight なしで読み込んでいる（`src/app/globals.css`）。既存ページの BEM クラスは同じ CSS 変数（Zinc 基調のダーク）を参照する。新規 UI は Tailwind で書く。Tailwind を使う要素では `m-0` などで既定マージンを明示的に消す。
- フォントはゴシック体のみ（Inter＋IBM Plex Sans JP）。明朝体は使わない。
- 異変バッジ（リスク記述追加／表現トーンダウン／前提条件変更／据え置き）の判定と要約文は `src/lib/anomaly.ts`。AI を使わず、解析結果の数値だけから組み立てる。しきい値は `THRESHOLDS`。
- トップページは KV の `core30` キーを1回だけ読む。`digest` は `npm run reports:build` で生成される（未生成の場合は、トーンと開示シグナルだけで判定するフォールバックで動く）。
- `scripts/` はローカル PC 上で実行するバッチなので Node.js モジュールを使ってよい（Edge 互換の制約は `src/` が対象）。
