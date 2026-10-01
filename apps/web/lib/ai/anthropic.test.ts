import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { anthropicProvider, type MessagesClient } from "./anthropic";
import { GenerationError, failureStatus, generateValidated, type GenerationTask } from "./provider";
import { FollowUpAnswerSchema, type FollowUpAnswer } from "./schemas";

type Message = Anthropic.Beta.BetaMessage;

const task = (): GenerationTask<FollowUpAnswer> => ({
  name: "followup", system: "system", user: "user", schema: FollowUpAnswerSchema, effort: "low", maxTokens: 1000,
  mock: () => ({ kind: "clarify", answer: "x" }),
});

const usage = (extra: Partial<Message["usage"]> = {}) => ({
  input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, iterations: null, ...extra,
}) as unknown as Message["usage"];

function message(stop: Message["stop_reason"], text: string | null, extra: Partial<Message> = {}): Message {
  return {
    id: "msg", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: stop, stop_sequence: null,
    content: text === null ? [] : [{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text, citations: null }],
    usage: usage(), ...extra,
  } as unknown as Message;
}

/** An error the fake throws after `message_start` (the model had begun answering: billed). */
class AfterStart extends Error {}

/**
 * A fake SDK stream: replays the script, records max_tokens and signals, emits `message_start` and
 * text snapshots. A plain Error fails before message_start (never billed); AfterStart fails after it.
 */
function fake(script: Array<Message | Error>): MessagesClient & { maxTokens: number[]; signals: Array<AbortSignal | undefined> } {
  const maxTokens: number[] = [];
  const signals: Array<AbortSignal | undefined> = [];
  return {
    maxTokens, signals,
    beta: {
      messages: {
        stream(body, options) {
          maxTokens.push(body.max_tokens);
          signals.push(options?.signal);
          const next = script.shift();
          const text: Array<(delta: string, snapshot: string) => void> = [];
          const events: Array<(event: { type: string }) => void> = [];
          const stream = {
            on(event: string, listener: never) {
              if (event === "text") text.push(listener);
              if (event === "streamEvent") events.push(listener);
              return stream;
            },
            async finalMessage() {
              if (!next) throw new Error("script exhausted");
              if (next instanceof Error && !(next instanceof AfterStart)) throw next;
              for (const l of events) l({ type: "message_start" });
              if (next instanceof Error) throw next;
              const body = next.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
              for (let i = 1; i <= body.length; i += 8) for (const l of text) l(body.slice(i - 1, i + 7), body.slice(0, i + 7));
              return next;
            },
          };
          return stream as unknown as ReturnType<MessagesClient["beta"]["messages"]["stream"]>;
        },
      },
    },
  };
}

const ANSWER = JSON.stringify({ kind: "clarify", answer: "그림 속 노인은 등불을 높이 들었어요." });

