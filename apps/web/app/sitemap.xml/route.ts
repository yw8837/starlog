import { siteOfRequest } from "@/lib/hosts";
import { premiumMode } from "@/lib/premium/flags";
import { sitemapXml } from "@/lib/seo";

// Which sitemap it is depends on the request's host, so it is never prerendered at build time.
export const dynamic = "force-dynamic";

/**
 * /sitemap.xml as a route (not app/sitemap.ts, whose function is handed no request): the root domain
 * lists the guide's URLs, every other host (the app, localhost) the app's. Entries: lib/seo.ts. The premium product
 * pages are listed only while STARLOG_PREMIUM is on (read per request: a crawler is never the owner pass).
 */
export function GET(request: Request) {
  return new Response(sitemapXml(siteOfRequest(request), { premium: premiumMode() === "on" }), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" },
  });
}
