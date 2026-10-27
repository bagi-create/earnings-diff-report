/**
 * Regression check for the rule-based engine: `npm run check:analysis`.
 * Uses the demo samples, a PDF-like noisy copy of them and a large document.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeEarningsTexts } from "../src/lib/analyze";
import { SAMPLES } from "../src/lib/samples";
import { buildSummaryPayload, PAYLOAD_LIMITS } from "../src/lib/summaryPayload";

const [upgrade, downgrade] = SAMPLES;
const signal = (r: ReturnType<typeof analyzeEarningsTexts>, key: string) =>
  r.signals.find((s) => s.key === key)!.after;

const up = analyzeEarningsTexts(upgrade.previous, upgrade.current);
assert.equal(signal(up, "guidance"), "上方修正");
assert.equal(signal(up, "dividend"), "増配");
assert.equal(signal(up, "buyback"), "実施・予定あり");
assert.ok(up.currentTone.score > up.previousTone.score + 30, "upgrade sample should turn more bullish");
assert.equal(up.metrics.find((m) => m.name === "営業利益")?.after, "112億円");
assert.ok(up.changes.some((c) => c.kind === "rephrased" && c.after?.includes("上方修正")), "guidance sentence should pair as a rewrite");

const down = analyzeEarningsTexts(downgrade.previous, downgrade.current);
assert.equal(signal(down, "dividend"), "減配");
assert.ok(down.currentTone.score < down.previousTone.score - 30, "downgrade sample should turn more cautious");
assert.ok(down.currentTone.uncertaintyHits > down.previousTone.uncertaintyHits);

// pdf.js-like input: wrapped lines, spaces between CJK, running headers, page numbers, table rows.
function pdfify(text: string): string {
  const out: string[] = [];
  let page = 1;
  text.split("\n").forEach((line, i) => {
    if (i % 6 === 0) out.push("サンプル精機株式会社(9999) 2027年3月期 第2四半期決算短信", `- ${page++} -`);
    for (let k = 0; k < line.length; k += 33) out.push(line.slice(k, k + 33).split("").join(i % 2 ? " " : ""));
    if (i === 4) out.push("売上高 1,240 2.1 86 △4.5 90 1.2", "営業利益 86 △4.5 90 1.2 55 3.3");
  });
  return out.join("\n");
}
const noisy = analyzeEarningsTexts(pdfify(upgrade.previous), pdfify(upgrade.current));
assert.deepEqual(noisy.counts, up.counts, "PDF noise should not change the diff");
assert.equal(noisy.unchangedCount, up.unchangedCount);

const payload = buildSummaryPayload(up, upgrade.companyName);
const chars = payload.changes.reduce((n, c) => n + (c.before?.length ?? 0) + (c.after?.length ?? 0), 0);
assert.ok(chars <= PAYLOAD_LIMITS.totalChangeChars);

const big = (t: string) => Array.from({ length: 110 }, (_, i) => t.replace(/当社/g, `当社${i}`)).join("\n");
const started = Date.now();
const large = analyzeEarningsTexts(big(upgrade.previous), big(upgrade.current));
const ms = Date.now() - started;
assert.ok(ms < 5000, `large document took ${ms}ms`);

// Real documents, when they have been downloaded locally (npm run docs:fetch).
const textDir = join(__dirname, "..", "data", "text");
let realPairs = 0;
if (existsSync(textDir)) {
  const files = readdirSync(textDir).filter((f) => f.endsWith(".txt")).sort();
  for (const type of ["tanshin", "presentation"]) {
    const ofType = files.filter((f) => f.endsWith(`-${type}.txt`)).slice(-2);
    if (ofType.length < 2) continue;
    const [a, b] = ofType.map((f) => readFileSync(join(textDir, f), "utf8"));
    const r = analyzeEarningsTexts(a, b, { mode: type === "presentation" ? "slides" : "tanshin" });
    assert.ok(r.current.sentences > 10, `${ofType[1]}: too few sentences (${r.current.sentences})`);
    assert.ok(r.changes.length > 0 && r.unchangedCount > 0, `${ofType[1]}: expected both changes and unchanged sentences`);
    realPairs += 1;
  }
}

console.log(`ok — upgrade ${JSON.stringify(up.counts)}, downgrade ${JSON.stringify(down.counts)}, large ${large.current.sentences} sentences in ${ms}ms, real document pairs ${realPairs}`);
