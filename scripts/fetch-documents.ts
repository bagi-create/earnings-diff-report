/**
 * Download the collected PDFs and extract their text.
 *
 *   npm run docs:fetch            # merge parts, download what is missing, extract, check
 *   npm run docs:fetch -- 7203    # only some companies
 *
 * data/sources/parts/*.json → data/sources/core30.json (merged, committed)
 * PDFs → data/raw/, text → data/text/ (both git-ignored; company documents are not redistributed)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { CORE30 } from "../src/data/core30";
import { PAGE_BREAK, pageItemsToText } from "../src/lib/pdfText";
import {
  docId,
  PARTS_DIR,
  RAW_DIR,
  ROOT,
  SOURCES_FILE,
  TEXT_DIR,
  type SourceCompany,
  type SourceDocument,
} from "./lib/documents";

const only = process.argv.slice(2);
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

function mergeParts(): SourceCompany[] {
  const order = new Map(CORE30.map((c, i) => [c.code, i]));
  const companies = readdirSync(PARTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(PARTS_DIR, f), "utf8")) as SourceCompany)
    .map((c) => ({
      ...c,
      documents: dedupe(c.documents).sort((a, b) => b.fy * 4 + b.q - (a.fy * 4 + a.q) || a.type.localeCompare(b.type)),
    }))
    .sort((a, b) => (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99));
  writeFileSync(SOURCES_FILE, JSON.stringify(companies, null, 2) + "\n");
  return companies;
}

/** One document per company, period and type; the first one listed wins. */
function dedupe(docs: SourceDocument[]): SourceDocument[] {
  const seen = new Set<string>();
  return docs.filter((d) => {
    const key = `${d.fy}-${d.q}-${d.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function download(url: string, file: string): Promise<void> {
  let response: Response | null = null;
  // Some IR servers answer intermittently with 4xx/5xx; retry a few times.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await new Promise((r) => setTimeout(r, 2000 * attempt));
    response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
    if (response.ok) break;
  }
  if (!response?.ok) throw new Error(`HTTP ${response?.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") throw new Error("not a PDF");
  writeFileSync(file, bytes);
}

async function extract(file: string): Promise<{ text: string; pages: number }> {
  // Japanese PDFs often use CID fonts: without the CMaps, text comes out garbled or without digits.
  const pdfjsDir = join(ROOT, "node_modules", "pdfjs-dist");
  const pdf = await getDocument({
    data: new Uint8Array(readFileSync(file)),
    cMapUrl: join(pdfjsDir, "cmaps") + "/",
    cMapPacked: true,
    standardFontDataUrl: join(pdfjsDir, "standard_fonts") + "/",
    verbosity: 0,
  }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const content = await (await pdf.getPage(n)).getTextContent();
    pages.push(pageItemsToText(content.items));
  }
  return { text: pages.join(`\n${PAGE_BREAK}\n`), pages: pdf.numPages };
}

/**
 * Some PDFs (often exported from Word) carry no usable character mapping and
 * extract as nonsense such as "㻞㻜㻞㻢ᖺ". Real Japanese text is full of hiragana.
 */
function looksJapanese(text: string): boolean {
  const chars = text.replace(/[\s\x00-\x7f]/g, "");
  const hiragana = (chars.match(/[\u3041-\u3096]/g) ?? []).length;
  return chars.length > 0 && hiragana / chars.length > 0.02;
}

/** Does the start of the document mention the period we expect? Catches swapped links. */
function periodWarning(text: string, company: SourceCompany, d: SourceDocument): string | null {
  const head = text.slice(0, 4000).normalize("NFKC").replace(/\s/g, "");
  const m = company.fiscalYearEnd;
  const startYear = m === 12 ? d.fy : d.fy - 1; // 年度 names the year the fiscal year starts
  const yearHints = [`${d.fy}年${m}月期`, `FY${d.fy}`, `FY${String(d.fy).slice(2)}`, `${startYear}年度`, `${d.fy}/${m}`];
  if (!yearHints.some((h) => head.includes(h))) return `年度の表記が見つからない（${d.fy}年${m}月期）`;
  if (d.type === "tanshin") {
    const quarter = d.q === 4 ? null : new RegExp(d.q === 2 ? "第2四半期|中間" : `第${d.q}四半期`);
    if (quarter && !quarter.test(head)) return `四半期の表記が見つからない（第${d.q}四半期）`;
    if (!quarter && /第[123]四半期/.test(head.slice(0, 200))) return "通期のはずが四半期の資料に見える";
  }
  return null;
}

async function main() {
  mkdirSync(RAW_DIR, { recursive: true });
  mkdirSync(TEXT_DIR, { recursive: true });
  const companies = mergeParts().filter((c) => only.length === 0 || only.includes(c.code));
  const problems: string[] = [];
  let downloaded = 0;
  let extracted = 0;

  for (const company of companies) {
    for (const d of company.documents) {
      const id = docId(company.code, d);
      const pdfFile = join(RAW_DIR, `${id}.pdf`);
      const textFile = join(TEXT_DIR, `${id}.txt`);
      try {
        if (!existsSync(pdfFile)) {
          await download(d.url, pdfFile);
          downloaded += 1;
          await new Promise((r) => setTimeout(r, 800)); // be polite to IR servers
        }
        if (!existsSync(textFile)) {
          const { text, pages } = await extract(pdfFile);
          if (text.replace(/\s/g, "").length < 200) throw new Error(`文字がほとんど取れない（${pages}ページ、画像PDFの可能性）`);
          if (!looksJapanese(text)) throw new Error("文字化け（PDFに文字コードの対応情報がない。OCRが必要）");
          writeFileSync(textFile, text);
          extracted += 1;
        }
        const warning = periodWarning(readFileSync(textFile, "utf8"), company, d);
        if (warning) problems.push(`${id}: ${warning}`);
      } catch (error) {
        problems.push(`${id}: ${(error as Error).message} ${d.url}`);
      }
    }
    const counts = ["tanshin", "presentation"].map(
      (t) => company.documents.filter((d) => d.type === t && existsSync(join(TEXT_DIR, `${docId(company.code, d)}.txt`))).length,
    );
    console.log(`${company.code} ${company.name}: 短信 ${counts[0]} / 説明資料 ${counts[1]}`);
  }

  console.log(`\n取得 ${downloaded} 件、抽出 ${extracted} 件、要確認 ${problems.length} 件`);
  for (const p of problems) console.log(`  - ${p}`);
}

void main();
