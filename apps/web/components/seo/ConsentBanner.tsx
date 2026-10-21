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
 * browser's clock) until a choice is stored (lib/analyticsConsent.ts), from the root layout on both hosts. It tells what
 * 제28조의8 제2항 asks before consent to the transfer abroad: Google LLC (미국), what goes, how long it is kept, and that
 * refusing costs nothing; the rest is behind 자세히. Not a modal: it
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
        어떤 화면을 많이 보는지 알아보려고, 허용하면 방문한 페이지(공유·초대 번호는 가림)·기기 정보·IP 주소·쿠키 식별값을 Google 애널리틱스로
        Google LLC(미국)에 보내요. 마지막 방문부터 최대 14개월 보관하고, 거부해도 이용에 제한은 없어요.{" "}
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
