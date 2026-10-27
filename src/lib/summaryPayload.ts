import type { AnalysisResult, ChangeKind } from "@/lib/types";

/**
 * The compact slice of an analysis that is sent to the AI.
 *
 * Only the most important changes go in, trimmed to a character budget, so
 * every request has a known upper bound on input tokens (and on cost).
 * Full documents are never sent: the model can only talk about evidence it
 * was given, which keeps it grounded and cheap.
 */
export interface SummaryPayload {
  companyName?: string;
  summaryLines: string[];
  signals: string[];
  metrics: string[];
  tone: string;
  changes: Array<{
    id: string;
    kind: ChangeKind;
    section: string;
    categories: string[];
    before?: string;
    after?: string;
  }>;
}

export const PAYLOAD_LIMITS = {
  changes: 60,
  charsPerSentence: 400,
  totalChangeChars: 14_000,
};

const clip = (value: string | undefined, max: number) =>
  value && value.length > max ? `${value.slice(0, max)}…` : value;

export function buildSummaryPayload(result: AnalysisResult, companyName?: string): SummaryPayload {
  const ranked = [...result.changes]
    .filter((c) => c.kind !== "numeric" || c.importance >= 3)
    .sort((a, b) => b.importance - a.importance);

  const changes: SummaryPayload["changes"] = [];
  let budget = PAYLOAD_LIMITS.totalChangeChars;
  for (const c of ranked) {
    if (changes.length >= PAYLOAD_LIMITS.changes) break;
    const before = clip(c.before, PAYLOAD_LIMITS.charsPerSentence);
    const after = clip(c.after, PAYLOAD_LIMITS.charsPerSentence);
    const size = (before?.length ?? 0) + (after?.length ?? 0);
    if (size > budget) continue;
    budget -= size;
    changes.push({ id: c.id, kind: c.kind, section: c.section, categories: c.categories, before, after });
  }

  return {
    companyName: companyName?.trim() || undefined,
    summaryLines: result.summaryLines,
    signals: result.signals.map((s) => `${s.label}: ${s.before} → ${s.after}`),
    metrics: result.metrics.map(
      (m) =>
        `${m.name}: ${m.before ?? "記載なし"}${m.beforeYoY ? `(${m.beforeYoY})` : ""} → ${m.after ?? "記載なし"}${m.afterYoY ? `(${m.afterYoY})` : ""}`,
    ),
    tone: `${result.previousTone.label}(${result.previousTone.score}) → ${result.currentTone.label}(${result.currentTone.score})`,
    changes,
  };
}
