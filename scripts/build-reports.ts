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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeEarningsTexts, ANALYSIS_VERSION } from "../src/lib/analyze";
import { getGeminiModel, isGeminiConfigured, PROMPT_VERSION, summarizeWithGemini } from "../src/lib/gemini";
import { buildSummaryPayload } from "../src/lib/summaryPayload";
import type { CompanyIndex, ComparisonKind, Core30Index, PeriodDoc, StoredReport } from "../src/lib/reportTypes";
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
    core30.companies.push({
      code: company.code,
      name: company.name,
      latest: latest ? { label: latest.label, official: latest.official } : null,
      toneBefore: headline?.toneBefore ?? null,
      toneAfter: headline?.toneAfter ?? null,
      signals: headline?.signals ?? [],
      periods: list.length,
      hasPresentation: list.some((p) => p.docs.presentation),
    });
  }
  writeFileSync(join(OUT_DIR, "index", "core30.json"), JSON.stringify(core30));
}

async function main() {
  mkdirSync(join(OUT_DIR, "index"), { recursive: true });
  if (useAi && !isGeminiConfigured()) console.warn(".env.local に GEMINI_API_KEY がないため、AI要約なしで作ります。");
  const companies = loadSources().filter((c) => only.length === 0 || only.includes(c.code));
  for (const company of companies) {
    console.log(`${company.code} ${company.name}`);
    await buildCompany(company);
  }
  writeIndexes(loadSources());
  if (aiStopped) console.warn(`\nAI要約は途中で止めました（${aiStopped}）。時間をおいて同じコマンドを再実行すると続きから作ります。`);
}

void main();
