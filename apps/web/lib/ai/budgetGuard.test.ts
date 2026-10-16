import { describe, expect, it } from "vitest";
import { z } from "zod";
import { budgeted, newBudget } from "./budgetGuard";
import { GenerationError, type GenerationHooks, type GenerationTask, type ReadingProvider, type Usage } from "./provider";

/**
 * The eval harness's budget (scripts/premium-smoke.test.ts, review 2026-10-17 #2): every billed usage counts once,
 * including a call the provider then refuses or cuts off (it reports through hooks.onUsage before throwing), and every
 * upstream call is checked before it starts, the provider's own second call with twice the room included.
 */

const FX = 1500;
/** 10,000 output tokens on Opus: $0.20 = 300원. */
const BILL: Usage[] = [{ model: "claude-opus-5-5", inputTokens: 0, outputTokens: 10_000, cacheReadTokens: 0, cacheWriteTokens: 0 }];
const task = { name: "match-part", system: "", user: "", schema: z.object({ a: z.string() }), effort: "medium", maxTokens: 100, mock: () => ({ a: "x" }) } as unknown as GenerationTask<{ a: string }>;

const provider = (run: (hooks: GenerationHooks) => Promise<{ data: unknown; usage: Usage[] }>): ReadingProvider => ({
  name: "mock",
  generate: (_task, _attempt, _feedback, hooks = {}) => run(hooks) as never,
});

describe("the eval budget", () => {
  it("counts what a refused or cut-off call billed (reported through the hooks before it throws)", async () => {
    const budget = newBudget(5000);
    const rec = budgeted(provider(async (hooks) => {
      hooks.onReserve?.(BILL);
      hooks.onUsage?.(BILL);
      throw new GenerationError("REFUSED");
    }), budget, { slot: "match:part", estimateKrw: 100, fx: FX, label: "M1 part0" });
    await expect(rec.provider.generate(task, 1)).rejects.toThrow("REFUSED");
    expect(Math.round(budget.spentKrw)).toBe(300);
    expect(rec.usage).toEqual(BILL);
  });

  it("checks the provider's own second call (twice the room after max_tokens) before it starts", async () => {
    const budget = newBudget(500);
    let second = false;
    const rec = budgeted(provider(async (hooks) => {
      hooks.onReserve?.(BILL);
      hooks.onUsage?.(BILL); // 300원 spent; the estimate grows to what one call cost
      hooks.onReserve?.(BILL); // 300 + 300 > 500: stopped here
      second = true;
      return { data: { a: "x" }, usage: [...BILL, ...BILL] };
    }), budget, { slot: "match:part", estimateKrw: 100, fx: FX, label: "M1 part0" });
    await expect(rec.provider.generate(task, 1)).rejects.toThrow(/예산/);
    expect(second).toBe(false);
    expect(budget.stopped).toMatch(/M1 part0/);
    expect(Math.round(budget.spentKrw)).toBe(300);
  });

  it("never counts a usage twice: reported through the hooks and returned again", async () => {
    const budget = newBudget(5000);
    const rec = budgeted(provider(async (hooks) => {
      hooks.onReserve?.(BILL);
      hooks.onUsage?.(BILL);
      return { data: { a: "x" }, usage: BILL };
    }), budget, { slot: "match:part", estimateKrw: 100, fx: FX, label: "M1 part0" });
    await rec.provider.generate(task, 1);
    expect(Math.round(budget.spentKrw)).toBe(300);
    expect(rec.usage).toEqual(BILL);
  });

  it("counts the returned usage of a provider that reports none through the hooks (the mock)", async () => {
    const budget = newBudget(5000);
    const rec = budgeted(provider(async () => ({ data: { a: "x" }, usage: BILL })), budget, { slot: "match:part", estimateKrw: 100, fx: FX, label: "M1 part0" });
    await rec.provider.generate(task, 1);
    expect(Math.round(budget.spentKrw)).toBe(300);
  });

  it("stops before an attempt whose estimate would pass the budget, calling nothing, and stays stopped", async () => {
    const budget = newBudget(50);
    let called = false;
    const rec = budgeted(provider(async () => {
      called = true;
      return { data: { a: "x" }, usage: [] };
    }), budget, { slot: "match:part", estimateKrw: 100, fx: FX, label: "M1 part0" });
    await expect(rec.provider.generate(task, 1)).rejects.toThrow(/예산/);
    expect(called).toBe(false);
    expect(budget.stopped).not.toBeNull();
  });
});
