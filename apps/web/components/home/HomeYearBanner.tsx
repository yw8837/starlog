"use client";

import { PremiumRows } from "@/components/premium/PremiumRows";
import { OpeningOnly } from "@/components/ui/OpeningOnly";
import { OPENING_LAST_DAY } from "@/lib/config";
import s from "./home.module.css";

/**
 * The home's 2027 신년운세 banner (sales 2026-11-10 item 5, owner decision 2026-11-10): the existing product at its
 * price, never gold, only where it is on sale (PremiumRows: nothing while premium is off or the status is unknown); from
 * 2026-12-01, where the server sells it, the 2027 신년운세 + 프리미엄 궁합 set beside it (owner 2026-11-10). One compact
 * line under the hook, still on the first screen, in 사주주's words (spec 2026-11-11 3.1, Q3 default, H6).
 */
export function HomeYearBanner({ className }: { className?: string }) {
  return (
    <PremiumRows
      ids={["newyear-2027"]}
      onlyOpen
      withSet
      look="line"
      title="2027년 미리 보기"
      lines={{ "newyear-2027": "사주주가 2027년 한 해와 열두 달을 미리 봐 드려요" }}
      className={className}
    />
  );
}

/**
 * One line on 오픈 기념 무료 until it ends (SITE.beta.openingEndsAt, 2026-11-30 23:59:59 KST), by the browser's clock: it
 * goes away by itself on 12월 1일 with no deploy, and the server refuses the free opening from then (lib/api/unlock.ts).
 */
export function OpeningNotice({ className }: { className?: string }) {
  return (
    <OpeningOnly>
      <p className={[s.openingNotice, className ?? ""].filter(Boolean).join(" ")}>{`오픈 기념 타로 전체 풀이 무료는 ${OPENING_LAST_DAY}까지예요. 로그인하면 계정마다 한 번 받을 수 있어요.`}</p>
    </OpeningOnly>
  );
}
