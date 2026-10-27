import { NextRequest, NextResponse } from "next/server";
import { searchCompanies } from "@/lib/companies";

/** Company search for the top page: ?q=7203 or ?q=トヨタ. */
export function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 40);
  return NextResponse.json(
    { results: searchCompanies(q) },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
