import type { Metadata } from "next";
import { NightSky } from "@/components/sky/NightSky";
import { NOINDEX } from "@/lib/seo";
import { PaySuccess } from "./PaySuccess";

export const metadata: Metadata = { title: "결제 확인", robots: NOINDEX };

export default async function PaySuccessPage({ searchParams }: PageProps<"/pay/success">) {
  const query = await searchParams;
  const value = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col">
        <PaySuccess paymentKey={value("paymentKey")} orderId={value("orderId")} amount={value("amount")} />
      </main>
    </div>
  );
}
