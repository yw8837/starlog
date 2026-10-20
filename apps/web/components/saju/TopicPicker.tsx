"use client";

import Link from "next/link";
import { SITE, won } from "@/lib/config";
import { opensOnText } from "@/lib/premium/offer";
import { PREMIUM, premiumPath } from "@/lib/premium/products";
import { usePremiumStatus } from "@/lib/premium/status";
import { useFreshSajuContextOnEntry } from "@/lib/sajuFlow";
import { SAJU_TOPICS, TOPIC_PICK_LINES } from "@/lib/sajuTopics";
import s from "./TopicPicker.module.css";

/**
 * Saju step 1 (owner 2026-10-14): 사주팔자 or one of the four 운, each a link to the birth input that
 * carries it (/saju/new?topic=…; the form opens the chart on it). The flow starts here, so an entry
 * from elsewhere starts the status chips clean, as the form did when it came first. Under them, where
 * premium is visible, the premium rows (PremiumTopics).
 */
export function TopicPicker() {
  useFreshSajuContextOnEntry();
  return (
    <>
      <ul className={s.list} aria-label="무엇이 궁금해요?">
        {SAJU_TOPICS.map((topic) => (
          <li key={topic.id}>
            <Link href={`/saju/new?topic=${topic.id}`} className={s.item}>
              {/* The price beside the name, as on the premium rows below (owner 2026-10-20: 금액란 통일). */}
              <span className={s.head}>
                <strong className={s.name}>{topic.label}</strong>
                <span className={s.price} data-price="">
                  {won(SITE.price.sajuStandardKrw)}
                </span>
              </span>
              <span className={s.line}>{TOPIC_PICK_LINES[topic.id]}</span>
            </Link>
          </li>
        ))}
      </ul>
      <PremiumTopics />
    </>
  );
}

const PREMIUM_ROWS = ["match", "newyear-2027"] as const;

/**
 * Below the five rows (owner 2026-10-16): a thin divider, a small 프리미엄 label, then 프리미엄 궁합 and 2027
 * 신년운세 with their prices, the same size as the rows above and never gold. Each row only where its
 * product is visible (usePremiumStatus); nothing at all while the status is unknown or premium is off. A
 * product before its sales window says when it opens and cannot be followed (contrast unchanged); one inside its
 * window this device cannot start (payments closed) says 준비 중이에요 the same way (review 2026-10-16 #10).
 */
function PremiumTopics() {
  const status = usePremiumStatus();
  const rows = PREMIUM_ROWS.filter((id) => status?.[id].visible);
  if (rows.length === 0) return null;
  const now = Date.now();
  return (
    <>
      <hr className={s.divider} />
      <p id="premium-topics" className={s.premiumLabel}>
        프리미엄
      </p>
      <ul className={s.list} aria-labelledby="premium-topics">
        {rows.map((id) => {
          const spec = PREMIUM[id];
          const opensAt = spec.opensAt !== undefined && now < spec.opensAt ? spec.opensAt : null;
          // Inside its window (or undated) but not open to this device (payments closed): 준비 중이에요.
          const closed = opensAt === null && !status?.[id].open;
          const body = (
            <>
              <span className={s.head}>
                <strong className={s.name}>{spec.name}</strong>
                <span className={s.price} data-price="">
                  {won(spec.krw)}
                </span>
              </span>
              <span className={s.line}>{opensAt !== null ? opensOnText(opensAt) : closed ? "준비 중이에요" : spec.sub}</span>
            </>
          );
          return (
            <li key={id}>
              {opensAt !== null || closed ? (
                // Not open yet: a link that cannot be followed or focused (components/ui/Button's disabled link).
                <a role="link" aria-disabled="true" className={`${s.item} ${s.soon}`}>
                  {body}
                </a>
              ) : (
                <Link href={`${premiumPath(id)}/new`} className={s.item}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
