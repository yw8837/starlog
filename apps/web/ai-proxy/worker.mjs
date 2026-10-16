// starlog-ai: the main Worker's way to the Anthropic API (service binding AI_PROXY in ../wrangler.jsonc).
// It runs where placement.hostname puts it, near api.anthropic.com and never in Hong Kong, where the API
// answers 403 "Request not allowed"; the main Worker runs near its visitors and D1 (2026-10-16). It adds the
// API key itself (secret ANTHROPIC_API_KEY on this Worker): the main Worker drops any key before calling.
// No route and no workers.dev address, so only bound Workers reach it. Deploy and checks: ./wrangler.jsonc.

const UPSTREAM = "https://api.anthropic.com";
/** The API paths the app calls (lib/ai/anthropic.ts); anything else is refused. */
const PATHS = new Set(["/v1/messages", "/v1/messages/count_tokens"]);
/** Request headers passed on. Never the caller's key or cookies: the key is this Worker's own. */
const PASSED = ["content-type", "accept", "anthropic-version", "anthropic-beta", "user-agent"];
const TRACE = "https://cloudflare.com/cdn-cgi/trace";

/** An error in the API's own shape, so the SDK reports it like any other API error. */
const error = (status, type) => Response.json({ type: "error", error: { type, message: `starlog-ai: ${type}` } }, { status });

export default {
  /**
   * @param {Request} request
   * @param {{ ANTHROPIC_API_KEY?: string }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/_placement" && request.method === "GET") return placement();
    if (!PATHS.has(url.pathname)) return error(404, "not_found");
    if (request.method !== "POST") return error(405, "method_not_allowed");
    const key = env.ANTHROPIC_API_KEY?.trim();
    if (!key) return error(503, "proxy_not_configured");
    const headers = new Headers();
    for (const name of PASSED) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    headers.set("x-api-key", key);
    try {
      // The answer (an event stream included) goes back as it arrives. request.signal aborts when the caller
      // goes away (enable_request_signal), which ends the upstream call and its billing too.
      return await fetch(UPSTREAM + url.pathname + url.search, {
        method: "POST",
        headers,
        body: await request.arrayBuffer(),
        signal: request.signal,
      });
    } catch (cause) {
      // The caller left (a closed tab, a cancelled reading): nothing to report, nobody to answer.
      if (request.signal.aborted) return error(499, "client_closed");
      // The class name only; the message may echo the request.
      console.error(JSON.stringify({ evt: "proxy.upstream_failed", kind: cause instanceof Error ? cause.name : "unknown" }));
      return error(502, "upstream_unreachable");
    }
  },
};

/**
 * Where this Worker runs and what the API says to a keyless request from there: 401 where it takes requests,
 * 403 "Request not allowed" where it refuses the region. Billing nothing; for checks after a deploy.
 */
async function placement() {
  const trace = await (await fetch(TRACE)).text();
  const colo = /^colo=(\w+)$/m.exec(trace)?.[1] ?? "unknown";
  const answer = await fetch(UPSTREAM + "/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "anthropic-version": "2023-06-01" },
    body: "{}",
  });
  const body = await answer.json().catch(() => null);
  return Response.json({ colo, anthropic: answer.status, error: body?.error?.type ?? null });
}
