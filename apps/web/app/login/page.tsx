import type { Metadata } from "next";
import { NightSky } from "@/components/sky/NightSky";
import { LoginPanel } from "./LoginPanel";

export const metadata: Metadata = { title: "로그인", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const query = await searchParams;
  return (
    <div className="page-shell">
      <NightSky fixed glow="center" />
      <main className="page-col">
        <LoginPanel instant={query.instant === "1"} />
      </main>
    </div>
  );
}
