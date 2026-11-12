import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { NightSky } from "@/components/sky/NightSky";
import { safeReturnTo } from "@/lib/account/returnTo";
import { reviewLogin } from "@/lib/account/review";
import { openingFreeOn } from "@/lib/config";
import { paymentsMode } from "@/lib/pay/mode";
import { NOINDEX } from "@/lib/seo";
import { LoginPanel } from "./LoginPanel";

export const metadata: Metadata = { title: "로그인", robots: NOINDEX };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // The payments mode is a runtime value: without this the build (no STARLOG_PAYMENTS) prerendered
  // the page as a static 404, and /login stayed 404 in production whatever the mode.
  await connection();
  // Dark deploy (STARLOG_PAYMENTS=off): no login anywhere, as before P4.
  if (paymentsMode() === "off") notFound();
  const query = await searchParams;
  // The Reviewer sign-in link (Google Play review): the very test /login/review and POST /api/auth/review answer 404 by.
  const mode = paymentsMode();
  const reviewLoginOn = reviewLogin() !== null && (mode === "owner" || mode === "on");
  return (
    <div className="page-shell">
      <NightSky fixed glow="center" />
      <main className="page-col">
        <LoginPanel next={safeReturnTo(typeof query.next === "string" ? query.next : null)} status={typeof query.login === "string" ? query.login : null} opening={openingFreeOn()} reviewLoginOn={reviewLoginOn} />
      </main>
    </div>
  );
}
