// Redirects the Worker (worker.mjs) answers itself, ahead of OpenNext's handler. Plain JavaScript and
// free of the generated `.open-next/worker.js`, so tests can load it.

/**
 * Plain http on either host: a permanent redirect to the same address on https, before anything else.
 * `wrangler dev` (the OpenNext preview and e2e) hands the Worker http://starlog.yeolmaeapps.kr/ whatever
 * the client typed, and Miniflare marks those requests with MF-Original-Hostname; a redirect there
 * would send the preview to the live site, so they are left alone. Production never sends the header.
 */
export function httpsRedirect(request) {
  const url = new URL(request.url);
  if (url.protocol !== "http:" || request.headers.has("mf-original-hostname")) return null;
  url.protocol = "https:";
  url.port = "";
  return Response.redirect(url.toString(), 301);
}

/**
 * OpenNext answers a URL with a trailing slash by redirecting to the one without (308) before it looks
 * at next.config's redirects, so /guide/the-hermit/ on the app host took two hops: the strip, then the
 * rule that sends the guide to the root domain. Ask `app` (OpenNext's handler) for the slash-less
 * address first, and when the app's own rules redirect that, return it as the one hop. Anything else
 * (a page, a 404) is discarded and null comes back, so OpenNext answers the original request as ever.
 */
export async function slashRedirect(request, app) {
  const url = new URL(request.url);
  const page = (request.method === "GET" || request.method === "HEAD") && !url.pathname.startsWith("/api/");
  if (!page || url.pathname === "/" || !url.pathname.endsWith("/")) return null;
  url.pathname = url.pathname.replace(/\/+$/, "");
  const response = await app(new Request(url.toString(), request));
  if (response.status === 307 || response.status === 308) return response;
  await response.body?.cancel();
  return null;
}
