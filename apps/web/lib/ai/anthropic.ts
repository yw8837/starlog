import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { GenerationError, type GenerationTask, type ReadingProvider, type Usage } from "./provider";

type BetaMessage = Anthropic.Beta.BetaMessage;
type BetaTextBlockParam = Anthropic.Beta.BetaTextBlockParam;

/**
 * Claude provider: claude-opus-5-5, adaptive thinking, explicit effort, structured JSON output,
 * a cached system prompt, and the server-side refusal fallback (`fallbacks: "default"`).
 */

export const MODEL = "claude-opus-5-5";
/** The `"default"` scalar form of `fallbacks` needs exactly this beta header. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const TIMEOUT_MS = 110_000;

const clients = new Map<string, Anthropic>();

function client(apiKey: string): Anthropic {
  let c = clients.get(apiKey);
  if (!c) {
    c = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
    clients.set(apiKey, c);
  }
  return c;
}

/** The request body; exported so tests can pin its shape without calling the API. */
export function buildRequest<T>(task: GenerationTask<T>, maxTokens: number, feedback?: string[]) {
  const content: BetaTextBlockParam[] = [{ type: "text", text: task.user }];
  if (feedback?.length) {
    content.push({
      type: "text",
      text: `<feedback>\n이전 초안이 아래 검사를 통과하지 못했어요. 모든 규칙을 지키고 아래 항목을 고쳐 처음부터 다시 써 주세요.\n${feedback.map((v) => `- ${v}`).join("\n")}\n</feedback>`,
    });
  }
  return {
    model: MODEL,
    max_tokens: maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: "default" as const,
    thinking: { type: "adaptive" as const },
    output_config: { effort: task.effort, format: betaZodOutputFormat(task.schema) },
    system: [{ type: "text" as const, text: task.system, cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content }],
  };
}

export function anthropicProvider(apiKey: string): ReadingProvider {
  return {
    name: "anthropic",
    async generate<T>(task: GenerationTask<T>, _attempt: number, feedback?: string[]) {
      const usage: Usage[] = [];
      let maxTokens = task.maxTokens;
      for (let call = 0; call < 2; call++) {
        let message: BetaMessage;
        try {
          message = await client(apiKey).beta.messages.create(buildRequest(task, maxTokens, feedback));
        } catch (error) {
          const name = error instanceof Anthropic.APIError ? `${error.name}:${error.status ?? "-"}` : error instanceof Error ? error.name : "unknown";
          throw new GenerationError("UPSTREAM", [name]);
        }
        usage.push(...usageOf(message));
        // Branch on stop_reason before reading content (a refusal can come with empty or partial content).
        if (message.stop_reason === "refusal") throw new GenerationError("REFUSED");
        if (message.stop_reason === "max_tokens") {
          maxTokens *= 2; // thinking counts toward max_tokens; one retry with room to finish
          continue;
        }
        return { data: parseOutput(message, task), usage };
      }
      throw new GenerationError("QUALITY", ["답이 길이 제한에서 잘렸어요. 더 짧게 써 주세요."]);
    },
  };
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
