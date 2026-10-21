"use client";

import { useSyncExternalStore } from "react";
import b from "@/components/ui/Button.module.css";
import { type AnalyticsChoice, chooseAnalytics, readChoice, subscribeChoice } from "@/lib/analyticsConsent";
import s from "./legal.module.css";

const STATUS: Record<AnalyticsChoice | "none", string> = {
  granted: "지금은 허용한 상태예요.",
  denied: "지금은 거부한 상태예요.",
  none: "아직 고르지 않았어요.",
};

const OPTIONS = [
  ["granted", "허용"],
  ["denied", "거부"],
] as const;

/** Both choices in the same style: neither is pushed. */
const BUTTON = `${b.btn} ${b.secondary} ${b.md}`;

/**
 * The 방문 통계 setting in the privacy policy's #analytics: this browser's choice, and the two buttons to change it at any
 * time, on phones too (lib/analyticsConsent.ts; 거부 stops gtag and deletes its cookies, 허용 lets the loader start it
 * without a reload). The choice lives in the browser, so the server and the first render show none.
 */
export function AnalyticsSetting() {
  const choice = useSyncExternalStore(subscribeChoice, readChoice, () => undefined);
  return (
    <div className={s.setting} role="group" aria-labelledby="analytics-setting">
      <p id="analytics-setting" className={s.noteTitle}>
        방문 통계 설정
      </p>
      <p role="status" className={s.muted}>
        {choice === undefined ? "" : STATUS[choice ?? "none"]}
      </p>
      <div className={s.settingButtons}>
        {OPTIONS.map(([option, label]) => (
          <button key={option} type="button" className={BUTTON} aria-pressed={choice === option} onClick={() => chooseAnalytics(option)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
