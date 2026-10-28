import { toneLabel } from "@/lib/tone";
import type { AnalysisResult, ToneLabel } from "@/lib/types";
import type { Core30Index, CoreDigest } from "@/lib/reportTypes";

/**
 * 異変タイプの判定。
 *
 * バッジと要約文は、解析エンジンが検出した事実（変更件数・トーンスコア・
 * 開示シグナル）だけから機械的に組み立てる。AIの推測は使わない。
 */

export type AnomalyKind = "risk" | "toneDown" | "premise" | "steady";

export const ANOMALY_LABEL: Record<AnomalyKind, string> = {
  risk: "リスク記述追加",
  toneDown: "表現トーンダウン",
  premise: "前提条件変更",
  steady: "据え置き（変化少）",
};

/** リスク・不確実性を示す語。追加された文にこれが含まれれば「リスク記述」とみなす。 */
const RISK_TERMS =
  /リスク|不透明|不確実|懸念|おそれ|恐れ|可能性があ|注視|予断を許さない|減損|下振れ|悪化|訴訟|リコール|関税|地政学|下押し|厳しい|厳しさ/;

/** 業績予想の前提（為替・市況・計画値）を語る文。 */
const PREMISE_TERMS = /前提|想定|為替レート|ドル[=＝]|ユーロ[=＝]|見通し|業績予想|通期計画|ガイダンス/;

/** 判定のしきい値。運用しながら調整する。 */
export const THRESHOLDS = {
  /** トーンスコア（-100〜+100）がこれ以上下がったらトーンダウン。 */
  toneDrop: 10,
  /** 消えた／弱まったポジティブ表現がこの件数以上でトーンダウン。 */
  positiveRemoved: 3,
  /** リスク関連の追加文がこの件数以上で「リスク記述追加」。 */
  riskAdded: 2,
  /** 前提に関わる文の書き換えがこの件数以上で「前提条件変更」（開示シグナルの変化は1件でも該当）。 */
  premiseChanges: 2,
} as const;

/** ビルド時に1件のレポートから要約指標を作る（scripts/build-reports.ts から使う）。 */
export function computeDigest(result: AnalysisResult): CoreDigest {
  let riskAdded = 0;
  let positiveRemoved = 0;
  let premiseChanges = 0;
  for (const c of result.changes) {
    const after = c.after ?? "";
    const before = c.before ?? "";
    if (c.kind === "added" && (RISK_TERMS.test(after) || c.toneDelta < 0)) riskAdded++;
    if (c.kind === "rephrased" && RISK_TERMS.test(after) && !RISK_TERMS.test(before)) riskAdded++;
    if ((c.kind === "removed" || c.kind === "rephrased") && c.toneDelta < 0) positiveRemoved++;
    if ((c.kind === "numeric" || c.kind === "rephrased") && (PREMISE_TERMS.test(after) || PREMISE_TERMS.test(before)))
      premiseChanges++;
  }
  return {
    changes: result.changes.length - result.counts.numeric,
    changeRatio: Math.round(result.changeRatio * 1000) / 1000,
    riskAdded,
    positiveRemoved,
    premiseChanges,
  };
}

export type CoreCompany = Core30Index["companies"][number];

export interface CompanyInsight {
  code: string;
  name: string;
  period: string | null;
  anomalies: AnomalyKind[];
  /** 15〜20字程度の事実ベースの要約。 */
  summary: string;
  /** 注目度の並び替えキー（大きいほど変化が大きい）。 */
  score: number;
  changeRatio: number | null;
  tone: { before: ToneLabel; after: ToneLabel; delta: number } | null;
  hasData: boolean;
}

const TONE_RANK: Record<ToneLabel, number> = { 慎重: 0, やや慎重: 1, 中立: 2, やや強気: 3, 強気: 4 };

export function analyzeCompany(c: CoreCompany): CompanyInsight {
  const base = { code: c.code, name: c.name, period: c.latest?.official ?? null };
  if (!c.latest || c.toneBefore === null || c.toneAfter === null) {
    return { ...base, anomalies: [], summary: "レポート準備中", score: -1, changeRatio: null, tone: null, hasData: false };
  }

  const d = c.digest;
  const delta = Math.round(c.toneAfter - c.toneBefore);
  const tone = { before: toneLabel(c.toneBefore), after: toneLabel(c.toneAfter), delta };
  const labelDown = TONE_RANK[tone.after] < TONE_RANK[tone.before];
  const negativeSignal = c.signals.find((s) => s.direction === -1);
  const anySignal = negativeSignal ?? c.signals[0];

  const anomalies: AnomalyKind[] = [];
  if (d && d.riskAdded >= THRESHOLDS.riskAdded) anomalies.push("risk");
  if (delta <= -THRESHOLDS.toneDrop || labelDown || (d && d.positiveRemoved >= THRESHOLDS.positiveRemoved))
    anomalies.push("toneDown");
  if (c.signals.length > 0 || (d && d.premiseChanges >= THRESHOLDS.premiseChanges)) anomalies.push("premise");
  if (anomalies.length === 0) anomalies.push("steady");

  // 主たる事実を1つ選び、15字に満たなければ短い補足を足す（20字以内）。
  let summary: string;
  if (negativeSignal) summary = `${negativeSignal.label}が「${negativeSignal.after}」に変化`;
  else if (anomalies.includes("risk") && d) summary = `リスク関連の記述が${d.riskAdded}文増加`;
  else if (anomalies.includes("toneDown"))
    summary = labelDown ? `トーンが${tone.before}→${tone.after}に後退` : `表現のトーンが${Math.abs(delta)}pt低下`;
  else if (anySignal) summary = `${anySignal.label}が「${anySignal.after}」に変化`;
  else if (anomalies.includes("premise") && d) summary = `業績前提の記述が${d.premiseChanges}か所変化`;
  else summary = d ? `文言の書き換えは全体の${Math.round(d.changeRatio * 100)}%` : "目立った文言の変化なし";

  const extras = [
    d && anomalies.includes("risk") && !summary.includes("リスク") ? `リスク記述+${d.riskAdded}` : null,
    anomalies.includes("toneDown") && !summary.includes("トーン") ? `トーン${delta}pt` : null,
    d ? `書換率${Math.round(d.changeRatio * 100)}%` : null,
  ].filter((x): x is string => x !== null);
  for (const extra of extras) {
    if (Array.from(summary).length >= 15) break;
    const next = `${summary}、${extra}`;
    if (Array.from(next).length <= 20) summary = next;
  }

  const score = d
    ? d.changeRatio
    : Math.abs(delta) / 100 + c.signals.length * 0.1 + (anomalies.includes("steady") ? 0 : 0.05);

  return { ...base, anomalies, summary: clamp(summary, 20), score, changeRatio: d?.changeRatio ?? null, tone, hasData: true };
}

/** 変化の大きい順に上位n社。異変のない銘柄は後回し。 */
export function pickHighlights(list: CompanyInsight[], n = 3): CompanyInsight[] {
  const flagged = (i: CompanyInsight) => (i.anomalies.some((a) => a !== "steady") ? 1 : 0);
  return list
    .filter((i) => i.hasData)
    .sort((a, b) => flagged(b) - flagged(a) || b.score - a.score)
    .slice(0, n);
}

function clamp(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}
