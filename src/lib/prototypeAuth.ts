/** Password gate for the private prototype pages (company reports). */

export const AUTH_COOKIE = "edr_prototype";

/** Cookie value derived from the password, so the password itself is never stored in the browser. */
export async function authToken(password: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`earnings-diff-report:${password}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Only allow redirects back into this site. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
