import data from "@/data/companies.json";
import { CORE30 } from "@/data/core30";

export interface Company {
  code: string;
  name: string;
  market: string;
  sector: string;
  /** Pre-generated reports exist (Core30 prototype). */
  covered: boolean;
}

const covered = new Set(CORE30.map((c) => c.code));

const companies: Company[] = (data.rows as string[][]).map(([code, name, market, sector]) => ({
  code,
  name,
  market,
  sector,
  covered: covered.has(code),
}));

const byCode = new Map(companies.map((c) => [c.code, c]));

export const companiesAsOf = data.asOf;

export function findCompany(code: string): Company | undefined {
  return byCode.get(code.toUpperCase());
}

/** Fold width and case so "ﾄﾖﾀ", "トヨタ" and "toyota" style input all match. */
const fold = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s・()（）]/g, "");

/** Code prefix first, then name matches; companies with reports rank higher. */
export function searchCompanies(query: string, limit = 12): Company[] {
  const q = fold(query);
  if (!q) return [];
  const scored: Array<[number, Company]> = [];
  for (const c of companies) {
    let score = -1;
    if (c.code.toLowerCase() === q) score = 100;
    else if (c.code.toLowerCase().startsWith(q)) score = 80;
    else {
      const name = fold(c.name);
      if (name.startsWith(q)) score = 60;
      else if (name.includes(q)) score = 40;
    }
    if (score < 0) continue;
    scored.push([score + (c.covered ? 10 : 0), c]);
  }
  return scored
    .sort((a, b) => b[0] - a[0] || a[1].code.localeCompare(b[1].code))
    .slice(0, limit)
    .map(([, c]) => c);
}
