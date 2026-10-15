"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getJson } from "@/lib/reading/api";
import s from "../pay.module.css";

/**
 * Toss's failUrl. Nothing was charged: the confirm API is never called after a failure. Toss's own
 * message is shown as text (at most 120 characters), then another card or 간편결제 to try (F3; a card
 * company may still be reviewing the store). The page offers the way back to the reading.
 */
export function PayFail({ code, message, orderId }: { code: string; message: string; orderId: string | null }) {
  const [back, setBack] = useState("/");
  useEffect(() => {
    if (!orderId) return;
    void getJson<{ returnTo: string }>(`/api/pay/orders?id=${encodeURIComponent(orderId)}`).then((res) => {
      if (res.ok) setBack(res.data.returnTo);
    });
  }, [orderId]);
  const cancelled = code === "PAY_PROCESS_CANCELED";
  return (
    <div className={s.screen}>
      <div role="alert" className={s.panel}>
        <p className={s.title}>{cancelled ? "결제를 취소했어요" : "결제를 마치지 못했어요"}</p>
        {!cancelled && message ? <p>{message.slice(0, 120)}</p> : null}
        <p>{cancelled ? "청구된 금액은 없어요." : "청구된 금액은 없어요. 다른 카드나 간편결제로 다시 해 보세요."}</p>
        <Button href={back} block>
          풀이로 돌아가기
        </Button>
      </div>
    </div>
  );
}
