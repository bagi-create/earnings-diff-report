/**
 * Build the pre-generated comparisons for the Core30 prototype.
 *
 *   npm run reports:build                # analysis + AI summaries (resumable)
 *   npm run reports:build -- --no-ai     # analysis only
 *   npm run reports:build -- 7203 6758   # only some companies
 *
 * For every company × document type × {前四半期比, 前年同期比} and the latest
 * 8 periods, compares the two documents with the same engine as the web app
 * and asks Gemini for the evidence-linked summary. Each comparison is saved
 * to data/out/reports/ as soon as it is done, so the run can stop (daily
 * quota) and continue later. Indexes for the pages are written at the end.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeEarningsTexts, ANALYSIS_VERSION } from "../src/lib/analyze";
import { computeDigest, type DigestHistory } from "../src/lib/anomaly";
import { getGeminiModel, isGeminiConfigured, PROMPT_VERSION, summarizeWithGemini } from "../src/lib/gemini";
import { buildSummaryPayload } from "../src/lib/summaryPayload";
import type {
  CompanyIndex,
  ComparisonKind,
  Core30Index,
  DeepAnalysis,
  DeepFinding,
  PeriodDoc,
  DocMeta,
  StoredReport,
} from "../src/lib/reportTypes";
import {
  docId,
  loadSources,
  officialPeriod,
  OUT_DIR,
  periodIndex,
  periodLabel,
  ROOT,
  TEXT_DIR,
  type DocType,
  type SourceCompany,
  type SourceDocument,
} from "./lib/documents";
import { sentenceIndex } from "./lib/history";
import { quoteStatus } from "./lib/quotes";
import { bigrams, INDEX_SHARDS, shardOf, type IndexShard } from "../src/lib/docSearch";
import { searchableText } from "./lib/docText";
import { DOCS_FILE } from "./lib/searchFile";

const PERIODS = 8;
const args = process.argv.slice(2);
const useAi = !args.includes("--no-ai");
const only = args.filter((a) => /^\d{4}$/.test(a));
const minIntervalMs = 60_000 / Number(process.env.AI_RPM ?? 10);

loadEnvLocal();

function loadEnvLocal() {
  const file = join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const reportFile = (code: string, type: DocType, kind: ComparisonKind, fy: number, q: number) =>
  join(OUT_DIR, "reports", code, `${type}-${kind}-FY${fy}-${q}Q.json`);

function periodDoc(company: SourceCompany, d: SourceDocument): PeriodDoc {
  return {
    fy: d.fy,
    q: d.q,
    label: periodLabel(d.fy, d.q),
    official: officialPeriod(d.fy, d.q, company.fiscalYearEnd),
    title: d.title ?? null,
    date: d.date ?? null,
    url: d.url,
  };
}

let lastAiCall = 0;
let aiStopped: string | null = null;

async function summarize(report: StoredReport): Promise<void> {
  if (!useAi || aiStopped || !isGeminiConfigured() || report.result.changes.length === 0) return;
  const wait = lastAiCall + minIntervalMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAiCall = Date.now();
  try {
    const { summary, model, usage } = await summarizeWithGemini(
      buildSummaryPayload(report.result, report.company.name),
    );
    report.result.aiSummary = summary;
    report.ai = { model, promptVersion: PROMPT_VERSION, usage };
  } catch (error) {
    const message = (error as Error).message;
    // Quota or rate limit: stop asking for today, keep the analysis.
    if (/429|quota|exhausted|rate/i.test(message)) aiStopped = message;
    else console.warn(`    AI要約に失敗: ${message}`);
  }
}

async function buildCompany(company: SourceCompany) {
  const available = company.documents.filter((d) => existsSync(join(TEXT_DIR, `${docId(company.code, d)}.txt`)));
  const byKey = new Map(available.map((d) => [`${d.type}:${periodIndex(d.fy, d.q)}`, d]));
  const text = (d: SourceDocument) => readFileSync(join(TEXT_DIR, `${docId(company.code, d)}.txt`), "utf8");

  for (const type of ["tanshin", "presentation"] as DocType[]) {
    const targets = available
      .filter((d) => d.type === type)
      .sort((a, b) => periodIndex(b.fy, b.q) - periodIndex(a.fy, a.q))
      .slice(0, PERIODS);
    for (const target of targets) {
      const p = periodIndex(target.fy, target.q);
      const bases: Array<[ComparisonKind, SourceDocument | undefined]> = [
        ["qoq", byKey.get(`${type}:${p - 1}`)],
        ["yoy", byKey.get(`${type}:${p - 4}`)],
      ];
      for (const [kind, base] of bases) {
        if (!base) continue;
        const file = reportFile(company.code, type, kind, target.fy, target.q);
        const existing = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as StoredReport) : null;
        const fresh = existing?.analysisVersion === ANALYSIS_VERSION;
        const hasAi = existing?.ai?.promptVersion === PROMPT_VERSION && existing.ai.model === getGeminiModel();
        if (fresh && (hasAi || !useAi || aiStopped)) continue;

        const report: StoredReport =
          fresh && existing
            ? existing
            : {
                analysisVersion: ANALYSIS_VERSION,
                company: { code: company.code, name: company.name },
                type,
                kind,
                base: periodDoc(company, base),
                target: periodDoc(company, target),
                result: analyzeEarningsTexts(text(base), text(target), {
                  mode: type === "presentation" ? "slides" : "tanshin",
                }),
              };
        await summarize(report);
        mkdirSync(join(OUT_DIR, "reports", company.code), { recursive: true });
        writeFileSync(file, JSON.stringify(report));
        console.log(
          `  ${type === "tanshin" ? "短信" : "説明"} ${kind === "qoq" ? "前四半期比" : "前年同期比"} ${periodLabel(target.fy, target.q)}` +
            `  変更${report.result.changes.length}件${report.result.aiSummary ? "・AI要約あり" : ""}`,
        );
      }
    }
  }
}

/** Sentences that appeared in at least this many of the recent documents count as long-standing. */
const LONG_STANDING = { minPresent: 6, window: 8 };

