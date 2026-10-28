import { ANOMALY_LABEL, type AnomalyKind } from "@/lib/anomaly";

const STYLE: Record<AnomalyKind, { box: string; dot: string }> = {
  risk: { box: "border-rose-500/30 bg-rose-500/10 text-rose-300", dot: "bg-rose-400" },
  toneDown: { box: "border-amber-500/30 bg-amber-500/10 text-amber-300", dot: "bg-amber-400" },
  premise: { box: "border-sky-500/30 bg-sky-500/10 text-sky-300", dot: "bg-sky-400" },
  steady: { box: "border-zinc-700 bg-zinc-800/60 text-zinc-400", dot: "bg-zinc-500" },
};

/** 異変タイプのバッジ。色だけに頼らず、必ず文字ラベルで種類を示す。 */
export function AnomalyBadge({ kind }: { kind: AnomalyKind }) {
  const s = STYLE[kind];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-px text-[11px] font-medium leading-5 ${s.box}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {ANOMALY_LABEL[kind]}
    </span>
  );
}

export function AnomalyBadges({ kinds, className = "" }: { kinds: AnomalyKind[]; className?: string }) {
  if (kinds.length === 0) return null;
  return (
    <ul className={`m-0 flex list-none flex-wrap gap-1.5 p-0 ${className}`} aria-label="検出された変化">
      {kinds.map((k) => (
        <li key={k}>
          <AnomalyBadge kind={k} />
        </li>
      ))}
    </ul>
  );
}
