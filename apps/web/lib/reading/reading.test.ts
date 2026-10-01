import { describe, expect, it, vi } from "vitest";
import { commitQuota, parseApiError, parseStreamLine, postGeneration, postJson, readLines, type ApiError } from "./api";
import { describeApiError, resetLine } from "./errors";
import { RETRY_CAPTION, advanceProgress, progressPlan, startProgress } from "./progress";

const NDJSON = { "Content-Type": "application/x-ndjson; charset=utf-8" };

/** A streamed Response whose body arrives in the given chunks (lines may be split anywhere). */
function streamed(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status, headers: NDJSON });
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("NDJSON stream", () => {
  it("splits lines across chunks, keeps a last line without a newline", async () => {
    const lines: string[] = [];
    const response = streamed(['{"type":"st', 'art"}\n{"type":"section","key":"verdict","index":0}\n\n{"type":"do', 'ne","data":{"a":1}}']);
    await readLines(response.body!, (line) => lines.push(line));
    expect(lines).toEqual(['{"type":"start"}', '{"type":"section","key":"verdict","index":0}', '{"type":"done","data":{"a":1}}']);
  });

  it("parses events and ignores pings, starts and junk", () => {
    expect(parseStreamLine('{"type":"section","key":"cards","index":2}')).toEqual({ type: "section", key: "cards", index: 2 });
    expect(parseStreamLine('{"type":"retry","reason":"quality"}')).toEqual({ type: "retry" });
    expect(parseStreamLine('{"type":"done","data":{"x":1},"commit":"c.1"}')).toEqual({ type: "done", data: { x: 1 }, commit: "c.1" });
    expect(parseStreamLine('{"type":"ping"}')).toEqual({ type: "other" });
    expect(parseStreamLine("not json")).toEqual({ type: "other" });
  });

  it("reports progress and returns the done data with its commit token for the caller", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url === "/api/commit"
        ? jsonResponse({ ok: true })
        : streamed([
            '{"type":"start"}\n{"type":"section","key":"verdict","index":0}\n',
            '{"type":"retry","reason":"quality"}\n{"type":"ping"}\n',
            '{"type":"done","data":{"reading":{"verdict":"v"},"chapterToken":"t"},"commit":"quota.token"}\n',
          ]),
    ) as unknown as typeof fetch;
    const progress: unknown[] = [];
    const result = await postGeneration("/api/tarot/reading", { drawToken: "d" }, { fetchImpl, onProgress: (p) => progress.push(p) });
    // The caller keeps the reading first; the commit is not sent yet.
    expect(result).toEqual({ ok: true, data: { reading: { verdict: "v" }, chapterToken: "t" }, commit: "quota.token" });
    expect(progress).toEqual([{ type: "section", key: "verdict", index: 0 }, { type: "retry" }]);
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]![1].headers.Accept).toContain("application/x-ndjson");
    await commitQuota("quota.token", fetchImpl);
    expect(calls[1]![0]).toBe("/api/commit");
    expect(JSON.parse(calls[1]![1].body)).toEqual({ commit: "quota.token" });
    expect(calls[1]![1].keepalive).toBe(true);
    // A failed commit never throws.
    await expect(commitQuota("x", vi.fn(async () => Promise.reject(new TypeError("offline"))) as unknown as typeof fetch)).resolves.toBeUndefined();
  });

  it("maps an error event to the JSON route's error", async () => {
    const fetchImpl = vi.fn(async () => streamed(['{"type":"start"}\n{"type":"error","status":502,"body":{"code":"QUALITY","message":"m"}}\n'])) as unknown as typeof fetch;
    expect(await postGeneration("/api/saju/reading", {}, { fetchImpl })).toEqual({ ok: false, error: { code: "QUALITY", status: 502, message: "m" } });
  });

  it("treats a stream that ends without done as a network error (nothing spent)", async () => {
    const fetchImpl = vi.fn(async () => streamed(['{"type":"start"}\n{"type":"section","key":"verdict","index":0}\n'])) as unknown as typeof fetch;
    const result = await postGeneration("/api/tarot/reading", {}, { fetchImpl });
    expect(result).toEqual({ ok: false, error: { code: "NETWORK", status: 0 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to plain JSON when the server does not stream", async () => {
    const ok = vi.fn(async () => jsonResponse({ title: "t", summary: "s", lockedToc: [] })) as unknown as typeof fetch;
    expect(await postGeneration("/api/saju/teaser", {}, { fetchImpl: ok })).toEqual({ ok: true, data: { title: "t", summary: "s", lockedToc: [] } });
    const limited = vi.fn(async () => jsonResponse({ code: "BETA_LIMIT", resetsAt: "2026-10-01T15:00:00.000Z" }, 429)) as unknown as typeof fetch;
    expect(await postGeneration("/api/tarot/reading", {}, { fetchImpl: limited })).toEqual({
      ok: false,
      error: { code: "BETA_LIMIT", status: 429, resetsAt: "2026-10-01T15:00:00.000Z" },
    });
  });

  it("turns a failed fetch into a network error", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await postJson("/api/tarot/draw", {}, { fetchImpl: offline })).toEqual({ ok: false, error: { code: "NETWORK", status: 0 } });
  });

  it("reads error extras and maps unknown codes by status", () => {
    expect(parseApiError(429, { code: "BETA_LIMIT", card: { cardId: "major-19-sun", orientation: "upright" }, resetsAt: "x" })).toEqual({
      code: "BETA_LIMIT",
      status: 429,
      card: { cardId: "major-19-sun", orientation: "upright" },
      resetsAt: "x",
    });
    expect(parseApiError(503, { code: "WHO_KNOWS" }).code).toBe("UPSTREAM");
    expect(parseApiError(400, null).code).toBe("BAD_REQUEST");
    expect(parseApiError(422, { code: "REFUSED", care: true, message: "109" })).toMatchObject({ care: true, message: "109" });
  });
});

