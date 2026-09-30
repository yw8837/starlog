import Link from "next/link";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { TarotCard } from "@/components/tarot/TarotCard";
import { FortuneCookie } from "@/components/today/FortuneCookie";
import type { GuideArticle } from "@/lib/guide";
import { ChevronIcon } from "./icons";
import s from "./home.module.css";

/**
 * Row 1: the cat astrologer beside the gold 타로 보기 card, the screen's one primary. The character
 * stands outside the link, so tapping it only makes it react.
 */
export function TarotEntry() {
  return (
    <div className={s.entryRow}>
      <span className={s.entryCharacter}>
        <Cat outfit="tarot" size={100} />
      </span>
      <Link href="/tarot/new" className={`${s.entry} ${s.entryPrimary}`}>
        <span className={s.entryText}>
          <span className={s.entryTitle}>타로 보기</span>
          <span className={s.entrySub}>카드 3장으로 지금을 봐요</span>
        </span>
        <span className={s.entryChevron}>
          <ChevronIcon />
        </span>
      </Link>
    </div>
  );
}

/** Row 2, mirrored: the hanji-cream 사주 보기 card, then the rabbit in hanbok (saju mode's leader). */
export function SajuEntry() {
  return (
    <div className={s.entryRow}>
      <Link href="/saju/new" className={`${s.entry} ${s.entryHanji}`}>
        <span className={s.entryText}>
          <span className={s.entryTitle}>사주 보기</span>
          <span className={s.entrySub}>타고난 결로 나를 봐요</span>
        </span>
        <span className={s.entryChevron}>
          <ChevronIcon />
        </span>
      </Link>
      <span className={s.entryCharacter}>
        <Rabbit outfit="hanbok" size={100} />
      </span>
    </div>
  );
}

/** A face-down card with a big question mark: one card for whatever is on your mind now. */
function NowIcon() {
  return (
    <span className={s.nowIcon} aria-hidden="true">
      <TarotCard faceUp={false} size="sm" className={s.nowCard} />
      <span className={s.nowMark}>?</span>
    </span>
  );
}

/** Row 3: the two quick, free cards side by side (지금의 한 장 wider, 오늘의 한 장 narrower). */
export function QuickCards() {
  return (
    <div className={s.quick}>
      <Link href="/now" className={`${s.quickCard} ${s.quickWide}`}>
        <NowIcon />
        <span className={s.quickText}>
          <span className={s.quickTitle}>지금의 한 장</span>
          <span className={s.quickSub}>고민 한 줄 쓰고 카드 한 장 · 무제한 무료</span>
        </span>
      </Link>
      <Link href="/today" className={s.quickCard}>
        <span className={s.cookieIcon} aria-hidden="true">
          <FortuneCookie size={58} />
        </span>
        <span className={s.quickText}>
          <span className={s.quickTitle}>오늘의 한 장</span>
          <span className={s.quickSub}>매일 무료</span>
        </span>
      </Link>
    </div>
  );
}

/** Guide articles as link chips. */
export function GuideChips({ articles }: { articles: readonly GuideArticle[] }) {
  return (
    <section className={s.section} aria-labelledby="guide-title">
      <div className={s.sectionHead}>
        <h2 id="guide-title" className={s.sectionTitle}>
          가이드
        </h2>
        <Link href="/guide" className={s.more}>
          전체 보기
        </Link>
      </div>
      <ul className={s.chips}>
        {articles.map((article) => (
          <li key={article.slug}>
            <Link href={`/guide/${article.slug}`} className={s.chip}>
              {article.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
