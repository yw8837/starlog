import type { Metadata } from "next";
import { Rabbit } from "@/components/characters/Rabbit";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { Button } from "@/components/ui/Button";
import { NOT_FOUND_METADATA } from "@/lib/seo";
import s from "./not-found.module.css";

export const metadata: Metadata = NOT_FOUND_METADATA;

/** Any unknown address (and every `notFound()`): Korean copy, one way home. */
export default function NotFound() {
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className={`page-col ${s.page}`}>
        <Rabbit outfit="tarot" expression="surprise" size={150} reactOnTap={false} />
        <h1 className={s.title}>찾는 페이지가 없어요</h1>
        <p className={s.text}>주소가 바뀌었거나 아직 열리지 않은 페이지예요.</p>
        <Button href="/" block>
          홈으로
        </Button>
      </main>
      <Footer host="either" />
    </div>
  );
}
