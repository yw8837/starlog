"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";
import { chooseAnalytics, readChoice, subscribeChoice } from "@/lib/analyticsConsent";
import { gaRevisionInForce } from "@/lib/legal";
import s from "./ConsentBanner.module.css";

/**
 * "방문 통계를 켜도 될까요?": asked once per browser (and host) from the GA revision (lib/legal.ts GA_REVISION_DATE, by the
 * browser's clock) until a choice is stored (lib/analyticsConsent.ts), from the root layout on both hosts. Not a modal: it
 * takes no focus and covers nothing but its own box, above the bottom tab bar on phones. 허용 and 거부 are the same button.
 * Nothing on the server, so no flash and no hydration mismatch on pages cached for a year.
 */
export function ConsentBanner() {
  const ask = useSyncExternalStore(subscribeChoice, () => GA_MEASUREMENT_ID !== "" && gaRevisionInForce() && readChoice() === null, () => false);
  if (!ask) return null;
  return (
    <section className={s.banner} aria-labelledby="consent-title">
      <h2 id="consent-title" className={s.title}>
        방문 통계를 켜도 될까요?
      </h2>
      <p className={s.body}>
        어떤 화면을 많이 보는지 알아보려고 Google 애널리틱스를 써요. 허용한 경우에만 쓰고, 설정은 언제든 바꿀 수 있어요.{" "}
        <Link href="/privacy#analytics" className={s.more}>
          자세히
        </Link>
      </p>
      <div className={s.actions}>
        <Button variant="secondary" size="md" onClick={() => chooseAnalytics("granted")}>
          허용
        </Button>
        <Button variant="secondary" size="md" onClick={() => chooseAnalytics("denied")}>
          거부
        </Button>
      </div>
    </section>
  );
}
