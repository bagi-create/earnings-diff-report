/** Minimal shape of a pdf.js text item (TextItem | TextMarkedContent). */
interface PdfTextItem {
  str?: string;
  transform?: number[];
  hasEOL?: boolean;
}

/** Page separator kept in extracted text so slide decks can be split by page. */
export const PAGE_BREAK = "\f";

/**
 * Rebuild lines from pdf.js text items. Items are joined without spaces
 * (Japanese has none) and a new line starts whenever the baseline moves, so
 * the segmenter can tell wrapped sentences, headings and table rows apart.
 * Shared by the browser upload and the Node batch scripts.
 */
export function pageItemsToText(items: readonly unknown[]): string {
  const lines: string[] = [];
  let line = "";
  let lastY: number | null = null;
  for (const raw of items) {
    const item = raw as PdfTextItem;
    if (typeof item.str !== "string" || !item.transform) continue;
    const y = item.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > 2 && line) {
      lines.push(line);
      line = "";
    }
    line += item.str;
    if (item.hasEOL) {
      lines.push(line);
      line = "";
    }
    lastY = y;
  }
  if (line) lines.push(line);
  return lines.join("\n");
}
