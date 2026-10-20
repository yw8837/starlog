import { AiNote } from "@/components/reading/AiNote";
import { GlanceCard } from "@/components/saju/GlanceCard";
import { ReadingArticle } from "@/components/tarot/ReadingArticle";
import { ReadingLayout } from "@/components/tarot/ReadingLayout";
import { SpreadRow, faceUpCard } from "@/components/tarot/SpreadRow";
import { Stepper } from "@/components/tarot/Stepper";
import { Button } from "@/components/ui/Button";
import { NEW_SAJU_HREF, NEW_TAROT_HREF } from "@/lib/freshStart";
import { isSajuGlance } from "@/lib/reading/validate";
import type { SharedSaju, SharedTarot, SharePayload } from "@/lib/share/payload";
import { topicLabel } from "@/lib/sajuTopics";
import { SajuSections } from "../../chapter/[id]/SajuSections";
import { SharedDailyView } from "./SharedDaily";
import s from "../../chapter/[id]/ChapterView.module.css";

const COUNT = ["한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열"];

/** "카드 세 장이 건넨 이야기" (11 and up in digits: "카드 11장이"). */
export function tarotShareTitle(cards: number): string {
  const word = COUNT[cards - 1];
  return word ? `카드 ${word} 장이 건넨 이야기` : `카드 ${cards}장이 건넨 이야기`;
}

/** "연애운 풀이", or "사주팔자 풀이" for 전체 흐름. */
export const sajuShareTitle = (share: SharedSaju) => `${topicLabel(share.topic ?? "overall")} 풀이`;

function SharedTarotView({ share }: { share: SharedTarot }) {
  return (
    <ReadingLayout
      head={
        <header className={s.head}>
          <p className={s.eyebrow}>친구가 공유한 타로 풀이</p>
          <h1 className={s.title}>{tarotShareTitle(share.cards.length)}</h1>
          <p className={s.question}>질문과 직접 쓴 말, 고른 상황은 공유한 사람만 볼 수 있어요.</p>
        </header>
      }
      spread={<SpreadRow size="sm" cards={share.cards.map(faceUpCard)} deck={share.deck} />}
    >
      <ReadingArticle paid={share.reading} />
      <AiNote />
      <section className={s.invite} aria-labelledby="try-title">
        <h2 id="try-title" className={s.inviteTitle}>
          나도 카드 뽑아 보기
        </h2>
        <p className={s.inviteText}>마음에 걸리는 일 하나를 골라 카드로 물어봐요. 지금의 한 장은 무료예요.</p>
        <Button href={NEW_TAROT_HREF} block trailing="→">
          타로 보기
        </Button>
        <Button href="/now" variant="secondary" block>
          무료로 한 장 뽑기
        </Button>
        <Button href="/" variant="ghost" block>
          스타로그 홈으로
        </Button>
      </section>
    </ReadingLayout>
  );
}

function SharedSajuView({ share }: { share: SharedSaju }) {
  return (
    <ReadingLayout
      spreadLabel="한눈에 보기"
      head={
        <header className={s.head}>
          <p className={s.eyebrow}>친구가 공유한 사주 풀이</p>
          <h1 className={s.title}>{sajuShareTitle(share)}</h1>
          <p className={s.question}>생년월일과 태어난 시각, 명식, 고른 상황은 공유한 사람만 볼 수 있어요.</p>
        </header>
      }
      spread={isSajuGlance(share.reading.glance) ? <GlanceCard glance={share.reading.glance} /> : null}
    >
      <div className={s.sections}>
        <SajuSections reading={share.reading} glance={false} />
      </div>
      <AiNote />
      <section className={s.invite} aria-labelledby="try-title">
        <h2 id="try-title" className={s.inviteTitle}>
          내 사주도 보기
        </h2>
        <p className={s.inviteText}>태어난 날만 고르면 만세력으로 사주를 계산해 풀어 줘요.</p>
        <Button href={NEW_SAJU_HREF} block trailing="→">
          사주 보기
        </Button>
        <Button href="/" variant="ghost" block>
          스타로그 홈으로
        </Button>
      </section>
    </ReadingLayout>
  );
}

/**
 * A shared reading as its result screen shows it, read-only, with a way in for the visitor and a way to
 * the Starlog home at the top and at the end (owner 2026-10-14).
 */
export function SharedReading({ share }: { share: SharePayload }) {
  return (
    <>
      <Stepper label="친구가 공유한 풀이" backHref="/" backLabel="스타로그 홈으로" />
      {share.kind === "tarot" ? <SharedTarotView share={share} /> : share.kind === "saju" ? <SharedSajuView share={share} /> : <SharedDailyView share={share} />}
    </>
  );
}
