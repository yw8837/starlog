import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NightSky } from "@/components/sky/NightSky";
import { safeReturnTo } from "@/lib/account/returnTo";
import { paymentsMode } from "@/lib/pay/mode";
import { NOINDEX } from "@/lib/seo";
import { LoginPanel } from "./LoginPanel";

export const metadata: Metadata = { title: "로그인", robots: NOINDEX };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Dark deploy (STARLOG_PAYMENTS=off): no login anywhere, as before P4.
  if (paymentsMode() === "off") notFound();
  const query = await searchParams;
  return (
    <div className="page-shell">
      <NightSky fixed glow="center" />
      <main className="page-col">
        <LoginPanel next={safeReturnTo(typeof query.next === "string" ? query.next : null)} status={typeof query.login === "string" ? query.login : null} />
      </main>
    </div>
  );
}
