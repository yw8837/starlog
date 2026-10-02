import { describe, expect, it } from "vitest";
import { RESUME_TTL_MS, inputHash, openResume, sealResume } from "./resume";

const SECRET = "signing-secret-for-tests-0123456789abcdef";
const NOW = Date.parse("2026-10-20T03:00:00Z");
/** One character of the sealed bytes changed (a full 6-bit character, so the bytes always differ). */
const tamper = (token: string, i = Math.floor(token.length / 2)) => `${token.slice(0, i)}${token[i] === "A" ? "B" : "A"}${token.slice(i + 1)}`;

describe("resume token", () => {
  it("round-trips parts, subject, input and reservation, and hides them", async () => {
    const h = await inputHash("match", { a: 1, b: [2] }, SECRET);
    const token = await sealResume({ product: "match", subject: "u_1", inputHash: h, unlockId: "ul_1", parts: [{ x: "민지 이야기" }] }, SECRET, NOW);
    expect(token).not.toContain("민지");
    expect(await openResume(token, { product: "match", subject: "u_1", inputHash: h }, SECRET, NOW + 1)).toEqual({
      product: "match", subject: "u_1", inputHash: h, unlockId: "ul_1", parts: [{ x: "민지 이야기" }],
    });
  });

  it("binds the input with a keyed, order-independent hash", async () => {
    expect(await inputHash("match", { a: 1, b: 2 }, SECRET)).toBe(await inputHash("match", { b: 2, a: 1 }, SECRET));
    expect(await inputHash("match", { a: 1 }, SECRET)).not.toBe(await inputHash("tarot-deep", { a: 1 }, SECRET));
    expect(await inputHash("match", { a: 1 }, SECRET)).not.toBe(await inputHash("match", { a: 1 }, `${SECRET}x`));
  });

  it("refuses another product, subject or input, a tampered or expired token, and junk", async () => {
    const h = await inputHash("tarot-deep", { q: 1 }, SECRET);
    const token = await sealResume({ product: "tarot-deep", subject: "u_1", inputHash: h, unlockId: null, parts: [] }, SECRET, NOW);
    const expect1 = { product: "tarot-deep" as const, subject: "u_1", inputHash: h };
    expect(await openResume(token, expect1, SECRET, NOW)).not.toBeNull();
    expect(await openResume(token, { ...expect1, product: "match" }, SECRET, NOW)).toBeNull();
    expect(await openResume(token, { ...expect1, subject: "u_2" }, SECRET, NOW)).toBeNull();
    expect(await openResume(token, { ...expect1, inputHash: "other" }, SECRET, NOW)).toBeNull();
    expect(await openResume(tamper(token), expect1, SECRET, NOW)).toBeNull();
    expect(await openResume(tamper(token, token.length - 2), expect1, SECRET, NOW)).toBeNull();
    expect(await openResume(token, expect1, `${SECRET}x`, NOW)).toBeNull();
    expect(await openResume(token, expect1, SECRET, NOW + RESUME_TTL_MS + 1)).toBeNull();
    expect(await openResume(42, expect1, SECRET, NOW)).toBeNull();
    expect(await openResume("x".repeat(200_000), expect1, SECRET, NOW)).toBeNull();
  });
});
