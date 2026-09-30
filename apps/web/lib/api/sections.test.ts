import { describe, expect, it } from "vitest";
import { SectionScanner } from "./sections";

const reading = JSON.stringify({
  verdict: "먼저 보내도 괜찮아요. \"한 줄\"이면 돼요, {괄호}도 [대괄호]도 문자열 안이에요.",
  cards: [{ position: "나의 마음", cardId: "a", heading: "h", body: "b" }, { position: "두 사람 사이", cardId: "b", heading: "h", body: "b" }],
  connection: { heading: "h", body: "b" },
  followUps: ["q1", "q2"],
});

describe("section scanner", () => {
  it("reports each top-level key once, one event per array element, never any text", () => {
    const events = new SectionScanner().push(reading);
    expect(events).toEqual([
      { key: "verdict", index: 0 },
      { key: "cards", index: 0 },
      { key: "cards", index: 1 },
      { key: "connection", index: 0 },
      { key: "followUps", index: 0 },
      { key: "followUps", index: 1 },
    ]);
  });

  it("works on partial JSON fed in chunks, including a key split across chunks", () => {
    const scanner = new SectionScanner();
    const events = [];
    for (let end = 1; end <= reading.length; end += 7) events.push(...scanner.push(reading.slice(0, end)));
    events.push(...scanner.push(reading));
    expect(events.map((e) => `${e.key}#${e.index}`)).toEqual(["verdict#0", "cards#0", "cards#1", "connection#0", "followUps#0", "followUps#1"]);
    // nothing new on a repeated snapshot
    expect(scanner.push(reading)).toEqual([]);
  });

  it("does not report a key until its value starts, and ignores nested keys", () => {
    const scanner = new SectionScanner();
    expect(scanner.push('{"verdict"')).toEqual([]);
    expect(scanner.push('{"verdict": ')).toEqual([]);
    expect(scanner.push('{"verdict": "x", "connection": {"heading": "h"')).toEqual([{ key: "verdict", index: 0 }, { key: "connection", index: 0 }]);
  });

  it("starts over after reset or a shorter snapshot (a regeneration)", () => {
    const scanner = new SectionScanner();
    scanner.push(reading);
    scanner.reset();
    expect(scanner.push('{"verdict": "a"')).toEqual([{ key: "verdict", index: 0 }]);
    expect(scanner.push('{"ver')).toEqual([]);
    expect(scanner.push('{"verdict": "b", "cards": [{')).toEqual([{ key: "verdict", index: 0 }, { key: "cards", index: 0 }]);
  });
});
