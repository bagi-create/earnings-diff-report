/**
 * Shared types and paths for the Core30 batch scripts.
 * Period keys are common to every company: FY = calendar year in which the
 * fiscal year ends, Q = 1..4 (4 = full year).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type DocType = "tanshin" | "presentation";

export interface SourceDocument {
  fy: number;
  q: 1 | 2 | 3 | 4;
  type: DocType;
  title?: string | null;
  date?: string | null;
  url: string;
}

export interface SourceCompany {
  code: string;
  name: string;
  fiscalYearEnd: number;
  irUrl: string;
  documents: SourceDocument[];
  notes?: string;
}

export const ROOT = join(__dirname, "..", "..");
export const DATA = join(ROOT, "data");
export const PARTS_DIR = join(DATA, "sources", "parts");
export const SOURCES_FILE = join(DATA, "sources", "core30.json");
export const RAW_DIR = join(DATA, "raw");
export const TEXT_DIR = join(DATA, "text");
export const OUT_DIR = join(DATA, "out");

export const docId = (code: string, d: Pick<SourceDocument, "fy" | "q" | "type">) =>
  `${code}-FY${d.fy}-${d.q}Q-${d.type}`;

/** Sortable period number: FY2027 1Q → 2027*4+1. */
export const periodIndex = (fy: number, q: number) => fy * 4 + q;

export const periodLabel = (fy: number, q: number) => `FY${fy} ${q}Q`;

/** Official-style name, e.g. "2027年3月期 第1四半期" / "2027年3月期 通期". */
export function officialPeriod(fy: number, q: number, fiscalYearEnd: number): string {
  return `${fy}年${fiscalYearEnd}月期 ${q === 4 ? "通期" : `第${q}四半期`}`;
}

export function loadSources(): SourceCompany[] {
  if (existsSync(SOURCES_FILE)) return JSON.parse(readFileSync(SOURCES_FILE, "utf8"));
  return readdirSync(PARTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(PARTS_DIR, f), "utf8")) as SourceCompany);
}
