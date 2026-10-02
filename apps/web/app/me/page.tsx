import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { MeView } from "./MeView";
import { meStatusMessage } from "./meStatus";

export const metadata: Metadata = { title: "내 정보", robots: { index: false, follow: false } };

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export default async function MePage({ searchParams }: PageProps<"/me">) {
  const query = await searchParams;
  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed seed={31} />
      <TabBar active="me" />
      <main className="page-col page-wide">
        <MeView
          status={meStatusMessage({ account: str(query.account), delete: str(query.delete), login: str(query.login) })}
          accountDeleted={str(query.account) === "deleted"}
        />
      </main>
      <Footer />
    </div>
  );
}
