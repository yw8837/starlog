import type { Metadata } from "next";
import { NightSky } from "@/components/sky/NightSky";
import { OwnerForm } from "./OwnerForm";
import { ReviewDesk } from "./ReviewDesk";

export const metadata: Metadata = { title: "운영자", robots: { index: false, follow: false } };

/** Owner pass: not linked anywhere and not in the sitemap. */
export default function OwnerPage() {
  return (
    <div className="page-shell">
      <NightSky fixed glow="center" />
      <main className="page-col">
        <OwnerForm />
        <ReviewDesk />
      </main>
    </div>
  );
}
