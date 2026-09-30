import Link from "next/link";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import { ChevronIcon } from "./icons";
import s from "./home.module.css";

type StoryHeroProps = {
  /** Number of the chapter a new reading would open, e.g. 2. */
  nextChapter: number;
  /** Title of the latest chapter, shown as where the story left off. */
  lastTitle: string | null;
};

/** Returning visitor: the cat next to the story card, which opens 나의 스타로그. */
export function StoryHero({ nextChapter, lastTitle }: StoryHeroProps) {
  return (
    <section className={s.hero} aria-label={`나의 ${SITE.nameKo}`}>
      <div className={s.heroCat}>
        <Cat outfit="tarot" size={124} />
      </div>
      <Link href="/story" className={s.storyCard}>
        <span className={s.storyEyebrow}>{`나의 ${SITE.nameKo} · ${nextChapter}장`}</span>
        <span className={s.storyTitle}>다음 장을 열어볼까요</span>
        {lastTitle ? <span className={s.storyLast}>{`지난 장 · ${lastTitle}`}</span> : null}
        <span className={s.storyChevron}>
          <ChevronIcon />
        </span>
      </Link>
    </section>
  );
}

/** First visit: both characters introduce themselves; the only gold button starts a first reading. */
export function WelcomeHero() {
  return (
    <section className={`${s.hero} ${s.welcome}`} aria-labelledby="welcome-title">
      <div className={s.welcomeCast}>
        <Cat outfit="tarot" size={136} />
        <Rabbit outfit="tarot" size={108} />
      </div>
      <p id="welcome-title" className={s.welcomeText}>
        <span className={s.welcomeLine}>처음 오셨네요.</span> <span className={s.welcomeLine}>고양이가 카드를,</span>{" "}
        <span className={s.welcomeLine}>토끼가 기록을 맡아요.</span>
      </p>
      <div className={s.welcomeCta}>
        <Button href="/tarot/new" block trailing="→">
          첫 타로 보기
        </Button>
      </div>
    </section>
  );
}
