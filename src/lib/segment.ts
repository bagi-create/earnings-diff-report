/**
 * Turns raw text (often extracted from a PDF) into sentences that carry the
 * section they belong to. PDF text arrives with hard line breaks in the middle
 * of sentences, repeated page headers, page numbers and table rows; all of
 * those make a naive sentence diff report hundreds of fake changes.
 */

export interface Sentence {
  index: number;
  text: string;
  section: string;
  heading: string;
}

export interface SegmentedDocument {
  sentences: Sentence[];
  characters: number;
  skippedLines: number;
}

const CJK = "\\u3000-\\u30ff\\u3400-\\u9fff\\uff00-\\uffef";
const SPACE_BETWEEN_CJK = new RegExp(`(?<=[${CJK}])[ \\t]+(?=[${CJK}])`, "g");

const HEADING_PATTERNS = [
  /^[0-9]{1,2}[.．、]\s*\S/,
  /^[（(][0-9]{1,2}[)）]\s*\S/,
  /^[IVX]{1,4}[.．、\s]\s*\S/,
  /^【[^】]{1,30}】$/,
  /^[■□◆◇●▼▶◎]\s*\S/,
  /^第[0-9一二三四五六七八九十]+[章節部]/,
];

const BULLET = /^[・‧•\-－―]\s*/;

/** Canonical section names so that the same part of two reports lines up. */
const SECTION_RULES: Array<[RegExp, string]> = [
  [/見通し|予想|計画|ガイダンス|今後の/, "見通し"],
  [/配当|株主還元|利益配分|自己株式|自社株/, "株主還元"],
  [/キャッシュ|資金/, "キャッシュ・フロー"],
  [/財政状態|資産|負債|純資産/, "財政状態"],
  [/セグメント|事業別|部門別/, "セグメント"],
  [/リスク|課題|継続企業/, "リスク・課題"],
  [/経営方針|経営戦略|中期経営|サステナ/, "経営方針"],
  [/会計|注記|連結財務諸表|基本となる重要な事項/, "注記"],
  [/経営成績|業績|概況|決算の概要|ハイライト/, "業績"],
];

export const SECTION_ORDER = [
  "業績",
  "セグメント",
  "財政状態",
  "キャッシュ・フロー",
  "見通し",
  "株主還元",
  "リスク・課題",
  "経営方針",
  "注記",
  "その他",
];

export function normalizeText(text: string): string {
  return text
    // NFKC would turn circled numbers into bare digits and lose the heading marker.
    .replace(/[①-⑳]/g, (c) => `(${c.charCodeAt(0) - 0x245f})`)
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ 　]/g, " ")
    .replace(SPACE_BETWEEN_CJK, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ");
}

/** Canonical section for a heading line, or null when it is not recognisable. */
export function canonicalSection(heading: string): string | null {
  for (const [pattern, name] of SECTION_RULES) {
    if (pattern.test(heading)) return name;
  }
  return null;
}

export function isHeading(line: string): boolean {
  if (line.length > 40 || /[。]$/.test(line)) return false;
  return HEADING_PATTERNS.some((p) => p.test(line));
}

function isPageFurniture(line: string): boolean {
  return (
    /^[-－―\s]*[0-9]{1,3}[-－―\s]*$/.test(line) || // page numbers like "- 3 -"
    /^[0-9]{1,3}\s*\/\s*[0-9]{1,3}$/.test(line) ||
    /^(ページ|page)\s*[0-9]+$/i.test(line)
  );
}

/** Table rows: mostly digits, separators and short labels, no sentence ending. */
function isTableRow(line: string): boolean {
  if (/[。]/.test(line)) return false;
  const digits = (line.match(/[0-9△▲,.%-]/g) ?? []).length;
  return line.length >= 6 && digits / line.length > 0.35;
}

export function segmentDocument(rawText: string): SegmentedDocument {
  const text = normalizeText(rawText);
  const rawLines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Lines that repeat many times are running headers / footers.
  const lineCounts = new Map<string, number>();
  for (const line of rawLines) lineCounts.set(line, (lineCounts.get(line) ?? 0) + 1);

  let skippedLines = 0;
  const lines: string[] = [];
  for (const line of rawLines) {
    const repeated = (lineCounts.get(line) ?? 0) >= 3 && !/[。]$/.test(line) && line.length < 60;
    if (repeated || isPageFurniture(line) || isTableRow(line)) {
      skippedLines += 1;
      continue;
    }
    lines.push(line);
  }

  // Re-join lines that a PDF wrapped in the middle of a sentence.
  const blocks: Array<{ text: string; heading: boolean }> = [];
  let buffer = "";
  const flush = () => {
    if (buffer) blocks.push({ text: buffer, heading: false });
    buffer = "";
  };
  for (const line of lines) {
    if (isHeading(line)) {
      flush();
      blocks.push({ text: line, heading: true });
      continue;
    }
    if (BULLET.test(line)) {
      flush();
      buffer = line.replace(BULLET, "");
    } else {
      const glue = /[A-Za-z0-9]$/.test(buffer) && /^[A-Za-z0-9]/.test(line) ? " " : "";
      buffer += glue + line;
    }
    if (/[。！？!?]$/.test(line)) flush();
  }
  flush();

  const sentences: Sentence[] = [];
  let section = "その他";
  let heading = "";
  for (const block of blocks) {
    if (block.heading) {
      heading = block.text;
      section = canonicalSection(block.text) ?? section;
      continue;
    }
    for (const piece of splitSentences(block.text)) {
      sentences.push({ index: sentences.length, text: piece, section, heading });
    }
  }

  return { sentences, characters: text.length, skippedLines };
}

/** Split on sentence-final punctuation, but not inside brackets. */
export function splitSentences(block: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of block) {
    current += ch;
    if ("（(「『【".includes(ch)) depth += 1;
    else if ("）)」』】".includes(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && "。！？".includes(ch)) {
      out.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) out.push(current.trim());
  return out.filter((s) => s.replace(/[\s。、]/g, "").length >= 6);
}

/** Comparison key: drop spacing and punctuation. */
export function normalizeSentence(sentence: string): string {
  return sentence
    .toLowerCase()
    .replace(/[\s]/g, "")
    .replace(/[、。,.・:;「」『』()[\]<>"'“”‘’【】〔〕]/g, "");
}

/** Comparison key with every number replaced, to spot "only the figures changed". */
export function maskNumbers(normalized: string): string {
  return normalized.replace(/[△▲-]?[0-9][0-9,.]*/g, "#");
}
