import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SITE } from "@/lib/config";
import { NOT_FOUND_METADATA } from "@/lib/seo";
import { visibleWorries, type Worry } from "@/lib/worries";
import { WorryScreen, worryMetadata } from "./WorryScreen";

/**
 * Built ahead (generateStaticParams), and rendered on demand when the built copy cannot be read, as the birth cards
 * (app/birth-card/[card]/page.tsx: a Cloudflare location once missed fresh static assets for minutes after a deploy).
 * Any other address is a 404.
 */
export const dynamicParams = true;

/**
 * The worries this route builds: the ten that need no premium. The two premium ones have pages of their own, rendered per
 * request behind the premium gate (app/w/marry, app/w/stay-or-go; code review 2026-11-26 A1: a prerendered copy served
 * their product, price and contents with 200 while premium was hidden). A static segment wins over [id], and this route
 * answers 404 for them too.
 */
const listed = (): Worry[] => (SITE.features.worries ? visibleWorries(null) : []);

export function generateStaticParams() {
  return listed().map((worry) => ({ id: worry.id }));
}

const findListed = (id: string): Worry | undefined => listed().find((worry) => worry.id === id);

export async function generateMetadata({ params }: PageProps<"/w/[id]">): Promise<Metadata> {
  const worry = findListed((await params).id);
  return worry ? worryMetadata(worry) : NOT_FOUND_METADATA;
}

/** One worry (WorryScreen). Off (SITE.features.worries) it sends home. */
export default async function WorryPage({ params }: PageProps<"/w/[id]">) {
  if (!SITE.features.worries) redirect("/");
  const worry = findListed((await params).id);
  if (!worry) notFound();
  return <WorryScreen worry={worry} open />;
}
