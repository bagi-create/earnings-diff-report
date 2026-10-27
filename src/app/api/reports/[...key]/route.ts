import { NextRequest, NextResponse } from "next/server";
import { companyKey, seriesKey, type ComparisonKind, type ReportDocType } from "@/lib/reportTypes";
import { readReport } from "@/lib/reportsStore";

export const dynamic = "force-dynamic";

/**
 * Pre-generated reports (password-protected by middleware).
 *   /api/reports/company/7203
 *   /api/reports/series/7203/tanshin/qoq
 * The stored JSON is passed through untouched, so the Worker never parses it.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const [scope, code, type, kind] = (await params).key;
  let key: string | null = null;
  if (scope === "company" && /^\w{4}$/.test(code ?? "")) key = companyKey(code);
  if (
    scope === "series" &&
    /^\w{4}$/.test(code ?? "") &&
    (type === "tanshin" || type === "presentation") &&
    (kind === "qoq" || kind === "yoy")
  ) {
    key = seriesKey(code, type as ReportDocType, kind as ComparisonKind);
  }
  if (!key) return NextResponse.json({ error: "not found" }, { status: 404 });

  const value = await readReport(key);
  if (!value) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(value, {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, max-age=600" },
  });
}
