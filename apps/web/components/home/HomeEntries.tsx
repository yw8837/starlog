import Link from "next/link";
import { GuideThumb } from "@/app/guide/GuideThumb";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { AccordionItem } from "@/components/info/InfoPage";
import info from "@/components/info/info.module.css";
import { faqGroups, type FaqEntry } from "@/lib/faq";
import { GUIDE_CATEGORIES, GUIDE_CATEGORY_LABEL, articlesIn, guideIndexPath } from "@/lib/guide";
import { INFO_PAGES } from "@/lib/infoPages";
import { ArrowIcon, ChevronIcon } from "./icons";
import s from "./home.module.css";

/** What the site is, in one line, then who reads what. The page's one <h1>. */
export function HomeHero() {
  return (
    <div className={s.hero}>
      <h1 className={s.heroTitle}>
        <span className={s.heroLine}>마음에 걸리는 걸</span> <span className={s.heroLine}>카드와 사주로 차분히 풀어 봐요</span>
      </h1>
      <p className={s.heroSub}>타로는 고양이 점성술사가, 사주는 한복 입은 토끼 선생님이 읽어 줘요.</p>
    </div>
  );
}

/**
 * Row 1: the gold 타로 보기 card, the screen's one primary, with the cat astrologer standing inside
 * it on the left. The cat is a sibling laid over the card, not part of the link: tapping it only
 * makes it react.
 */
export function TarotEntry() {
  return (
    <div className={`${s.entryRow} ${s.entryRowStart}`}>
      <Link href="/tarot/new" className={`${s.entry} ${s.entryPrimary}`}>
        <span className={s.entryText}>
          <span className={s.entryTitle}>타로 보기</span>
          <span className={s.entrySub}>카드 3장으로 지금을 봐요</span>
          <span className={s.entryCta}>
            시작하기
            <ChevronIcon size={16} />
          </span>
        </span>
      </Link>
      <span className={s.entryCharacter}>
        <Cat outfit="tarot" size={120} />
      </span>
    </div>
  );
}

/** Row 2, mirrored: the hanji-cream 사주 보기 card with the rabbit in hanbok (saju mode's leader) on the right. */
export function SajuEntry() {
  return (
    <div className={`${s.entryRow} ${s.entryRowEnd}`}>
      <Link href="/saju/new" className={`${s.entry} ${s.entryHanji}`}>
        <span className={s.entryText}>
          <span className={s.entryTitle}>사주 보기</span>
          <span className={s.entrySub}>타고난 결로 나를 봐요</span>
          <span className={s.entryCta}>
            시작하기
            <ChevronIcon size={16} />
          </span>
        </span>
      </Link>
      <span className={s.entryCharacter}>
        <Rabbit outfit="hanbok" size={120} />
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

/** Row 3: the two quick, free cards, equal halves, quieter than the two entries above. */
export function QuickCards() {
  return (
    <div className={s.quick}>
      <Link href="/now" className={s.quickCard}>
        <NowIcon />
        <span className={s.quickText}>
          <span className={s.quickTitle}>지금의 한 장</span>
          <span className={s.quickSub}>고민 한 줄, 카드 한 장</span>
          <span className={s.quickTag}>무제한 무료</span>
        </span>
      </Link>
      <Link href="/today" className={s.quickCard}>
        <TodayIcon />
        <span className={s.quickText}>
          <span className={s.quickTitle}>오늘의 한 장</span>
          <span className={s.quickSub}>포춘쿠키 속 오늘의 카드</span>
          <span className={s.quickTag}>매일 무료</span>
        </span>
      </Link>
    </div>
  );
}

/** Row 5: the guide articles as cards, split 타로 / 사주 as on /guide/tarot and /guide/saju. */
export function HomeGuide() {
  return (
    <section className={s.section} aria-labelledby="home-guide-title">
      <div className={s.sectionHead}>
        <div className={s.sectionHeading}>
          <p className={s.eyebrow}>GUIDE</p>
          <h2 id="home-guide-title" className={s.sectionTitle}>
            알아 두면 좋은 이야기
          </h2>
        </div>
        <Link href={guideIndexPath("tarot")} className={s.more}>
          전체 보기
          <ArrowIcon />
        </Link>
      </div>

      <div className={s.guideGroups}>
        {GUIDE_CATEGORIES.map((category) => (
          <div key={category} className={s.guideGroup}>
            <h3 className={s.guideGroupTitle}>
              <Link href={guideIndexPath(category)} className={s.guideGroupLink}>
                <span className={s.dot} data-tone={category} aria-hidden="true" />
                {GUIDE_CATEGORY_LABEL[category]} 가이드
                <ChevronIcon size={16} />
              </Link>
            </h3>
            <ul className={s.guideList}>
              {articlesIn(category).map((article) => (
                <li key={article.slug}>
                  <Link href={`/guide/${article.slug}`} className={s.guideItem}>
                    <GuideThumb article={article} />
                    <span className={s.guideText}>
                      <span className={s.guideTitle}>{article.title}</span>
                      <span className={s.guideDesc}>{article.description}</span>
                    </span>
                    <span className={s.roundArrow} aria-hidden="true">
                      <ChevronIcon size={16} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The four questions a first visitor asks before trying: free, what shows first, no birth time, ChatGPT. */
export const HOME_FAQ_IDS = ["free", "preview", "birth-time", "chatgpt"] as const;

export function homeFaqEntries(): FaqEntry[] {
  const entries = faqGroups().flatMap((group) => group.entries);
  return HOME_FAQ_IDS.flatMap((id) => entries.filter((entry) => entry.id === id));
}

/**
 * FAQ on the home: the /faq accordion cards for four questions, then the way to the rest. Desktop
 * puts the heading and the link in a left column beside the list; the DOM order stays heading,
 * questions, link.
 */
export function HomeFaq() {
  return (
    <section className={`${s.section} ${s.faq}`} aria-labelledby="home-faq-title">
      <div className={s.faqHead}>
        <p className={s.eyebrow}>FAQ</p>
        <h2 id="home-faq-title" className={s.sectionTitle}>
          자주 묻는 질문
        </h2>
        <p className={s.faqLead}>처음 쓰기 전에 많이 묻는 것부터 모았어요.</p>
      </div>
      <ul className={`${info.list} ${s.faqList}`}>
        {homeFaqEntries().map((entry) => (
          <li key={entry.id}>
            <AccordionItem id={`home-faq-${entry.id}`} title={entry.q}>
              {entry.a.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {entry.link ? (
                <Link href={entry.link.href} className={info.more}>
                  {entry.link.label}
                </Link>
              ) : null}
            </AccordionItem>
          </li>
        ))}
      </ul>
      <Link href={INFO_PAGES.faq.path} className={`${s.more} ${s.faqMore}`}>
        전체 FAQ 보기
        <ArrowIcon />
      </Link>
    </section>
  );
}
