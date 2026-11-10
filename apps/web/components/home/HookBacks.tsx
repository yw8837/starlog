"use client";

import { backImage, useDeckPrefs } from "@/lib/deck";
import s from "./home.module.css";

/**
 * Three face-down cards fanned behind 타로로 on the home hook (spec 2026-11-11 3.1): the back the visitor chose (내 정보 →
 * 카드 디자인), as 지금의 한 장 deals it. Decoration only.
 */
export function HookBacks() {
  const { back } = useDeckPrefs();
  const src = backImage(back, "sm");
  return (
    <span className={s.hookBacks} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <img key={i} className={s.hookBack} src={src} alt="" width={600} height={1040} draggable={false} />
      ))}
    </span>
  );
}
