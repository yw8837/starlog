import Link from "next/link";
import { AccordionItem } from "@/components/info/InfoPage";
import info from "@/components/info/info.module.css";
import { JsonLd } from "@/components/seo/JsonLd";
import { Paper } from "@/components/tarot/Paper";
import { Button } from "@/components/ui/Button";
import { SITE, won } from "@/lib/config";
import { findArticle } from "@/lib/guide";
import { absoluteUrl, guideHref } from "@/lib/hosts";
import { REFUND_DAYS } from "@/lib/pay/catalog";
import { LANDING } from "@/lib/premium/landing";
import { opensAtText } from "@/lib/premium/offer";
import { PREMIUM, premiumPath, type PremiumId } from "@/lib/premium/products";
import { PREMIUM_SAMPLES, sampleExcerpt } from "@/lib/premium/samples";
import s from "./landing.module.css";

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

/** schema.org Product + Offer for the page (price in KRW; a pre-order before the sales window opens). */
function productJsonLd(id: PremiumId, soon: boolean, open: boolean) {
  const spec = PREMIUM[id];
  const url = absoluteUrl(premiumPath(id));
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: LANDING[id].title,
    description: LANDING[id].description,
    brand: { "@type": "Brand", name: SITE.nameKo },
    url,
    offers: {
      "@type": "Offer",
      priceCurrency: "KRW",
      price: spec.krw,
      url,
      availability: soon ? "https://schema.org/PreOrder" : open ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      ...(soon && spec.opensAt !== undefined ? { availabilityStarts: new Date(spec.opensAt).toISOString() } : {}),
    },
  };
}

/**
 * A premium product page (plan-reconciled §4.6), rendered on the server per request: the name, the price and one gold
 * 시작하기 (or when it opens / 준비 중이에요), 이렇게 읽어요 (what is read, three steps, what one purchase holds), a sample
 * excerpt and the whole sample, the same action again as a secondary, the guide article and three questions, and the
 * refund summary. `open`: this device may start it now (premiumOpen).
 */
export function PremiumLanding({ id, open, now }: { id: PremiumId; open: boolean; now: number }) {
  const spec = PREMIUM[id];
  const copy = LANDING[id];
  const soon = !open && spec.opensAt !== undefined && spec.opensAt > now;
  const excerpt = sampleExcerpt(id);
  const guide = findArticle(copy.guide);
  const action = (primary: boolean) =>
    open ? (
      <Button href={copy.start} variant={primary ? "primary" : "secondary"} block trailing="→">
        시작하기
      </Button>
    ) : (
      <p className={s.state}>{soon && spec.opensAt !== undefined ? opensAtText(spec.opensAt) : "준비 중이에요"}</p>
    );

  return (
    <article className={s.page} aria-labelledby="premium-title">
      <JsonLd data={productJsonLd(id, soon, open)} />
      <header className={s.head}>
        <p className={s.eyebrow}>프리미엄 풀이</p>
        <h1 id="premium-title" className={s.title}>
          {spec.entry}
        </h1>
        <p className={s.sub}>{spec.entry === spec.name ? spec.sub : `${spec.name} · ${spec.sub}`}</p>
        <p className={s.price}>
          {won(spec.krw)}
          <span className={s.priceUnit}>1회</span>
        </p>
        {action(true)}
      </header>

      <section className={s.section} aria-labelledby="premium-how">
        <h2 id="premium-how" className={s.sectionTitle}>
          이렇게 읽어요
        </h2>
        <p className={s.text}>{copy.method}</p>
        <ol className={s.steps}>
          {copy.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <h3 className={s.subTitle}>한 번 결제하면 담기는 것</h3>
        <ul className={s.checks}>
          {spec.scope.map((line) => (
            <li key={line}>
              <CheckIcon />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.section} aria-labelledby="premium-sample">
        <h2 id="premium-sample" className={s.sectionTitle}>
          샘플로 미리 보기
        </h2>
        <p className={s.note}>{`가상의 입력으로 만든 샘플이에요 · ${PREMIUM_SAMPLES[id].input.summary}`}</p>
        <Paper as="div" className={s.excerpt}>
          <h3 className={s.excerptHeading}>{excerpt.heading}</h3>
          <p className={s.excerptBody}>{excerpt.body}</p>
        </Paper>
        <Link href={`${premiumPath(id)}/sample`} className={s.more}>
          샘플 전체 보기 →
        </Link>
      </section>

      <div className={s.again}>{action(false)}</div>

      <section className={s.section} aria-labelledby="premium-more">
        <h2 id="premium-more" className={s.sectionTitle}>
          더 알아보기
        </h2>
        {guide ? (
          <Link href={guideHref(`/guide/${guide.slug}`)} className={s.guide}>
            <span className={s.guideLabel}>가이드 글</span>
            <span className={s.guideTitle}>{guide.title}</span>
          </Link>
        ) : null}
        <ul className={info.list}>
          {copy.faqs.map((faq, i) => (
            <li key={faq.q}>
              <AccordionItem id={`premium-faq-${i + 1}`} title={faq.q}>
                <p>{faq.a}</p>
              </AccordionItem>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.section} aria-labelledby="premium-refund">
        <h2 id="premium-refund" className={s.sectionTitle}>
          결제와 환불
        </h2>
        <p className={s.text}>
          {`결제하면 바로 풀이를 적기 시작하고, 적기 시작하면 청약철회가 제한돼요. 열기 전에는 결제일로부터 ${REFUND_DAYS}일 안에 전액 환불받을 수 있어요. 다 받기 전에 화면을 닫거나 연결이 끊겨도 3번까지 다시 열어 끝까지 받을 수 있어요. `}
          <Link href="/refund">환불 정책</Link>
        </p>
      </section>
    </article>
  );
}
