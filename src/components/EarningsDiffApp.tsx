"use client";

import { useRef, useState } from "react";
import ResultView, { type AiState } from "@/components/ResultView";
import { analyzeEarningsTexts } from "@/lib/analyze";
import { extractPdfText } from "@/lib/pdf";
import { SAMPLES } from "@/lib/samples";
import { buildSummaryPayload } from "@/lib/summaryPayload";
import type { AnalysisResult, SummarizeResponse } from "@/lib/types";

type Side = "previous" | "current";

interface DocState {
  text: string;
  fileName?: string;
  pages?: number;
  loading?: boolean;
  error?: string;
}

const MAX_CHARS = 300_000;

export default function EarningsDiffApp() {
  const [companyName, setCompanyName] = useState("");
  const [docs, setDocs] = useState<Record<Side, DocState>>({
    previous: { text: "" },
    current: { text: "" },
  });
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [ai, setAi] = useState<AiState | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [editing, setEditing] = useState(true);
  const runId = useRef(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  const ready = docs.previous.text.trim().length > 0 && docs.current.text.trim().length > 0;
  const busy = docs.previous.loading || docs.current.loading;

  function patchDoc(side: Side, patch: DocState | ((d: DocState) => DocState)) {
    setDocs((prev) => ({ ...prev, [side]: typeof patch === "function" ? patch(prev[side]) : patch }));
  }

  async function loadFile(side: Side, file: File) {
    patchDoc(side, (d) => ({ ...d, loading: true, error: undefined, fileName: file.name }));
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const { text, pages } = isPdf ? await extractPdfText(file) : { text: await file.text(), pages: undefined };
      if (!text.replace(/\s/g, "")) {
        patchDoc(side, {
          text: "",
          fileName: file.name,
          error: "文字を読み取れませんでした。画像だけのPDF（スキャン）の可能性があります。本文を貼り付けてください。",
        });
        return;
      }
      patchDoc(side, { text: text.slice(0, MAX_CHARS), fileName: file.name, pages });
    } catch {
      patchDoc(side, {
        text: "",
        fileName: file.name,
        error: "PDFを読み込めませんでした。パスワード付きか破損している可能性があります。本文を貼り付けてください。",
      });
    }
  }

  function loadSample(id: string) {
    const sample = SAMPLES.find((s) => s.id === id)!;
    setCompanyName(sample.companyName);
    setDocs({
      previous: { text: sample.previous, fileName: "サンプル（前回）" },
      current: { text: sample.current, fileName: "サンプル（今回）" },
    });
    void analyze(sample.previous, sample.current, sample.companyName);
  }

  function swap() {
    setDocs((d) => ({ previous: d.current, current: d.previous }));
  }

  async function analyze(previous = docs.previous.text, current = docs.current.text, company = companyName) {
    if (!previous.trim() || !current.trim()) return;
    const id = ++runId.current;
    setAnalyzing(true);
    // Let the button state paint before the synchronous analysis runs.
    await new Promise((r) => setTimeout(r, 30));
    const analysis = analyzeEarningsTexts(previous, current);
    if (id !== runId.current) return;
    setResult(analysis);
    setEditing(false);
    setAnalyzing(false);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

    if (analysis.changes.length === 0) {
      setAi(null);
      return;
    }
    setAi({ status: "loading" });
    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: buildSummaryPayload(analysis, company) }),
      });
      const data = (await response.json()) as SummarizeResponse;
      if (id === runId.current) setAi({ status: "done", ...data });
    } catch {
      if (id === runId.current) {
        setAi({
          status: "done",
          aiStatus: "fallback",
          model: null,
          warning: "AI要約のサーバーに接続できませんでした。自動解析の結果のみ表示しています。",
        });
      }
    }
  }

  return (
    <main className="page">
      <header className="masthead">
        <p className="masthead__mark">決算差分</p>
        <p className="masthead__sub">前回と今回の決算資料を読み比べ、書き換わった箇所だけを拾い出します。</p>
      </header>

      {editing || !result ? (
        <section className="intake" aria-label="比較する資料">
          <label className="company">
            <span>会社名</span>
            <input
              className="input"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="任意（レポートの見出しに入ります）"
            />
          </label>

          <div className="sheets">
            <DocumentSheet
              side="previous"
              label="前回"
              hint="比較のもとになる資料"
              doc={docs.previous}
              onText={(text) => patchDoc("previous", (d) => ({ ...d, text, error: undefined }))}
              onFile={(f) => void loadFile("previous", f)}
              onClear={() => patchDoc("previous", { text: "" })}
            />
            <button type="button" className="swap" onClick={swap} title="前回と今回を入れ替える" aria-label="前回と今回を入れ替える">
              ⇄
            </button>
            <DocumentSheet
              side="current"
              label="今回"
              hint="新しく出た資料"
              doc={docs.current}
              onText={(text) => patchDoc("current", (d) => ({ ...d, text, error: undefined }))}
              onFile={(f) => void loadFile("current", f)}
              onClear={() => patchDoc("current", { text: "" })}
            />
          </div>

          <div className="intake__actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={!ready || analyzing || busy}
              onClick={() => void analyze()}
            >
              {analyzing ? "読み比べています…" : "読み比べる"}
            </button>
            <p className="samples">
              資料が手元になければ、架空の会社のサンプルで試せます：
              {SAMPLES.map((s) => (
                <button key={s.id} type="button" className="link" onClick={() => loadSample(s.id)} title={s.description}>
                  {s.label}
                </button>
              ))}
            </p>
          </div>
        </section>
      ) : (
        <section className="intake intake--folded">
          <p>
            <span className="intake__tag">前回</span>
            {docs.previous.fileName ?? "貼り付けたテキスト"}
            <span className="intake__arrow">→</span>
            <span className="intake__tag">今回</span>
            {docs.current.fileName ?? "貼り付けたテキスト"}
          </p>
          <button type="button" className="btn btn--ghost" onClick={() => setEditing(true)}>
            資料を差し替える
          </button>
        </section>
      )}

      <div ref={resultsRef}>
        {result ? (
          result.changes.length === 0 ? (
            <p className="notice">2つの資料の本文は同じでした。前回と今回で別の資料を選んでいるか確認してください。</p>
          ) : (
            <ResultView result={result} ai={ai} companyName={companyName} />
          )
        ) : null}
      </div>

      <footer className="footer">
        決算資料の文言の変化を機械的に整理するツールです。特定の銘柄の売買を勧めるものではありません。
        資料の本文は解析のためにブラウザ内で処理し、AI要約には変更のあった文だけを送ります。
      </footer>
    </main>
  );
}

