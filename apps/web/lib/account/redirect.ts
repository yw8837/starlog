import "server-only";
import { serializeCookie, type CookieSpec } from "@/lib/api/http";

/**
 * 303 to `target` (a path on this site or an absolute URL) with query flags and cookies. Strings in
 * `cookies` are ready-made Set-Cookie values. Never cached.
 */
export function redirectTo(request: Request, target: string, query: Record<string, string> = {}, cookies: Array<CookieSpec | string> = []): Response {
  const url = new URL(target, request.url);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const headers = new Headers({ Location: url.toString(), "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", typeof cookie === "string" ? cookie : serializeCookie(cookie));
  return new Response(null, { status: 303, headers });
}
