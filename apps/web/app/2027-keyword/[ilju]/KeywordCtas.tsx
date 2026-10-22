"use client";

import { Button } from "@/components/ui/Button";
import { NEW_SAJU_HREF } from "@/lib/freshStart";
import { PREMIUM, inWindow, premiumPath } from "@/lib/premium/products";
import { usePremiumStatus } from "@/lib/premium/status";
import s from "../keyword.module.css";

/**
 * After a keyword: 2027 신년운세 깊게 보기 (the gold primary) where that product is on sale here, that is visible on
 * this device (GET /api/premium/status, as every premium entry asks) and inside its sales window (it closes
 * 2027-12-01); 사주 풀이 보기 to the saju start always. Until the status answers, on failure, while premium is off
 * or past the window, only the saju entry shows: the static page never names a product that may not be on sale.
 */
export function KeywordCtas() {
  const status = usePremiumStatus();
  const deep = Boolean(status?.["newyear-2027"].visible) && inWindow(PREMIUM["newyear-2027"], Date.now());
  return (
    <div className={s.ctas}>
      {deep ? (
        <Button href={premiumPath("newyear-2027")} block trailing="→">
          2027 신년운세 깊게 보기
        </Button>
      ) : null}
      <Button href={NEW_SAJU_HREF} variant="secondary" block>
        사주 풀이 보기
      </Button>
    </div>
  );
}
