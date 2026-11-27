import type { Metadata } from "next";
import { premiumWorryMetadata, premiumWorryPage } from "../[id]/premiumWorry";

/** 오늘도 퇴사 생각 (spec 2026-11-26 worry catalog §4): rendered per request behind 켈틱 크로스 10장's gate (premiumWorry.tsx). */
export function generateMetadata(): Promise<Metadata> {
  return premiumWorryMetadata("stay-or-go");
}

export default function StayOrGoWorryPage() {
  return premiumWorryPage("stay-or-go");
}
