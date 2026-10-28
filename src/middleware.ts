import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/prototypeAuth";

/**
 * The pre-generated company pages are a private prototype: they need the
 * PROTOTYPE_PASSWORD secret (entered once on /login, kept as a cookie).
 * Without the secret the pages stay closed. The cross-company search shows the same report text,
 * so it is closed too. The home page company search and /compare stay public.
 */
export async function middleware(request: NextRequest) {
  const password = process.env.PROTOTYPE_PASSWORD;
  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  if (password && cookie && cookie === (await authToken(password))) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "password required" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/company/:path*", "/search/:path*", "/api/reports/:path*"],
};
