import Link from "next/link";
import { AnomalyBadges } from "@/components/AnomalyBadge";
import { ToneShift } from "@/components/HighlightCards";
import type { CompanyInsight } from "@/lib/anomaly";

export interface Core30Row {
  code: string;
  name: string;
  sector?: string;
  insight: CompanyInsight | null;
}

/** TOPIX Core30 の銘柄一覧（異変バッジ付き、サーバーコンポーネント）。 */
export default function Core30List({ rows }: { rows: Core30Row[] }) {
  return (
    <ul className="m-0 grid list-none gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 p-0 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <li key={row.code} className="bg-zinc-950">
          <Link
            href={`/company/${row.code}`}
            className="flex h-full flex-col gap-2 px-4 py-3.5 text-zinc-100 no-underline transition-colors hover:bg-zinc-900 focus-visible:bg-zinc-900"
          >
            <div className="flex items-baseline gap-3">
              <span className="w-10 shrink-0 font-mono text-xs text-zinc-500">{row.code}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{row.name}</span>
              {row.insight?.tone ? (
                <span className="shrink-0 font-mono text-[11px]">
                  <ToneShift tone={row.insight.tone} />
                </span>
              ) : null}
            </div>
            <div className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1.5 pl-[3.25rem]">
              {row.insight?.hasData ? (
                <AnomalyBadges kinds={row.insight.anomalies} />
              ) : (
                <span className="text-[11px] text-zinc-500">{row.sector ?? ""}</span>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
