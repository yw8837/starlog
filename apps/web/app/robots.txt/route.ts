import { robotsTxt } from "@/lib/robots";

export const dynamic = "force-static";

/**
 * robots.txt as a route (not app/robots.ts) so it can carry the Daum 웹마스터도구 ownership comment,
 * which Next's robots object cannot write. Rules and crawler list: lib/robots.ts.
 */
export function GET() {
  return new Response(robotsTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
