import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { BIRTH_CARDS, BIRTH_CARD_NOTE, BIRTH_CARD_PATH, BIRTH_CARD_TITLE, birthCardPath } from "@/lib/birthCard";
import { pageMetadata } from "@/lib/seo";
import { BackLink } from "./BackLink";
import { BirthCardForm } from "./BirthCardForm";
import s from "./birthCard.module.css";

export const metadata: Metadata = pageMetadata({
  title: `${BIRTH_CARD_TITLE} · 생년월일 탄생 카드 테스트`,
  description: "생년월일을 고르면 메이저 아르카나 22장 가운데 나를 닮은 타로 카드 한 장과 그 카드가 보여 주는 나의 모습을 알려 드려요. 무료이고 로그인 없이 볼 수 있어요.",
  path: BIRTH_CARD_PATH,
});

/**
 * 나를 닮은 타로 카드 (free test ①): the date fields, how the card is found, and the 22 cards. The form sends
 * the visitor to /birth-card/<slug>; the date never leaves the browser.
 */
export default function BirthCardPage() {
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={22} />
      <main className={`page-col ${s.screen}`}>
        <BackLink href="/" label="홈으로" />
        <div className={s.intro}>
          <h1 className={s.heading}>
            <span className={s.title}>{BIRTH_CARD_TITLE}</span> <span className={s.sub}>생년월일로 찾는 나의 탄생 카드</span>
          </h1>
          <p className={s.lead}>생년월일 숫자로 메이저 아르카나 22장 가운데 나를 닮은 한 장을 찾아요. 무료이고, 로그인하지 않아도 돼요.</p>
        </div>

        <BirthCardForm id="birth-card" />

        <section className={s.block} aria-labelledby="birth-card-how">
          <h2 id="birth-card-how" className={s.blockTitle}>
            카드는 이렇게 정해요
          </h2>
          <p className={s.prose}>
            생년월일 여덟 자리 숫자를 모두 더해요. 합이 22보다 크면 그 수의 숫자를 한 번 더 더하고, 22가 나오면 0번 바보 카드예요. 음력 생일은 양력 날짜로 바꿔서 더해요.
          </p>
          <p className={s.example}>예: 1990년 5월 15일 → 1+9+9+0+0+5+1+5 = 30 → 3+0 = 3, 여황제</p>
        </section>

        <nav className={s.block} aria-labelledby="birth-card-all">
          <h2 id="birth-card-all" className={s.blockTitle}>
            메이저 아르카나 22장
          </h2>
          <ul className={s.cardList}>
            {BIRTH_CARDS.map((card) => (
              <li key={card.slug}>
                <Link href={birthCardPath(card.slug)} className={s.cardLink}>
                  <span className={s.cardRoman}>{card.roman}</span>
                  {card.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className={s.note}>{BIRTH_CARD_NOTE}</p>
      </main>
      <Footer />
    </div>
  );
}
