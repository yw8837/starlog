import type { Metadata } from "next";
import Link from "next/link";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { LegalNote, LegalPage, LegalSection } from "@/components/legal/LegalPage";
import s from "@/components/legal/legal.module.css";
import { ReviewList } from "@/components/reviews/ReviewList";
import { OpeningOnly } from "@/components/ui/OpeningOnly";
import { SITE, won } from "@/lib/config";
import { openingFreeText, times } from "@/lib/helpGuide";
import { REFUND_DAYS, standardProduct } from "@/lib/pay/catalog";
import { premiumPath } from "@/lib/premium/products";
import { approxCharsText } from "@/lib/pricing";
import { sajuFreeLine, sajuPricingLine } from "@/lib/sajuTopicCopy";
import { pageMetadata } from "@/lib/seo";
import { PremiumPricing } from "./PremiumPricing";

const { price, reading, beta, features } = SITE;

export const metadata: Metadata = pageMetadata({
  title: "가격 안내",
  description: `타로 전체 풀이 ${won(price.tarotStandardKrw)}, 사주 전체 풀이 ${won(price.sajuStandardKrw)}. 풀이 한 번에 담기는 것, 깊게 보는 풀이(${price.premium.map((p) => p.name).join("·")}), 무료로 볼 수 있는 부분, 결제 수단을 안내해요.`,
  path: "/pricing",
});

/**
 * The standard readings: what one opening includes, lengths from SITE.reading.approxChars. The picture
 * is the reader of each (the home entries' characters), so every product shows a name, a picture, a
 * description and a price.
 */
const PRODUCTS = [
  {
    name: standardProduct("tarot").name,
    href: "/tarot/new",
    cta: "타로 보기",
    sub: "카드 3장으로 보는 지금",
    krw: standardProduct("tarot").krw,
    includes: [`소제목으로 나눈 풀이 전체 · 약 ${approxCharsText(reading.approxChars.tarot)}자`, "카드별 풀이와 세 카드의 연결, 시기, 상황별 갈래, 오늘 해 볼 일"],
    picture: <Cat outfit="tarot" size={72} reactOnTap={false} />,
  },
  {
    name: standardProduct("saju").name,
    href: "/saju/new",
    cta: "사주 보기",
    sub: "타고난 결로 보는 나",
    krw: standardProduct("saju").krw,
    includes: [`소제목으로 나눈 풀이 전체 · 약 ${approxCharsText(reading.approxChars.saju)}자`, sajuPricingLine(features.sajuTopics)],
    picture: <Rabbit outfit="hanbok" size={72} reactOnTap={false} />,
  },
] as const;

