import { SITE } from "./config";

/** 시행일 shared by the terms, privacy and refund pages. */
export const LEGAL_EFFECTIVE_DATE = "2026-10-15";

/** "2026년 10월 1일" */
export function koreanDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

/** Footer's second row, in order. 개인정보처리방침 is set apart visually, as Korean sites customarily do. */
export const LEGAL_LINKS = [
  { href: "/pricing", label: "가격 안내" },
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보처리방침", emphasis: true },
  { href: "/refund", label: "환불 정책" },
] as const;

type Business = Readonly<Record<keyof (typeof SITE)["business"], string>>;

/** Filled contact channels only, as [label, value]; empty until the owner sets them in SITE. */
export function contactChannels(business: Business = SITE.business): Array<readonly [string, string]> {
  const channels: Array<readonly [string, string]> = [];
  const email = business.email.trim();
  const phone = business.phone.trim();
  if (email) channels.push(["이메일", email]);
  if (phone) channels.push(["전화", phone]);
  return channels;
}
