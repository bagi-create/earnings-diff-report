/**
 * Upload the built reports to the REPORTS KV namespace.
 *
 *   npm run reports:upload -- --local    # the dev server's local KV
 *   npm run reports:upload -- --remote   # production
 *
 * Reports are packed into one value per company × type × comparison kind
 * (about 150 keys for Core30), which keeps writes inside KV's free daily
 * limit and lets the page switch between periods without another request.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  companyKey,
  CORE30_KEY,
  periodKey,
  DOCS_KEY,
  docTextKey,
  indexShardKey,
  seriesKey,
  type ReportSeries,
  type StoredReport,
} from "../src/lib/reportTypes";
import { OUT_DIR, ROOT } from "./lib/documents";
import { DOCS_FILE } from "./lib/searchFile";

const target = process.argv.includes("--remote") ? "--remote" : "--local";
const MAX_BATCH_BYTES = 40 * 1024 * 1024;

function main() {
  const entries: Array<{ key: string; value: string }> = [];
  const series = new Map<string, ReportSeries>();
  const reportsDir = join(OUT_DIR, "reports");
  for (const code of readdirSync(reportsDir)) {
    for (const file of readdirSync(join(reportsDir, code))) {
      const report = JSON.parse(readFileSync(join(reportsDir, code, file), "utf8")) as StoredReport;
      const key = seriesKey(code, report.type, report.kind);
      const s = series.get(key) ?? { code, type: report.type, kind: report.kind, reports: {} };
      s.reports[periodKey(report.target.fy, report.target.q)] = report;
      series.set(key, s);
    }
  }
  for (const [key, value] of series) entries.push({ key, value: JSON.stringify(value) });

  const indexDir = join(OUT_DIR, "index");
  for (const file of readdirSync(indexDir)) {
    const value = readFileSync(join(indexDir, file), "utf8");
    const key =
      file === "core30.json" ? CORE30_KEY : file === DOCS_FILE ? DOCS_KEY : companyKey(file.replace(".json", ""));
    entries.push({ key, value });
  }

  // Full-text search: index shards and one plain-text value per document.
  const searchDir = join(OUT_DIR, "search");
  if (existsSync(searchDir)) {
    for (const file of readdirSync(join(searchDir, "shards"))) {
      const value = readFileSync(join(searchDir, "shards", file), "utf8");
      entries.push({ key: indexShardKey(Number(file.replace(".json", ""))), value });
    }
    for (const file of readdirSync(join(searchDir, "texts"))) {
      const value = readFileSync(join(searchDir, "texts", file), "utf8");
      entries.push({ key: docTextKey(file.replace(".txt", "")), value });
    }
  }

  // Split into files below the bulk upload size limit.
  const batches: Array<typeof entries> = [[]];
  let size = 0;
  for (const entry of entries) {
    const bytes = Buffer.byteLength(entry.value);
    if (bytes > 25 * 1024 * 1024) throw new Error(`${entry.key} is larger than KV's 25 MiB value limit`);
    if (size + bytes > MAX_BATCH_BYTES && batches[batches.length - 1].length) {
      batches.push([]);
      size = 0;
    }
    batches[batches.length - 1].push(entry);
    size += bytes;
  }

  const tmp = join(OUT_DIR, "upload");
  if (!existsSync(tmp)) mkdirSync(tmp, { recursive: true });
  const totalMb = entries.reduce((n, e) => n + Buffer.byteLength(e.value), 0) / 1024 / 1024;
  console.log(`${entries.length} keys, ${totalMb.toFixed(1)} MB → ${target === "--remote" ? "本番" : "ローカル"}のKV`);
  batches.forEach((batch, i) => {
    const file = join(tmp, `batch-${i}.json`);
    writeFileSync(file, JSON.stringify(batch));
    execFileSync(
      process.execPath,
      [join(ROOT, "node_modules/wrangler/bin/wrangler.js"), "kv", "bulk", "put", file, "--binding", "REPORTS", target],
      { cwd: ROOT, stdio: "inherit" },
    );
  });
}

main();
