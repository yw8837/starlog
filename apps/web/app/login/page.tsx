import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NightSky } from "@/components/sky/NightSky";
import { NOT_FOUND_METADATA } from "@/lib/seo";
import { LoginPanel } from "./LoginPanel";

// A prototype (no real sign-in yet): dev only, like /dev/characters. A production build answers 404.
const PROTOTYPE_ONLY = process.env.NODE_ENV === "production";

export const metadata: Metadata = PROTOTYPE_ONLY ? NOT_FOUND_METADATA : { title: "로그인", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (PROTOTYPE_ONLY) notFound();
  const query = await searchParams;
  return (
    <div className="page-shell">
      <NightSky fixed glow="center" />
      <main className="page-col">
        <LoginPanel instant={query.instant === "1"} chapter={query.chapter === "prologue" ? "prologue" : "sample"} />
      </main>
    </div>
  );
}
