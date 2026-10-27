import type { ToneLabel, ToneSummary } from "@/lib/types";

/**
 * Sentence-level tone scoring for Japanese disclosure language.
 *
 * Plain keyword counting gets many disclosure sentences wrong: "回復には至って
 * おりません" is negative, "コストの減少" is positive and a longer document
 * always scores more extreme. This scorer handles negation, decides the
 * polarity of movement words (増加/減少 …) from the noun they describe, and
 * normalizes the document score by the amount of signal found.
 */

type Term = [term: string, weight: number];

const POSITIVE: Term[] = [
  ["過去最高", 4], ["最高益", 4], ["上方修正", 4], ["増配", 3], ["復配", 3],
  ["増収増益", 3], ["増益", 3], ["増収", 2], ["好調", 3], ["想定を上回", 3],
  ["計画を上回", 3], ["上振れ", 3], ["黒字転換", 3], ["黒字化", 3],
  ["回復", 2], ["改善", 2], ["堅調", 2], ["追い風", 2], ["伸長", 2], ["好転", 2],
  ["浸透", 1], ["順調", 1], ["底堅", 1], ["持ち直", 1], ["寄与", 1], ["着実", 1],
  ["成長", 1], ["自己株式の取得", 1], ["価格転嫁が進", 2],
];

const NEGATIVE: Term[] = [
  ["下方修正", 4], ["赤字", 3], ["減配", 3], ["無配", 3], ["減損", 3], ["減収減益", 3],
  ["減益", 3], ["減収", 2], ["悪化", 3], ["想定を下回", 3], ["計画を下回", 3],
  ["下振れ", 3], ["低迷", 2], ["苦戦", 2], ["落ち込", 2], ["厳しい", 2], ["厳しさ", 2],
  ["軟調", 2], ["弱含", 2], ["鈍化", 2], ["停滞", 2], ["遅延", 2], ["向かい風", 2],
  ["下押し", 2], ["圧迫", 2], ["特別損失", 2], ["未達", 2], ["懸念", 1], ["減速", 2],
  ["一服", 1], ["調整局面", 1], ["高騰", 1], ["高止まり", 1],
];

const UNCERTAINTY = [
  "不透明", "不確実", "予断を許さない", "注視", "見極め", "慎重", "先行きが見通せ",
  "見通しづらい", "可能性があ", "おそれ", "懸念",
];

/** Words whose polarity depends on what is moving. */
const MOVEMENT: Array<[term: string, direction: 1 | -1]> = [
  ["増加", 1], ["拡大", 1], ["上昇", 1], ["伸び", 1], ["増え", 1],
  ["減少", -1], ["縮小", -1], ["低下", -1], ["下落", -1], ["減っ", -1], ["落ち", -1],
];
const GOOD_WHEN_UP =
  /(売上|収益|利益|需要|受注|販売|出荷|シェア|客数|会員|契約|稼働率|利益率|単価|ARPU|入居率|来客|生産性)/;
const BAD_WHEN_UP =
  /(費用|コスト|原価|原材料|損失|在庫|負担|金利|人件費|物流費|エネルギー|販管費|経費|解約|貸倒|不良)/;

const NEGATION = /^.{0,8}?(ない|なく|ず[、。に]|ず$|ません|せず|には至ら|とはなら|していない)/;

// Longer terms first so that "増収増益" wins over "増益".
const LEXICON: Term[] = [...POSITIVE, ...NEGATIVE.map(([t, w]) => [t, -w] as Term)].sort(
  (a, b) => b[0].length - a[0].length,
);

export interface SentenceTone {
  score: number;
  positive: number;
  negative: number;
  uncertainty: number;
  terms: Array<{ term: string; polarity: 1 | -1 }>;
}

export function scoreSentence(sentence: string): SentenceTone {
  const result: SentenceTone = { score: 0, positive: 0, negative: 0, uncertainty: 0, terms: [] };
  const consumed: Array<[number, number]> = [];
  const overlaps = (start: number, end: number) =>
    consumed.some(([s, e]) => start < e && end > s);

  const apply = (term: string, weight: number, at: number) => {
    const end = at + term.length;
    if (overlaps(at, end)) return;
    consumed.push([at, end]);
    const negated = NEGATION.test(sentence.slice(end));
    const value = negated ? -weight * 0.7 : weight;
    if (value > 0) result.positive += value;
    else result.negative += -value;
    result.score += value;
    result.terms.push({ term, polarity: value > 0 ? 1 : -1 });
  };

  for (const [term, weight] of LEXICON) {
    for (const at of findAll(sentence, term)) apply(term, weight, at);
  }

  for (const [term, direction] of MOVEMENT) {
    for (const at of findAll(sentence, term)) {
      const context = sentence.slice(Math.max(0, at - 14), at);
      const good = lastIndex(context, GOOD_WHEN_UP);
      const bad = lastIndex(context, BAD_WHEN_UP);
      if (good < 0 && bad < 0) continue;
      const subject = good > bad ? 1 : -1;
      apply(term, direction * subject * 1.5, at);
    }
  }

  for (const word of UNCERTAINTY) {
    result.uncertainty += findAll(sentence, word).length;
  }
  return result;
}

export function summarizeTone(sentences: string[]): ToneSummary {
  let positive = 0;
  let negative = 0;
  let uncertainty = 0;
  const termCounts = new Map<string, { count: number; polarity: 1 | -1 }>();
  for (const sentence of sentences) {
    const tone = scoreSentence(sentence);
    positive += tone.positive;
    negative += tone.negative;
    uncertainty += tone.uncertainty;
    for (const { term, polarity } of tone.terms) {
      const key = `${term}:${polarity}`;
      const entry = termCounts.get(key) ?? { count: 0, polarity };
      entry.count += 1;
      termCounts.set(key, entry);
    }
  }
  // Damped net ratio: a few hits cannot produce an extreme score.
  const score = Math.round(((positive - negative) / (positive + negative + 6)) * 100);
  const topTerms = [...termCounts.entries()]
    .map(([key, v]) => ({ term: key.split(":")[0], count: v.count, polarity: v.polarity }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  return {
    score,
    label: toneLabel(score),
    positiveHits: Math.round(positive),
    negativeHits: Math.round(negative),
    uncertaintyHits: uncertainty,
    topTerms,
  };
}

export function toneLabel(score: number): ToneLabel {
  if (score >= 45) return "強気";
  if (score >= 15) return "やや強気";
  if (score <= -45) return "慎重";
  if (score <= -15) return "やや慎重";
  return "中立";
}

function findAll(text: string, term: string): number[] {
  const out: number[] = [];
  let at = text.indexOf(term);
  while (at >= 0) {
    out.push(at);
    at = text.indexOf(term, at + term.length);
  }
  return out;
}

function lastIndex(text: string, pattern: RegExp): number {
  const global = new RegExp(pattern.source, "g");
  let last = -1;
  for (const match of text.matchAll(global)) last = match.index ?? last;
  return last;
}
