import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccount } from "@/lib/account/deletion";
import type { DailyResult } from "@/lib/ai/schemas";
import { getOrCreateDailyResult, resetDailyStore } from "@/lib/api/dailyStore";
import { setTestDb } from "@/lib/db";
import type { D1Binding } from "@/lib/db/d1";
import { DAILY_COOKIE, dailyCookie } from "@/lib/security/dailyCookie";
import { kstDay } from "@/lib/security/quota";
import { LIMITS_PER_MINUTE, resetMemoryLimiter } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";
import { findShare } from "@/lib/share/store";
import { browser, loginAs, useTestDb, type Browser } from "@/lib/testing/p4";
import { DELETE, POST } from "./route";

const secret = signingSecret() as string;

/** Today's 오늘의 한 장 as /api/tarot/daily stores it for a device (with its pick and design). */
const READING: DailyResult & { deck: "starlog" } = {
  card: { cardId: "major-17-star", orientation: "upright", keyword: "희망" },
  summary: "작은 빛 하나를 따라가 보는 하루",
  body: "별 카드는 밤하늘 아래 물을 붓는 사람을 그려요. 서두르지 않아도 괜찮다는 이야기예요.",
  areas: { love: "먼저 안부를 건네 보세요", money: "작은 지출을 적어 봐요", work: "한 가지만 끝내 봐요" },
  lucky: { color: "하늘색", number: 7 },
  tip: "물 한 잔을 천천히 마셔 보세요",
  pick: 1,
  deck: "starlog",
};

/** A browser holding this device's 오늘의 한 장 cookie for `day`, with `reading` stored for it (none: nothing picked). */
async function deviceWithCard(did: string, reading: DailyResult | null = READING, day = kstDay(Date.now()), ip?: string): Promise<Browser> {
  const b = browser(ip);
  b.jar.set(DAILY_COOKIE, await dailyCookie({ did, day, gen: 1, pick: 1 }, secret));
  if (reading) await getOrCreateDailyResult(did, day, async () => reading);
  return b;
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => resetMemoryLimiter());
afterEach(() => {
  setTestDb(null);
  resetDailyStore();
});

describe("POST /api/share/daily", () => {
  it("makes one public link for today's card from the server's own record: the card, its design, the reading and the day, nothing of the device", async () => {
    const db = useTestDb();
    const b = await deviceWithCard("device-aaaa");
    const first = await b.send(POST, "/api/share/daily", { body: {}, origin: true });
    expect(first.status).toBe(200);
    const { id, path } = await json(first);
    expect(path).toBe(`/s/${id}`);
    expect((await json(await b.send(POST, "/api/share/daily", { body: {}, origin: true }))).id).toBe(id);

    const share = await findShare(db, id as string);
    expect(share?.payload).toEqual({
      kind: "daily",
      v: 1,
      deck: "starlog",
      day: kstDay(Date.now()),
      reading: { card: READING.card, summary: READING.summary, body: READING.body, areas: READING.areas, lucky: READING.lucky, tip: READING.tip },
    });
    const row = await db.prepare("SELECT kind, chapter_key, payload FROM shares WHERE id = ?").bind(id).first<{ kind: string; chapter_key: string; payload: string }>();
    expect(row?.kind).toBe("daily");
    expect(row?.chapter_key).not.toContain("device-aaaa");
    expect(row?.payload).not.toMatch(/device-aaaa|203\.0\.113|"pick"/);
  });

  it("never takes the reading from the client: what the request says is ignored", async () => {
    const db = useTestDb();
    const b = await deviceWithCard("device-bbbb");
    const forged = { reading: { summary: "스타로그가 쓰지 않은 말" }, card: { cardId: "major-13-death" } };
    const { id } = await json(await b.send(POST, "/api/share/daily", { body: forged, origin: true }));
    const stored = JSON.stringify((await findShare(db, id as string))?.payload);
    expect(stored).toContain(READING.summary);
    expect(stored).not.toMatch(/스타로그가 쓰지 않은 말|major-13-death/);
  });

  it("gives each device its own link", async () => {
    useTestDb();
    const mine = await json(await (await deviceWithCard("device-cccc")).send(POST, "/api/share/daily", { body: {}, origin: true }));
    const theirs = await json(await (await deviceWithCard("device-dddd", { ...READING, summary: "다른 기기의 하루" }, undefined, "198.51.100.8")).send(POST, "/api/share/daily", { body: {}, origin: true }));
    expect(mine.id).not.toBe(theirs.id);
  });

  it("refuses without today's card (no cookie, nothing stored, yesterday's cookie), another site's page and an oversized body, and saves nothing", async () => {
    const db = useTestDb();
    const noCookie = await browser().send(POST, "/api/share/daily", { body: {}, origin: true });
    expect(noCookie.status).toBe(409);
    expect((await json(noCookie)).message).toContain("오늘 고른 카드가 있어야 공유할 수 있어요");
    expect((await (await deviceWithCard("device-eeee", null)).send(POST, "/api/share/daily", { body: {}, origin: true })).status).toBe(409);
    const yesterday = kstDay(Date.now() - 24 * 3_600_000);
    expect((await (await deviceWithCard("device-ffff", READING, yesterday)).send(POST, "/api/share/daily", { body: {}, origin: true })).status).toBe(409);
    const b = await deviceWithCard("device-gggg");
    expect((await b.send(POST, "/api/share/daily", { body: {} })).status).toBe(403);
    expect((await b.send(POST, "/api/share/daily", { body: { pad: "가".repeat(2_000) }, origin: true })).status).toBe(400);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM shares").first()).toEqual({ n: 0 });
  });

  it("counts against the per-network limit the chapter shares use: past it, a 429", async () => {
    useTestDb();
    const b = await deviceWithCard("device-hhhh");
    for (let i = 0; i < LIMITS_PER_MINUTE.GEN_LIMITER; i++) expect((await b.send(POST, "/api/share/daily", { body: {}, origin: true })).status).toBe(200);
    expect((await b.send(POST, "/api/share/daily", { body: {}, origin: true })).status).toBe(429);
  });
});

