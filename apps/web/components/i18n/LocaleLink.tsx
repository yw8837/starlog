"use client";

import NextLink from "next/link";
import type { ComponentPropsWithRef } from "react";
import { localizeHref } from "@/lib/i18n/paths";
import { useLocale } from "./LocaleProvider";

/**
 * next/link with the page's locale prefix (spec §4.2). Task 21's codemod points every
 * `import Link from "next/link"` here; Korean hrefs come out unchanged.
 */
export default function LocaleLink({ href, ...rest }: ComponentPropsWithRef<typeof NextLink>) {
  const locale = useLocale();
  const localized =
    typeof href === "string"
      ? localizeHref(locale, href)
      : href.pathname
        ? { ...href, pathname: localizeHref(locale, href.pathname) }
        : href;
  return <NextLink href={localized} {...rest} />;
}
