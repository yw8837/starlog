import { DEFAULT_REVERSAL_RATE, TEMPLATES, createDeck, pickCards } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { KEEP_TEMPLATES, issueDraw, openDraw } from "./drawToken";
import { signToken } from "./sign";

/**
 * 이어 읽기 on the server (spec 2026-11-26 beyond trend §3, §7): /now's card kept in the first position of a standard
 * three-card spread, the other positions dealt as today from the deck without it, carried in a `v: 2` token that is
 * recomputed the same way. The `v: 1` tokens are lib/security/security.test.ts's, unchanged.
 */

const SECRET = "test-secret-0123456789-0123456789-abcdef";
const NOW = Date.parse("2026-11-26T03:00:00Z");
const KEEP = { cardId: "major-06-lovers", orientation: "reversed" } as const;

/** The signed payload of a token (its first part, base64url JSON). */
const payloadOf = (token: string) => JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8")) as Record<string, unknown>;

describe("a draw that keeps /now's card", () => {
  it("takes the six standard three-card spreads only", () => {
    expect([...KEEP_TEMPLATES].sort()).toEqual(["choice", "group", "relationship", "relationship-contact", "self-flow", "work"]);
    for (const id of KEEP_TEMPLATES) expect(TEMPLATES[id].positions, id).toHaveLength(3);
  });

  it.each([...KEEP_TEMPLATES])("%s: the kept card first, the rest dealt from the deck without it, and the v2 token recomputes the same", async (templateId) => {
    const { cards, drawToken } = await issueDraw(templateId, [0, 76], SECRET, NOW, KEEP);
    const positions = TEMPLATES[templateId].positions;
    expect(cards).toHaveLength(3);
    expect(cards[0]).toEqual({ cardId: KEEP.cardId, orientation: KEEP.orientation, position: positions[0], slot: 0 });
    expect(cards.slice(1).map((c) => [c.position, c.slot])).toEqual([
      [positions[1], 1],
      [positions[2], 2],
    ]);

    // The token is the new kind and carries the kept card; recomputed from it, the same three cards.
    const payload = payloadOf(drawToken);
    expect(payload).toMatchObject({ k: "draw", v: 2, templateId, picks: [0, 76], keep: [KEEP.cardId, KEEP.orientation] });
    expect(await openDraw(drawToken, SECRET, NOW + 1000)).toEqual({ templateId, cards });

    // "As today": the same seed's deck, with the kept card taken out, then the picks as indexes into what is left.
    const deck = createDeck(payload.seed as string, DEFAULT_REVERSAL_RATE);
    const at = deck.order.indexOf(KEEP.cardId);
    const rest = { seed: deck.seed, order: deck.order.filter((_, i) => i !== at), orientations: deck.orientations.filter((_, i) => i !== at) };
    expect(rest.order).toHaveLength(77);
    const tail = pickCards(rest, { ...TEMPLATES[templateId], positions: positions.slice(1) }, [0, 76]);
    expect(cards.slice(1).map((c) => [c.cardId, c.orientation])).toEqual(tail.map((c) => [c.cardId, c.orientation]));
  });

  it("never deals the kept card a second time, whatever is picked", async () => {
    for (let i = 0; i < 77; i++) {
      const { cards } = await issueDraw("relationship", [i, (i + 38) % 77], SECRET, NOW, { cardId: "cups-02", orientation: "upright" });
      expect(cards.filter((c) => c.cardId === "cups-02"), String(i)).toHaveLength(1);
      expect(new Set(cards.map((c) => c.cardId)).size).toBe(3);
    }
  });

  it("refuses keep for the ten-card spread, the daily card and the 궁합 spread", async () => {
    await expect(issueDraw("deep-tarot", [0, 1, 2, 3, 4, 5, 6, 7, 8], SECRET, NOW, KEEP)).rejects.toThrow(RangeError);
    await expect(issueDraw("daily", [], SECRET, NOW, KEEP)).rejects.toThrow(RangeError);
    await expect(issueDraw("match", [0, 1, 2, 3], SECRET, NOW, KEEP)).rejects.toThrow(RangeError);
  });

  it("refuses an unknown card id, a wrong orientation, and picks that are not the spread's count less one", async () => {
    await expect(issueDraw("self-flow", [0, 1], SECRET, NOW, { cardId: "major-99", orientation: "upright" })).rejects.toThrow();
    await expect(issueDraw("self-flow", [0, 1], SECRET, NOW, { cardId: "", orientation: "upright" })).rejects.toThrow();
    await expect(issueDraw("self-flow", [0, 1], SECRET, NOW, { cardId: "major-06-lovers", orientation: "sideways" as never })).rejects.toThrow();
    await expect(issueDraw("self-flow", [0, 1, 2], SECRET, NOW, KEEP)).rejects.toThrow();
    await expect(issueDraw("self-flow", [0], SECRET, NOW, KEEP)).rejects.toThrow();
    await expect(issueDraw("self-flow", [1, 1], SECRET, NOW, KEEP)).rejects.toThrow();
    // 77 cards are left: index 77 is outside them.
    await expect(issueDraw("self-flow", [0, 77], SECRET, NOW, KEEP)).rejects.toThrow();
  });

  it("issues the old v1 token, with no keep, for a draw that keeps nothing", async () => {
    const { drawToken, cards } = await issueDraw("self-flow", [4, 40, 70], SECRET, NOW);
    const payload = payloadOf(drawToken);
    expect(payload.v).toBe(1);
    expect(payload).not.toHaveProperty("keep");
    expect(await openDraw(drawToken, SECRET, NOW)).toEqual({ templateId: "self-flow", cards });
  });

  it("opens no v2 token whose kept card, spread or shape does not recompute (even one signed with the secret)", async () => {
    const { drawToken } = await issueDraw("self-flow", [5, 50], SECRET, NOW, KEEP);
    const payload = payloadOf(drawToken);
    const resign = (change: Record<string, unknown>) => signToken({ ...payload, ...change } as never, SECRET);
    // Another kept card than the one the cards were dealt with.
    expect(await openDraw(await resign({ keep: ["major-07-chariot", "reversed"] }), SECRET, NOW)).toBeNull();
    // A v2 token without its card, a v2 token on the ten-card spread, a malformed keep, a v1 token with v2's cards.
    expect(await openDraw(await resign({ keep: undefined }), SECRET, NOW)).toBeNull();
    expect(await openDraw(await resign({ templateId: "deep-tarot" }), SECRET, NOW)).toBeNull();
    expect(await openDraw(await resign({ keep: ["major-06-lovers"] }), SECRET, NOW)).toBeNull();
    expect(await openDraw(await resign({ v: 1 }), SECRET, NOW)).toBeNull();
    expect(await openDraw(await resign({ v: 3 }), SECRET, NOW)).toBeNull();
    // Unchanged, it opens.
    expect(await openDraw(await resign({}), SECRET, NOW)).not.toBeNull();
  });
});
