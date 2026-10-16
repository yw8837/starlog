"use client";

import Link from "next/link";
import { ChevronIcon } from "@/components/home/icons";
import { PREMIUM_IDS } from "@/lib/premium/products";
import { usePremiumStatus } from "@/lib/premium/status";
import s from "./MeView.module.css";

/**
 * 내 정보's 프리미엄 풀이 보기 (plan-reconciled §4.4): one menu row to the pricing page's premium tier, only once the
 * premium status says a product is visible here; nothing before, on failure, or while premium is off.
 */
export function PremiumMenuRow() {
  const status = usePremiumStatus();
  if (!status || !PREMIUM_IDS.some((id) => status[id].visible)) return null;
  return (
    <li>
      <Link href="/pricing#premium" className={s.item}>
        <span>프리미엄 풀이 보기</span>
        <ChevronIcon />
      </Link>
    </li>
  );
}
