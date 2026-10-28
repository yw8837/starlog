import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { JsonLd } from "@/components/seo/JsonLd";
import { NightSky } from "@/components/sky/NightSky";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import { ShareButton } from "@/components/ui/ShareButton";
import { BIRTH_CARDS, BIRTH_CARD_NOTE, BIRTH_CARD_PATH, BIRTH_CARD_TITLE, birthCardOgPath, birthCardPath, findBirthCard, pairCardOf, type BirthCard } from "@/lib/birthCard";
import { SITE } from "@/lib/config";
import { TAROT_BRIDGE_HREF } from "@/lib/freshStart";
import { GUIDE_ARTICLES } from "@/lib/guide";
import { guideHref } from "@/lib/hosts";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { NOINDEX_FOLLOW, NOT_FOUND_METADATA, pageMetadata } from "@/lib/seo";
import { BackLink } from "../BackLink";
import { BirthCardForm } from "../BirthCardForm";
import s from "../birthCard.module.css";

/**
 * Built ahead (generateStaticParams), and rendered on demand when the built copy cannot be read: right after a deploy a
 * Cloudflare location (HKG, 2026-10-28) missed the new static assets for minutes and `dynamicParams = false` turned
 * that miss into a 404. Any other address is still a 404 (notFound below).
 */
export const dynamicParams = true;

export function generateStaticParams() {
  return BIRTH_CARDS.map((card) => ({ card: card.slug }));
}

function birthCardMetadata(card: BirthCard): Metadata {
  const base = pageMetadata({
    title: `${BIRTH_CARD_TITLE} · ${card.name}`,
    description: `생년월일로 찾는 ${BIRTH_CARD_TITLE}, ${card.roman} ${card.name}. ${card.traits.join(". ")}. 재미로 보는 무료 테스트예요.`,
    path: birthCardPath(card.slug),
  });
  // The card's own preview (Threads, KakaoTalk): its face and name, never the site's brand picture.
  const image = { url: birthCardOgPath(card.slug), width: 1200, height: 630, alt: `${BIRTH_CARD_TITLE} · ${card.name} · ${SITE.nameKo}` };
  return { ...base, robots: NOINDEX_FOLLOW, openGraph: { ...base.openGraph, images: [image] } };
}

export async function generateMetadata({ params }: PageProps<"/birth-card/[card]">): Promise<Metadata> {
  const card = findBirthCard((await params).card);
  return card ? birthCardMetadata(card) : NOT_FOUND_METADATA;
}

/**
 * One birth card, the same for whoever opens it: the one who just found it and a friend opening a shared
 * link. It never knows a date (the address is the slug), so it says 나를 닮은 타로 카드, and ends with the
 * form (#find) to find one's own. The face is always the Starlog deck's, whatever this device chose.
 */
export default async function BirthCardResultPage({ params }: PageProps<"/birth-card/[card]">) {
  const card = findBirthCard((await params).card);
  if (!card) notFound();
  const guide = GUIDE_ARTICLES.find((article) => article.cardId === card.cardId);
  const pair = pairCardOf(card);
  const url = `${SITE.url}${birthCardPath(card.slug)}`;
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={card.number + 30} />
      <main className={`page-col ${s.screen}`}>
        <JsonLd
          data={breadcrumbJsonLd([
            { name: SITE.nameKo, path: "/" },
            { name: BIRTH_CARD_TITLE, path: BIRTH_CARD_PATH },
            { name: card.name, path: birthCardPath(card.slug) },
          ])}
        />
        <BackLink href={BIRTH_CARD_PATH} label={`${BIRTH_CARD_TITLE} 처음으로`} />

        <section className={s.result} aria-labelledby="birth-card-name">
          <p className={s.eyebrow}>{BIRTH_CARD_TITLE}</p>
          <h1 id="birth-card-name" className={s.name}>
            <span className={s.roman}>{card.roman}</span> {card.name}
          </h1>
          <TarotCard cardId={card.cardId} faceUp deck="starlog" size="lg" alt={`${card.name} 타로 카드`} className={s.face} imageSizes="200px" loading="eager" />

          <div className={s.panel}>
            <h2 id="birth-card-traits" className={s.panelTitle}>
              이런 사람이에요
            </h2>
            <ul className={s.traits} aria-labelledby="birth-card-traits">
              {card.traits.map((trait) => (
                <li key={trait}>{trait}</li>
              ))}
            </ul>
            <h2 className={s.panelTitle}>요즘 이 카드가 묻는 것</h2>
            <p className={s.asks}>{card.asks}</p>
          </div>

          {pair ? (
            <section className={s.pair} aria-labelledby="birth-card-pair">
              <h2 id="birth-card-pair" className={s.panelTitle}>
                짝 카드
              </h2>
              <p className={s.pairHow}>
                {`${[...String(card.number)].join("+")} = ${pair.number}`}. 두 자리를 한 번 더 더하면 나오는, 나를 닮은 또 한 장이에요.
              </p>
              <Link href={birthCardPath(pair.slug)} className={s.pairLink}>
                <TarotCard cardId={pair.cardId} faceUp deck="starlog" size="sm" className={s.pairFace} imageSizes="56px" />
                <span className={s.pairText}>
                  <span className={s.pairName}>
                    <span className={s.roman}>{pair.roman}</span> {pair.name}
                  </span>
                  <span className={s.pairTrait}>{pair.traits[0]}</span>
                </span>
                <span className={s.pairArrow} aria-hidden="true">
                  →
                </span>
              </Link>
            </section>
          ) : null}

          <p className={s.nudge}>{card.nudge}</p>
          <div className={s.actions}>
            <Button href={TAROT_BRIDGE_HREF} block trailing="→">
              내 고민도 타로로 보기
            </Button>
            <div className={s.share}>
              <ShareButton
                text={`${BIRTH_CARD_TITLE}는 ${card.name} · ${SITE.nameKo}`}
                target={{ url, imageUrl: `${SITE.url}${birthCardOgPath(card.slug)}`, button: "내 카드 찾기", description: "생년월일로 찾는 나를 닮은 타로 카드예요. 내 카드도 찾아보세요.", imageSize: { width: 1200, height: 630 } }}
              />
            </div>
            <Button href="#find" variant="secondary" block>
              친구 생일로도 해 보기
            </Button>
          </div>
          <ul className={s.more}>
            <li>
              <Link href="/now">지금의 한 장도 무료로 뽑아 보기</Link>
            </li>
            {guide ? (
              <li>
                <Link href={guideHref(`/guide/${guide.slug}`)}>{card.name} 카드 뜻 자세히 보기</Link>
              </li>
            ) : null}
          </ul>
        </section>

        <section id="find" className={`${s.block} ${s.find}`} aria-labelledby="birth-card-find-title">
          <h2 id="birth-card-find-title" className={s.blockTitle}>
            내 카드 찾기
          </h2>
          <p className={s.prose}>생년월일을 고르면 메이저 아르카나 22장 가운데 나를 닮은 한 장을 찾아 드려요.</p>
          <BirthCardForm id="birth-card-find" primary={false} />
        </section>

        <p className={s.note}>{BIRTH_CARD_NOTE}</p>
      </main>
      <Footer />
    </div>
  );
}
