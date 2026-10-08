// No model call. Turns a saved attempt-1 draft into the chapter the app would have stored (same headings,
// same trimming as generateSajuReading, a token signed like the route does) and writes a Playwright
// storage state for http://localhost:3100 holding only that chapter. Title and summary come from the
// tester's earlier chapter of the same chart (capture/state/<nick>-saju.json).
// usage (repo root): VOICE_OUT=<dir> VOICE_NICK=<nick> pnpm exec vitest run --config scripts/voice-real/vitest.config.ts inject.real
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "vitest";
import { SAJU_OBSERVATION_HEADING } from "@/lib/ai/prompts/saju";
import { stripBold } from "@/lib/reading/bold";
import { SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { issueChapter } from "@/lib/security/chapterToken";
import { signingSecret } from "@/lib/security/sign";

test("inject a saved draft as a chapter", async () => {
  const out = process.env.VOICE_OUT!;
  const nick = process.env.VOICE_NICK?.trim() || "doby";
  const stateNick = nick === "doby" ? "도비" : nick;
  const draft = JSON.parse(readFileSync(`${out}/${nick}-saju-attempt1.json`, "utf8")).attempts[0].data;
  const oldState = JSON.parse(readFileSync(`${out}/../capture/state/${stateNick}-saju.json`, "utf8"));
  const oldEntry = oldState.origins.flatMap((o: { localStorage: Array<{ name: string; value: string }> }) => o.localStorage).find((e: { name: string }) => e.name === "starlog.chapters");
  const old = JSON.parse(oldEntry.value).chapters.find((c: { kind: string }) => c.kind === "saju");
  const oldCtx = JSON.parse(Buffer.from(old.chapterToken.split(".")[0], "base64url").toString("utf8")).ctx;

  const g = draft.glance;
  const reading = {
    ...draft,
    sections: draft.sections.map((s: { body: string }, i: number) => ({ heading: SAJU_PROLOGUE_SECTIONS[i]!, body: s.body.trim() })),
    // the observation is plain wherever it is shown (check-in card, history): never bold
    observation: { heading: SAJU_OBSERVATION_HEADING, body: stripBold(draft.observation.body).trim() },
    glance: { goesWell: g.goesWell.trim(), watchOut: g.watchOut.trim(), remedy: g.remedy.trim(), thisYear: g.thisYear.trim(), thisYearAction: g.thisYearAction.trim() },
  };
  const now = Date.now();
  const secret = signingSecret({ ...process.env, NODE_ENV: "development" });
  expect(secret).toBeTruthy();
  const chapterToken = await issueChapter(oldCtx, reading, [], secret!, now);
  const id = `voice${now.toString(36)}`;
  const chapter = { kind: "saju", birth: old.birth, title: old.title, summary: old.summary, reading, chapterToken, id, createdAt: now, turns: [], followUpsLeft: old.followUpsLeft };
  const state = { cookies: [], origins: [{ origin: "http://localhost:3100", localStorage: [{ name: "starlog.chapters", value: JSON.stringify({ v: 1, chapters: [chapter] }) }] }] };
  writeFileSync(`${out}/${nick}-new-state.json`, JSON.stringify(state));
  writeFileSync(`${out}/${nick}-new-chapter-id.txt`, id);
  console.log(`${nick}: chapter ${id} · sections ${reading.sections.length} · title ${old.title}`);
});
