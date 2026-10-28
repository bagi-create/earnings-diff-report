import type { DeepAnalysis, DeepFinding } from "@/lib/reportTypes";
import type { Change } from "@/lib/types";

const KIND_LABEL: Record<Change["kind"], string> = {
  added: "追加",
  removed: "削除",
  rephrased: "言い換え",
  numeric: "数値",
};

const KIND_CLASS: Record<Change["kind"], string> = {
  added: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  removed: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  rephrased: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  numeric: "border-zinc-600 bg-zinc-800 text-zinc-300",
};

const CONFIDENCE_CLASS: Record<DeepFinding["confidence"], string> = {
  高: "border-emerald-500/40 text-emerald-300",
  中: "border-amber-500/40 text-amber-300",
  低: "border-zinc-600 text-zinc-400",
};

/**
 * 資料の全文を読んだAIの読み解き。最初に見せる部分で、根拠（原文の引用と差分）は閉じておく。
 * 引用はビルド時に原文と照合済みで、見つからなかったものは含まれない。
 */
export default function DeepAnalysisView({ deep, changes }: { deep: DeepAnalysis; changes: Change[] }) {
  const byId = new Map(changes.map((c) => [c.id, c]));
  return (
    <section aria-labelledby="deep-title" className="mb-10 rounded-xl border border-emerald-900/60 bg-zinc-900/60 p-5 sm:p-6">
      <p className="m-0 font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-400">AIの読み解き（試作）</p>
      <h2 id="deep-title" className="m-0 mt-2 text-xl font-semibold leading-snug text-zinc-50 sm:text-2xl">
        {deep.headline}
      </h2>
      <p className="m-0 mt-3 leading-relaxed text-zinc-300">{deep.whatHappened}</p>
      <div className="mt-4 rounded-md border-l-2 border-sky-400/70 bg-zinc-950/60 px-4 py-3 text-sm leading-relaxed text-zinc-400">
        <span className="block text-xs font-semibold text-zinc-200">比べている資料について</span>
        {deep.comparisonNote}
      </div>

      <FindingList title="起きている可能性のある変化" findings={deep.hypotheses} byId={byId} />
      <FindingList title="消えた言葉が示すこと" findings={deep.removedMeaning} byId={byId} />

      {deep.peerContext ? (
        <Block title="同業他社と比べて">
          <p className="m-0 leading-relaxed text-zinc-300">{deep.peerContext}</p>
        </Block>
      ) : null}
      {deep.watchNext.length ? (
        <Block title="次の決算で確かめたい点">
          <ul className="m-0 list-disc space-y-1 pl-5 text-zinc-300">
            {deep.watchNext.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Block>
      ) : null}
      {deep.formatDriven.length ? (
        <details className="mt-6 text-sm">
          <summary className="cursor-pointer select-none text-zinc-400 hover:text-zinc-200">
            異変ではない差分（資料の種類の違いなど）{deep.formatDriven.length}件
          </summary>
          <ul className="m-0 mt-2 list-disc space-y-1 pl-5 text-zinc-400">
            {deep.formatDriven.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="m-0 mt-6 text-xs leading-relaxed text-zinc-500">
        {deep.model}が前回と今回の資料の全文を読んで書いたものです。推測を含みます。引用は原文と照合済みですが、本文中の数字は原文の資料で確かめてください。
      </p>
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="m-0 mb-2 text-xs font-semibold tracking-wider text-emerald-400">{title}</h3>
      {children}
    </div>
  );
}

function FindingList({
  title,
  findings,
  byId,
}: {
  title: string;
  findings: DeepFinding[];
  byId: Map<string, Change>;
}) {
  if (!findings.length) return null;
  return (
    <Block title={title}>
      <ul className="m-0 grid list-none gap-3 p-0">
        {findings.map((f) => {
          const linked = f.changeIds.map((id) => byId.get(id)).filter((c): c is Change => Boolean(c)).slice(0, 4);
          const evidence = f.quotes.length + linked.length;
          return (
            <li key={f.title} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <h4 className="m-0 text-base font-semibold text-zinc-100">{f.title}</h4>
                <span
                  className={`shrink-0 rounded-full border px-2 py-px text-[11px] whitespace-nowrap ${CONFIDENCE_CLASS[f.confidence] ?? CONFIDENCE_CLASS.低}`}
                >
                  確からしさ {f.confidence}
                </span>
              </div>
              <p className="m-0 mt-2 text-sm leading-relaxed text-zinc-300">{f.detail}</p>
              {evidence ? (
                <details className="mt-2">
                  <summary className="cursor-pointer select-none text-xs text-emerald-400 hover:text-emerald-300">
                    根拠を見る（原文{f.quotes.length}件・差分{linked.length}件）
                  </summary>
                  {f.quotes.map((q) => (
                    <blockquote
                      key={q.text}
                      className="m-0 mt-2 border-l-2 border-zinc-700 bg-zinc-900 px-3 py-2 text-[13px] leading-relaxed text-zinc-300"
                    >
                      <span className="mr-2 text-[11px] text-zinc-500">{q.doc}の資料</span>
                      {q.text}
                    </blockquote>
                  ))}
                  {linked.map((c) => (
                    <div key={c.id} className="mt-2 rounded-md border border-zinc-800 px-3 py-2 text-[13px] leading-relaxed">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded border px-1.5 text-[11px] ${KIND_CLASS[c.kind]}`}>{KIND_LABEL[c.kind]}</span>
                        <span className="font-mono text-[11px] text-zinc-500">{c.id}</span>
                        <span className="text-[11px] text-zinc-500">{c.section}</span>
                      </div>
                      {c.before ? (
                        <p className="m-0 mt-1 text-zinc-400 [overflow-wrap:anywhere]">
                          <span className="mr-2 text-[11px] text-zinc-600">前回</span>
                          {c.before.slice(0, 400)}
                        </p>
                      ) : null}
                      {c.after ? (
                        <p className="m-0 mt-1 text-zinc-200 [overflow-wrap:anywhere]">
                          <span className="mr-2 text-[11px] text-zinc-600">今回</span>
                          {c.after.slice(0, 400)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Block>
  );
}
