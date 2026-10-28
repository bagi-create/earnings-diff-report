import type { AnalysisResult } from "@/lib/types";

/** Shapes of the pre-generated Core30 data stored in KV (REPORTS). */

export type ComparisonKind = "qoq" | "yoy";
export type ReportDocType = "tanshin" | "presentation";

export interface PeriodDoc {
  fy: number;
  q: 1 | 2 | 3 | 4;
  /** Common label across companies, e.g. "FY2027 1Q". */
  label: string;
  /** e.g. "2027年3月期 第1四半期". */
  official: string;
  title: string | null;
  date: string | null;
  url: string;
}

export interface StoredReport {
  analysisVersion: number;
  company: { code: string; name: string };
  type: ReportDocType;
  kind: ComparisonKind;
  base: PeriodDoc;
  target: PeriodDoc;
  result: AnalysisResult;
  ai?: {
    model: string;
    promptVersion: number;
    usage: { inputTokens: number; outputTokens: number; estimatedUsd: number };
  };
}

export interface ComparisonSummary {
  type: ReportDocType;
  kind: ComparisonKind;
  changes: number;
  toneBefore: number;
  toneAfter: number;
  signals: Array<{ label: string; after: string; direction: 1 | 0 | -1 }>;
  headline: string | null;
}

export interface CompanyIndex {
  code: string;
  name: string;
  fiscalYearEnd: number;
  irUrl: string;
  /** Newest first. */
  periods: Array<
    PeriodDoc & {
      docs: Partial<Record<ReportDocType, PeriodDoc>>;
      comparisons: ComparisonSummary[];
    }
  >;
}

/** Figures for the home page badges, computed at build time from the latest comparison. */
export interface CoreDigest {
  /** Changed sentences excluding number-only updates. */
  changes: number;
  /** Share of current sentences that are new or reworded (0-1). */
  changeRatio: number;
  /** Added sentences that mention risk or uncertainty. */
  riskAdded: number;
  /** Removed or weakened positive expressions. */
  positiveRemoved: number;
  /** Rewritten sentences about forecast premises (FX, assumptions, plans). */
  premiseChanges: number;
  /**
   * Changes left out of the counts above because they happen every year with the
   * document type (checked against the same quarter of the previous year).
   * Missing when no previous-year document was available.
   */
  routine?: number;
  /** Removed sentences that had appeared in most of the recent documents. */
  longStandingRemoved?: number;
}

export interface Core30Index {
  generatedAt: string;
  companies: Array<{
    code: string;
    name: string;
    latest: { label: string; official: string } | null;
    toneBefore: number | null;
    toneAfter: number | null;
    signals: ComparisonSummary["signals"];
    /**
     * Comparison the tone and signals come from. "yoy" (same quarter last year) compares
     * documents of the same type; missing means the older "qoq" basis.
     */
    toneBasis?: ComparisonKind;
    periods: number;
    hasPresentation: boolean;
    /** Missing in indexes built before the DeltaLens redesign. */
    digest?: CoreDigest;
  }>;
}

/** One KV value per company × document type × comparison kind, keyed by "FY2027-1Q". */
export interface ReportSeries {
  code: string;
  type: ReportDocType;
  kind: ComparisonKind;
  reports: Record<string, StoredReport>;
}

export const seriesKey = (code: string, type: ReportDocType, kind: ComparisonKind) =>
  `series:${code}:${type}:${kind}`;
export const companyKey = (code: string) => `company:${code}`;
export const CORE30_KEY = "core30";
export const periodKey = (fy: number, q: number) => `FY${fy}-${q}Q`;
