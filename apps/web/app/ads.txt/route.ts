import { adsConfig, adsTxt } from "@/lib/ads";

export const dynamic = "force-static";

/** Serves ads.txt once AdSense is configured; 404 until then. */
export function GET() {
  const ads = adsConfig();
  if (!ads) return new Response("Not found", { status: 404 });
  return new Response(adsTxt(ads.client), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
