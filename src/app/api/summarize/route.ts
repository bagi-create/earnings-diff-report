import { NextRequest, NextResponse } from "next/server";
import { analyzeEarningsTexts } from "@/lib/diff";

/**
 * Server-side analysis endpoint.
 *
 * MVP: deterministic rule-based analysis shared with the client.
 * Later phase: when OPENAI_API_KEY is configured, send the extracted
 * added/removed/rephrased sentences to an LLM here and return a
 * higher-quality business-environment summary. Keep the response shape
 * stable so the client does not need to change.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { previousText?: string; currentText?: string }
    | null;

  if (!body?.previousText || !body?.currentText) {
    return NextResponse.json(
      { error: "previousText and currentText are required" },
      { status: 400 },
    );
  }

  const result = analyzeEarningsTexts(body.previousText, body.currentText);
  return NextResponse.json({ result, engine: process.env.OPENAI_API_KEY ? "rule-based+llm-ready" : "rule-based" });
}
