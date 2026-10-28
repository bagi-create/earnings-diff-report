import Link from "next/link";
import { AnomalyBadge } from "@/components/AnomalyBadge";
import CompanySearch from "@/components/CompanySearch";
import Core30List, { type Core30Row } from "@/components/Core30List";
import HighlightCards from "@/components/HighlightCards";
import { CORE30 } from "@/data/core30";
import { analyzeCompany, pickHighlights, THRESHOLDS, type AnomalyKind } from "@/lib/anomaly";
import { findCompany } from "@/lib/companies";
import { readCore30Index } from "@/lib/core30Index";

// KV（REPORTS）をリクエスト時に1回だけ読む。ビルド時には KV がないため静的化しない。
export const dynamic = "force-dynamic";

export default async function Page() {
  const index = await readCore30Index();
  const byCode = new Map(index?.companies.map((c) => [c.code, analyzeCompany(c)]) ?? []);
  const rows: Core30Row[] = CORE30.map((c) => ({
    code: c.code,
    name: c.name,
    sector: findCompany(c.code)?.sector,
    insight: byCode.get(c.code) ?? null,
  }));
  const highlights = pickHighlights([...byCode.values()]);
  const updated = index ? formatDate(index.generatedAt) : null;

  return (
    <main className="mx-auto max-w-[1180px] px-4 pb-20 sm:px-5">
      <section aria-labelledby="hero-title" className="relative pt-14 sm:pt-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-40 right-0 -top-14 h-80 bg-[radial-gradient(ellipse_at_top_left,rgba(52,211,153,0.12),transparent_60%)]"
        />
        <p className="relative m-0 font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400">
          DeltaLens · Earnings Δ Reader
        </p>
        <h1
          id="hero-title"
          className="relative m-0 mt-4 max-w-3xl text-[clamp(28px,4.6vw,46px)] font-bold leading-[1.25] tracking-tight text-zinc-50"
        >
          会社の変化<span className="text-emerald-400">（Δ）</span>を、
          <br className="hidden sm:block" />
          決算からすばやく読み解く
        </h1>
        <p className="relative m-0 mt-5 max-w-2xl text-[15px] leading-relaxed text-zinc-400">
          決算短信と説明資料を前四半期・前年同期と突き合わせ、書き加えられたリスク、消えた強気の言葉、前提の書き換えを拾い出します。判定はすべて原文の差分にもとづきます。
        </p>
        <div className="relative mt-8 max-w-xl">
          <CompanySearch />
        </div>
        <dl className="relative m-0 mt-8 flex flex-wrap gap-x-8 gap-y-3 text-xs text-zinc-500">
          <Stat label="対象" value="TOPIX Core30" />
          <Stat label="期間" value="直近8四半期" />
          <Stat label="資料" value="決算短信・説明資料" />
          {updated ? <Stat label="更新" value={updated} /> : null}
        </dl>
      </section>

      <HighlightCards items={highlights} />

      <section aria-labelledby="core30-title" className="mt-14">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="m-0 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">Coverage</p>
            <h2 id="core30-title" className="m-0 mt-1 text-xl font-semibold tracking-tight text-zinc-50">
              TOPIX Core30
            </h2>
          </div>
          <p className="m-0 text-xs text-zinc-500">
            2026年10月30日の入替後の構成。バッジは最新決算の決算短信を、前四半期と前年同期の資料に照らして判定
          </p>
        </div>
        <Core30List rows={rows} />
        <Criteria />
      </section>

      <section className="mt-14 flex flex-col items-start justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="m-0 text-base font-semibold text-zinc-50">手元の資料で比べる</h2>
          <p className="m-0 mt-1 text-sm text-zinc-400">Core30以外の銘柄や任意の2期分のPDFも、アップロードしてその場で読み比べられます。</p>
        </div>
        <Link
          href="/compare"
          className="shrink-0 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 no-underline transition-colors hover:bg-emerald-300"
        >
          資料をアップロード
        </Link>
      </section>

      <footer className="mt-16 border-t border-zinc-800 pt-6 text-xs leading-relaxed text-zinc-500">
        DeltaLens は決算資料の文言の変化を機械的に整理するツールです。特定の銘柄の売買を勧めるものではありません。
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-zinc-600">{label}</dt>
      <dd className="m-0 font-medium text-zinc-300">{value}</dd>
    </div>
  );
}

const CRITERIA: Array<[AnomalyKind, string]> = [
  ["risk", `リスク・不確実性に触れる文が${THRESHOLDS.riskAdded}文以上、新たに書き加えられた`],
  ["toneDown", `トーンスコアが${THRESHOLDS.toneDrop}pt以上低下、または強気の表現が${THRESHOLDS.positiveRemoved}か所以上消えた・弱まった`],
  ["premise", `業績予想・配当・自己株式取得の記載が変わった、または為替などの前提を語る文が${THRESHOLDS.premiseChanges}か所以上書き換わった`],
  ["steady", "上のいずれにも当たらない"],
];

function Criteria() {
  return (
    <details className="group mt-3 text-xs text-zinc-500">
      <summary className="cursor-pointer select-none py-1 hover:text-zinc-300">バッジの判定基準</summary>
      <dl className="m-0 mt-2 grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-[auto_1fr] sm:gap-x-4">
        {CRITERIA.map(([kind, text]) => (
          <div key={kind} className="contents">
            <dt>
              <AnomalyBadge kind={kind} />
            </dt>
            <dd className="m-0 mb-2 leading-relaxed text-zinc-400 sm:mb-0">{text}</dd>
          </div>
        ))}
      </dl>
      <ul className="m-0 mt-3 list-disc space-y-1 pl-5 leading-relaxed text-zinc-400">
        <li>
          通期と四半期のように資料の種類が違うと、毎年同じ文が消えたり戻ったりします。前年同期の資料にも同じ違いがある変化は、異変として数えません。
        </li>
        <li>トーンと、業績予想・配当・自己株式取得の記載は、同じ種類の資料どうし（前年同期）で比べます。</li>
        <li>
          直近8期のうち6期以上に載っていた文が今回消えた場合は「長く続いた記述が消えた」として、注目度を高めます。過去の株式分割の注記など、時間がたてば外れる補足は除きます。
        </li>
        <li>表の項目名がつながった断片は、文として読めないため判定に使いません。</li>
      </ul>
    </details>
  );
}

function formatDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" }).format(d);
}
