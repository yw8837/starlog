import Link from "next/link";
import { AiNote } from "@/components/reading/AiNote";
import { PREMIUM, premiumPath, type PremiumId } from "@/lib/premium/products";
import { PREMIUM_SAMPLES } from "@/lib/premium/samples";
import { DeepTarotArticle } from "./DeepTarotArticle";
import { MatchArticle } from "./MatchArticle";
import { NewYearArticle } from "./NewYearArticle";
import s from "./landing.module.css";

/** The sample reading in the 1909 design its text quotes (the placeholder samples were written for those pictures). */
const DECK = "rws1909";

/**
 * A product's whole sample (noindex, plan-reconciled §4.6): the 13px line saying it was made from a made-up input and
 * what that input was, then the reading as its record shows it. Rendered on the server from the sample JSON.
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
          {`← ${spec.entry} 안내로`}
        </Link>
        <p className={s.eyebrow}>샘플</p>
        <h1 id="sample-title" className={s.title}>{`${spec.entry} 샘플`}</h1>
        <p className={s.note}>{`가상의 입력으로 만든 샘플이에요 · ${PREMIUM_SAMPLES[id].input.summary}`}</p>
      </header>
      <div className={s.sampleBody}>
        {article}
        <AiNote />
      </div>
    </article>
  );
}
