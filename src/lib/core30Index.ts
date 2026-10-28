import { CORE30_KEY, type Core30Index } from "@/lib/reportTypes";
import { readReport } from "@/lib/reportsStore";

/** Core30 の一覧インデックス（KV の1キー）。読めなければ null。 */
export async function readCore30Index(): Promise<Core30Index | null> {
  const raw = await readReport(CORE30_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Core30Index;
  } catch {
    return null;
  }
}
