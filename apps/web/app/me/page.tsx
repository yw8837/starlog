import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { WALLET_FIXTURE } from "@/lib/fixtures";
import { MeView } from "./MeView";

export const metadata: Metadata = { title: "내 정보", robots: { index: false, follow: false } };

export default function MePage() {
  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed seed={31} />
      <main className="page-col page-wide">
        {/* Balances are fixture data until payments exist; the beta shows none. */}
        <MeView wallet={SITE.features.payments ? WALLET_FIXTURE : null} />
      </main>
      <Footer />
      <TabBar active="me" />
    </div>
  );
}
