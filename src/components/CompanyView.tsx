"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DeepAnalysisView from "@/components/DeepAnalysisView";
import ResultView, { type AiState } from "@/components/ResultView";
import { isMeaningfulSignal, signed } from "@/components/parts";
import {
  periodKey,
  type CompanyIndex,
  type ComparisonKind,
  type PeriodDoc,
  type ReportDocType,
  type ReportSeries,
} from "@/lib/reportTypes";

const TYPE_LABEL: Record<ReportDocType, string> = { tanshin: "決算短信", presentation: "決算説明資料" };
const KIND_LABEL: Record<ComparisonKind, string> = { qoq: "前四半期比", yoy: "前年同期比" };

export default function CompanyView({
  index,
  sector,
  market,
}: {
  index: CompanyIndex;
  sector: string;
  market: string;
}) {
  const [type, setType] = useState<ReportDocType>("tanshin");
  const [kind, setKind] = useState<ComparisonKind>("qoq");
  const periods = useMemo(() => [...index.periods].reverse(), [index]); // oldest → newest, left → right
  const [selected, setSelected] = useState(periodKey(index.periods[0].fy, index.periods[0].q));
  const [series, setSeries] = useState<ReportSeries | null>(null);
  const [error, setError] = useState(false);
  const cache = useRef(new Map<string, ReportSeries>());

  const hasPresentation = index.periods.some((p) => p.comparisons.some((c) => c.type === "presentation"));
  const comparisonOf = (p: CompanyIndex["periods"][number]) =>
    p.comparisons.find((c) => c.type === type && c.kind === kind);

  useEffect(() => {
    const key = `${type}:${kind}`;
    const cached = cache.current.get(key);
    if (cached) {
      setSeries(cached);
      return;
    }
    setSeries(null);
    setError(false);
    let cancelled = false;
    fetch(`/api/reports/series/${index.code}/${type}/${kind}`)
      .then((r) => (r.ok ? (r.json() as Promise<ReportSeries>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        cache.current.set(key, data);
        if (!cancelled) setSeries(data);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [index.code, type, kind]);

  // Keep the selected period valid when switching to a comparison it does not have.
  useEffect(() => {
    const current = periods.find((p) => periodKey(p.fy, p.q) === selected);
    if (current && comparisonOf(current)) return;
    const latest = [...periods].reverse().find((p) => comparisonOf(p));
    if (latest) setSelected(periodKey(latest.fy, latest.q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, kind]);

  const report = series?.reports[selected];
  const ai: AiState | null = report
    ? report.result.aiSummary
      ? { status: "done", aiStatus: "cached", model: report.ai?.model ?? null, aiSummary: report.result.aiSummary }
      : { status: "done", aiStatus: "skipped", model: null, warning: "この比較のAI要約はまだ作成していません。自動解析の結果のみ表示しています。" }
    : null;

  const tones = periods.map((p) => comparisonOf(p)?.toneAfter ?? null);
  // Scale to the data (at least ±30) so quarter-to-quarter moves are visible; 0 stays in the middle.
  const span = Math.max(30, ...tones.map((t) => Math.abs(t ?? 0)));
  const y = (t: number) => 50 - (t / span) * 42;
  const points = tones
    .map((t, i) => (t === null ? null : `${(i + 0.5) * (100 / periods.length)},${y(t)}`))
    .filter(Boolean)
    .join(" ");

  return (
    <div className="companyView">
      <header className="company__head">
        <p className="mono eyebrow">
          {index.code}・{market}・{sector}
        </p>
        <h1 className="company__name">{index.name}</h1>
        <p className="company__links">
          <a href={index.irUrl} target="_blank" rel="noreferrer" className="link">
            IRライブラリ（会社のサイト）
          </a>
        </p>
      </header>

      <div className="switches">
        <Segmented
          label="資料"
          value={type}
          options={(["tanshin", "presentation"] as ReportDocType[]).map((t) => ({
            value: t,
            label: TYPE_LABEL[t],
            disabled: t === "presentation" && !hasPresentation,
          }))}
          onChange={setType}
        />
        <Segmented
          label="比較"
          value={kind}
          options={(["qoq", "yoy"] as ComparisonKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          onChange={setKind}
        />
      </div>

      <section className="timeline" aria-label="期ごとのトーンと開示シグナル">
        <div className="timeline__plot" aria-hidden>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="0" x2="100" y1="50" y2="50" className="timeline__zero" />
            <polyline points={points} />
          </svg>
          {tones.map((t, i) =>
            t === null ? null : (
              <i
                key={i}
                className={`timeline__dot ${t >= 0 ? "is-up" : "is-down"} ${periodKey(periods[i].fy, periods[i].q) === selected ? "is-selected" : ""}`}
                style={{ left: `${(i + 0.5) * (100 / periods.length)}%`, top: `${y(t)}%` }}
              />
            ),
          )}
          <span className="timeline__axis is-top">強気</span>
          <span className="timeline__axis is-bottom">慎重</span>
        </div>
        <ol className="timeline__cells" style={{ gridTemplateColumns: `repeat(${periods.length}, minmax(0, 1fr))` }}>
          {periods.map((p, i) => {
            const c = comparisonOf(p);
            const key = periodKey(p.fy, p.q);
            const tone = tones[i];
            return (
              <li key={key}>
                <button
                  type="button"
                  className={`cell ${key === selected ? "is-selected" : ""}`}
                  disabled={!c}
                  onClick={() => setSelected(key)}
                  title={p.official}
                >
                  <span className="cell__fy mono">FY{p.fy}</span>
                  <span className="cell__q">{p.q}Q</span>
                  <span className="cell__tone mono">{tone !== null ? signed(tone) : "—"}</span>
                  <span className="cell__signals">
                    {c?.signals.filter(isMeaningfulSignal).map((s) => (
                      <span key={s.label} className={`dir-${s.direction}`} title={`${s.label}：${s.after}`}>
                        {s.direction > 0 ? "▲" : s.direction < 0 ? "▼" : "●"}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="timeline__legend">
          点は各期の資料のトーン（−100 慎重〜＋100 強気）。▲▼● は業績予想・配当・自己株式取得の変化（上向き／下向き／その他）。
        </p>
      </section>

      {error ? (
        <p className="notice">レポートを読み込めませんでした。ページを再読み込みしてください。</p>
      ) : !series ? (
        <p className="notice">読み込んでいます…</p>
      ) : !report ? (
        <p className="notice">この期の{TYPE_LABEL[type]}の{KIND_LABEL[kind]}はありません（比べる相手の資料がありません）。</p>
      ) : (
        <>
          <Sources base={report.base} target={report.target} />
          {report.deep ? (
            <>
              <DeepAnalysisView deep={report.deep} changes={report.result.changes} />
              {/* The AI reading comes first; the rule-based diff is its evidence, opened on demand. */}
              <details className="group mb-8">
                <summary className="cursor-pointer select-none rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-300 hover:border-zinc-600">
                  自動解析の詳細を見る（文ごとの差分・トーン・数値）
                </summary>
                <div className="mt-6">
                  <ResultView key={`${type}-${kind}-${selected}`} result={report.result} ai={ai} companyName={index.name} />
                </div>
              </details>
            </>
          ) : (
            <>
              {kind === "qoq" && report.target.q === 1 ? (
                <p className="notice">
                  第1四半期の前四半期比は、前年度の通期の資料と比べています。資料の構成が違うため、変更が多めに出ます。
                </p>
              ) : null}
              <ResultView key={`${type}-${kind}-${selected}`} result={report.result} ai={ai} companyName={index.name} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function Sources({ base, target }: { base: PeriodDoc; target: PeriodDoc }) {
  const doc = (d: PeriodDoc, role: string) => (
    <div className="sources__doc">
      <span className="sources__role">{role}</span>
      <strong className="mono">{d.label}</strong>
      <span className="sources__official">{d.official}</span>
      <a href={d.url} target="_blank" rel="noreferrer" className="link sources__title">
        {d.title ?? "元の資料（PDF）"}
      </a>
      {d.date ? <span className="mono sources__date">{d.date}</span> : null}
    </div>
  );
  return (
    <div className="sources">
      {doc(base, "前回")}
      <span className="sources__arrow" aria-hidden>
        →
      </span>
      {doc(target, "今回")}
    </div>
  );
}

function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={props.label}>
      <span className="segmented__label">{props.label}</span>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          disabled={o.disabled}
          className={props.value === o.value ? "is-active" : ""}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