describe("the owner of a 오늘의 한 장 share", () => {
  beforeEach(() => {
    vi.stubEnv("STARLOG_PAYMENTS", "on");
    vi.stubEnv("STARLOG_KAKAO", "mock");
  });
  afterEach(() => vi.unstubAllEnvs());

  const ownerOf = async (db: D1Binding, id: unknown) => (await db.prepare("SELECT user_id FROM shares WHERE id = ?").bind(id).first<{ user_id: string | null }>())?.user_id;

  it("is the signed-in account that made it, and it goes when that account is deleted", async () => {
    const db = useTestDb();
    const signedIn = await deviceWithCard("device-iiii", READING, undefined, "198.51.100.7");
    await loginAs(signedIn, "alice");
    const { id } = await json(await signedIn.send(POST, "/api/share/daily", { body: {}, origin: true }));
    const userId = await ownerOf(db, id);
    expect(userId).toEqual(expect.any(String));
    expect(await deleteAccount(db, null, { userId: userId as string, now: Date.now() })).toEqual({ ok: true, refunded: 0 });
    expect(await findShare(db, id as string)).toBeNull();
  });
});

describe("DELETE /api/share/daily", () => {
  it("stops sharing today's card: the link answers nothing afterwards, and sharing again makes a new one", async () => {
    const db = useTestDb();
    const b = await deviceWithCard("device-jjjj");
    const { id } = await json(await b.send(POST, "/api/share/daily", { body: {}, origin: true }));
    const stopped = await b.send(DELETE, "/api/share/daily", { method: "DELETE", body: {}, origin: true });
    expect(await json(stopped)).toEqual({ deleted: true });
    expect(await findShare(db, id as string)).toBeNull();
    const again = await json(await b.send(POST, "/api/share/daily", { body: {}, origin: true }));
    expect(again.id).not.toBe(id);
  });

  it("only stops this device's own link, and only from our pages", async () => {
    const db = useTestDb();
    const { id } = await json(await (await deviceWithCard("device-kkkk")).send(POST, "/api/share/daily", { body: {}, origin: true }));
    const other = await deviceWithCard("device-llll", READING, undefined, "198.51.100.9");
    expect(await json(await other.send(DELETE, "/api/share/daily", { method: "DELETE", body: {}, origin: true }))).toEqual({ deleted: false });
    expect((await other.send(DELETE, "/api/share/daily", { method: "DELETE", body: {} })).status).toBe(403);
    expect(await findShare(db, id as string)).not.toBeNull();
  });
});
