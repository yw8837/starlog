import { POST as agePost } from "@/app/api/auth/age/route";
import { GET as kakaoCallback } from "@/app/api/auth/kakao/callback/route";
import { GET as kakaoStart } from "@/app/api/auth/kakao/start/route";
import { GET as meGet } from "@/app/api/me/route";
import { POST as confirmPost } from "@/app/api/pay/confirm/route";
import { POST as ordersPost } from "@/app/api/pay/orders/route";
import { setTestDb } from "@/lib/db";
import { migratedTestD1 } from "@/lib/db/testing/migrate";
import type { TestD1 } from "@/lib/db/testing/sqliteD1";

/** Helpers for P4 route tests: a cookie-keeping browser, a test D1 for accountDb(), mock Kakao login. Tests only. */

export type Handler = (request: Request) => Promise<Response>;

export interface SendInit {
  method?: string;
  body?: unknown;
  /** send Origin: http://localhost (our own pages) */
  origin?: boolean;
  accept?: string;
  signal?: AbortSignal;
}

export interface Browser {
  jar: Map<string, string>;
  send(handler: Handler, url: string, init?: SendInit): Promise<Response>;
}

/** Keeps cookies between calls (Max-Age=0 deletes one), sends its IP and, when asked, our Origin. */
export function browser(ip = "203.0.113.9"): Browser {
  const jar = new Map<string, string>();
  return {
    jar,
    async send(handler, url, init = {}) {
      const headers: Record<string, string> = { "cf-connecting-ip": ip };
      if (jar.size) headers.cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
      if (init.body !== undefined) headers["content-type"] = "application/json";
      if (init.origin) headers.origin = "http://localhost";
      if (init.accept) headers.accept = init.accept;
      const response = await handler(
        new Request(new URL(url, "http://localhost"), {
          method: init.method ?? (init.body === undefined ? "GET" : "POST"),
          headers,
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal: init.signal,
        }),
      );
      for (const line of response.headers.getSetCookie()) {
        const [pair = ""] = line.split(";");
        const index = pair.indexOf("=");
        const name = pair.slice(0, index);
        if (/Max-Age=0(;|$)/.test(line)) jar.delete(name);
        else jar.set(name, pair.slice(index + 1));
      }
      return response;
    },
  };
}

/** A fresh migrated test D1 that every accountDb() call returns until setTestDb(null). */
export function useTestDb(): TestD1 {
  const db = migratedTestD1();
  setTestDb(db);
  return db;
}

/**
 * The 만 14세 check as /login does it: a same-origin POST hands back the URL that starts Kakao login,
 * with its 5-minute token. `mockUser` picks the mock Kakao account (STARLOG_KAKAO=mock).
 */
export async function startUrl(b: Browser, returnTo = "/tarot/result", mockUser?: string): Promise<string> {
  const res = await b.send(agePost, "/api/auth/age", { body: { ageConfirmed: true, returnTo }, origin: true });
  if (res.status !== 200) throw new Error(`age check answered ${res.status}`);
  const { url } = (await res.json()) as { url: string };
  return mockUser ? `${url}&mockUser=${encodeURIComponent(mockUser)}` : url;
}

/** Logs in through the mock Kakao flow (STARLOG_KAKAO=mock); returns the callback's 303. */
export async function loginAs(b: Browser, name = "alice", returnTo = "/tarot/result"): Promise<Response> {
  const start = await b.send(kakaoStart, await startUrl(b, returnTo, name));
  const location = start.headers.get("location");
  if (!location?.includes("/api/auth/kakao/callback")) throw new Error(`login did not reach the callback: ${start.status} ${location}`);
  return b.send(kakaoCallback, location);
}

export interface MeBody {
  payments: boolean;
  login: boolean;
  owner: boolean;
  user: null | {
    nickname: string;
    gift: { status: "unused"; until: string | null } | { status: "used" } | null;
    unused: Array<{ orderId: string; productId: string; refundUntil: string }>;
    opening: Array<{ productId: string; currency: "paid" | "gift"; orderId: string | null }>;
  };
}

export async function me(b: Browser): Promise<MeBody> {
  return (await (await b.send(meGet, "/api/me")).json()) as MeBody;
}

let paymentSeq = 0;

/** Buys through the mock Toss (STARLOG_PAY=mock): create the order, then confirm it. Returns the order id. */
export async function buy(b: Browser, productId = "tarot"): Promise<string> {
  const order = await b.send(ordersPost, "/api/pay/orders", { body: { productId, returnTo: "/tarot/result", ack: true }, origin: true });
  if (order.status !== 200) throw new Error(`order answered ${order.status}`);
  const { orderId, amount } = (await order.json()) as { orderId: string; amount: number };
  const confirmed = await b.send(confirmPost, "/api/pay/confirm", { body: { paymentKey: `mock_${++paymentSeq}_${orderId}`, orderId, amount }, origin: true });
  if (confirmed.status !== 200) throw new Error(`confirm answered ${confirmed.status}`);
  return orderId;
}
