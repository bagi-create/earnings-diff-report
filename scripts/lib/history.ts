/**
 * Sentence lookup across past documents, used to tell real wording changes
 * from ones that happen every year because the document type differs
 * (a 第1四半期 短信 never carries the 通期 dividend policy, for example).
 */
import { maskNumbers, normalizeSentence, segmentDocument, type DocumentMode } from "../../src/lib/segment";

function bigrams(value: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < value.length - 1; i += 1) set.add(value.slice(i, i + 2));
  return set;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const g of small) if (large.has(g)) hit += 1;
  return (2 * hit) / (a.size + b.size);
}

export interface SentenceIndex {
  /** True when the document has the same sentence, ignoring figures and small rewordings. */
  has(sentence: string): boolean;
}

export function sentenceIndex(text: string, mode: DocumentMode = "tanshin"): SentenceIndex {
  const sentences = segmentDocument(text, mode).sentences.map((s) => {
    const masked = maskNumbers(normalizeSentence(s.text));
    return { masked, grams: bigrams(masked) };
  });
  const exact = new Set(sentences.map((s) => s.masked));
  return {
    has(sentence) {
      const masked = maskNumbers(normalizeSentence(sentence));
      if (exact.has(masked)) return true;
      const grams = bigrams(masked);
      return sentences.some(
        (s) =>
          s.masked.length > masked.length * 0.6 && s.masked.length < masked.length * 1.6 && dice(grams, s.grams) >= 0.8,
      );
    },
  };
}
