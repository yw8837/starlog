"use client";

import Link from "next/link";
import { linkHref, type SiteHost } from "@/lib/hosts";
import { PREMIUM_IDS } from "@/lib/premium/products";
import { usePremiumStatus } from "@/lib/premium/status";
import styles from "./Footer.module.css";

/**
 * The footer's 프리미엄 풀이 (plan-reconciled §4.5): one more item after 가격 안내, to its premium tier. The footer is on
 * every page, so a client island on the premium status: nothing before it answers, when it fails, or while premium is
 * not visible here (STARLOG_PREMIUM off keeps today's footer).
 */
export function PremiumFooterLink({ host }: { host: SiteHost | "either" }) {
  const status = usePremiumStatus();
  if (!status || !PREMIUM_IDS.some((id) => status[id].visible)) return null;
  return (
    <li>
      <Link href={linkHref("/pricing#premium", host)} prefetch={false} className={styles.link}>
        프리미엄 풀이
      </Link>
    </li>
  );
}
