"use client";

import Link from "next/link";
import { useId } from "react";
import { won } from "@/lib/config";
import { linkHref, type SiteHost } from "@/lib/hosts";
import { opensOnText } from "@/lib/premium/offer";
import { PREMIUM, premiumPath, type PremiumId } from "@/lib/premium/products";
import { usePremiumStatus } from "@/lib/premium/status";
import s from "./PremiumRows.module.css";

type PremiumRowsProps = {
  ids: readonly PremiumId[];
  title: string;
  /** A line per product in place of its sub. */
  lines?: Partial<Record<PremiumId, string>>;
  /** The home's ivory cards (three across on desktop); otherwise glass rows. */
  look?: "home" | "rows";
  /** Leave out a product before its sales window instead of showing when it opens (a reading's end). */
  onlyOpen?: boolean;
  /** The host the page is served on: a guide page links to the app host. */
  host?: SiteHost;
  className?: string;
};

/**
 * The premium rows shown after a finished reading, on the home's 더 깊게 보기 and under a guide article
 * (plan-reconciled §4.1, §4.3): each product's entry name, a line, its price and a link to its product page, never
 * gold. A client island on the shared premium status (pages stay static): nothing before it answers, when it cannot
 * be read, or for a product not visible here, so STARLOG_PREMIUM off shows today's page exactly.
 */
export function PremiumRows({ ids, title, lines = {}, look = "rows", onlyOpen = false, host = "app", className }: PremiumRowsProps) {
  const status = usePremiumStatus();
  const titleId = useId();
  if (!status) return null;
  const now = Date.now();
  const opensAt = (id: PremiumId) => {
    const at = PREMIUM[id].opensAt;
    return at !== undefined && now < at ? at : null;
  };
  const rows = ids.filter((id) => status[id].visible && !(onlyOpen && opensAt(id) !== null));
  if (rows.length === 0) return null;
  return (
    <section className={[s.section, look === "home" ? s.home : "", className ?? ""].filter(Boolean).join(" ")} aria-labelledby={titleId}>
      <h2 id={titleId} className={s.title}>
        {title}
      </h2>
      <ul className={s.list}>
        {rows.map((id) => {
          const spec = PREMIUM[id];
          const soon = opensAt(id);
          return (
            <li key={id}>
              <Link href={linkHref(premiumPath(id), host)} prefetch={host === "app" ? undefined : false} className={look === "home" ? `${s.row} ${s.ivory}` : s.row}>
                <span className={s.head}>
                  <strong className={s.name}>{spec.name}</strong>
                  <span className={s.price}>{won(spec.krw)}</span>
                </span>
                <span className={s.line}>{lines[id] ?? spec.sub}</span>
                {soon !== null ? <span className={s.badge}>{opensOnText(soon)}</span> : null}
                <span className={s.arrow} aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
