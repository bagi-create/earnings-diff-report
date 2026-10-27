export type ToneLabel = "強気" | "やや強気" | "中立" | "やや慎重" | "慎重";

export type ChangeKind = "added" | "removed" | "rephrased" | "numeric";

/** One token of a word-level diff between two sentences. */
export interface InlineSegment {
  op: "eq" | "add" | "del";
  text: string;
}

export interface Change {
  /** Stable id such as "C12". Used as evidence references from the AI summary. */
  id: string;
  kind: ChangeKind;
  before?: string;
  after?: string;
  /** Section label of the sentence (e.g. "業績", "見通し"). */
  section: string;
  categories: string[];
  /** Tone score of the sentence after minus before (positive = more bullish). */
  toneDelta: number;
  importance: number;
  similarity?: number;
  inline?: InlineSegment[];
}

export interface ToneSummary {
  /** -100 (very cautious) to +100 (very bullish), normalized by document length. */
  score: number;
  label: ToneLabel;
  positiveHits: number;
  negativeHits: number;
  /** Mentions of uncertainty such as 不透明 / 注視 / 予断を許さない. */
  uncertaintyHits: number;
  topTerms: Array<{ term: string; count: number; polarity: 1 | -1 }>;
}

export type SignalKey = "guidance" | "dividend" | "buyback";

export interface Signal {
  key: SignalKey;
  label: string;
  before: string;
  after: string;
  changed: boolean;
  /** 1 = favourable direction, -1 = unfavourable, 0 = neutral / unknown. */
  direction: 1 | 0 | -1;
}

export interface Metric {
  name: string;
  before?: string;
  after?: string;
  beforeYoY?: string;
  afterYoY?: string;
}

export interface SectionStat {
  section: string;
  added: number;
  removed: number;
  rephrased: number;
  numeric: number;
  unchanged: number;
}

export interface CategoryStat {
  category: string;
  changeIds: string[];
  toneDelta: number;
}

export interface DocumentStats {
  characters: number;
  sentences: number;
  /** Lines that looked like table rows or page furniture and were excluded from the text diff. */
  skippedLines: number;
}

export interface EvidencePoint {
  title: string;
  detail: string;
  evidence: string[];
}

export interface AiSummary {
  headline: string;
  overview: string;
  toneDirection: string;
  toneReason: string;
  toneEvidence: string[];
  keyPoints: EvidencePoint[];
  watchPoints: EvidencePoint[];
  risks: EvidencePoint[];
}

export interface AnalysisResult {
  version: number;
  previous: DocumentStats;
  current: DocumentStats;
  changes: Change[];
  unchangedCount: number;
  counts: Record<ChangeKind, number>;
  /** Share of current sentences that are new or reworded (0-1). */
  changeRatio: number;
  previousTone: ToneSummary;
  currentTone: ToneSummary;
  signals: Signal[];
  metrics: Metric[];
  sections: SectionStat[];
  categories: CategoryStat[];
  /** Ids of the most important changes, highest first. */
  highlights: string[];
  summaryLines: string[];
  aiSummary?: AiSummary;
}

export type AiStatus =
  | "generated"
  | "cached"
  | "not_configured"
  | "fallback"
  | "limit_reached"
  | "skipped";

export interface SummarizeResponse {
  aiStatus: AiStatus;
  model: string | null;
  aiSummary?: AiSummary;
  usage?: { inputTokens: number; outputTokens: number; estimatedUsd: number };
  warning?: string;
}
