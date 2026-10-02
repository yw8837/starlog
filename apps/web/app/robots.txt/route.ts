import { originOf, siteOfRequest } from "@/lib/hosts";
import { robotsTxt } from "@/lib/robots";

// The Sitemap and llms.txt lines name the request's own host, so it is never prerendered at build time.
export const dynamic = "force-dynamic";

/**
 * robots.txt as a route (not app/robots.ts) so it can carry the Daum 웹마스터도구 ownership comment,
 * which Next's robots object cannot write, and read the request's host: the root domain and the app
 * host each point at their own sitemap. Rules and crawler list: lib/robots.ts.
 */
export function GET(request: Request) {
  return new Response(robotsTxt({ site: originOf(siteOfRequest(request)) }), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" },
  });
}
