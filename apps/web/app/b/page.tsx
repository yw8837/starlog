import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SITE } from "@/lib/config";

export const metadata: Metadata = { title: "별자리 인연", robots: { index: false, follow: false } };

/**
 * /b without a code: invites are links only (owner 2026-10-28: 초대는 링크로, 코드 없이), so there is no code to type here;
 * it goes to 별자리 인연. A friend's invite is /b/<code>, opened from the link.
 */
export default function InviteEntryPage() {
  if (!SITE.features.bonds) notFound();
  redirect("/bonds");
}
