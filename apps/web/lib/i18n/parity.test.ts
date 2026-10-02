import { describe, expect, it } from "vitest";
import { argumentNames, hasJosa, parseMessage } from "./format";
import { LOCALES } from "./locales";
import { MESSAGES, NAMESPACES } from "./messages";

function leaves(node: unknown, prefix = ""): Array<[string, string]> {
  if (typeof node === "string") return [[prefix, node]];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => leaves(value, prefix ? `${prefix}.${key}` : key));
}
const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/;

describe.each(NAMESPACES)("messages: %s", (ns) => {
  const ko = new Map(leaves(MESSAGES.ko[ns]));

  it.each(LOCALES.filter((l) => l !== "ko"))("%s has exactly the Korean keys", (locale) => {
    expect([...new Map(leaves(MESSAGES[locale][ns])).keys()].sort()).toEqual([...ko.keys()].sort());
  });

  it.each(LOCALES)("%s parses, keeps the Korean argument names, has no empty values", (locale) => {
    for (const [key, value] of leaves(MESSAGES[locale][ns])) {
      const where = `${locale} ${ns}.${key}`;
      expect(value.trim(), where).not.toBe("");
      const nodes = parseMessage(value);
      expect(argumentNames(nodes), where).toEqual(argumentNames(parseMessage(ko.get(key) ?? "")));
      if (locale !== "ko") {
        expect(hasJosa(nodes), `${where} uses josa`).toBe(false);
        expect(HANGUL.test(value), `${where} contains Hangul`).toBe(false);
      }
    }
  });
});
