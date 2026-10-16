import Link from "next/link";
import { AiNote } from "@/components/reading/AiNote";
import { PREMIUM, premiumPath, type PremiumId } from "@/lib/premium/products";
import { MATCH_SECOND_SAMPLE, PREMIUM_SAMPLES } from "@/lib/premium/samples";
import { DeepTarotArticle } from "./DeepTarotArticle";
import { MatchArticle } from "./MatchArticle";
import { NewYearArticle } from "./NewYearArticle";
import s from "./landing.module.css";

/** The sample reading in the 1909 design its text quotes (the eval read the cards in those pictures). */
const DECK = "rws1909";

/**
 * A product's whole sample (noindex, plan-reconciled §4.6): the 13px line saying it was made from a made-up input and
 * what that input was, then the reading as its record shows it. Rendered on the server from the sample JSON. The 궁합
 * shows a second one after it, the other person's birth time unknown (owner 2026-10-17).
 */
export function PremiumSample({ id }: { id: PremiumId }) {
  const spec = PREMIUM[id];
  let article;
  if (id === "tarot-deep") {
    const sample = PREMIUM_SAMPLES["tarot-deep"];
    article = <DeepTarotArticle reading={sample.reading} cards={sample.cards} deck={DECK} />;
  } else if (id === "match") {
    const sample = PREMIUM_SAMPLES.match;
    article = <MatchArticle reading={sample.reading} cards={sample.cards} deck={DECK} />;
  } else {
    article = <NewYearArticle reading={PREMIUM_SAMPLES["newyear-2027"].reading} />;
  }
  return (
    <article aria-labelledby="sample-title">
      <header className={s.sampleHead}>
        <Link href={premiumPath(id)} className={s.back}>
          {`← ${spec.name} 안내로`}
        </Link>
        <p className={s.eyebrow}>샘플</p>
        <h1 id="sample-title" className={s.title}>{`${spec.name} 샘플`}</h1>
        <p className={s.note}>{`가상의 입력으로 만든 샘플이에요 · ${PREMIUM_SAMPLES[id].input.summary}`}</p>
      </header>
      <div className={s.sampleBody}>
        {article}
        {id === "match" ? (
          <section className={s.sampleBody} aria-labelledby="sample-second-title">
            <header className={s.sampleHead}>
              <p className={s.eyebrow}>두 번째 샘플</p>
              <h2 id="sample-second-title" className={s.title}>상대가 태어난 시를 몰라도</h2>
              <p className={s.note}>{`가상의 입력으로 만든 샘플이에요 · ${MATCH_SECOND_SAMPLE.input.summary}`}</p>
            </header>
            <MatchArticle reading={MATCH_SECOND_SAMPLE.reading} cards={MATCH_SECOND_SAMPLE.cards} deck={DECK} />
          </section>
        ) : null}
        <AiNote />
      </div>
    </article>
  );
}
