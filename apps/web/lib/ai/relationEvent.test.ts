import { readFileSync, readdirSync } from "node:fs";
import { computeChart } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_SAJU_FORM, toSajuInput } from "@/lib/sajuForm";
import { buildFactSet } from "./prompts/saju";
import { allowedFactViolations, relationEventSentences, sentences } from "./validate";

/**
 * 합·충·형·파·해 read as an event (spec 2026-11-11, 정통 사주에 충·합 … 안: "검증기 추가"): until now only the prompt said so
 * (prompts/saju.ts "사건(이별, 사고, 이사)으로 읽지 않아요"); the validator now fails such a sentence in every saju reading it checks.
 */

const allowed = buildFactSet(computeChart(toSajuInput(DEFAULT_SAJU_FORM)), Date.parse("2026-11-11T12:00:00+09:00")).allowed;
const violations = (text: string) => {
  const out: string[] = [];
  allowedFactViolations(text, allowed, out);
  return out.filter((line) => line.includes("관계를 사건으로"));
};

const EVENT_READINGS = [
  "충이 있어서 올해 이별수가 있어요.",
  "일지와 월지가 충이라서 이사를 하게 돼요.",
  "충 때문에 사고를 조심하세요.",
  "세운이 일지와 충을 이루니 다툼이 생길 수 있어요.",
  "합이 들어오면 결혼할 수 있어요.",
  "육합이 있어서 재회할 거예요.",
  "형(刑)이 있으니 수술을 조심하세요.",
  "해(害)가 있으면 구설이 생겨요.",
  "삼합으로 인해 이직하게 될 거예요.",
  "충(沖) 탓에 헤어질 수 있어요.",
];

const COMPLIANT = [
  "합·충은 사건으로 읽지 않고, 실제로 묶이는지도 따지지 않았어요.",
  "충이 있다고 해서 이별이나 이사를 뜻하지는 않아요.",
  "올해 들어오는 세운이 일지와 충을 이루지만, 이사나 이별 같은 일을 예고하지 않아요.",
  "정면으로 맞서는 배치(충)가 있어서, 마음이 두 갈래로 나뉘는 장면이 떠오를 수 있어요.",
  "묶이려는 짝(육합)처럼 가까운 사람과 일을 나누고 싶은 마음이 커지는 해예요.",
  "이사 같은 큰 결정과는 상관없어요.",
  "해가 바뀌면 이사를 생각하는 분이 많아요.",
  "올해는 이직보다 지금 자리에서 손에 익은 일을 다듬어 보세요.",
  "충분히 쉬고 나서 이사를 정해도 늦지 않아요.",
  "합격 소식을 기다리는 동안 생활 리듬부터 지켜 보세요.",
];

describe("relation read as an event", () => {
  it.each(EVENT_READINGS)("fails: %s", (sentence) => {
    expect(relationEventSentences(sentence)).toEqual([sentence]);
    expect(violations(sentence)).toHaveLength(1);
  });

  it.each(COMPLIANT)("passes: %s", (sentence) => {
    expect(relationEventSentences(sentence)).toEqual([]);
    expect(violations(sentence)).toEqual([]);
  });

  it("names the sentences, so a retry knows what to change", () => {
    const out: string[] = [];
    allowedFactViolations(`${COMPLIANT[0]} ${EVENT_READINGS[0]}`, allowed, out);
    expect(out.find((line) => line.includes("관계를 사건으로"))).toContain(EVENT_READINGS[0]);
  });

  it("no sentence in the samples and golden sets that passed before fails now", () => {
    const root = new URL("../../../../content/", import.meta.url);
    const files = [
      new URL("samples/saju-prologue.ko.json", root),
      ...readdirSync(new URL("samples/premium/", root)).map((f) => new URL(`samples/premium/${f}`, root)),
      new URL("eval/premium/golden.json", root),
      new URL("eval/saju-topics/golden.json", root),
    ];
    const strings: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === "string") strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    for (const file of files) walk(JSON.parse(readFileSync(file, "utf8")));
    expect(strings.length).toBeGreaterThan(100);
    expect(strings.flatMap((s) => relationEventSentences(s))).toEqual([]);
    // the patterns are really there to be met: relation names occur in those texts
    expect(strings.flatMap(sentences).filter((s) => /(?<![가-힣])(?:충|합|육합|삼합|방합|천간합)(?:\(|이|은|을|과|와|\s)/.test(s)).length).toBeGreaterThan(0);
  });
});
