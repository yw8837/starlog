import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { anthropicProvider, type MessagesClient } from "./anthropic";
import { GenerationError, type GenerationTask } from "./provider";
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

/** A fake SDK that answers from a script and records the requested max_tokens. */
function fake(script: Array<Message | Error>): MessagesClient & { maxTokens: number[] } {
  const maxTokens: number[] = [];
  return {
    maxTokens,
    beta: {
      messages: {
        async create(body) {
          maxTokens.push(body.max_tokens);
          const next = script.shift();
          if (!next) throw new Error("script exhausted");
          if (next instanceof Error) throw next;
          return next;
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

  it("maps a refusal to REFUSED before reading any content", async () => {
    const sdk = fake([message("refusal", null)]);
    await expect(anthropicProvider("key", sdk).generate(task(), 1)).rejects.toMatchObject({ code: "REFUSED" });
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
