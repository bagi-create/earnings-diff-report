/**
 * 決算資料の全文検索。差分は使わず、資料にその言葉が出てくるかと、その前後の文だけを見る。
 * 資料の本文はビルド時に NFKC で正規化し、改行を除いてある（scripts/lib/docText.ts）。
 */

export interface Excerpt {
  /** Text with the matched terms marked. */
  parts: Array<{ text: string; mark: boolean }>;
}

export interface DocMatch {
  /** Occurrences of the first term. */
  count: number;
  excerpts: Excerpt[];
}

const MAX_EXCERPTS = 3;
const BEFORE = 80;
const AFTER = 120;

/**
 * 索引の単位：2文字の組（bigram）。英字は小文字にそろえる。
 * ビルド（scripts/build-reports.ts）と検索で同じ関数を使い、索引と検索のずれを防ぐ。
 */
export function bigrams(text: string): Set<string> {
  const s = text.toLowerCase();
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i += 1) {
    const g = s.slice(i, i + 2);
    if (!/\s/.test(g)) set.add(g);
  }
  return set;
}

/** 索引を分けて置く数。1回の検索は、キーワードの2文字の組が入っている分だけを読む。 */
export const INDEX_SHARDS = 64;

/** Which shard holds a bigram (FNV-1a hash). */
export function shardOf(gram: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < gram.length; i += 1) {
    h ^= gram.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % INDEX_SHARDS;
}

/** One index shard: bigram → positions (in DocMeta[] order) of the documents that contain it. */
export type IndexShard = Record<string, number[]>;

export function parseQuery(query: string): string[] {
  return query
    .normalize("NFKC")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5);
}

/** Null when the document does not contain every term. Case-insensitive for Latin letters. */
export function matchDocument(text: string, terms: string[]): DocMatch | null {
  if (!terms.length) return null;
  const folded = /[A-Za-z]/.test(terms.join("")) ? text.toLowerCase() : text;
  const needles = folded === text ? terms : terms.map((t) => t.toLowerCase());
  if (!needles.every((t) => folded.includes(t))) return null;

  const first = needles[0];
  let count = 0;
  const excerpts: Excerpt[] = [];
  let coveredUntil = -1;
  for (let i = folded.indexOf(first); i !== -1; i = folded.indexOf(first, i + first.length)) {
    count += 1;
    if (excerpts.length >= MAX_EXCERPTS || i < coveredUntil) continue;
    const [start, end] = window(text, i, i + first.length);
    excerpts.push({ parts: mark(text.slice(start, end), folded.slice(start, end), needles, start > 0, end < text.length) });
    coveredUntil = end;
  }
  return { count, excerpts };
}

/** Widen to the surrounding sentence, within BEFORE / AFTER characters. */
function window(text: string, from: number, to: number): [number, number] {
  const back = text.lastIndexOf("。", from - 1);
  const start = back !== -1 && from - back <= BEFORE ? back + 1 : Math.max(0, from - BEFORE);
  const ahead = text.indexOf("。", to);
  const end = ahead !== -1 && ahead - to <= AFTER ? ahead + 1 : Math.min(text.length, to + AFTER);
  return [start, end];
}

function mark(
  slice: string,
  foldedSlice: string,
  needles: string[],
  cutStart: boolean,
  cutEnd: boolean,
): Excerpt["parts"] {
  const marks = new Array<boolean>(slice.length).fill(false);
  for (const n of needles) {
    for (let i = foldedSlice.indexOf(n); i !== -1; i = foldedSlice.indexOf(n, i + n.length)) {
      for (let k = i; k < i + n.length; k += 1) marks[k] = true;
    }
  }
  const parts: Excerpt["parts"] = cutStart ? [{ text: "…", mark: false }] : [];
  for (let i = 0; i < slice.length; i += 1) {
    const last = parts[parts.length - 1];
    if (last && last.mark === marks[i] && last.text !== "…") last.text += slice[i];
    else parts.push({ text: slice[i], mark: marks[i] });
  }
  if (cutEnd) parts.push({ text: "…", mark: false });
  return parts;
}
