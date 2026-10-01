import { guideRss } from "@/lib/rss";

export const dynamic = "force-static";

/** /rss.xml: the guide articles (lib/rss.ts). */
export function GET() {
  return new Response(guideRss(), { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