/** Footnotes that explain a past event (e.g. a 2024 stock split) and drop out once it is old news. */
const EXPIRING_NOTE = /^[（(]?注|^※|株式分割|株式併合|効力発生日|遡及/;

/**
 * Past-document checks for the home page digest:
 * - routine: the change also separates this document from the same quarter last year's,
 *   i.e. it happens every year because the document type differs (通期 → 第1四半期 etc.)
 * - long-standing: a removed sentence that had been in most of the recent documents
 */
function digestHistory(company: SourceCompany, report: StoredReport): DigestHistory | undefined {
  const { type, target } = report;
  const mode = type === "presentation" ? "slides" : "tanshin";
  const docs = company.documents.filter(
    (d) => d.type === type && existsSync(join(TEXT_DIR, `${docId(company.code, d)}.txt`)),
  );
  const read = (d: SourceDocument) =>
    sentenceIndex(readFileSync(join(TEXT_DIR, `${docId(company.code, d)}.txt`), "utf8"), mode);

  const lastYearDoc = docs.find((d) => d.fy === target.fy - 1 && d.q === target.q);
  const currentDoc = docs.find((d) => d.fy === target.fy && d.q === target.q);
  if (!lastYearDoc || !currentDoc) return undefined;
  const lastYear = read(lastYearDoc);
  const current = read(currentDoc);
  const recent = docs
    .filter((d) => periodIndex(d.fy, d.q) < periodIndex(target.fy, target.q))
    .sort((a, b) => periodIndex(b.fy, b.q) - periodIndex(a.fy, a.q))
    .slice(0, LONG_STANDING.window)
    .map(read);

  return {
    isRoutine(c) {
      // Gone now, but also absent a year ago: this quarter's document never carries it.
      if (c.kind === "removed") return Boolean(c.before) && !lastYear.has(c.before!);
      // New against last quarter, but the same quarter last year had it: it comes back every year.
      return Boolean(c.after) && lastYear.has(c.after!);
    },
    isLongStanding(c) {
      if (c.kind !== "removed" || !c.before || recent.length < LONG_STANDING.minPresent) return false;
      if (!/[。、]/.test(c.before) || EXPIRING_NOTE.test(c.before)) return false;
      // The aligner sometimes leaves a repeated sentence unpaired although the new document still has it.
      if (current.has(c.before)) return false;
      return recent.filter((doc) => doc.has(c.before!)).length >= LONG_STANDING.minPresent;
    },
  };
}

/** Indexes the pages read: one per company and one for the Core30 list. */
function writeIndexes(companies: SourceCompany[]) {
  const core30: Core30Index = { generatedAt: new Date().toISOString(), companies: [] };
  for (const company of companies) {
    const periods = new Map<number, CompanyIndex["periods"][number]>();
    for (const d of company.documents) {
      if (!existsSync(join(TEXT_DIR, `${docId(company.code, d)}.txt`))) continue;
      const p = periodIndex(d.fy, d.q);
      const entry = periods.get(p) ?? { ...periodDoc(company, d), docs: {}, comparisons: [] };
      entry.docs[d.type] = periodDoc(company, d);
      periods.set(p, entry);
    }
    for (const entry of periods.values()) {
      for (const type of ["tanshin", "presentation"] as DocType[]) {
        for (const kind of ["qoq", "yoy"] as ComparisonKind[]) {
          const file = reportFile(company.code, type, kind, entry.fy, entry.q);
          if (!existsSync(file)) continue;
          const r = JSON.parse(readFileSync(file, "utf8")) as StoredReport;
          entry.comparisons.push({
            type,
            kind,
            changes: r.result.changes.length - r.result.counts.numeric,
            toneBefore: r.result.previousTone.score,
            toneAfter: r.result.currentTone.score,
            signals: r.result.signals.filter((s) => s.changed).map((s) => ({ label: s.label, after: s.after, direction: s.direction })),
            headline: r.result.aiSummary?.headline ?? null,
          });
        }
      }
    }
    const list = [...periods.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, v]) => v)
      .filter((v) => v.comparisons.length > 0)
      .slice(0, PERIODS);
    const index: CompanyIndex = {
      code: company.code,
      name: company.name,
      fiscalYearEnd: company.fiscalYearEnd,
      irUrl: company.irUrl,
      periods: list,
    };
    writeFileSync(join(OUT_DIR, "index", `${company.code}.json`), JSON.stringify(index));

    const latest = list[0];
    const headline = latest?.comparisons.find((c) => c.type === "tanshin" && c.kind === "qoq") ?? latest?.comparisons[0];
    const headlineFile = latest && headline ? reportFile(company.code, headline.type, headline.kind, latest.fy, latest.q) : null;
    const headlineReport =
      headlineFile && existsSync(headlineFile) ? (JSON.parse(readFileSync(headlineFile, "utf8")) as StoredReport) : null;
    const history = headlineReport ? digestHistory(company, headlineReport) : undefined;
    const digest = headlineReport ? computeDigest(headlineReport.result, history) : undefined;
    // Tone and disclosure signals compare like with like: the same quarter of the previous year.
    // Against the previous quarter, a 第1四半期 短信 always "loses" the 通期 dividend policy and tone.
    const toneSource =
      (headline && latest?.comparisons.find((c) => c.type === headline.type && c.kind === "yoy")) ?? headline;
    core30.companies.push({
      code: company.code,
      name: company.name,
      latest: latest ? { label: latest.label, official: latest.official } : null,
      toneBefore: toneSource?.toneBefore ?? null,
      toneAfter: toneSource?.toneAfter ?? null,
      signals: toneSource?.signals ?? [],
      toneBasis: toneSource?.kind,
      periods: list.length,
      hasPresentation: list.some((p) => p.docs.presentation),
      digest,
    });
  }
  writeFileSync(join(OUT_DIR, "index", "core30.json"), JSON.stringify(core30));
}

