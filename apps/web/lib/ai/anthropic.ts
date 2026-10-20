import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { ServiceBinding } from "@/lib/cloudflare";
import { DEFAULT_MODEL } from "./config";
import { GenerationError, type GenerationHooks, type GenerationTask, type ReadingProvider, type Usage } from "./provider";

type BetaMessage = Anthropic.Beta.BetaMessage;
type BetaTextBlockParam = Anthropic.Beta.BetaTextBlockParam;

/**
 * Claude provider: claude-opus-5-5 by default or claude-sonnet-5-5 (lib/ai/config.ts), adaptive
 * thinking, explicit effort, structured JSON output, a cached system prompt, and the server-side
 * refusal fallback (`fallbacks: "default"`; both models take it on the Claude API with the
 * -2026-07-01 header). Every call streams (`beta.messages.stream` + `finalMessage()`), so a long
 * reading never hits an HTTP timeout; the caller's AbortSignal cancels it upstream.
 */

export const MODEL = DEFAULT_MODEL;
/** The `"default"` scalar form of `fallbacks` needs exactly this beta header. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** Matches the routes' overall generation budget (lib/api/stream.ts). */
export const TIMEOUT_MS = 240_000;

const clients = new Map<string, Anthropic>();

function client(apiKey: string): Anthropic {
  let c = clients.get(apiKey);
  if (!c) {
    c = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
    clients.set(apiKey, c);
  }
  return c;
}

/**
 * The SDK's fetch through the starlog-ai Worker (ai-proxy/worker.mjs, near the API, holding the key): the same URL, method, body and AbortSignal (so streaming, cancelling
 * and usage work as before), minus the x-api-key header; the proxy adds the real key.
 */
export function proxyFetch(proxy: ServiceBinding) {
  return (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.delete("x-api-key");
    return proxy.fetch(input, { ...init, headers });
  };
}

/** The SDK insists on a key; proxyFetch drops this one before the call leaves the Worker. */
const KEY_SET_BY_PROXY = "set-by-starlog-ai";
const proxyClients = new WeakMap<ServiceBinding, Anthropic>();

export function proxyClient(proxy: ServiceBinding): Anthropic {
  let c = proxyClients.get(proxy);
  if (!c) {
    c = new Anthropic({ apiKey: KEY_SET_BY_PROXY, timeout: TIMEOUT_MS, maxRetries: 1, fetch: proxyFetch(proxy) });
    proxyClients.set(proxy, c);
  }
  return c;
}

/** The production provider: the same calls, sent through the starlog-ai Worker (service binding AI_PROXY). */
export function anthropicProxyProvider(proxy: ServiceBinding): ReadingProvider {
  return anthropicProvider(KEY_SET_BY_PROXY, proxyClient(proxy));
}

/** The request body; exported so tests can pin its shape without calling the API. */
export function buildRequest<T>(task: GenerationTask<T>, maxTokens: number, feedback?: string[]) {
  const content: BetaTextBlockParam[] = [
    // Cached: the next part of the same reading starts with the same block (P5 spec §6.2).
    ...(task.shared ? [{ type: "text" as const, text: task.shared, cache_control: { type: "ephemeral" as const } }] : []),
    { type: "text", text: task.user },
  ];
  if (feedback?.length) {
    content.push({
      type: "text",
      text: `<feedback>\n이전 초안이 아래 검사를 통과하지 못했어요. 모든 규칙을 지키고 아래 항목을 고쳐 처음부터 다시 써 주세요.\n${feedback.map((v) => `- ${v}`).join("\n")}\n</feedback>`,
    });
  }
  return {
    model: task.model ?? DEFAULT_MODEL,
    max_tokens: maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: "default" as const,
    // "summarized" streams the thinking as it goes. The default on this model is "omitted", which leaves the stream silent
    // while it thinks; real calls whose silence ran past about 150 s were cut (2026-10-08 to 10-13). Billing is the same.
    thinking: { type: "adaptive" as const, display: "summarized" as const },
    output_config: { effort: task.effort, format: betaZodOutputFormat(task.schema) },
    system: [{ type: "text" as const, text: task.system, cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content }],
  };
}

/** What the provider uses of an SDK message stream. */
export interface MessageStreamLike {
  on(event: "text", listener: (delta: string, snapshot: string) => void): unknown;
  /** every raw event; `message_start` means the model began answering (billing has started) */
  on(event: "streamEvent", listener: (event: { type: string }) => void): unknown;
  finalMessage(): Promise<BetaMessage>;
}

/** The one SDK call the provider makes; tests pass a fake with the same shape. */
export interface MessagesClient {
  beta: { messages: { stream(body: ReturnType<typeof buildRequest>, options?: { signal?: AbortSignal }): MessageStreamLike } };
}

/** A max_tokens cap raised for a task stays raised for its regeneration (same task object), never past 2×. */
const raisedCaps = new WeakMap<object, number>();

