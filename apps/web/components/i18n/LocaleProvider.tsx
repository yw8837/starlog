"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { formatMessage, type MessageValues } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locales";
import type { Namespace } from "@/lib/i18n/messages";
import { lookup } from "@/lib/i18n/shape";
import type { MessageKey, PickedMessages, Translate } from "@/lib/i18n/translate";

interface LocaleState {
  locale: Locale;
  messages: PickedMessages;
}

const LocaleContext = createContext<LocaleState>({ locale: "ko", messages: {} });

/**
 * The page's locale and the namespaces its client components read. A nested provider (a page that
 * needs more namespaces) merges its namespaces over the layout's.
 */
export function LocaleProvider({ locale, messages, children }: { locale: Locale; messages: PickedMessages; children: ReactNode }) {
  const parent = useContext(LocaleContext);
  const value = useMemo(() => ({ locale, messages: { ...parent.messages, ...messages } }), [locale, parent.messages, messages]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = (): Locale => useContext(LocaleContext).locale;

export function useT<N extends Namespace>(ns: N): Translate<N> {
  const { locale, messages } = useContext(LocaleContext);
  const catalog = messages[ns];
  if (catalog === undefined) throw new Error(`Message namespace "${ns}" was not provided to this client tree`);
  return useCallback((key: MessageKey<N>, values?: MessageValues) => formatMessage(lookup(catalog, key) ?? key, values, locale), [catalog, locale]);
}
