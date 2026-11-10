import { headers } from "next/headers";
import { SITE } from "./config";

/**
 * The origin to name as canonical for a page both hosts serve (GUIDE_HOST_PAGES): the root domain's when the request came
 * to it, else none (the path stays relative to the layout's metadataBase, the app host). Reading the request makes the
 * page render per request; the three pages that call this already do.
 */
export async function servedOrigin(): Promise<string | undefined> {
  const host = (await headers()).get("host") ?? "";
  return host.replace(/:\d+$/, "") === new URL(SITE.guideUrl).hostname ? SITE.guideUrl : undefined;
}
