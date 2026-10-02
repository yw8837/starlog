import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, LOCALE_INFO, isLocale, previewLocales, publicLocales, routedLocales } from "./locales";

describe("locales", () => {
  it("puts Korean first as the default, then en, ja, zh-hant", () => {
    expect(LOCALES).toEqual(["ko", "en", "ja", "zh-hant"]);
    expect(DEFAULT_LOCALE).toBe("ko");
  });

  it("tags Traditional Chinese with its script and spells the owner's chip row", () => {
    expect(LOCALE_INFO["zh-hant"].tag).toBe("zh-Hant");
    expect(LOCALE_INFO["zh-hant"].intl).toBe("zh-Hant-TW");
    expect(LOCALES.map((l) => LOCALE_INFO[l].chip).join(" · ")).toBe("KO · EN · JA · 繁中");
    expect(LOCALES.map((l) => LOCALE_INFO[l].endonym)).toEqual(["한국어", "English", "日本語", "繁體中文"]);
  });

  it("recognises exactly the four URL codes", () => {
    expect(isLocale("ja")).toBe(true);
    for (const value of ["JA", "zh-Hant", "zh", "fr", "", undefined, 3]) expect(isLocale(value)).toBe(false);
  });

  it("always keeps Korean public and ignores unknown, repeated or upper-case codes", () => {
    expect(publicLocales(undefined)).toEqual(["ko"]);
    expect(publicLocales("ja, fr ,ja,EN")).toEqual(["ko", "en", "ja"]);
  });

  it("previews only locales that are not public, and routes both in LOCALES order", () => {
    expect(previewLocales("zh-hant,ja", ["ko", "ja"])).toEqual(["zh-hant"]);
    expect(routedLocales(["ko", "ja"], ["zh-hant"])).toEqual(["ko", "ja", "zh-hant"]);
  });
});