describe("anthropic provider response handling (fake SDK)", () => {
  it("parses the text block after the thinking block and reports usage", async () => {
    const sdk = fake([message("end_turn", ANSWER)]);
    const result = await anthropicProvider("key", sdk).generate(task(), 1);
    expect(result.data).toEqual({ kind: "clarify", answer: "그림 속 노인은 등불을 높이 들었어요." });
    expect(result.usage).toEqual([{ model: "claude-opus-5-5", inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 }]);
  });

  it("streams: forwards text snapshots and the abort signal", async () => {
    const sdk = fake([message("end_turn", ANSWER)]);
    const snapshots: string[] = [];
    const controller = new AbortController();
    await anthropicProvider("key", sdk).generate(task(), 1, undefined, { signal: controller.signal, onText: (s) => snapshots.push(s) });
    expect(sdk.signals[0]).toBe(controller.signal);
    expect(snapshots.at(-1)).toBe(ANSWER);
    expect(snapshots.length).toBeGreaterThan(3);
  });

  it("maps an aborted stream to UPSTREAM", async () => {
    const caught = await anthropicProvider("key", fake([new Anthropic.APIUserAbortError()])).generate(task(), 1).catch((e: unknown) => e);
    expect(caught).toMatchObject({ code: "UPSTREAM" });
    expect((caught as GenerationError).detail[0]).toMatch(/APIUserAbortError/);
  });

  it("maps a refusal to REFUSED before reading any content", async () => {
    const sdk = fake([message("refusal", null)]);
    await expect(anthropicProvider("key", sdk).generate(task(), 1)).rejects.toMatchObject({ code: "REFUSED" });
  });

  it("reports billed usage through onUsage for every call, refused and cut-off ones included", async () => {
    const billed: string[] = [];
    const onUsage = (usage: Array<{ model: string }>) => billed.push(...usage.map((u) => u.model));
    await anthropicProvider("key", fake([message("refusal", null)])).generate(task(), 1, undefined, { onUsage }).catch(() => {});
    expect(billed).toHaveLength(1);
    await anthropicProvider("key", fake([message("max_tokens", "{"), message("max_tokens", "{")])).generate(task(), 1, undefined, { onUsage }).catch(() => {});
    expect(billed).toHaveLength(3);
  });

  it("reserves each call's worst case before it starts: prompt and schema overhead at the cache-write price, the whole output budget", async () => {
    const reserved: Array<{ model: string; outputTokens: number; inputTokens: number; cacheWriteTokens: number }> = [];
    const onReserve = (usage: typeof reserved) => reserved.push(...usage);
    await anthropicProvider("key", fake([message("max_tokens", "{"), message("end_turn", ANSWER)])).generate(task(), 1, undefined, { onReserve });
    expect(reserved.map((r) => r.outputTokens)).toEqual([1000, 2000]);
    expect(reserved.every((r) => r.model === "claude-opus-5-5" && r.inputTokens === 0 && r.cacheWriteTokens > 3_000)).toBe(true);
  });

  it("releases the reservation when a call fails before message_start, and keeps it when it fails after", async () => {
    const log: string[] = [];
    const hooks = { onReserve: () => log.push("reserve"), onRelease: () => log.push("release"), onUsage: () => log.push("bill") };
    const overloaded = new Anthropic.APIError(529, { type: "error" }, "overloaded", new Headers());
    await anthropicProvider("key", fake([overloaded])).generate(task(), 1, undefined, hooks).catch(() => {});
    expect(log).toEqual(["reserve", "release"]);
    log.length = 0;
    await anthropicProvider("key", fake([new AfterStart("network lost mid-answer")])).generate(task(), 1, undefined, hooks).catch(() => {});
    expect(log).toEqual(["reserve"]); // billed for an unknown share: the reservation stays
  });

  it("makes no max_tokens re-call when the caller is gone or the budget would run out, and never raises the cap twice", async () => {
    const aborted = new AbortController();
    aborted.abort();
    const gone = fake([message("max_tokens", "{"), message("end_turn", ANSWER)]);
    await expect(anthropicProvider("key", gone).generate(task(), 1, undefined, { signal: aborted.signal })).rejects.toMatchObject({ code: "UPSTREAM" });
    expect(gone.maxTokens).toEqual([1000]);

    const late = fake([message("max_tokens", "{"), message("end_turn", ANSWER)]);
    await expect(anthropicProvider("key", late).generate(task(), 1, undefined, { deadline: Date.now() - 1 })).rejects.toMatchObject({ code: "QUALITY" });
    expect(late.maxTokens).toEqual([1000]);

    const t = task();
    const twice = fake([message("max_tokens", "{"), message("max_tokens", "{"), message("max_tokens", "{")]);
    const provider = anthropicProvider("key", twice);
    await expect(provider.generate(t, 1)).rejects.toMatchObject({ code: "QUALITY" });
    await expect(provider.generate(t, 2, ["고쳐 주세요"])).rejects.toMatchObject({ code: "QUALITY" });
    expect(twice.maxTokens).toEqual([1000, 2000, 2000]); // the regeneration starts raised and stops there, never 4000
  });

  it("retries once with twice the cap on max_tokens, and a regeneration keeps the raised cap", async () => {
    const t = task();
    const sdk = fake([message("max_tokens", '{"kind":"cla'), message("end_turn", ANSWER), message("end_turn", ANSWER)]);
    const provider = anthropicProvider("key", sdk);
    await provider.generate(t, 1);
    await provider.generate(t, 2, ["고쳐 주세요"]);
    expect(sdk.maxTokens).toEqual([1000, 2000, 2000]);
  });

  it("gives up with QUALITY after two max_tokens stops, without asking for shorter text", async () => {
    const sdk = fake([message("max_tokens", "{"), message("max_tokens", "{")]);
    const error = await anthropicProvider("key", sdk).generate(task(), 1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GenerationError);
    expect((error as GenerationError).code).toBe("QUALITY");
    expect((error as GenerationError).detail.join()).not.toContain("짧게");
  });

  it("maps invalid JSON and a schema mismatch to QUALITY", async () => {
    await expect(anthropicProvider("key", fake([message("end_turn", "not json")])).generate(task(), 1)).rejects.toMatchObject({ code: "QUALITY" });
    await expect(anthropicProvider("key", fake([message("end_turn", '{"kind":"other","answer":1}')])).generate(task(), 1)).rejects.toMatchObject({ code: "QUALITY" });
  });

  it("maps SDK errors to UPSTREAM with the error class only", async () => {
    const error = new Anthropic.APIConnectionTimeoutError();
    const caught = await anthropicProvider("key", fake([error])).generate(task(), 1).catch((e: unknown) => e);
    expect(caught).toMatchObject({ code: "UPSTREAM" });
    expect((caught as GenerationError).detail[0]).toMatch(/APIConnectionTimeoutError/);
  });

  it("logs an upstream 403 as UPSTREAM_FORBIDDEN with its class and status, while callers still get UPSTREAM", async () => {
    const lines: string[] = [];
    const info = vi.spyOn(console, "info").mockImplementation((line: unknown) => void lines.push(String(line)));
    try {
      const forbidden = new Anthropic.PermissionDeniedError(403, { type: "error", error: { type: "permission_error", message: "Request not allowed" } }, "Request not allowed", new Headers());
      const provider = anthropicProvider("key", fake([forbidden]));
      const caught = await generateValidated(provider, task(), () => []).catch((e: unknown) => e);
      expect(caught).toMatchObject({ code: "UPSTREAM", detail: ["PermissionDeniedError:403"] });
      const log = JSON.parse(lines.find((l) => l.includes('"evt":"ai.generate"'))!);
      expect(log).toMatchObject({ status: "UPSTREAM_FORBIDDEN", detail: ["PermissionDeniedError:403"] });
      expect(lines.join("")).not.toContain("Request not allowed"); // class and status only, never the message
      expect(failureStatus(new GenerationError("UPSTREAM", ["APIError:403"]))).toBe("UPSTREAM_FORBIDDEN");
      expect(failureStatus(new GenerationError("UPSTREAM", ["InternalServerError:529"]))).toBe("UPSTREAM");
    } finally {
      info.mockRestore();
    }
  });

  it("counts every attempt in usage.iterations, fallback model included", async () => {
    const iterations = [
      { type: "message", model: "claude-opus-5-5", input_tokens: 80, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 70 },
      { type: "fallback_message", model: "claude-opus-5", input_tokens: 90, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    ];
    const sdk = fake([message("end_turn", ANSWER, { model: "claude-opus-5", usage: usage({ iterations } as never) })]);
    const result = await anthropicProvider("key", sdk).generate(task(), 1);
    expect(result.usage.map((u) => [u.model, u.inputTokens, u.outputTokens, u.cacheWriteTokens])).toEqual([
      ["claude-opus-5-5", 80, 0, 70],
      ["claude-opus-5", 90, 40, 0],
    ]);
  });
});
