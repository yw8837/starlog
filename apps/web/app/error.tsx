"use client";

import { Rabbit } from "@/components/characters/Rabbit";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import s from "./not-found.module.css";

/**
 * Any page that breaks while it is shown (QA Q-02: no English framework screen). Korean copy, one
 * h1, a retry of the page and a way home; never indexed. Errors in the root layout itself fall
 * through to global-error.tsx.
 */
export default function PageError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="page-shell">
      <title>{`잠시 문제가 생겼어요 · ${SITE.name}`}</title>
      <meta name="robots" content="noindex, nofollow" />
      <NightSky fixed moon={false} />
      <main className={`page-col ${s.page}`}>
        <Rabbit outfit="tarot" expression="surprise" size={150} reactOnTap={false} />
        <h1 className={s.title}>화면을 보여 드리지 못했어요</h1>
        <p className={s.text}>잠시 문제가 생겼어요. 다시 시도해 보고, 그래도 안 되면 홈에서 다시 시작해 주세요.</p>
        <Button block onClick={() => retry()}>
          다시 시도
        </Button>
        <Button href="/" variant="ghost" size="md" block>
          홈으로
        </Button>
      </main>
      <Footer />
    </div>
  );
}
