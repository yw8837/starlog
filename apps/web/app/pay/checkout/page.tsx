import type { Metadata } from "next";
import { NightSky } from "@/components/sky/NightSky";
import { safeReturnTo } from "@/lib/account/returnTo";
import { NOINDEX } from "@/lib/seo";
import { CheckoutView } from "./CheckoutView";

export const metadata: Metadata = { title: "결제", robots: NOINDEX };

export default async function CheckoutPage({ searchParams }: PageProps<"/pay/checkout">) {
  const query = await searchParams;
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col">
        <CheckoutView productId={typeof query.product === "string" ? query.product : ""} returnTo={safeReturnTo(typeof query.returnTo === "string" ? query.returnTo : null)} />
      </main>
    </div>
  );
}
