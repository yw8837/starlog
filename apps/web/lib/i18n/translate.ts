import { formatMessage, type MessageValues } from "./format";
import type { Locale } from "./locales";
import { MESSAGES, type KoCatalog, type Namespace } from "./messages";
import { lookup, type Leaves } from "./shape";

export type MessageKey<N extends Namespace> = Leaves<KoCatalog[N]>;
export type Translate<N extends Namespace> = (key: MessageKey<N>, values?: MessageValues) => string;
export type PickedMessages = Partial<Record<Namespace, unknown>>;

/** t() for one namespace. A key missing from a locale falls back to Korean (types make that unreachable). */
export function translator<N extends Namespace>(locale: Locale, ns: N): Translate<N> {
  const catalog = MESSAGES[locale][ns];
  const fallback = MESSAGES.ko[ns];
  return (key, values) => {
    const own = lookup(catalog, key);
    return formatMessage(own ?? lookup(fallback, key) ?? key, values, own === undefined ? "ko" : locale);
  };
}

/** The namespaces a client subtree needs, for one locale only (what a page hands to LocaleProvider). */
export function pickMessages(locale: Locale, namespaces: readonly Namespace[]): PickedMessages {
  return Object.fromEntries(namespaces.map((ns) => [ns, MESSAGES[locale][ns]]));
}