/** One sentence with every price on this page: the two readings, then the premium ones by name. */
const PRICE_SUMMARY = `타로 전체 풀이는 ${won(price.tarotStandardKrw)}, 사주 전체 풀이는 ${won(price.sajuStandardKrw)}이고, 깊게 보는 풀이는 ${price.premium.map((p) => `${p.name} ${won(p.krw)}`).join(", ")}이에요.`;

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <LegalPage title="가격 안내" lead="풀이 한 번의 가격과 무료로 볼 수 있는 부분을 한곳에 모았어요.">
      {/* Every price in one sentence first (AEO), facts that stay true; the dated 오픈 기념 무료 only in the browser while it runs. */}
      <LegalNote>
        <p className={s.noteTitle}>{PRICE_SUMMARY}</p>
        <OpeningOnly>
          <p>{openingFreeText(beta.firstFreeTarot)}</p>
        </OpeningOnly>
        <p>가격이 바뀔 때는 이 페이지에 먼저 알려 드려요.</p>
      </LegalNote>

      <LegalSection id="readings" title="풀이 가격">
        <div className={`${s.cards} ${s.cardsTwo}`}>
          {PRODUCTS.map((product, i) => (
            <section key={product.name} className={s.card} aria-labelledby={`product-${i}`}>
              <div className={s.cardHead}>
                {product.picture}
                <div>
                  <h3 id={`product-${i}`} className={s.cardTitle}>
                    {product.name}
                  </h3>
                  <p className={s.cardSub}>{product.sub}</p>
                </div>
              </div>
              <p className={s.price}>
                {won(product.krw)}
                <span className={s.priceUnit}>1회</span>
              </p>
              <ul className={s.checks}>
                {[...product.includes, `이어서 물어보기 ${reading.followUps}번`, "이 기기에 계속 보관"].map((item) => (
                  <li key={item}>
                    <Check />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p>
                <Link href={product.href}>{product.cta}</Link>
              </p>
              <p className={s.muted}>서비스 제공 기간: 결제 즉시 · 결제하면 바로 풀이가 열리는 디지털 콘텐츠예요.</p>
              <p className={s.muted}>
                {`열기 전에는 결제일로부터 ${REFUND_DAYS}일 안에 전액 환불받을 수 있어요. `}
                <Link href="/refund">환불 정책</Link>
              </p>
            </section>
          ))}
        </div>
        <p>
          로그인해 결제하고 연 풀이는 계정에도 보관돼 다른 기기에서 볼 수 있어요. 오픈 기념 무료로 연 풀이는 내 기록에 보관돼요(이어서 물어보기 제외).
        </p>
      </LegalSection>

      {/* 풀이 후기: shows itself once there is one (spec 2026-10-13 §7) */}
      <ReviewList />

      {/* 깊게 보는 풀이 where premium is visible (plan-reconciled §4.2). The server's first render, and the page while
          STARLOG_PREMIUM is off, names and prices them plainly: never 준비 중 for a reading on sale (review 2026-10-20 A3),
          each with a static link to its product page so crawlers find it (SEO P1-1; turning premium off then needs a deploy to drop them). */}
      <PremiumPricing
        fallback={
          <LegalSection id="premium" title="깊게 보는 풀이">
            <div className={s.cards}>
              {price.premium.map((product) => (
                <section key={product.id} className={s.card} aria-labelledby={`premium-${product.id}`}>
                  <div>
                    <h3 id={`premium-${product.id}`} className={s.cardTitle}>
                      {product.name}
                    </h3>
                    <p className={s.cardSub}>{product.sub}</p>
                  </div>
                  <p className={s.price}>
                    {won(product.krw)}
                    <span className={s.priceUnit}>1회</span>
                  </p>
                  {product.opens ? <p className={s.muted}>{product.opens}</p> : null}
                  <p>
                    <Link href={premiumPath(product.id)}>자세히 보기</Link>
                  </p>
                </section>
              ))}
            </div>
            <p>{`깊게 보는 풀이도 결제와 환불 기준은 같아요. 열기 전에는 결제일로부터 ${REFUND_DAYS}일 안에 전액 환불받을 수 있어요.`}</p>
          </LegalSection>
        }
      />

      <LegalSection id="free" title="무료로 볼 수 있는 부분">
        <ul className={s.list}>
          <OpeningOnly>
            <li>{openingFreeText(beta.firstFreeTarot)}</li>
          </OpeningOnly>
          <li>{`타로는 뽑은 카드 3장과 첫 풀이, 이어지는 풀이의 소제목을 먼저 무료로 볼 수 있어요. 첫 풀이는 하루 ${times(beta.teaserPerDay)}까지 볼 수 있어요.`}</li>
          <li>{sajuFreeLine(features.sajuTopics, beta.teaserPerDay)}</li>
          <li>지금의 한 장은 횟수 제한 없이, 오늘의 한 장은 하루 한 번 무료예요.</li>
        </ul>
      </LegalSection>

      <LegalSection id="payment" title="결제 수단과 영수증">
        <p>토스페이먼츠를 통해 신용·체크카드와 간편결제로 결제할 수 있어요. 풀이는 건별로 결제하고, 결제하면 바로 열려요.</p>
        <p>영수증은 내 정보 &gt; 결제 내역에서 볼 수 있어요.</p>
        <p>
          {`결제한 풀이는 결제 직후 자동으로 적기 시작하고, 적기 시작하면 청약철회가 제한돼요. 열기 전에는 결제일로부터 ${REFUND_DAYS}일 안에 전액 환불받을 수 있어요. 자세한 내용은 `}
          <Link href="/refund">환불 정책</Link>
          {"에 적어 두었어요."}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
