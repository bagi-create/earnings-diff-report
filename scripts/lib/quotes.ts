/** Look up an AI quote in the source text, ignoring spacing and full/half-width differences. */
export type QuoteStatus = "一致" | "ほぼ一致" | "見つからない";

const norm = (s: string) => s.normalize("NFKC").replace(/[\s…「」『』]/g, "");

export function quoteStatus(quote: string, source: string): QuoteStatus {
  const q = norm(quote);
  const src = norm(source);
  if (!q) return "見つからない";
  if (src.includes(q)) return "一致";
  // PDF text breaks lines and columns differently; accept a quote whose 10-char pieces are mostly there.
  const chunks: string[] = [];
  for (let i = 0; i + 10 <= q.length; i += 10) chunks.push(q.slice(i, i + 10));
  if (chunks.length === 0) return "見つからない";
  const found = chunks.filter((c) => src.includes(c)).length / chunks.length;
  return found >= 0.7 ? "ほぼ一致" : "見つからない";
}