const OUTPUT_CUT_OFF = "출력이 중간에 끊겼어요. 분량 목표는 그대로 지키면서 JSON을 끝까지 완성해 주세요.";

export function anthropicProvider(apiKey: string, sdk: MessagesClient = client(apiKey)): ReadingProvider {
  return {
    name: "anthropic",
    async generate<T>(task: GenerationTask<T>, _attempt: number, feedback?: string[], hooks: GenerationHooks = {}) {
      const usage: Usage[] = [];
      let maxTokens = raisedCaps.get(task) ?? task.maxTokens;
      for (let call = 0; call < 2; call++) {
        let message: BetaMessage;
        const body = buildRequest(task, maxTokens, feedback);
        const started = Date.now();
        let answering = false;
        // Reserved until the call reports its usage. A call that fails before message_start was never
        // billed and releases it; one cut off after it (disconnect, budget) keeps it.
        hooks.onReserve?.([worstCase(body)]);
        try {
          const stream = sdk.beta.messages.stream(body, hooks.signal ? { signal: hooks.signal } : undefined);
          stream.on("streamEvent", (event) => {
            if (event.type === "message_start") answering = true;
          });
          if (hooks.onText) stream.on("text", (_delta, snapshot) => hooks.onText!(snapshot));
          message = await stream.finalMessage();
        } catch (error) {
          if (!answering) hooks.onRelease?.();
          // The class name only (SDK errors keep name "Error"); never the message, which may echo the request.
          const kind = error instanceof Error ? error.constructor.name : "unknown";
          const name = error instanceof Anthropic.APIError ? `${kind}:${error.status ?? "-"}` : kind;
          throw new GenerationError("UPSTREAM", [name]);
        }
        const billed = usageOf(message);
        usage.push(...billed);
        hooks.onUsage?.(billed); // billed even if the draft below is refused, cut off or malformed
        // Branch on stop_reason before reading content (a refusal can come with empty or partial content).
        if (message.stop_reason === "refusal") throw new GenerationError("REFUSED");
        if (message.stop_reason === "max_tokens") {
          // Thinking counts toward max_tokens: one more call with twice the room, but only once per
          // task, only while the caller is still there, and only when it can finish in time.
          if (hooks.signal?.aborted) throw new GenerationError("UPSTREAM", ["aborted"]);
          const tooLate = hooks.deadline !== undefined && Date.now() + (Date.now() - started) > hooks.deadline;
          if (maxTokens >= task.maxTokens * 2 || tooLate) break;
          maxTokens = task.maxTokens * 2;
          raisedCaps.set(task, maxTokens);
          continue;
        }
        return { data: parseOutput(message, task), usage };
      }
      // Not "write shorter": the length targets still hold; the JSON just has to be finished.
      throw new GenerationError("QUALITY", [OUTPUT_CUT_OFF]);
    },
  };
}

/** Tokens the request carries besides our text: the output schema and the API's own framing. */
const REQUEST_OVERHEAD_TOKENS = 3_000;

/**
 * An upper bound on what one call can bill: every prompt character plus a fixed overhead as tokens
 * written to the cache (1.25× the input price; Korean runs at about one token per character or less),
 * and the whole output budget.
 */
export function worstCase(body: ReturnType<typeof buildRequest>): Usage {
  const promptChars = body.system.reduce((n, block) => n + block.text.length, 0)
    + body.messages.reduce((n, m) => n + m.content.reduce((k, block) => k + block.text.length, 0), 0);
  return { model: body.model, inputTokens: 0, outputTokens: body.max_tokens, cacheReadTokens: 0, cacheWriteTokens: promptChars + REQUEST_OVERHEAD_TOKENS };
}

function parseOutput<T>(message: BetaMessage, task: GenerationTask<T>): T {
  const text = message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new GenerationError("QUALITY", ["출력이 JSON이 아니었어요"]);
  }
  const parsed = task.schema.safeParse(json);
  if (!parsed.success) {
    const paths = parsed.error.issues.slice(0, 5).map((issue) => issue.path.join(".") || "(root)");
    throw new GenerationError("QUALITY", [`출력 JSON이 스키마와 맞지 않아요: ${paths.join(", ")}`]);
  }
  return parsed.data;
}

/** Token usage per attempt; `iterations` (when present) also lists declined and fallback attempts. */
function usageOf(message: BetaMessage): Usage[] {
  const u = message.usage;
  const iterations = (u.iterations ?? []).filter((it) => it.type === "message" || it.type === "fallback_message");
  if (iterations.length > 0) {
    return iterations.map((it) => ({
      model: ("model" in it && it.model) || message.model,
      inputTokens: it.input_tokens,
      outputTokens: it.output_tokens,
      cacheReadTokens: it.cache_read_input_tokens ?? 0,
      cacheWriteTokens: it.cache_creation_input_tokens ?? 0,
    }));
  }
  return [{
    model: message.model,
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  }];
}