describe("error copy", () => {
  // 2026-10-01 12:00 KST
  const NOW = Date.parse("2026-10-01T03:00:00.000Z");
  const err = (code: ApiError["code"], extra: Partial<ApiError> = {}): ApiError => ({ code, status: 400, ...extra });

  it("says when the day's count resets", () => {
    expect(resetLine("2026-10-01T15:00:00.000Z", NOW)).toBe("내일 0시에 다시 열려요");
    expect(resetLine(undefined, NOW)).toBe("내일 0시에 다시 열려요");
    expect(resetLine("2026-10-01T09:30:00.000Z", NOW)).toBe("오늘 18시 30분에 다시 열려요");
    expect(resetLine("2026-10-03T15:00:00.000Z", NOW)).toBe("10월 4일 0시에 다시 열려요");
  });

  it("maps every code to friendly copy with one way forward, never the code", () => {
    const views = {
      BETA_LIMIT: describeApiError(err("BETA_LIMIT", { resetsAt: "2026-10-01T15:00:00.000Z" }), "reading", NOW),
      RATE_LIMIT: describeApiError(err("RATE_LIMIT"), "reading", NOW),
      AI_UNAVAILABLE: describeApiError(err("AI_UNAVAILABLE"), "reading", NOW),
      REFUSED: describeApiError(err("REFUSED"), "reading", NOW),
      QUALITY: describeApiError(err("QUALITY"), "reading", NOW),
      UPSTREAM: describeApiError(err("UPSTREAM"), "reading", NOW),
      NETWORK: describeApiError(err("NETWORK"), "reading", NOW),
      BAD_TOKEN: describeApiError(err("BAD_TOKEN"), "reading", NOW),
      BAD_REQUEST: describeApiError(err("BAD_REQUEST"), "reading", NOW),
    };
    expect(views.BETA_LIMIT).toEqual({ title: "오늘 열 수 있는 풀이를 모두 열었어요", body: "내일 0시에 다시 열려요", action: null });
    expect(views.RATE_LIMIT.title).toBe("잠시 후 다시 해 주세요");
    expect(views.AI_UNAVAILABLE).toMatchObject({ title: "풀이를 준비하고 있어요", body: "조금 뒤에 다시 와 주세요.", action: "home" });
    expect(views.QUALITY).toMatchObject({ action: "retry", body: "횟수는 그대로예요. 한 번 더 시도해 주세요." });
    expect(views.UPSTREAM.action).toBe("retry");
    expect(views.NETWORK.action).toBe("retry");
    expect(views.BAD_TOKEN.action).toBe("redraw");
    expect(views.REFUSED.action).toBe("edit");
    for (const [code, view] of Object.entries(views)) expect(`${view.title} ${view.body ?? ""}`).not.toContain(code);
  });

  it("shows the server's calm message for crisis words, with the 109 line", () => {
    const view = describeApiError(err("REFUSED", { care: true, message: "…자살예방상담전화 109에서 언제든 이야기를 들어 줘요." }));
    expect(view.care).toBe(true);
    expect(view.body).toContain("109");
    expect(describeApiError(err("REFUSED", { care: true })).body).toContain("109");
  });

  it("says when the whole network's day count is used up, for any kind of reading", () => {
    for (const context of ["reading", "teaser", "followup", "daily"] as const) {
      const view = describeApiError(err("BETA_LIMIT", { scope: "network", resetsAt: "2026-10-01T15:00:00.000Z" }), context, NOW);
      expect(`${view.title} · ${view.body}`).toBe("같은 네트워크(와이파이·회사·학교)에서 오늘 열 수 있는 횟수를 다 썼어요 · 내일 0시에 다시 열려요");
      expect(view.action).toBeNull();
    }
    expect(parseApiError(429, { code: "BETA_LIMIT", scope: "network" }).scope).toBe("network");
  });

  it("says a teaser limit apart from the full-reading limit, and never mentions a count for a draw", () => {
    expect(describeApiError(err("BETA_LIMIT"), "teaser", NOW)).toEqual({ title: "오늘 볼 수 있는 첫 장을 모두 봤어요", body: "내일 0시에 다시 열려요", action: null });
    expect(describeApiError(err("NETWORK"), "tarot-draw", NOW)).toEqual({ title: "연결이 잠시 끊겼어요", body: "다시 시도해 주세요.", action: "retry" });
    expect(describeApiError(err("UPSTREAM"), "tarot-draw", NOW).body).not.toContain("횟수");
  });

  it("tells a follow-up limit per chapter from the day's", () => {
    expect(describeApiError(err("BETA_LIMIT", { scope: "chapter" }), "followup", NOW)).toEqual({ title: "이 풀이에서 물어볼 수 있는 질문을 모두 썼어요", action: null });
    expect(describeApiError(err("BETA_LIMIT", { scope: "day" }), "followup", NOW).title).toBe("오늘 물어볼 수 있는 질문을 모두 썼어요");
    expect(describeApiError(err("BAD_REQUEST", { field: "date", message: "오늘 이후의 날짜는 고를 수 없어요." })).title).toBe("오늘 이후의 날짜는 고를 수 없어요.");
  });
});