/**
 * Full-text search data: a small list of every document (date, link, …), the text of each
 * document, and a bigram index split into INDEX_SHARDS parts, so a search reads only the
 * shards its keywords fall in and the texts of the documents it shows.
 */
function writeDocIndex(companies: SourceCompany[]) {
  const docs: Array<{ meta: DocMeta; text: string }> = [];
  for (const company of companies) {
    for (const d of company.documents) {
      const file = join(TEXT_DIR, `${docId(company.code, d)}.txt`);
      if (!existsSync(file)) continue;
      docs.push({
        meta: {
          id: docId(company.code, d),
          code: company.code,
          name: company.name,
          type: d.type,
          official: officialPeriod(d.fy, d.q, company.fiscalYearEnd),
          title: d.title ?? null,
          date: d.date ?? null,
          url: d.url,
        },
        text: searchableText(readFileSync(file, "utf8")),
      });
    }
  }
  docs.sort((a, b) => (b.meta.date ?? "").localeCompare(a.meta.date ?? "") || a.meta.code.localeCompare(b.meta.code));

  const shards: IndexShard[] = Array.from({ length: INDEX_SHARDS }, () => ({}));
  docs.forEach(({ text }, position) => {
    for (const gram of bigrams(text)) (shards[shardOf(gram)][gram] ??= []).push(position);
  });

  const dir = join(OUT_DIR, "search");
  rmSync(dir, { recursive: true, force: true });
  rmSync(join(OUT_DIR, "docpacks"), { recursive: true, force: true });
  mkdirSync(join(dir, "shards"), { recursive: true });
  mkdirSync(join(dir, "texts"), { recursive: true });
  writeFileSync(join(OUT_DIR, "index", DOCS_FILE), JSON.stringify(docs.map((d) => d.meta)));
  shards.forEach((shard, i) => writeFileSync(join(dir, "shards", `${i}.json`), JSON.stringify(shard)));
  for (const { meta, text } of docs) writeFileSync(join(dir, "texts", `${meta.id}.txt`), text);
  const grams = shards.reduce((n, s) => n + Object.keys(s).length, 0);
  console.log(`全文検索: 資料${docs.length}本・2文字の組${grams.toLocaleString()}種類`);
}

