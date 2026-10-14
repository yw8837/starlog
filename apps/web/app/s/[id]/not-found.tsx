import { Rabbit } from "@/components/characters/Rabbit";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { Button } from "@/components/ui/Button";
import s from "../../not-found.module.css";

/**
 * A share link that was stopped or never made (notFound() in page.tsx). Korean copy and a way home;
 * kept out of search by page.tsx's metadata and the noindex notFound() adds.
 */
export default function ShareNotFound() {
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className={`page-col ${s.page}`}>
        <Rabbit outfit="tarot" expression="surprise" size={150} reactOnTap={false} />
        <h1 className={s.title}>공유가 멈췄거나 없는 풀이예요</h1>
        <p className={s.text}>공유한 사람이 공유를 그만뒀거나 주소가 바뀌었을 수 있어요.</p>
        <Button href="/" block>
          홈으로
        </Button>
      </main>
      <Footer />
    </div>
  );
}
