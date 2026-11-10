import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decisionFor } from "@/lib/decision";
import { setTestDb } from "@/lib/db";
import { resetMemoryLimiter } from "@/lib/security/rateLimit";
import { findShare } from "@/lib/share/store";
import { NOW_TYPES, nowType } from "@/lib/tarotType";
import { browser, useTestDb } from "@/lib/testing/p4";
import { POST } from "./route";

beforeEach(() => resetMemoryLimiter());
afterEach(() => setTestDb(null));

const DRAW = { cardId: "major-17-star", orientation: "reversed", pick: 2, deck: "starlog" };

describe("POST /api/share/now (지금의 한 장, owner 2026-10-23)", () => {
  it("makes the draw's public link from the card DB: the card, its line and why, nothing typed", async () => {
    const db = useTestDb();
    const res = await browser().send(POST, "/api/share/now", { body: { ...DRAW, question: "이직해도 될까?", answer: "지어낸 말" }, origin: true });
    expect(res.status).toBe(200);
    const { id, path } = (await res.json()) as { id: string; path: string };
    expect(path).toBe(`/s/${id}`);
    const share = await findShare(db, id);
    const entry = decisionFor("major-17-star", "reversed", "starlog");
    expect(share?.payload).toEqual({ kind: "now", v: 1, deck: "starlog", card: { cardId: "major-17-star", orientation: "reversed" }, lean: entry.lean, answer: entry.answers[2], why: entry.why });
    expect(JSON.stringify(share?.payload)).not.toMatch(/이직|지어낸/);
  });

  it("answers the same address for the same card, line and design from anyone (nothing personal in it)", async () => {
    useTestDb();
    const a = (await (await browser("203.0.113.1").send(POST, "/api/share/now", { body: DRAW, origin: true })).json()) as { id: string };
    const b = (await (await browser("203.0.113.2").send(POST, "/api/share/now", { body: DRAW, origin: true })).json()) as { id: string };
    expect(b.id).toBe(a.id);
  });

  it("says 타로로's nickname with the card when the page showed it (spec 2026-11-11 6.2 N8), as its own link", async () => {
    const db = useTestDb();
    const plain = (await (await browser().send(POST, "/api/share/now", { body: DRAW, origin: true })).json()) as { id: string };
    const res = await browser().send(POST, "/api/share/now", { body: { ...DRAW, nick: true }, origin: true });
    const { id, preview } = (await res.json()) as { id: string; preview: { title: string } };
    expect(id).not.toBe(plain.id);
    expect((await findShare(db, id))?.payload).toMatchObject({ kind: "now", nick: true });
    const name = NOW_TYPES[nowType("major-17-star", "reversed")].name;
    expect(preview.title).toBe(`타로로 판정: ${name} · 별(역) | 스타로그 지금의 한 장`);
    // Anything but `true` is no nickname: the plain link, as before (N9).
    const odd = (await (await browser().send(POST, "/api/share/now", { body: { ...DRAW, nick: "yes" }, origin: true })).json()) as { id: string; preview: { title: string } };
    expect(odd.id).toBe(plain.id);
    expect(odd.preview.title).not.toContain("타로로 판정");
  });

  it("refuses a draw the card DB does not know, and another site's page", async () => {
    useTestDb();
    const bad = await browser().send(POST, "/api/share/now", { body: { ...DRAW, pick: 9 }, origin: true });
    expect(bad.status).toBe(400);
    const cross = await browser().send(POST, "/api/share/now", { body: DRAW });
    expect(cross.status).toBe(403);
  });
});
