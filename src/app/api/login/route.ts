import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, authToken, safeNext } from "@/lib/prototypeAuth";

/** Form post from /login: set the prototype cookie and go back to the page. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const next = safeNext(String(form.get("next") ?? "/"));
  const password = process.env.PROTOTYPE_PASSWORD;
  const given = String(form.get("password") ?? "");

  if (!password || given !== password) {
    const back = new URL("/login", request.url);
    back.searchParams.set("next", next);
    back.searchParams.set("error", password ? "1" : "closed");
    return NextResponse.redirect(back, 303);
  }

  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(AUTH_COOKIE, await authToken(password), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
