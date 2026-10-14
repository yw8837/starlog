// The Worker entry: OpenNext's generated handler for every request, plus the Cron Trigger.
// `.open-next/worker.js` exists after `pnpm cf:build`. The app has no Durable Object caches
// (open-next.config.ts), so nothing else needs re-exporting from it.
import handler from "./.open-next/worker.js";
import { httpsRedirect, slashRedirect } from "./lib/workerRedirects.mjs";

/** Same host as SITE.url; the request never leaves the Worker (it goes straight to handler.fetch). */
const MAINTENANCE_URL = "https://starlog.yeolmaeapps.kr/api/internal/maintenance";

export default {
  /** http goes to https, a trailing-slash URL gets its one-hop redirect (lib/workerRedirects.mjs), the rest is the app's. */
  async fetch(request, env, ctx) {
    const app = (asked) => handler.fetch(asked, env, ctx);
    return httpsRedirect(request) ?? (await slashRedirect(request, app)) ?? app(request);
  },

  /**
   * Every 10 minutes (wrangler.jsonc triggers.crons): settle stale payments and refunds, return
   * stale reservations, finish erasures and purge old records (lib/pay/maintenance.ts). It goes
   * through the app's own route so it runs with the same bundle, bindings and env as a request.
   */
  async scheduled(_controller, env, ctx) {
    const secret = env.STARLOG_CRON_SECRET;
    if (!secret) {
      console.error(JSON.stringify({ evt: "cron.no_secret" }));
      return;
    }
    const request = new Request(MAINTENANCE_URL, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
    ctx.waitUntil(
      handler.fetch(request, env, ctx).then((response) => {
        if (!response.ok) console.error(JSON.stringify({ evt: "cron.maintenance_failed", status: response.status }));
      }),
    );
  },
};
