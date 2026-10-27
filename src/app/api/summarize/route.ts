import { NextRequest, NextResponse } from "next/server";
import { getGeminiModel, isGeminiConfigured, PROMPT_VERSION, summarizeWithGemini } from "@/lib/gemini";
import { readCache, sha256, takeDailyQuota, writeCache } from "@/lib/store";
import { PAYLOAD_LIMITS, type SummaryPayload } from "@/lib/summaryPayload";
import type { AiSummary, SummarizeResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS = new Set(["added", "removed", "rephrased", "numeric"]);
const clip = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
const strings = (v: unknown, maxItems: number, maxLen: number) =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, maxItems).map((x) => x.slice(0, maxLen)) : [];

/** The browser is untrusted: re-apply every size limit before spending tokens. */
function sanitize(input: unknown): SummaryPayload | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.changes)) return null;
  let budget = PAYLOAD_LIMITS.totalChangeChars;
  const changes: SummaryPayload["changes"] = [];
  for (const item of raw.changes.slice(0, PAYLOAD_LIMITS.changes)) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (typeof c.id !== "string" || !/^C\d{1,5}$/.test(c.id) || !KINDS.has(String(c.kind))) continue;
    const before = clip(c.before, PAYLOAD_LIMITS.charsPerSentence + 1);
    const after = clip(c.after, PAYLOAD_LIMITS.charsPerSentence + 1);
    const size = (before?.length ?? 0) + (after?.length ?? 0);
    if (size === 0 || size > budget) continue;
    budget -= size;
    changes.push({
      id: c.id,
      kind: c.kind as SummaryPayload["changes"][number]["kind"],
      section: clip(c.section, 20) ?? "その他",
      categories: strings(c.categories, 6, 20),
      before,
      after,
    });
  }
  if (changes.length === 0) return null;
  return {
    companyName: clip(raw.companyName, 80),
    summaryLines: strings(raw.summaryLines, 10, 200),
    signals: strings(raw.signals, 6, 80),
    metrics: strings(raw.metrics, 6, 120),
    tone: clip(raw.tone, 80) ?? "",
    changes,
  };
}

/**
 * AI summary of an analysis that already ran in the browser.
 * Order of checks keeps spend predictable: configured → cache → daily limit → Gemini.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { payload?: unknown } | null;
  const payload = sanitize(body?.payload);
  if (!payload) {
    return NextResponse.json({ aiStatus: "skipped", model: null } satisfies SummarizeResponse);
  }

  if (!isGeminiConfigured()) {
    return NextResponse.json({ aiStatus: "not_configured", model: null } satisfies SummarizeResponse);
  }

  const model = getGeminiModel();
  const cacheKey = await sha256(JSON.stringify([PROMPT_VERSION, model, payload]));
  const cached = await readCache<AiSummary>(cacheKey);
  if (cached) {
    return NextResponse.json({ aiStatus: "cached", model, aiSummary: cached } satisfies SummarizeResponse);
  }

  if (!(await takeDailyQuota())) {
    return NextResponse.json({
      aiStatus: "limit_reached",
      model,
      warning: "本日のAI要約の上限に達したため、自動解析の結果のみ表示しています。",
    } satisfies SummarizeResponse);
  }

  try {
    const { summary, usage } = await summarizeWithGemini(payload);
    await writeCache(cacheKey, summary);
    console.log(`gemini ${model} in=${usage.inputTokens} out=${usage.outputTokens} usd=${usage.estimatedUsd}`);
    return NextResponse.json({ aiStatus: "generated", model, aiSummary: summary, usage } satisfies SummarizeResponse);
  } catch (error) {
    console.error("Gemini summary failed", error);
    return NextResponse.json({
      aiStatus: "fallback",
      model,
      warning: "AI要約を生成できなかったため、自動解析の結果のみ表示しています。",
    } satisfies SummarizeResponse);
  }
}
