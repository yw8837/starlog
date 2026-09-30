import Link from "next/link";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { guideIndexPath, type GuideArticle } from "@/lib/guide";
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
    <span className={`${s.miniCard} ${s.nowIcon}`} aria-hidden="true">
      ?
    </span>
  );
}

/**
 * The day's card face up: a gold sun under a small 오늘 tab (no date, so a prerendered home never
 * shows a stale one). Pairs with 지금의 한 장's card back.
 */
function TodayIcon() {
  return (
    <span className={`${s.miniCard} ${s.todayIcon}`} aria-hidden="true">
      <span className={s.todayTab}>오늘</span>
      <svg width="30" height="30" viewBox="0 0 32 32" focusable="false">
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M16 2.5v3.5M16 26v3.5M2.5 16H6M26 16h3.5M6.5 6.5l2.5 2.5M23 23l2.5 2.5M6.5 25.5 9 23M23 9l2.5-2.5" />
        </g>
        <circle cx="16" cy="16" r="6.5" fill="currentColor" />
      </svg>
    </span>
  );
}

/** Row 3: the two quick, free cards side by side (지금의 한 장 wider, 오늘의 한 장 narrower). */
export function QuickCards() {
  return (
    <div className={s.quick}>
      <Link href="/now" className={s.quickCard}>
        <NowIcon />
        <span className={s.quickText}>
          <span className={s.quickTitle}>지금의 한 장</span>
          <span className={s.quickSub}>고민 한 줄 쓰고 카드 한 장 · 무제한 무료</span>
        </span>
      </Link>
      <Link href="/today" className={s.quickCard}>
        <TodayIcon />
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
        <Link href={guideIndexPath("tarot")} className={s.more}>
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
