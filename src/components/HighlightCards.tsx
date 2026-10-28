import Link from "next/link";
import { AnomalyBadges } from "@/components/AnomalyBadge";
import type { CompanyInsight } from "@/lib/anomaly";

/** 今期、文言の変化が大きかった注目銘柄（サーバーコンポーネント）。 */
export default function HighlightCards({ items }: { items: CompanyInsight[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="highlights-title" className="mt-14">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="m-0 font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-400">Highlights</p>
          <h2 id="highlights-title" className="m-0 mt-1 text-xl font-semibold tracking-tight text-zinc-50">
            今期、文言の変化が大きかった3社
          </h2>
        </div>
        <p className="m-0 text-xs text-zinc-500">最新決算の決算短信を、資料の種類による毎年の違いを除いて比べた結果</p>
      </div>
      <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
        {items.map((item, i) => (
          <li key={item.code}>
            <Link
              href={`/company/${item.code}`}
              className="group flex h-full flex-col rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-5 text-zinc-100 no-underline transition-colors hover:border-zinc-600 focus-visible:border-emerald-400"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="m-0 font-mono text-[11px] text-zinc-500">
                    {item.code}
                    {item.period ? <span className="ml-2">{item.period}</span> : null}
                  </p>
                  <h3 className="m-0 mt-0.5 truncate text-base font-semibold">{item.name}</h3>
                </div>
                <span className="font-mono text-2xl font-semibold leading-none text-zinc-700" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="flex-1">
                <p className="m-0 mt-4 text-[15px] font-medium leading-snug text-zinc-50">{item.summary}</p>
                <AnomalyBadges kinds={item.anomalies} className="mt-3" />
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-zinc-800 pt-3 text-xs text-zinc-400">
                <span className="font-mono">
                  {item.changeRatio !== null ? (
                    <>書き換え率 {Math.round(item.changeRatio * 100)}%</>
                  ) : item.tone ? (
                    <ToneShift tone={item.tone} />
                  ) : null}
                </span>
                <span className="text-emerald-400 transition-transform group-hover:translate-x-0.5">
                  レポートを見る<span aria-hidden="true"> →</span>
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ToneShift({ tone }: { tone: NonNullable<CompanyInsight["tone"]> }) {
  const color = tone.delta <= -10 ? "text-amber-300" : tone.delta >= 10 ? "text-emerald-300" : "text-zinc-400";
  return (
    <span className="whitespace-nowrap">
      <span className="text-zinc-500">トーン </span>
      <span className={color}>
        {tone.delta > 0 ? "+" : ""}
        {tone.delta}
      </span>
      <span className="sr-only">ポイント</span>
    </span>
  );
}
