/**
 * Plain text of a disclosure document for full-text search: width-folded (NFKC) and with
 * the PDF line breaks removed, so a phrase split across lines or columns still matches.
 */
const CJK = "\\u3000-\\u30ff\\u3400-\\u9fff\\uff00-\\uffef";
const SPACE_BETWEEN_CJK = new RegExp(`([${CJK}]) (?=[${CJK}])`, "g");

export function searchableText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(SPACE_BETWEEN_CJK, "$1")
    .trim();
}
