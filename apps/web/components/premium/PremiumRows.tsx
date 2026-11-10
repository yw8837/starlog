"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { SITE, won } from "@/lib/config";
import { SET_PRODUCT_ID } from "@/lib/pay/catalog";
import { checkoutHref } from "@/lib/pay/offer";
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
  /** The home's ivory cards (three across on desktop); one compact line under the home hook, its heading for screen readers only; otherwise glass rows. */
  look?: "home" | "line" | "rows";
  /** Only products on sale now (the status's `open`, as StarList): none before its window, after it, or with sales off (a reading's end, the home's banner). */
  onlyOpen?: boolean;
  /** The host the page is served on: a guide page links to the app host. */
  host?: SiteHost;
  className?: string;
  /**
   * Shown until the status answers, so the server's HTML (a static page) links the product for crawlers; gone once it
   * answers, replaced by the rows, or by nothing where premium is not visible or the status cannot be read.
   */
  fallback?: ReactNode;
  /**
   * Adds the 2027 신년운세 + 프리미엄 궁합 set after the rows, only while the server sells it (status `set`, from
   * 2026-12-01 KST), straight to its checkout; it comes back to the 신년운세 input. The app host only.
   */
  withSet?: boolean;
};

/** The set's price against its two readings apart (owner 2026-11-10: the saving is real, so it may be said; nothing else). */
const SET_APART = PREMIUM["newyear-2027"].krw + PREMIUM.match.krw;
const SET_LINE = `따로 사면 ${won(SET_APART)}, ${won(SET_APART - SITE.price.set.krw)} 아껴요`;
const SET_HREF = checkoutHref(SET_PRODUCT_ID, "/premium/newyear-2027/new");

/**
 * The premium rows shown after a finished reading, on the home's 더 깊게 보기 and under a guide article
 * (plan-reconciled §4.1, §4.3): each product's entry name, a line, its price and a link to its product page, never
 * gold. A client island on the shared premium status (pages stay static): nothing before it answers, when it cannot
 * be read, or for a product not visible here, so STARLOG_PREMIUM off shows today's page exactly.
 */
export function PremiumRows({ ids, title, lines = {}, look = "rows", onlyOpen = false, host = "app", className, fallback = null, withSet = false }: PremiumRowsProps) {
  const status = usePremiumStatus();
  const titleId = useId();
  if (status === undefined) return <>{fallback}</>;
  if (!status) return null;
  const now = Date.now();
  const opensAt = (id: PremiumId) => {
    const at = PREMIUM[id].opensAt;
    return at !== undefined && now < at ? at : null;
  };
  const rows = ids.filter((id) => status[id].visible && !(onlyOpen && !status[id].open));
  const set = withSet && host === "app" && status.set?.open === true;
  if (rows.length === 0 && !set) return null;
  const rowClass = look === "home" ? `${s.row} ${s.ivory}` : look === "line" ? `${s.row} ${s.compact}` : s.row;
  return (
    <section className={[s.section, look === "home" ? s.home : look === "line" ? s.line : "", className ?? ""].filter(Boolean).join(" ")} aria-labelledby={titleId}>
      <h2 id={titleId} className={look === "line" ? "sr-only" : s.title}>
        {title}
      </h2>
      <ul className={s.list}>
        {rows.map((id) => {
          const spec = PREMIUM[id];
          const soon = opensAt(id);
          return (
            <li key={id}>
              <Link href={linkHref(premiumPath(id), host)} prefetch={host === "app" ? undefined : false} className={rowClass}>
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
        {set ? (
          <li key={SET_PRODUCT_ID}>
            <Link href={SET_HREF} className={rowClass}>
              <span className={s.head}>
                <strong className={s.name}>{SITE.price.set.name}</strong>
                <span className={s.price}>{won(SITE.price.set.krw)}</span>
              </span>
              <span className={s.line}>{SET_LINE}</span>
              <span className={s.arrow} aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
