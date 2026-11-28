import type { Metadata } from "next";
import Link from "next/link";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { Stepper } from "@/components/tarot/Stepper";
import { SpeechBubble } from "@/components/ui/SpeechBubble";
import { won } from "@/lib/config";
import { LANDING } from "@/lib/premium/landing";
import { PREMIUM, premiumPath } from "@/lib/premium/products";
import { sampleApproved } from "@/lib/premium/samples";
import { TOPIC_SECTIONS, sectionHook } from "@/lib/sajuTopics";
import { pageMetadata } from "@/lib/seo";
import { WORRIES_PATH, WORRY_CATEGORIES, worryMethod, worryPath, worryPremium, type Worry } from "@/lib/worries";
import { TarotLooks, WorryStart } from "./WorryStart";
import s from "./worry.module.css";

/**
 * The way it is read, its price, and what is free with a login (§12.2: a login is not a payment). The premium ones say it
 * as their product page does (lib/premium/landing.ts).
 */
function priceLines(worry: Worry): { price: string; free: string } {
  const method = worryMethod(worry);
  const premium = worryPremium(worry);
  const free = premium
    ? LANDING[premium].steps[1]
    : worry.reading.kind === "saju"
      ? "명식은 로그인 없이, 풀이 앞부분은 로그인하면 무료로 읽을 수 있어요"
      : "풀이 앞부분은 로그인하면 무료로 읽을 수 있어요";
  return { price: `${method.name} 전체 풀이 ${won(method.krw)}`, free };
}

export function worryMetadata(worry: Worry): Metadata {
  const method = worryMethod(worry);
  const { free } = priceLines(worry);
  return pageMetadata({
    title: worry.name,
    description: `'${worry.name}' 고민을 ${method.name} 풀이로 봐요. 전체 풀이 ${won(method.krw)}, ${free}.`,
    path: worryPath(worry.id),
  });
}

/** 이 풀이가 보는 것: the real question and positions (tarot), the real section headings (saju), the real parts (궁합). */
function Looks({ worry }: { worry: Worry }) {
  const reading = worry.reading;
  if (reading.kind === "tarot") return <TarotLooks id={worry.id} />;
  if (reading.kind === "saju") {
    return (
      <ol className={s.items}>
        {TOPIC_SECTIONS[reading.topic].map((heading) => (
          <li key={heading}>
            {sectionHook(heading) ? <strong className={s.hook}>{sectionHook(heading)}</strong> : null}
            <span className={sectionHook(heading) ? s.under : undefined}>{heading}</span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <>
      <p className={s.question}>{PREMIUM.match.sub}</p>
      <ol className={s.items}>
        {PREMIUM.match.parts.map((part) => (
          <li key={part}>{part}</li>
        ))}
      </ol>
    </>
  );
}

/**
 * One worry (spec 2026-11-26 worry catalog §5.2 in §12.2's order): its name and its reader's line; the way it is read, the
 * price and what is free with a login; 이 풀이가 보는 것 (with its scope where the name could read as a forecast); the start,
 * named after the next screen's step; then the questions to think over, the first shown and the other two folded (뽑기 전에
 * for tarot, 시작 전에 for saju and 궁합, which draw no card: code review 2026-11-26 A4). A plain content page like /pricing:
 * a back bar to /worries, no tab bar. `open`: the start may start now (false for a premium product visible but not yet on
 * sale, which says 준비 중이에요), decided by the page on the server.
 */
export function WorryScreen({ worry, open }: { worry: Worry; open: boolean }) {
  const { price, free } = priceLines(worry);
  const premium = worryPremium(worry);
  const category = WORRY_CATEGORIES.find((c) => c.id === worry.category)!.label;
  const [first, ...more] = worry.reflect;
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={19} />
      <main className="page-col">
        <Stepper label={`${category} 고민`} backHref={WORRIES_PATH} backLabel="고민 전체 보기로" />

        <header className={s.head}>
          <h1 className={s.title}>{worry.name}</h1>
          <div className={s.speaker}>
            {worry.reader === "cat" ? <Cat outfit="tarot" size={88} /> : <Rabbit outfit="hanbok" size={88} />}
            <SpeechBubble tail="left" className={s.bubble}>
              {worry.line}
            </SpeechBubble>
          </div>
        </header>

        <section className={s.price} aria-labelledby="worry-price-title">
          <h2 id="worry-price-title" className="sr-only">
            가격과 무료로 보는 부분
          </h2>
          <p className={s.priceLine}>{price}</p>
          <p className={s.free}>{free}</p>
        </section>

        <section className={s.section} aria-labelledby="worry-looks-title">
          <h2 id="worry-looks-title" className={s.sectionTitle}>
            이 풀이가 보는 것
          </h2>
          {worry.scope ? <p className={s.scope}>{worry.scope}</p> : null}
          <Looks worry={worry} />
        </section>

        <div className={s.start}>
          <WorryStart id={worry.id} open={open} />
          {premium && sampleApproved(premium) ? (
            <Link href={`${premiumPath(premium)}/sample`} className={s.sample}>
              샘플 전체 보기 →
            </Link>
          ) : null}
        </div>

        <section className={s.section} aria-labelledby="worry-reflect-title">
          <h2 id="worry-reflect-title" className={s.sectionTitle}>
            {worry.reading.kind === "tarot" ? "뽑기 전에 떠올려 봐" : "시작 전에 떠올려 봐"}
          </h2>
          <p className={s.note}>풀이 내용이 아니라, 시작하기 전에 혼자 떠올려 보는 질문이에요.</p>
          <p className={s.reflect}>{first}</p>
          <details className={s.more}>
            <summary>질문 두 개 더 보기</summary>
            <ul className={s.reflectList}>
              {more.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </details>
        </section>
      </main>
      <Footer />
    </div>
  );
}
