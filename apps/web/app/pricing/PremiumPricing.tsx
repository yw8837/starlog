"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { setRefundRule } from "@/components/legal/PremiumLegal";
import s from "@/components/legal/legal.module.css";
import { SITE, won } from "@/lib/config";
import { REFUND_DAYS, SET_PRODUCT_ID } from "@/lib/pay/catalog";
import { checkoutHref } from "@/lib/pay/offer";
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

/** The set's price against its two readings apart (owner 2026-11-10: the real saving, nothing else). */
const SET_APART = PREMIUM["newyear-2027"].krw + PREMIUM.match.krw;

/** The 2027 신년운세 + 프리미엄 궁합 set, where the server sells it (from 2026-12-01 KST): one of each, the unopened one's part refundable. */
function SetCard() {
  return (
    <section className={s.card} aria-labelledby="premium-set">
      <div>
        <h3 id="premium-set" className={s.cardTitle}>
          {SITE.price.set.name} <span className={s.badge}>판매 중</span>
        </h3>
        <p className={s.cardSub}>한 번 결제로 두 풀이가 하나씩 열려요</p>
      </div>
      <p className={s.price}>
        {won(SITE.price.set.krw)}
        <span className={s.priceUnit}>1회</span>
      </p>
      <ul className={s.checks}>
        {[
          ...SITE.price.set.includes.map((id) => `${PREMIUM[id].name} · ${PREMIUM[id].scope[0]}`),
          `따로 사면 ${won(SET_APART)}, ${won(SET_APART - SITE.price.set.krw)} 아껴요`,
        ].map((line) => (
          <li key={line}>
            <Check />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p>{setRefundRule()}</p>
      <p>
        <Link href={checkoutHref(SET_PRODUCT_ID, "/premium/newyear-2027/new")}>세트로 결제하기</Link>
      </p>
    </section>
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
        {status.set?.open ? <SetCard /> : null}
      </div>
      {/* Review LOW 4: the set has its own refund rule (its card above), so this line speaks of a reading paid for alone. */}
      <p>{`깊게 보는 풀이도 결제와 환불 기준은 같아요. 따로 결제한 풀이는 열기 전에는 결제일로부터 ${REFUND_DAYS}일 안에 전액 환불받을 수 있어요.${
        status.set?.open ? " 세트의 환불 기준은 세트 안내에 있어요." : ""
      }`}</p>
    </section>
  );
}
