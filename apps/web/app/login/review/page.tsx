import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { NightSky } from "@/components/sky/NightSky";
import { reviewLogin } from "@/lib/account/review";
import { NOINDEX } from "@/lib/seo";
import { ReviewLoginForm } from "./ReviewLoginForm";

export const metadata: Metadata = { title: "로그인", robots: NOINDEX };

/** The review account's ID/password login (lib/account/review.ts): not linked anywhere, not in the sitemap. */
export default async function ReviewLoginPage() {
  // The secrets are read per request, never at build time.
  await connection();
  if (!reviewLogin()) notFound();
  return (
    <div className="page-shell">
      <NightSky fixed glow="center" />
      <main className="page-col">
        <ReviewLoginForm />
      </main>
    </div>
  );
}
