import { TEMPLATES, getCard } from "@starlog/core";
import { Paper } from "@/components/tarot/Paper";
import { ReadingLayout } from "@/components/tarot/ReadingLayout";
import { SpreadRow, faceUpCard } from "@/components/tarot/SpreadRow";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import { RELATION_KO } from "@/lib/ai/prompts/match";
import { NEW_SAJU_HREF, NEW_TAROT_HREF } from "@/lib/freshStart";
import { PREMIUM, premiumPath } from "@/lib/premium/products";
import { topicLabel } from "@/lib/sajuTopics";
import type { SharedNow, SharedPremium, SharedSajuFree, SharedTarotFree } from "@/lib/share/payload";
import t from "../../today/TodayView.module.css";
import s from "../../chapter/[id]/ChapterView.module.css";
import f from "../../tarot/result/FreeResult.module.css";

/** "별(역)" */
export const shortCardName = (card: { cardId: string; orientation: string }) => `${getCard(card.cardId).names.ko}${card.orientation === "reversed" ? "(역)" : ""}`;

/** "별 · 역방향" */
const sideName = (card: { cardId: string; orientation: string }) => `${getCard(card.cardId).names.ko} · ${card.orientation === "reversed" ? "역방향" : "정방향"}`;

/** The way in at the end of every shared page, and back to the Starlog home. */
function TryOwn({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <section className={s.invite} aria-labelledby="try-title">
      <h2 id="try-title" className={s.inviteTitle}>
        {title}
      </h2>
      <p className={s.inviteText}>{text}</p>
      {children}
      <Button href="/" variant="ghost" block>
        스타로그 홈으로
      </Button>
    </section>
  );
}

/** A shared 지금의 한 장 (owner 2026-10-23): the line as the title, the card in its design, why it says so; then one's own draw. */
export function SharedNowView({ share }: { share: SharedNow }) {
  const name = sideName(share.card);
  return (
    <article className={t.opened} aria-labelledby="shared-now-title">
      <header className={s.head}>
        <p className={s.eyebrow}>친구가 뽑은 지금의 한 장</p>
        <h1 id="shared-now-title" className={s.title}>
          {share.answer}
        </h1>
        <p className={s.question}>친구가 마음속 고민에 뽑은 카드가 건넨 한 문장이에요. 적은 고민은 공유되지 않아요.</p>
      </header>
      <div className={t.cardBlock}>
        <TarotCard cardId={share.card.cardId} orientation={share.card.orientation} faceUp size="md" highlight className={t.card} label={name} deck={share.deck} />
        <p className={t.cardName}>{name}</p>
      </div>
      <Paper>
        <p className={t.prose}>{share.why}</p>
      </Paper>
      <TryOwn title="나도 한 장 뽑아 보기" text="고민 하나를 떠올리고 78장 가운데 끌리는 한 장을 골라 봐요. 언제나 무료예요.">
        <Button href="/now" block trailing="→">
          나도 한 장 뽑아 보기
        </Button>
        <Button href={NEW_TAROT_HREF} variant="secondary" block>
          타로 보기
        </Button>
      </TryOwn>
    </article>
  );
}

/** A shared free first tarot reading: the cards, the first paragraph, the second up to where the free screen cut it. */
export function SharedTarotFreeView({ share, title }: { share: SharedTarotFree; title: string }) {
  return (
    <ReadingLayout
      head={
        <header className={s.head}>
          <p className={s.eyebrow}>친구가 공유한 무료 타로 풀이</p>
          <h1 className={s.title}>{title}</h1>
          <p className={s.question}>질문 원문과 직접 쓴 말은 공유한 사람만 볼 수 있어요.</p>
        </header>
      }
      spread={<SpreadRow size="sm" cards={share.cards.map(faceUpCard)} deck={share.deck} />}
    >
      <Paper as="article" aria-labelledby="shared-first-title">
        <h2 id="shared-first-title" className={f.cardHeading}>
          {share.first.heading}
        </h2>
        <p className={f.prose}>{share.first.body}</p>
      </Paper>
      {share.second ? (
        <Paper as="article" aria-labelledby="shared-second-title">
          <h2 id="shared-second-title" className={f.cardHeading}>
            {share.second.heading}
          </h2>
          <p className={`${f.prose} ${f.cut}`}>
            {share.second.body}
            <span aria-hidden="true"> …</span>
          </p>
          <p className={f.nudge}>이어지는 이야기는 공유한 사람만 볼 수 있어요</p>
        </Paper>
      ) : null}
      <TryOwn title="나도 카드 뽑아 보기" text="마음에 걸리는 일 하나를 골라 카드로 물어봐요. 첫 풀이는 무료로 볼 수 있어요.">
        <Button href={NEW_TAROT_HREF} block trailing="→">
          타로 보기
        </Button>
        <Button href="/now" variant="secondary" block>
          무료로 한 장 뽑기
        </Button>
      </TryOwn>
    </ReadingLayout>
  );
}

/** A shared saju 맛보기: its 운, title and summary. */
export function SharedSajuFreeView({ share }: { share: SharedSajuFree }) {
  return (
    <article aria-labelledby="shared-saju-free-title">
      <header className={s.head}>
        <p className={s.eyebrow}>{`친구가 공유한 ${share.topic ? `${topicLabel(share.topic)} ` : "사주 "}맛보기`}</p>
        <h1 id="shared-saju-free-title" className={s.title}>
          {share.title}
        </h1>
        <p className={s.question}>생년월일과 태어난 시각, 명식은 공유한 사람만 볼 수 있어요.</p>
      </header>
      <Paper>
        <p className={f.prose}>{share.summary}</p>
      </Paper>
      <TryOwn title="내 사주도 보기" text="태어난 날만 고르면 만세력으로 사주를 계산해 맛보기를 무료로 보여 줘요.">
        <Button href={NEW_SAJU_HREF} block trailing="→">
          사주 보기
        </Button>
      </TryOwn>
    </article>
  );
}

/** A shared premium reading: its name and what its share image draws (the ten cards, the relation, the year's title). */
export function SharedPremiumView({ share }: { share: SharedPremium }) {
  const product = PREMIUM[share.product];
  const positions = TEMPLATES["deep-tarot"].positions;
  const title =
    share.product === "newyear-2027" && share.title ? `2027년, ${share.title}` : share.product === "match" && share.relation ? `${RELATION_KO[share.relation]}와 본 ${product.name}` : product.name;
  return (
    <article aria-labelledby="shared-premium-title">
      <header className={s.head}>
        <p className={s.eyebrow}>{`친구가 연 ${product.name}`}</p>
        <h1 id="shared-premium-title" className={s.title}>
          {title}
        </h1>
        <p className={s.question}>풀이 본문과 질문, 생년월일은 공유한 사람만 볼 수 있어요.</p>
      </header>
      {share.cards?.length ? (
        <SpreadRow
          size="sm"
          columns={5}
          deck={share.deck}
          cards={share.cards.map((card, i) => faceUpCard({ ...card, position: positions[i] ?? `${i + 1}번` }))}
        />
      ) : null}
      <TryOwn title={`나도 ${product.name} 보기`} text={product.sub}>
        <Button href={premiumPath(share.product)} block trailing="→">
          {`${product.name} 알아보기`}
        </Button>
      </TryOwn>
    </article>
  );
}
