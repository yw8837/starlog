import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LUCKY_NOTICE } from "@starlog/core";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { POST as ownerPost } from "../bonds/owner/route";
import { GET, POST } from "./route";

type Jar = Map<string, string>;
const cookieHeader = (jar: Jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
function absorb(jar: Jar, res: Response) {
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const i = pair!.indexOf("=");
    jar.set(pair!.slice(0, i), pair!.slice(i + 1));
  }
}
const req = (jar: Jar, body?: unknown) =>
  new Request("http://localhost/api/lucky", {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie: cookieHeader(jar), "content-type": "application/json", "cf-connecting-ip": "5.5.5.5" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const BIRTH = { calendar: "solar", year: 1993, month: 7, day: 14 };

interface Lucky {
  weekId: string;
  numbers: { n: number; reason: string }[];
  card: { cardId: string; name: string };
  notice: string;
}

describe("/api/lucky", () => {
  beforeEach(() => {
    resetMemoryLimiter();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 9, 1, 3)); // Thursday, week of 2026-09-28
  });
  afterEach(() => vi.useRealTimers());

  it("gives the same device the same numbers all week, and new ones from the next KST Monday", async () => {
    const device: Jar = new Map();
    const first = await POST(req(device, { birth: BIRTH }));
    absorb(device, first);
    const a = (await first.json()) as Lucky;
    expect(a.weekId).toBe("2026-09-28");
    expect(a.numbers).toHaveLength(6);
    expect(a.notice).toBe(LUCKY_NOTICE);
    vi.setSystemTime(Date.UTC(2026, 9, 4, 14, 59)); // Sunday 23:59 KST
    expect(await (await POST(req(device, { birth: BIRTH }))).json()).toEqual(a);
    vi.setSystemTime(Date.UTC(2026, 9, 4, 15, 1)); // Monday 00:01 KST
    const next = (await (await POST(req(device, { birth: BIRTH }))).json()) as Lucky;
    expect(next.weekId).toBe("2026-10-05");
    expect(next.numbers).not.toEqual(a.numbers);
  });

  it("never sends the birth date back and never says 로또", async () => {
    const text = await (await POST(req(new Map(), { birth: BIRTH }))).text();
    expect(text).not.toMatch(/1993|"birth"|로또/);
  });

  it("uses an owner's stored basis on GET, and asks for a birth date otherwise", async () => {
    expect((await GET(req(new Map()))).status).toBe(404);
    const owner: Jar = new Map();
    absorb(owner, await ownerPost(new Request("http://localhost/api/bonds/owner", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname: "용우", birth: { calendar: "solar", year: 1990, month: 1, day: 1 } }),
    })));
    const viaGet = (await (await GET(req(owner))).json()) as Lucky;
    const viaPost = (await (await POST(req(owner, { birth: { calendar: "solar", year: 1990, month: 1, day: 1 } }))).json()) as Lucky;
    expect(viaGet.numbers).toHaveLength(6);
    expect(viaPost).toEqual(viaGet);
  });

  it("rejects an impossible date", async () => {
    expect((await POST(req(new Map(), { birth: { calendar: "solar", year: 1993, month: 2, day: 30 } }))).status).toBe(400);
  });
});
