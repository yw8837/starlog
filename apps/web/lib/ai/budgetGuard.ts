import { usdOf } from "./cost";
import type { GenerationHooks, ReadingProvider, Usage } from "./provider";

/**
 * A spending cap for runs against the real API (scripts/premium-smoke.test.ts; review 2026-10-17 #2). Every upstream
 * call is checked before it starts: an attempt (a regeneration included) and the provider's own second call with twice
 * the room after max_tokens (hooks.onReserve). Every billed usage counts once: through hooks.onUsage, which the real
 * provider calls even for a call it then refuses or cuts off, or else from what the call returns (the mock reports
 * nothing through the hooks).
 */

export interface Budget {
  limitKrw: number;
  spentKrw: number;
  /** why calls stopped, or null while they may go on */
  stopped: string | null;
  /** the dearest single upstream call seen per slot (KRW), so the check outgrows an estimate the run proves low */
  dearest: Map<string, number>;
}

export const newBudget = (limitKrw: number): Budget => ({ limitKrw, spentKrw: 0, stopped: null, dearest: new Map() });

export class BudgetStop extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetStop";
  }
}

export interface Slot {
  /** calls of one kind share it (`product:kind`) */
  slot: string;
  /** spec §11's estimate of one call of this kind */
  estimateKrw: number;
  /** KRW per USD */
  fx: number;
  /** names the call in the stop message */
  label: string;
}

/** Wraps `real` for one call: what it billed, how many attempts it took, and the findings a regeneration was asked to fix. */
export function budgeted(real: ReadingProvider, budget: Budget, { slot, estimateKrw, fx, label }: Slot) {
  const usage: Usage[] = [];
  let attempts = 0;
  let regenerated: string[] = [];

  const check = (when: string) => {
    const estimate = Math.max(estimateKrw, budget.dearest.get(slot) ?? 0);
    if (budget.stopped === null && budget.spentKrw + estimate <= budget.limitKrw) return;
    budget.stopped ??= `${label} ${when} 전: 지금까지 ${Math.round(budget.spentKrw)}원 + 이번 추정 ${estimate}원 > 예산 ${budget.limitKrw}원`;
    throw new BudgetStop(budget.stopped);
  };
  const count = (billed: Usage[]) => {
    if (billed.length === 0) return;
    const krw = usdOf(billed) * fx;
    budget.spentKrw += krw;
    budget.dearest.set(slot, Math.max(budget.dearest.get(slot) ?? 0, Math.ceil(krw)));
    usage.push(...billed);
  };

  const provider: ReadingProvider = {
    name: real.name,
    async generate(task, attempt, feedback, hooks: GenerationHooks = {}) {
      check(`시도 ${attempt}`);
      attempts++;
      if (attempt > 1 && feedback) regenerated = feedback;
      let reported = false;
      let calls = 0;
      const watched: GenerationHooks = {
        ...hooks,
        onReserve: (worst) => {
          if (calls++ > 0) check(`시도 ${attempt}의 다시 호출`);
          hooks.onReserve?.(worst);
        },
        onUsage: (billed) => {
          reported = true;
          count(billed);
          hooks.onUsage?.(billed);
        },
      };
      const result = await real.generate(task, attempt, feedback, watched);
      if (!reported) count(result.usage);
      return result;
    },
  };
  return { provider, usage, attempts: () => attempts, regenerated: () => regenerated };
}
