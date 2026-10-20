import type { MessageValues } from "./format";
import type { Locale } from "./locales";
import { MESSAGES, type KoCatalog, type Namespace } from "./messages";
import type { Leaves } from "./shape";

export type MessageKey<N extends Namespace> = Leaves<KoCatalog[N]>;
export type Translate<N extends Namespace> = (key: MessageKey<N>, values?: MessageValues) => string;
export type PickedMessages = Partial<Record<Namespace, unknown>>;

/** The namespaces a client subtree needs, for one locale only (what a page hands to LocaleProvider). */
export function pickMessages(locale: Locale, namespaces: readonly Namespace[]): PickedMessages {
  return Object.fromEntries(namespaces.map((ns) => [ns, MESSAGES[locale][ns]]));
}