function DocumentSheet(props: {
  side: Side;
  label: string;
  hint: string;
  doc: DocState;
  onText: (text: string) => void;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const { doc } = props;
  const [over, setOver] = useState(false);
  const inputId = `file-${props.side}`;
  return (
    <div
      className={`sheet ${over ? "is-over" : ""} ${doc.text ? "is-filled" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) props.onFile(file);
      }}
    >
      <div className="sheet__head">
        <p>
          <span className="sheet__label">{props.label}</span>
          <span className="sheet__hint">{props.hint}</span>
        </p>
        <label htmlFor={inputId} className="btn btn--ghost btn--small">
          PDFを選ぶ
        </label>
        <input
          id={inputId}
          type="file"
          accept="application/pdf,.pdf,.txt,text/plain"
          className="visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) props.onFile(file);
            e.target.value = "";
          }}
        />
      </div>
      <textarea
        className="sheet__text"
        value={doc.text}
        onChange={(e) => props.onText(e.target.value)}
        placeholder={"PDFをここにドロップするか、\n決算短信・説明資料の本文を貼り付けてください"}
        aria-label={`${props.label}の資料の本文`}
      />
      <div className="sheet__foot">
        {doc.loading ? (
          <span>{doc.fileName} を読み込んでいます…</span>
        ) : doc.error ? (
          <span className="sheet__error">{doc.error}</span>
        ) : doc.text ? (
          <>
            <span>
              {doc.fileName ? `${doc.fileName}・` : ""}
              {doc.pages ? `${doc.pages}ページ・` : ""}
              <span className="mono">{doc.text.length.toLocaleString()}</span>字
            </span>
            <button type="button" className="link" onClick={props.onClear}>
              クリア
            </button>
          </>
        ) : (
          <span>未入力</span>
        )}
      </div>
    </div>
  );
}
