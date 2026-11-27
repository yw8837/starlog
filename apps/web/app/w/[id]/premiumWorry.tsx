import { cache } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SITE } from "@/lib/config";
import { premiumPageOpen, premiumStateHere } from "@/lib/premium/pageGate";
import { NOT_FOUND_METADATA } from "@/lib/seo";
import { findWorry, worryPremium, type Worry } from "@/lib/worries";
import { WorryScreen, worryMetadata } from "./WorryScreen";

/**
 * The two premium worries' pages (app/w/marry, app/w/stay-or-go), rendered per request behind the premium screens' server
 * gate (lib/premium/pageGate.ts; code review 2026-11-26 A1): nothing of the product, its price or its contents is served or
 * indexed where it may not be seen. The page shows where the product is visible here, or where the logged-in user holds a
 * purchase of it (premiumPageOpen: the rule components/tarot/DeepSpreadGate.tsx deepAllowed follows in the browser), so such
 * a person is never sent away; anywhere else it is a 404, as the product's own page.
 */
export type PremiumWorryId = "marry" | "stay-or-go";

// Once per request: the metadata and the page ask the same thing.
const gate = cache(async (id: PremiumWorryId): Promise<{ worry: Worry; shown: boolean; open: boolean }> => {
  const worry = findWorry(id)!;
  const premium = worryPremium(worry)!;
  const state = await premiumStateHere(premium);
  const shown = state.visible || (await premiumPageOpen(premium));
  // Visible: it starts once on sale (else 준비 중이에요, as the product page). Not visible but shown: a purchase is held.
  return { worry, shown, open: state.open || !state.visible };
});

export async function premiumWorryMetadata(id: PremiumWorryId): Promise<Metadata> {
  if (!SITE.features.worries) return NOT_FOUND_METADATA;
  const { worry, shown } = await gate(id);
  return shown ? worryMetadata(worry) : NOT_FOUND_METADATA;
}

/** The page: home while the catalog is off (§8), a 404 where it may not be seen, else the worry. */
export async function premiumWorryPage(id: PremiumWorryId) {
  if (!SITE.features.worries) redirect("/");
  const { worry, shown, open } = await gate(id);
  if (!shown) notFound();
  return <WorryScreen worry={worry} open={open} />;
}
