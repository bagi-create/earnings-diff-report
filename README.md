# 決算差分レポート（Earnings Diff Report）

前回と今回の決算資料（決算短信・決算説明資料など）を読み比べ、書き換わった箇所だけを拾い出す Web アプリです。

- 追加・削除・言い換えを文単位で検出し、言い換えは語単位で朱書き（削除＝朱、追加＝群青）で表示
- 数値だけが変わった文は「数値だけの更新」として分け、文言の変化を埋もれさせない
- 業績予想（上方修正／下方修正／据え置き）、配当（増配／減配…）、自己株式取得の変化を検出
- トーン（慎重〜強気）を否定形・主語を考慮して判定し、前回→今回の動きを目盛りで表示
- 区分（業績／見通し／株主還元…）と論点（需要・価格・為替・人件費…）で変更を整理・絞り込み
- 変更ごとに重要度を付け、「注目の変化」を上位に表示
- AI要約（Gemini）は各項目に根拠の変更ID（C3 など）を付け、クリックで該当文へ移動
- Markdown のコピー／保存、印刷（PDF）

投資助言ではなく、決算資料の「文言の変化」を短時間で把握するための情報整理ツールです。

公開版: https://earnings-diff-report.m-shibahagi.workers.dev/

## 起動方法

Node.js 20 以上が必要です（`.nvmrc` は 22）。

```bash
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開いてください。API キーがなくてもルールベース解析で動作します。

AI要約を使う場合は `.env.local` に設定します（`.env.example` 参照）。

```bash
GEMINI_API_KEY=あなたのAPIキー
```

本番（Cloudflare Workers）では `npx wrangler secret put GEMINI_API_KEY` で登録します。
モデルの選び方・費用の上限の設定は [docs/AI_COST.md](docs/AI_COST.md) を参照してください。

## 処理の流れ

1. **ブラウザ内**：PDF からテキストを抽出（pdf.js）し、ルールベース解析を実行して結果をすぐ表示する。
2. **サーバー**：重要度の高い変更点だけ（上限つき）を受け取り、Gemini で要約する。
   キャッシュ → 1日の上限 → Gemini の順に確認する。失敗しても画面はルールベースの結果で成り立つ。

資料の全文はサーバーに送りません。

## 構成

| パス | 内容 |
| --- | --- |
| `src/lib/segment.ts` | テキストの正規化（NFKC、PDFの改行・ヘッダー・ページ番号・表の行の除去）、見出しからの区分判定、文分割 |
| `src/lib/analyze.ts` | 文の対応付け（完全一致 → 数値だけ違う → 類似文 → 追加・削除）、重要度、区分・論点の集計 |
| `src/lib/inlineDiff.ts` | 言い換えの語単位差分（Intl.Segmenter＋LCS、読みやすさのための整形） |
| `src/lib/tone.ts` | トーン判定（否定形、増加／減少の主語による向き、不確実性の表現） |
| `src/lib/signals.ts` | 論点の分類、業績予想・配当・自己株式取得の検出、本文中の主要数値の抽出 |
| `src/lib/summaryPayload.ts` | AIに送る変更点の選別と上限 |
| `src/lib/gemini.ts` | Gemini への構造化要約リクエスト（根拠ID付き）とレスポンス検証 |
| `src/lib/store.ts` | Cloudflare KV によるAI要約のキャッシュと1日の上限（KV 未設定でも動作） |
| `src/lib/report.ts` | Markdown レポート |
| `src/lib/pdf.ts` | ブラウザでのPDFテキスト抽出 |
| `src/app/api/summarize/route.ts` | AI要約API |
| `src/components/` | 画面（入力、結果、朱書き表示、トーンの目盛り） |
| `scripts/check-analysis.ts` | 解析エンジンの回帰チェック（`npm run check:analysis`） |

## 注意

- 画像だけのPDF（スキャン）は文字を読み取れません。その場合は本文を貼り付けてください。
- 表の中の数値は比較対象外です（表の行は自動で除外します）。本文中の数値は比較します。
- 本ツールは決算資料の文言変化を整理するもので、特定銘柄の売買を推奨する投資助言ではありません。