describe("progress captions", () => {
  const positions = ["지금의 나", "필요한 것", "이 시기의 흐름"];

  it("names the section being written, per card position", () => {
    const plan = progressPlan("tarot-reading", { positions });
    let state = startProgress(plan);
    expect(state.caption).toBe("카드를 다시 읽고 있어요");
    state = advanceProgress(state, { type: "section", key: "verdict", index: 0 }, plan);
    expect(state.caption).toBe("한 줄 결론을 적고 있어요");
    state = advanceProgress(state, { type: "section", key: "cards", index: 1 }, plan);
    expect(state.caption).toBe("필요한 것 카드를 읽고 있어요");
    expect(state.fraction).toBeGreaterThan(0);
    expect(state.fraction).toBeLessThan(1);
    state = advanceProgress(state, { type: "section", key: "timing", index: 0 }, plan);
    expect(state.caption).toBe("시기를 살피고 있어요");
  });

  it("says it is polishing on a retry, and never moves backwards", () => {
    const plan = progressPlan("tarot-reading", { positions });
    let state = advanceProgress(startProgress(plan), { type: "section", key: "timing", index: 0 }, plan);
    const before = state.fraction;
    state = advanceProgress(state, { type: "retry" }, plan);
    expect(state.caption).toBe(RETRY_CAPTION);
    state = advanceProgress(state, { type: "section", key: "verdict", index: 0 }, plan);
    expect(state.caption).toBe(RETRY_CAPTION);
    expect(state.fraction).toBe(before);
    // Unknown keys keep the place too.
    expect(advanceProgress(state, { type: "section", key: "story", index: 0 }, plan)).toBe(state);
  });

  it("follows the order the model writes the reading in (the observation comes after the action)", () => {
    const keys = progressPlan("tarot-reading", { positions }).stages.map((stage) => stage.key);
    expect(keys.indexOf("observation")).toBe(keys.indexOf("action") + 1);
  });

  it("uses the saju section names with the right particle", () => {
    const plan = progressPlan("saju-reading", { sections: ["월령과 뿌리 · 태어난 계절", "지금의 10년 · 대운의 흐름", "오행 지도 · 많은 기운"] });
    const captions = plan.stages.map((s) => s.caption);
    expect(captions).toContain("월령과 뿌리를 적고 있어요");
    expect(captions).toContain("지금의 10년을 적고 있어요");
    expect(captions).toContain("오행 지도를 적고 있어요");
  });
});
