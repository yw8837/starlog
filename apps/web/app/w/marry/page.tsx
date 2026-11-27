import type { Metadata } from "next";
import { premiumWorryMetadata, premiumWorryPage } from "../[id]/premiumWorry";

/** 결혼 얘기 중인 우리 (spec 2026-11-26 worry catalog §4): rendered per request behind 프리미엄 궁합's gate (premiumWorry.tsx). */
export function generateMetadata(): Promise<Metadata> {
  return premiumWorryMetadata("marry");
}

export default function MarryWorryPage() {
  return premiumWorryPage("marry");
}
