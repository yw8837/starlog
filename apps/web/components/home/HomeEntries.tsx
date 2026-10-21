import Link from "next/link";
import { GuideThumb } from "@/app/guide/GuideThumb";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { AccordionItem } from "@/components/info/InfoPage";
import info from "@/components/info/info.module.css";
import { faqGroups, type FaqEntry } from "@/lib/faq";
import { GUIDE_CATEGORIES, GUIDE_CATEGORY_LABEL, articlesIn, guideIndexPath } from "@/lib/guide";
import { guideHref } from "@/lib/hosts";
import { INFO_PAGES } from "@/lib/infoPages";
import { ArrowIcon, ChevronIcon } from "./icons";
import { TarotEntryLink } from "./TarotEntryLink";
import s from "./home.module.css";
import { NEW_SAJU_HREF } from "@/lib/freshStart";

/** What the site is, in one line, then who reads what. The page's one <h1>. */
export function HomeHero() {
  return (
    <div className={s.hero}>
      <h1 className={s.heroTitle}>
        <span className={s.heroLine}>연애도 일도 사람 사이도</span> <span className={s.heroLine}>고민 그대로 편하게 물어보세요</span>
      </h1>
      <p className={s.heroSub}>타로는 고양이 타로로가, 사주는 토끼 사주주가 내 상황에 맞춰 읽어 드려요.</p>
    </div>
  );
}

/**
 * Row 1: the gold 타로 보기 card, the screen's one primary, with the cat astrologer standing inside
 * it on the left. The cat is a sibling laid over the card, not part of the link: tapping it only
 * makes it react. The link is the builder, or the 다리 화면 where premium is visible (TarotEntryLink).
 */
export function TarotEntry() {
  return (
    <div className={`${s.entryRow} ${s.entryRowStart}`}>
      <TarotEntryLink className={`${s.entry} ${s.entryPrimary}`}>
        <span className={s.entryText}>
          <span className={s.entryTitle}>타로 보기</span>
          <span className={s.entrySub}>카드 3장으로 지금을 봐요</span>
          <span className={s.entryCta}>
            카드 세 장 뽑기
            <ChevronIcon size={16} />
          </span>
        </span>
      </TarotEntryLink>
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
      <Link href={NEW_SAJU_HREF} className={`${s.entry} ${s.entryHanji}`}>
        <span className={s.entryText}>
          <span className={s.entryTitle}>사주 보기</span>
          <span className={s.entrySub}>타고난 결로 나를 봐요</span>
          <span className={s.entryCta}>
            내 사주 보기
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
 * The day's card face up, no words: a sun rising over the hills under a lucky sparkle — "today"
 * and "fortune" in one picture. No date, so a prerendered home never shows a stale one. Pairs with
 * 지금의 한 장's card back.
 */
function TodayIcon() {
  return (
    <span className={`${s.miniCard} ${s.todayIcon}`} aria-hidden="true">
      <svg className={s.todayArt} viewBox="0 0 42 64" focusable="false">
        <defs>
          <linearGradient id="today-dawn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff5de" />
            <stop offset="1" stopColor="#f8cc88" />
          </linearGradient>
        </defs>
        <rect width="42" height="64" fill="url(#today-dawn)" />
        {/* rays, then the rising sun, then the low hills in front of it */}
        <g stroke="#eb9f2c" strokeWidth="1.8" strokeLinecap="round">
          <path d="M21 29.5V25M30.5 33.5l3.2-3.2M11.5 33.5l-3.2-3.2M34.2 39.6l4.3-1.2M7.8 39.6l-4.3-1.2" />
        </g>
        <path d="M10.5 44a10.5 10.5 0 0 1 21 0z" fill="#f0a32e" />
        <path d="M0 44c6-3.6 11-3.8 16.5-1.6 5.5 2.2 11 2.4 17-.6 3-1.5 6-2 8.5-1.8V64H0z" fill="#e0a052" />
        <path d="M0 52c7-3.4 13.5-3.2 20-.6 6.2 2.5 12.6 2.2 22-1V64H0z" fill="#c4843a" />
        {/* the lucky sparkle and two small stars */}
        <path d="M31 6c.7 3.5 1.9 4.7 5.4 5.4-3.5.7-4.7 1.9-5.4 5.4-.7-3.5-1.9-4.7-5.4-5.4 3.5-.7 4.7-1.9 5.4-5.4z" fill="#eea92a" />
        <circle cx="10" cy="11" r="1.3" fill="#eea92a" />
        <circle cx="14.5" cy="17.5" r="0.9" fill="#eea92a" fillOpacity="0.8" />
        <rect x="3" y="3" width="36" height="58" rx="3.5" fill="none" stroke="#fff3d6" strokeOpacity="0.7" strokeWidth="0.9" />
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
          <span className={s.quickSub}>카드로 보는 오늘의 운세</span>
          <span className={s.quickTag}>매일 무료</span>
        </span>
      </Link>
    </div>
  );
}

/** The home shows this many articles per tab; the rest are one tap away on the tab ("전체 보기"). */
const HOME_GUIDE_PER_TAB = 4;

/** Row 5: the first four guide articles of each tab as cards, split 타로 / 사주 as on /guide/tarot and /guide/saju. */
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
        <Link href={guideHref(guideIndexPath("tarot"))} className={s.more}>
          전체 보기
          <ArrowIcon />
        </Link>
      </div>

      <div className={s.guideGroups}>
        {GUIDE_CATEGORIES.map((category) => (
          <div key={category} className={s.guideGroup}>
            <h3 className={s.guideGroupTitle}>
              <Link href={guideHref(guideIndexPath(category))} className={s.guideGroupLink}>
                <span className={s.dot} data-tone={category} aria-hidden="true" />
                {GUIDE_CATEGORY_LABEL[category]} 가이드
                <ChevronIcon size={16} />
              </Link>
            </h3>
            <ul className={s.guideList}>
              {articlesIn(category).slice(0, HOME_GUIDE_PER_TAB).map((article) => (
                <li key={article.slug}>
                  <Link href={guideHref(`/guide/${article.slug}`)} className={s.guideItem}>
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

/** The four questions that build trust before a first try: how a reading is made, where the birth date goes, the price, the chatbot comparison. */
export const HOME_FAQ_IDS = ["how-made", "birth-saved", "free", "chatgpt"] as const;

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
