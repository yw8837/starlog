"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import s from "@/components/legal/legal.module.css";
import { won } from "@/lib/config";
import { REFUND_DAYS } from "@/lib/pay/catalog";
import { opensAtText } from "@/lib/premium/offer";
import { PREMIUM, PREMIUM_IDS, premiumPath } from "@/lib/premium/products";
import { usePremiumStatus } from "@/lib/premium/status";

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * /pricing's second tier (plan-reconciled §4.2): 깊게 보는 풀이, one card per product with its scope lines, its state
 * (판매 중 / when it opens / 준비 중) and its product page. A client island (the page stays static): until the premium
 * status says a product is visible here it shows `fallback` (the readings named and priced plainly), so STARLOG_PREMIUM off adds no link.
 */
export function PremiumPricing({ fallback }: { fallback: ReactNode }) {
  const status = usePremiumStatus();
  const ids = status ? PREMIUM_IDS.filter((id) => status[id].visible) : [];
  if (!status || ids.length === 0) return <>{fallback}</>;
  const now = Date.now();
  return (
    <section id="premium" className={s.section} aria-labelledby="premium-title">
      <h2 id="premium-title" className={s.sectionTitle}>
        깊게 보는 풀이
      </h2>
      <div className={s.cards}>
        {ids.map((id) => {
          const spec = PREMIUM[id];
          const opensAt = !status[id].open && spec.opensAt !== undefined && now < spec.opensAt ? spec.opensAt : null;
          const badge = status[id].open ? "판매 중" : opensAt !== null ? "곧 열려요" : "준비 중";
          return (
            <section key={id} className={s.card} aria-labelledby={`premium-${id}`}>
              <div>
                <h3 id={`premium-${id}`} className={s.cardTitle}>
                  {spec.name} <span className={s.badge}>{badge}</span>
                </h3>
                <p className={s.cardSub}>{spec.sub}</p>
              </div>
              <p className={s.price}>
                {won(spec.krw)}
                <span className={s.priceUnit}>1회</span>
              </p>
              {opensAt !== null ? <p className={s.muted}>{opensAtText(opensAt)}</p> : null}
              <ul className={s.checks}>
                {spec.scope.map((line) => (
                  <li key={line}>
                    <Check />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p>
                <Link href={premiumPath(id)}>자세히 보기</Link>
              </p>
            </section>
          );
        })}
      </div>
      <p>{`깊게 보는 풀이도 결제와 환불 기준은 같아요. 열기 전에는 결제일로부터 ${REFUND_DAYS}일 안에 전액 환불받을 수 있어요.`}</p>
    </section>
  );
}
