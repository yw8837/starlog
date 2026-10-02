import type { Locale } from "../locales";
import type { Shape } from "../shape";
import enCommon from "./en/common.json";
import jaCommon from "./ja/common.json";
import koCommon from "./ko/common.json";
import zhHantCommon from "./zh-hant/common.json";

/**
 * Every catalog, every locale (server side and tests only: a client file that imports this ships all
 * four languages; clientImports.test.ts forbids it). Korean defines the keys; `satisfies` fails the
 * typecheck when a locale misses one, and parity.test.ts catches extra keys and broken placeholders.
 */
const ko = { common: koCommon };
export type KoCatalog = typeof ko;
export type Namespace = keyof KoCatalog;
export const NAMESPACES = Object.keys(ko) as Namespace[];

type Catalog = { readonly [N in Namespace]: Shape<KoCatalog[N]> };

export const MESSAGES: Readonly<Record<Locale, Catalog>> = {
  ko,
  en: { common: enCommon satisfies Shape<typeof koCommon> },
  ja: { common: jaCommon satisfies Shape<typeof koCommon> },
  "zh-hant": { common: zhHantCommon satisfies Shape<typeof koCommon> },
};