/**
 * Copy full-document AI readings (data/out/prototype/<code>.deep.json, written by
 * scripts/prototype/deep-analysis.ts) into the stored report they belong to.
 * Quotes that cannot be found in the source text are dropped, as are unknown change ids.
 */
function attachDeepAnalyses() {
  const dir = join(OUT_DIR, "prototype");
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).filter((f) => /^\d{4}\.deep\.json$/.test(f))) {
    const code = name.slice(0, 4);
    const call = JSON.parse(readFileSync(join(dir, name), "utf8")) as {
      model: string;
      text: string;
      report?: { type: DocType; kind: ComparisonKind; fy: number; q: number };
    };
    if (!call.report) continue;
    const file = reportFile(code, call.report.type, call.report.kind, call.report.fy, call.report.q);
    if (!existsSync(file)) continue;
    const report = JSON.parse(readFileSync(file, "utf8")) as StoredReport;
    const company = loadSources().find((c) => c.code === code);
    const docText = (p: PeriodDoc) => {
      const d = company?.documents.find((x) => x.type === report.type && x.fy === p.fy && x.q === p.q);
      return d ? readFileSync(join(TEXT_DIR, `${docId(code, d)}.txt`), "utf8") : "";
    };
    const sources = { 前回: docText(report.base), 今回: docText(report.target) };
    const ids = new Set(report.result.changes.map((c) => c.id));
    const parsed = JSON.parse(call.text) as Omit<DeepAnalysis, "model" | "createdAt">;
    const clean = (f: DeepFinding): DeepFinding => ({
      ...f,
      quotes: f.quotes.filter((q) => quoteStatus(q.text, sources[q.doc] ?? "") !== "見つからない"),
      changeIds: f.changeIds.filter((id) => ids.has(id)),
    });
    report.deep = {
      model: call.model,
      createdAt: statSync(join(dir, name)).mtime.toISOString(),
      headline: parsed.headline,
      whatHappened: parsed.whatHappened,
      comparisonNote: parsed.comparisonNote,
      hypotheses: parsed.hypotheses.map(clean),
      removedMeaning: parsed.removedMeaning.map(clean),
      formatDriven: parsed.formatDriven,
      peerContext: parsed.peerContext,
      watchNext: parsed.watchNext,
    };
    writeFileSync(file, JSON.stringify(report));
    console.log(`  AIの読み解きを追加: ${code} ${report.type} ${report.kind} FY${report.target.fy}-${report.target.q}Q`);
  }
}

async function main() {
  mkdirSync(join(OUT_DIR, "index"), { recursive: true });
  if (useAi && !isGeminiConfigured()) console.warn(".env.local に GEMINI_API_KEY がないため、AI要約なしで作ります。");
  const companies = loadSources().filter((c) => only.length === 0 || only.includes(c.code));
  for (const company of companies) {
    console.log(`${company.code} ${company.name}`);
    await buildCompany(company);
  }
  attachDeepAnalyses();
  writeIndexes(loadSources());
  writeDocIndex(loadSources());
  if (aiStopped) console.warn(`\nAI要約は途中で止めました（${aiStopped}）。時間をおいて同じコマンドを再実行すると続きから作ります。`);
}

void main();
