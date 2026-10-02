import type { Metadata } from "next";
import { NightSky } from "@/components/sky/NightSky";
import { NOINDEX } from "@/lib/seo";
import { PayFail } from "./PayFail";

export const metadata: Metadata = { title: "결제 실패", robots: NOINDEX };

export default async function PayFailPage({ searchParams }: PageProps<"/pay/fail">) {
  const query = await searchParams;
  const value = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col">
        <PayFail code={value("code")} message={value("message")} orderId={value("orderId") || null} />
      </main>
    </div>
  );
}
