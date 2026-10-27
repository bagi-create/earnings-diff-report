import { NextRequest, NextResponse } from "next/server";
import { analyzeEarningsTexts, type AnalysisResult } from "@/lib/diff";
import { getGeminiModel, isGeminiConfigured, summarizeWithGemini } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TEXT_LENGTH = 300_000;

type AnalyzeRequest = {
companyName?: string;
previousText?: string;
currentText?: string;
};

type AnalyzeResponse = {
result: AnalysisResult;
engine: "gemini-flash" | "rule-based";
model: string | null;
aiStatus: "generated" | "not_configured" | "fallback";
warning?: string;
};

/**
 * Analysis endpoint used by the web UI.
 *
 * 1. Always run the deterministic sentence diff first.
 * 2. When GEMINI_API_KEY is set, ask Gemini Flash for a grounded summary.
 * 3. If Gemini is unavailable, return the rule-based result so the tool
 *    remains usable instead of failing the whole analysis.
 */
export async function POST(request: NextRequest) {
const body = (await request.json().catch(() => null)) as AnalyzeRequest | null;
const previousText = body?.previousText?.trim();
const currentText = body?.currentText?.trim();
const companyName = body?.companyName?.trim().slice(0, 100);

if (!previousText || !currentText) {
return NextResponse.json(
{ error: "previousText and currentText are required" },
{ status: 400 },
);
}

if (previousText.length > MAX_TEXT_LENGTH || currentText.length > MAX_TEXT_LENGTH) {
return NextResponse.json(
{ error: "Each document must be 300,000 characters or fewer" },
{ status: 413 },
);
}

const ruleBasedResult = analyzeEarningsTexts(previousText, currentText);

if (!isGeminiConfigured()) {
return NextResponse.json({
result: ruleBasedResult,
engine: "rule-based",
model: null,
aiStatus: "not_configured",
} satisfies AnalyzeResponse);
}

try {
const aiSummary = await summarizeWithGemini({
companyName,
previousText,
currentText,
result: ruleBasedResult,
});

return NextResponse.json({
result: { ...ruleBasedResult, aiSummary },
engine: "gemini-flash",
model: getGeminiModel(),
aiStatus: "generated",
} satisfies AnalyzeResponse);
} catch (error) {
console.error("Gemini summary failed; falling back to rule-based analysis", error);

return NextResponse.json({
result: ruleBasedResult,
engine: "rule-based",
model: getGeminiModel(),
aiStatus: "fallback",
warning: "AI要約を生成できなかったため、ルールベース解析の結果を表示しています。",
} satisfies AnalyzeResponse);
}
}
