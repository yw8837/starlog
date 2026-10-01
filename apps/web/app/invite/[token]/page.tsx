import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { INVITE_FIXTURE } from "@/lib/fixtures";
import { NOT_FOUND_METADATA } from "@/lib/seo";
import { InviteFlow } from "./InviteFlow";

// Invite details stay out of search (spec section 10); an unknown token is a not-found page.
export async function generateMetadata({ params }: PageProps<"/invite/[token]">): Promise<Metadata> {
  const { token } = await params;
  return token === INVITE_FIXTURE.token ? { title: "카드 한 장 부탁", robots: { index: false, follow: false } } : NOT_FOUND_METADATA;
}

export default async function InvitePage({ params, searchParams }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  // P1 knows one fixture invite; P2 looks the token up.
  if (token !== INVITE_FIXTURE.token) notFound();
  const query = await searchParams;

  return (
    <div className="page-shell">
      <NightSky fixed glow="center" seed={5} moon={false} />
      <main className="page-col">
        <InviteFlow invite={INVITE_FIXTURE} instant={query.instant === "1"} />
      </main>
      <Footer />
    </div>
  );
}
