import { getCard } from "@starlog/core";
import Link from "next/link";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { TarotCard } from "@/components/tarot/TarotCard";
import type { FriendScene } from "@/lib/fixtures";
import type { GuideArticle } from "@/lib/guide";
import { ChevronIcon } from "./icons";
import s from "./home.module.css";

/** The screen's gold primary: three card backs, title and one line. */
export function TarotEntry() {
  return (
    <Link href="/tarot/new" className={`${s.entry} ${s.entryPrimary}`}>
      <span className={s.entryArt} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <TarotCard key={i} faceUp={false} size="sm" className={s.entryCard} />
        ))}
      </span>
      <span className={s.entryText}>
        <span className={s.entryTitle}>타로 보기</span>
        <span className={s.entrySub}>카드 3장으로 지금을 봐요</span>
      </span>
      <span className={s.entryChevron}>
        <ChevronIcon />
      </span>
    </Link>
  );
}

/** Secondary entry, led by the rabbit in hanbok (saju mode). */
export function SajuEntry() {
  return (
    <Link href="/saju/new" className={`${s.entry} ${s.entrySecondary}`}>
      <span className={s.entryRabbit} aria-hidden="true">
        <Rabbit outfit="hanbok" size={64} reactOnTap={false} />
      </span>
      <span className={s.entryText}>
        <span className={s.entryTitle}>사주 보기</span>
        <span className={s.entrySub}>타고난 결로 나를 봐요</span>
      </span>
      <span className={s.entryChevron}>
        <ChevronIcon />
      </span>
    </Link>
  );
}

/** 오늘의 한 장: one card, no sign-in. */
export function TodayRow() {
  return (
    <Link href="/tarot/draw?template=daily" className={s.row}>
      <span className={s.rowArt} aria-hidden="true">
        <Cat outfit="tarot" size={52} reactOnTap={false} />
      </span>
      <span className={s.rowText}>
        <span className={s.rowTitle}>오늘의 한 장</span>
        <span className={s.rowSub}>하루를 여는 카드 한 장을 뽑아요</span>
      </span>
      <span className={s.rowChevron}>
        <ChevronIcon />
      </span>
    </Link>
  );
}

/** Cards friends left that wait for approval; rendered only when there are any. */
export function FriendScenesRow({ scenes }: { scenes: FriendScene[] }) {
  if (scenes.length === 0) return null;
  const [first] = scenes;
  if (!first) return null;
  const card = getCard(first.cardId);
  const who = scenes.length === 1 ? `${first.nickname}님이` : `${first.nickname}님 외 ${scenes.length - 1}명이`;
  return (
    <section className={s.section} aria-labelledby="friends-title">
      <div className={s.sectionHead}>
        <h2 id="friends-title" className={s.sectionTitle}>
          친구 장면
        </h2>
        <span className={s.pendingTag}>{`확인 대기 ${scenes.length}`}</span>
      </div>
      <Link href="/story" className={s.row}>
        <span className={s.rowArt} aria-hidden="true">
          <TarotCard cardId={first.cardId} orientation={first.orientation} faceUp size="sm" className={s.friendCard} />
        </span>
        <span className={s.rowText}>
          <span className={s.rowTitle}>{`${who} 카드를 남겼어요`}</span>
          <span className={s.rowSub}>{`${card.names.ko} · 확인하면 이야기에 들어가요`}</span>
        </span>
        <span className={s.rowChevron}>
          <ChevronIcon />
        </span>
      </Link>
    </section>
  );
}

/** Guide articles as link chips. */
export function GuideChips({ articles }: { articles: readonly GuideArticle[] }) {
  return (
    <section className={s.section} aria-labelledby="guide-title">
      <div className={s.sectionHead}>
        <h2 id="guide-title" className={s.sectionTitle}>
          가이드
        </h2>
        <Link href="/guide" className={s.more}>
          전체 보기
        </Link>
      </div>
      <ul className={s.chips}>
        {articles.map((article) => (
          <li key={article.slug}>
            <Link href={`/guide/${article.slug}`} className={s.chip}>
              {article.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
