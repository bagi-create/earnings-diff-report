"use client";

import { useMemo, useState } from "react";
import {
  analyzeEarningsTexts,
  toPlainTextReport,
  type AnalysisResult,
} from "@/lib/diff";
import {
  SAMPLE_CURRENT,
  SAMPLE_CURRENT_CAUTIOUS,
  SAMPLE_PREVIOUS,
  SAMPLE_PREVIOUS_BULLISH,
} from "@/lib/samples";

type DiffFilter = "all" | "added" | "removed" | "rephrased";

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(text);
  }

  return pages.join("\n");
}

export default function EarningsDiffApp() {
  const [companyName, setCompanyName] = useState("");
  const [previousText, setPreviousText] = useState("");
  const [currentText, setCurrentText] = useState("");
  const [filter, setFilter] = useState<DiffFilter>("all");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const canAnalyze = previousText.trim().length > 0 && currentText.trim().length > 0;

  const reportText = useMemo(
    () => (result ? toPlainTextReport(result, companyName) : ""),
    [result, companyName],
  );

  async function handleFile(file: File | null, target: "previous" | "current") {
    if (!file) return;
    setStatus(`${file.name} を読み込み中です…`);
    try {
      const text = file.type === "application/pdf" ? await extractPdfText(file) : await file.text();
      if (target === "previous") setPreviousText(text);
      else setCurrentText(text);
      setStatus(`${file.name} からテキストを抽出しました。`);
    } catch {
      setStatus("PDFの抽出に失敗しました。テキストを直接貼り付けて試してください。");
    }
  }

  function loadSample(kind: "bullish" | "cautious") {
    if (kind === "bullish") {
      setPreviousText(SAMPLE_PREVIOUS);
      setCurrentText(SAMPLE_CURRENT);
    } else {
      setPreviousText(SAMPLE_PREVIOUS_BULLISH);
      setCurrentText(SAMPLE_CURRENT_CAUTIOUS);
    }
    setResult(null);
    setStatus("サンプルを読み込みました。「差分を解析」を押してください。");
  }

  function analyze() {
    if (!canAnalyze) return;
    setResult(analyzeEarningsTexts(previousText, currentText));
    setStatus("解析が完了しました。");
  }

  function downloadReport() {
    if (!reportText) return;
    const blob = new Blob([reportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "earnings-diff-report.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">Earnings Diff Report</p>
        <h1>決算差分レポート</h1>
        <p className="lead">
          前回と今回の決算資料を比べ、追加・削除・言い換えられた文言、トーンの変化、
          事業環境の変化を短時間で確認するためのツールです。
        </p>
      </header>

      <section className="card">
        <label className="field">
          <span>会社名（任意）</span>
          <input
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            placeholder="例：〇〇ホールディングス"
          />
        </label>

        <div className="grid">
          <DocumentInput
            title="前回の決算資料"
            text={previousText}
            onTextChange={setPreviousText}
            onFile={(file) => void handleFile(file, "previous")}
          />
          <DocumentInput
            title="今回の決算資料"
            text={currentText}
            onTextChange={setCurrentText}
            onFile={(file) => void handleFile(file, "current")}
          />
        </div>

        <div className="actions">
          <button type="button" className="primary" onClick={analyze} disabled={!canAnalyze}>
            差分を解析
          </button>
          <button type="button" onClick={() => loadSample("bullish")}>
            サンプル：中立→強気
          </button>
          <button type="button" onClick={() => loadSample("cautious")}>
            サンプル：強気→慎重
          </button>
          {result ? (
            <button type="button" onClick={downloadReport}>
              レポートを.txtで保存
            </button>
          ) : null}
        </div>
        {status ? <p className="status">{status}</p> : null}
      </section>

      {result ? (
        <section className="card">
          <h2>トーンの変化</h2>
          <p className="tone">
            {result.previousToneLabel}（{result.previousToneScore}pt）→{" "}
            <strong>
              {result.currentToneLabel}（{result.currentToneScore}pt）
            </strong>
          </p>

          <h2>要約</h2>
          <ul>
            {result.summaryLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          <h2>事業環境の変化</h2>
          {result.environmentChanges.length ? (
            <div className="envGrid">
              {result.environmentChanges.map((change) => (
                <article key={change.category} className="envCard">
                  <h3>{change.category}</h3>
                  {change.added.map((line) => (
                    <p key={line} className="addedText">＋ {line}</p>
                  ))}
                  {change.removed.map((line) => (
                    <p key={line} className="removedText">－ {line}</p>
                  ))}
                </article>
              ))}
            </div>
          ) : (
            <p>事業環境カテゴリに該当する変化は検出されませんでした。</p>
          )}

          <h2>文言の差分</h2>
          <div className="actions">
            {(["all", "added", "removed", "rephrased"] as DiffFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "chip active" : "chip"}
                onClick={() => setFilter(value)}
              >
                {value === "all" && `すべて`}
                {value === "added" && `追加 ${result.added.length}`}
                {value === "removed" && `削除 ${result.removed.length}`}
                {value === "rephrased" && `言い換え ${result.rephrased.length}`}
              </button>
            ))}
          </div>

          {(filter === "all" || filter === "added") &&
            result.added.map((line) => (
              <p key={`a-${line}`} className="diffLine addedText">＋ {line}</p>
            ))}
          {(filter === "all" || filter === "removed") &&
            result.removed.map((line) => (
              <p key={`r-${line}`} className="diffLine removedText">－ {line}</p>
            ))}
          {(filter === "all" || filter === "rephrased") &&
            result.rephrased.map((pair) => (
              <div key={pair.before} className="pair">
                <p className="removedText">前回：{pair.before}</p>
                <p className="addedText">今回：{pair.after}</p>
                <p className="similarity">類似度 {Math.round(pair.similarity * 100)}%</p>
              </div>
            ))}
        </section>
      ) : null}

      <footer className="footer">
        <p>
          本ツールは決算資料の文言変化を整理するためのもので、特定銘柄の売買を推奨する
          投資助言ではありません。
        </p>
      </footer>
    </main>
  );
}

function DocumentInput(props: {
  title: string;
  text: string;
  onTextChange: (value: string) => void;
  onFile: (file: File | null) => void;
}) {
  return (
    <div className="field">
      <span>{props.title}</span>
      <input
        type="file"
        accept="application/pdf,.pdf,.txt"
        onChange={(event) => props.onFile(event.target.files?.[0] ?? null)}
      />
      <textarea
        value={props.text}
        onChange={(event) => props.onTextChange(event.target.value)}
        placeholder="PDFをアップロードするか、決算短信・決算説明資料の本文を貼り付けてください"
        rows={12}
      />
    </div>
  );
}
