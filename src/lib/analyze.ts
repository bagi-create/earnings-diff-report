import { inlineDiff } from "@/lib/inlineDiff";
import {
  maskNumbers,
  normalizeSentence,
  SECTION_ORDER,
  segmentDocument,
  type DocumentMode,
  type Sentence,
} from "@/lib/segment";
import { categorize, detectSignals, extractMetrics, MATERIAL_TERMS } from "@/lib/signals";
import { scoreSentence, summarizeTone } from "@/lib/tone";
import type {
  AnalysisResult,
  CategoryStat,
  Change,
  ChangeKind,
  SectionStat,
} from "@/lib/types";

/** Bump when the analysis output changes so cached reports are recomputed. */
export const ANALYSIS_VERSION = 4;

const SECTION_WEIGHT: Record<string, number> = {
  見通し: 1.5,
  株主還元: 1.5,
  "リスク・課題": 1,
  業績: 0.8,
  セグメント: 0.5,
  経営方針: 0.5,
  注記: -1.5,
};

interface Pair {
  kind: ChangeKind;
  before?: Sentence;
  after?: Sentence;
  similarity?: number;
}

function bigrams(value: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < value.length - 1; i += 1) set.add(value.slice(i, i + 2));
  return set;
}

function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

/**
 * Pair up sentences of the two documents:
 * 1. identical text → unchanged
 * 2. identical once numbers are masked → "numeric" (only the figures moved)
 * 3. similar wording → "rephrased", assigned greedily from the best match down
 * 4. leftovers → added / removed
 */
