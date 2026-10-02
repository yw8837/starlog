"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { localizeHref, splitLocale } from "@/lib/i18n/paths";
import { useLocale } from "./LocaleProvider";

type Router = ReturnType<typeof useRouter>;

/** useRouter() whose push, replace and prefetch keep the page's locale. */
export function useLocaleRouter(): Router {
  const router = useRouter();
  const locale = useLocale();
  return useMemo<Router>(
    () => ({
      ...router,
      push: (href, options) => router.push(localizeHref(locale, href), options),
      replace: (href, options) => router.replace(localizeHref(locale, href), options),
      prefetch: (href, options) => router.prefetch(localizeHref(locale, href), options),
    }),
    [router, locale],
  );
}

/** usePathname() without the locale prefix, for code that compares paths ("/tarot/draw"). */
export function useBarePathname(): string {
  return splitLocale(usePathname() ?? "/").path;
}
