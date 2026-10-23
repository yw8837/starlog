import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDailyStore } from "@/lib/api/dailyStore";
import { setTestDb } from "@/lib/db";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { findShare } from "@/lib/share/store";
import { useTestDb } from "@/lib/testing/p4";
import { POST as draw } from "../../tarot/draw/route";
import { POST as teaser } from "../../tarot/teaser/route";
import { POST as sajuTeaser } from "../../saju/teaser/route";
import { DELETE, POST } from "./route";

/** 무료 첫 풀이 공유 (owner 2026-10-23): what the free screen shows, sealed by its teaser route, never the paid part. */

type Handler = (request: Request) => Promise<Response>;
function device(ip = "203.0.113.70") {
  const jar = new Map<string, string>();
  return async (handler: Handler, body: unknown, method = "POST") => {
    const res = await handler(
      new Request("http://localhost/api", {
        method,
        headers: { "content-type": "application/json", "cf-connecting-ip": ip, origin: "http://localhost", cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
        body: JSON.stringify(body),
      }),
    );
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const at = pair!.indexOf("=");
      jar.set(pair!.slice(0, at), pair!.slice(at + 1));
    }
    return { status: res.status, data: (await res.json()) as Record<string, unknown> };
  };
}

const INPUT = {
  topicId: "money", whoId: "me", whenId: "week",
  question: "이번 주, 나의 재물 흐름은 어떨까",
  conditions: [{ label: "지금 상황", value: "수입이 들쭉날쭉" }],
  note: "이번 달 카드값이 많이 나왔어요",
};

beforeEach(() => {
  vi.stubEnv("STARLOG_AI", "mock");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  resetMemoryLimiter();
  resetDailyStore();
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setTestDb(null);
});

describe("POST /api/share/free", () => {
  it("the free first tarot reading: the cards, the first paragraph and the second up to its cut, never the hidden part, the question or the note", async () => {
    const db = useTestDb();
    const call = device();
    const drawn = await call(draw, { templateId: "self-flow", picks: [3, 30, 60] });
    const t = await call(teaser, { drawToken: drawn.data.drawToken, input: INPUT });
    expect(t.status).toBe(200);
    const share = t.data.share as string;
    expect(typeof share).toBe("string");
    const res = await call(POST, { share });
    expect(res.status).toBe(200);
    const stored = await findShare(db, res.data.id as string);
    expect(stored?.payload.kind).toBe("tarot-free");
    if (stored?.payload.kind !== "tarot-free") return;
    const second = t.data.secondCard as { heading: string; body: string } | undefined;
    expect(stored.payload.first.body.length).toBeGreaterThan(0);
    if (second) expect(stored.payload.second?.body).toBe(second.body);
    const text = JSON.stringify(stored.payload);
    expect(text).not.toContain("카드값");
    expect(text).not.toContain("재물 흐름은 어떨까");
    expect((res.data.preview as { try: { path: string } }).try.path).toBe("/tarot/start");
    // The same seal answers the same address; DELETE takes it down.
    expect((await call(POST, { share })).data.id).toBe(res.data.id);
    expect((await call(DELETE, { share }, "DELETE")).data).toEqual({ deleted: true });
    expect(await findShare(db, res.data.id as string)).toBeNull();
  });

  it("the free saju 맛보기: its title and summary, without the birth", async () => {
    const db = useTestDb();
    const call = device("203.0.113.71");
    const t = await call(sajuTeaser, { birth: DEFAULT_SAJU_FORM });
    expect(t.status).toBe(200);
    const res = await call(POST, { share: t.data.share });
    expect(res.status).toBe(200);
    const stored = await findShare(db, res.data.id as string);
    expect(stored?.payload).toMatchObject({ kind: "saju-free", v: 1 });
    expect(Object.keys(stored!.payload).sort()).toEqual(["kind", "summary", "title", "v"]);
    expect(JSON.stringify(stored?.payload)).not.toContain(String(DEFAULT_SAJU_FORM.year));
  });

  it("refuses text the server did not seal, and another site's page", async () => {
    useTestDb();
    const call = device("203.0.113.72");
    expect((await call(POST, { share: "made-up" })).status).not.toBe(200);
    const cross = await POST(new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ share: "x" }) }));
    expect(cross.status).toBe(403);
  });
});