function alignSentences(previous: Sentence[], current: Sentence[]) {
  const pairs: Pair[] = [];
  const unchanged: Array<{ before: Sentence; after: Sentence }> = [];
  const usedPrev = new Set<number>();
  const usedCurr = new Set<number>();

  const matchBy = (key: (s: Sentence) => string, onMatch: (b: Sentence, a: Sentence) => void) => {
    const byKey = new Map<string, number[]>();
    for (const s of current) {
      if (usedCurr.has(s.index)) continue;
      const k = key(s);
      const list = byKey.get(k);
      if (list) list.push(s.index);
      else byKey.set(k, [s.index]);
    }
    for (const s of previous) {
      if (usedPrev.has(s.index)) continue;
      const candidates = byKey.get(key(s));
      const hit = candidates?.find((i) => !usedCurr.has(i));
      if (hit === undefined) continue;
      usedPrev.add(s.index);
      usedCurr.add(hit);
      onMatch(s, current[hit]);
    }
  };

  matchBy(
    (s) => normalizeSentence(s.text),
    (before, after) => unchanged.push({ before, after }),
  );
  matchBy(
    (s) => maskNumbers(normalizeSentence(s.text)),
    (before, after) => pairs.push({ kind: "numeric", before, after, similarity: 1 }),
  );

  // Fuzzy matching through an inverted bigram index, so large reports stay fast.
  const prevLeft = previous.filter((s) => !usedPrev.has(s.index));
  const currLeft = current.filter((s) => !usedCurr.has(s.index));
  // Numbers are masked so that "売上高は1,240億円" and "売上高は1,318億円" still look alike.
  const key = (s: Sentence) => maskNumbers(normalizeSentence(s.text));
  const currGrams = new Map(currLeft.map((s) => [s.index, bigrams(key(s))]));
  const index = new Map<string, number[]>();
  for (const [i, grams] of currGrams) {
    for (const g of grams) {
      const list = index.get(g);
      if (list) list.push(i);
      else index.set(g, [i]);
    }
  }
  const commonLimit = Math.max(40, currLeft.length * 0.25);

  const candidates: Array<{ p: Sentence; c: Sentence; score: number; sim: number }> = [];
  for (const p of prevLeft) {
    const pKey = key(p);
    const grams = bigrams(pKey);
    const shared = new Map<number, number>();
    for (const g of grams) {
      const postings = index.get(g);
      if (!postings || postings.length > commonLimit) continue;
      for (const i of postings) shared.set(i, (shared.get(i) ?? 0) + 1);
    }
    // Only the strongest few candidates per sentence are scored exactly.
    const shortlist = [...shared].sort((x, y) => y[1] - x[1]).slice(0, 20);
    for (const [i, rough] of shortlist) {
      const cGrams = currGrams.get(i)!;
      if (rough < Math.min(grams.size, cGrams.size) * 0.2) continue;
      let inter = 0;
      for (const g of grams) if (cGrams.has(g)) inter += 1;
      const jaccard = inter / (grams.size + cGrams.size - inter);
      const containment = inter / Math.min(grams.size, cGrams.size);
      const c = current[i];
      // Disclosures reuse fixed openings ("通期の連結業績予想につきましては、…");
      // a shared opening in the same section marks a rewrite of the same statement.
      const sameOpening =
        p.section === c.section && commonPrefixLength(pKey, key(c)) >= 8 && jaccard >= 0.18;
      if (jaccard < 0.36 && !(containment >= 0.7 && jaccard >= 0.22) && !sameOpening) continue;
      const position =
        1 - Math.abs(p.index / previous.length - c.index / current.length);
      const score = jaccard + (p.section === c.section ? 0.05 : 0) + position * 0.05;
      candidates.push({ p, c, score, sim: jaccard });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const { p, c, sim } of candidates) {
    if (usedPrev.has(p.index) || usedCurr.has(c.index)) continue;
    usedPrev.add(p.index);
    usedCurr.add(c.index);
    pairs.push({ kind: "rephrased", before: p, after: c, similarity: sim });
  }

  for (const s of previous) if (!usedPrev.has(s.index)) pairs.push({ kind: "removed", before: s });
  for (const s of current) if (!usedCurr.has(s.index)) pairs.push({ kind: "added", after: s });

  return { pairs, unchanged };
}

function importanceOf(pair: Pair, toneDelta: number, categories: string[], section: string): number {
  const base: Record<ChangeKind, number> = {
    added: 2,
    removed: 2,
    rephrased: 1 + 2 * (1 - (pair.similarity ?? 0)),
    numeric: 0.4,
  };
  const before = pair.before?.text ?? "";
  const after = pair.after?.text ?? "";
  // Footnotes such as "(注)1.直近に公表されている業績予想からの修正の有無:無" are boilerplate.
  const footnote = /^(\(注|※|\*|注\d)/.test(after || before);
  const material =
    !footnote &&
    (MATERIAL_TERMS.test(after) !== MATERIAL_TERMS.test(before) ||
      (pair.kind !== "rephrased" && MATERIAL_TERMS.test(after + before)));
  let score = base[pair.kind];
  score += Math.min(Math.abs(toneDelta), 6) * 0.6;
  score += SECTION_WEIGHT[section] ?? 0;
  score += material ? 3 : 0;
  score += categories.length * 0.3;
  if ((after || before).length < 20) score -= 0.5;
  if (footnote) score -= 2.5;
  if (pair.kind === "numeric" && !material) score = Math.min(score, 2);
  return Math.round(score * 10) / 10;
}

export function analyzeEarningsTexts(
  previousText: string,
  currentText: string,
  options: { mode?: DocumentMode } = {},
): AnalysisResult {
  const prevDoc = segmentDocument(previousText, options.mode);
  const currDoc = segmentDocument(currentText, options.mode);
  const { pairs, unchanged } = alignSentences(prevDoc.sentences, currDoc.sentences);

  const ratio = currDoc.sentences.length / Math.max(1, prevDoc.sentences.length);
  const position = (p: Pair) => (p.after ? p.after.index : (p.before?.index ?? 0) * ratio - 0.5);
  pairs.sort((a, b) => position(a) - position(b));

  const changes: Change[] = pairs.map((pair, i) => {
    const before = pair.before?.text;
    const after = pair.after?.text;
    const section = (pair.after ?? pair.before)!.section;
    const toneDelta =
      Math.round(((after ? scoreSentence(after).score : 0) - (before ? scoreSentence(before).score : 0)) * 10) / 10;
    const categories = [...new Set([...categorize(before ?? ""), ...categorize(after ?? "")])];
    return {
      id: `C${i + 1}`,
      kind: pair.kind,
      before,
      after,
      section,
      categories,
      toneDelta,
      importance: importanceOf(pair, toneDelta, categories, section),
      similarity: pair.similarity !== undefined ? Math.round(pair.similarity * 100) / 100 : undefined,
      inline: before && after ? inlineDiff(before, after) : undefined,
    };
  });

  const counts: Record<ChangeKind, number> = { added: 0, removed: 0, rephrased: 0, numeric: 0 };
  for (const c of changes) counts[c.kind] += 1;

  const sectionMap = new Map<string, SectionStat>();
  const sectionStat = (name: string) => {
    if (!sectionMap.has(name)) {
      sectionMap.set(name, { section: name, added: 0, removed: 0, rephrased: 0, numeric: 0, unchanged: 0 });
    }
    return sectionMap.get(name)!;
  };
  for (const c of changes) sectionStat(c.section)[c.kind] += 1;
  for (const u of unchanged) sectionStat(u.after.section).unchanged += 1;
  const sections = [...sectionMap.values()].sort(
    (a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section),
  );

  const categoryMap = new Map<string, CategoryStat>();
  for (const c of changes) {
    if (c.kind === "numeric") continue;
    for (const category of c.categories) {
      const stat = categoryMap.get(category) ?? { category, changeIds: [], toneDelta: 0 };
      stat.changeIds.push(c.id);
      stat.toneDelta = Math.round((stat.toneDelta + c.toneDelta) * 10) / 10;
      categoryMap.set(category, stat);
    }
  }
  const categories = [...categoryMap.values()].sort((a, b) => b.changeIds.length - a.changeIds.length);

  const highlights = changes
    .filter((c) => c.kind !== "numeric" || c.importance >= 3)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 8)
    .map((c) => c.id);

  const previousTone = summarizeTone(prevDoc.sentences.map((s) => s.text));
  const currentTone = summarizeTone(currDoc.sentences.map((s) => s.text));
  const signals = detectSignals(
    prevDoc.sentences.map((s) => s.text).join("\n"),
    currDoc.sentences.map((s) => s.text).join("\n"),
  );

  const result: AnalysisResult = {
    version: ANALYSIS_VERSION,
    previous: {
      characters: prevDoc.characters,
      sentences: prevDoc.sentences.length,
      skippedLines: prevDoc.skippedLines,
    },
    current: {
      characters: currDoc.characters,
      sentences: currDoc.sentences.length,
      skippedLines: currDoc.skippedLines,
    },
    changes,
    unchangedCount: unchanged.length,
    counts,
    changeRatio:
      Math.round(((counts.added + counts.rephrased) / Math.max(1, currDoc.sentences.length)) * 100) / 100,
    previousTone,
    currentTone,
    signals,
    metrics: extractMetrics(
      prevDoc.sentences.map((s) => s.text).join("\n"),
      currDoc.sentences.map((s) => s.text).join("\n"),
    ),
    sections,
    categories,
    highlights,
    summaryLines: [],
  };
  result.summaryLines = buildSummaryLines(result);
  return result;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function buildSummaryLines(r: AnalysisResult): string[] {
  const lines: string[] = [];
  const toneShift = r.currentTone.score - r.previousTone.score;
  lines.push(
    r.previousTone.label === r.currentTone.label
      ? `全体のトーンは「${r.currentTone.label}」のまま（スコア ${signed(r.previousTone.score)} → ${signed(r.currentTone.score)}）。`
      : `全体のトーンは「${r.previousTone.label}」から「${r.currentTone.label}」へ変化（スコア ${signed(r.previousTone.score)} → ${signed(r.currentTone.score)}、${signed(toneShift)}）。`,
  );
  for (const s of r.signals.filter((x) => x.changed)) {
    lines.push(`${s.label}：「${s.before}」→「${s.after}」。`);
  }
  lines.push(
    `本文${r.current.sentences}文のうち、新しい記述${r.counts.added}件・言い換え${r.counts.rephrased}件・削除${r.counts.removed}件` +
      (r.counts.numeric ? `（数値だけの更新${r.counts.numeric}件は別掲）` : "") +
      `。全体の${Math.round(r.changeRatio * 100)}%が書き換わっています。`,
  );
  const unc = r.currentTone.uncertaintyHits - r.previousTone.uncertaintyHits;
  if (Math.abs(unc) >= 2) {
    lines.push(
      `「不透明」「注視」など不確実性を示す表現が${r.previousTone.uncertaintyHits}件→${r.currentTone.uncertaintyHits}件に${unc > 0 ? "増加" : "減少"}。`,
    );
  }
  const topics = r.categories.slice(0, 3).map((c) => `${c.category}（${c.changeIds.length}件）`);
  if (topics.length) lines.push(`変化が集中している論点：${topics.join("、")}。`);
  return lines;
}
