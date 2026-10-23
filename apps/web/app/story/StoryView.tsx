"use client";

import { branchElement, stemElement } from "@starlog/core";
import Link from "next/link";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { ELEMENT_KEY } from "@/components/saju/elements";
import { chartFor } from "@/components/saju/useSajuChart";
import { MoveToAccount } from "@/components/account/MoveToAccount";
import { TarotCard } from "@/components/tarot/TarotCard";
import { Button } from "@/components/ui/Button";
import { useAccount } from "@/lib/account/client";
import { kstMonthDay } from "@/lib/kst";
import { sajuTopicsVisible } from "@/lib/sajuTopics";
import { PREMIUM } from "@/lib/premium/products";
import type { SajuForm } from "@/lib/sajuForm";
import { checkinDue, newestFirst, recordLine, sajuRecordTitle, uniqueChapters, useChapters, type StoredChapter } from "@/lib/storage/chapters";
import { useAccountSync } from "@/lib/storage/sync";
import s from "./StoryView.module.css";
import { NEW_TAROT_HREF } from "@/lib/freshStart";

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const KIND_LABEL: Record<StoredChapter["kind"], string> = {
  tarot: "타로",
  saju: "사주",
  "tarot-deep": PREMIUM["tarot-deep"].name,
  match: PREMIUM.match.name,
  "newyear-2027": PREMIUM["newyear-2027"].name,
};

/** Card thumbnails a record shows: the three of a standard reading, the first three of a larger spread. */
const THUMBS = 3;

/** The day pillar as two element tiles, and the day master's name. */
function DayPillar({ chapter }: { chapter: { birth: SajuForm } }) {
  const result = chartFor(chapter.birth);
  if (!("chart" in result)) return null;
  const { day } = result.chart.pillars;
  return (
    <span className={s.pillar}>
      <span className={s.glyphs} aria-hidden="true">
        <span className={s.glyph} data-el={ELEMENT_KEY[stemElement(day.stem)]}>
          {day.stem}
        </span>
        <span className={s.glyph} data-el={ELEMENT_KEY[branchElement(day.branch)]}>
          {day.branch}
        </span>
      </span>
      <span className={s.pillarText}>{`일간 ${result.chart.dayMaster.ko}`}</span>
    </span>
  );
}

/** `deviceOnly`: logged in, and this record is on this device alone (account sync: it can move into the account). */
function Record({ chapter, now, topicsOpen, deviceOnly }: { chapter: StoredChapter; now: number; topicsOpen: boolean; deviceOnly: boolean }) {
  const { question, verdict } = recordLine(chapter);
  const title = chapter.kind === "saju" ? sajuRecordTitle(chapter, topicsOpen) : question;
  return (
    <li>
      {/* A reading saved in the account opens by its account id, the same address on every device. */}
      <Link href={`/chapter/${chapter.serverId ?? chapter.id}`} className={s.record}>
        <span className={s.recordHead}>
          <span className={s.kind} data-kind={chapter.kind}>
            {KIND_LABEL[chapter.kind]}
          </span>
          <span className={s.date}>{kstMonthDay(chapter.createdAt)}</span>
          {deviceOnly ? <span className={s.local}>이 기기에만</span> : null}
          {checkinDue(chapter, now) ? <span className={s.due}>돌아볼 때예요</span> : chapter.checkin ? <span className={s.checked}>{`돌아보기 · ${chapter.checkin.answer}`}</span> : null}
        </span>
        <span className={s.recordBody}>
          {chapter.kind === "tarot" || chapter.kind === "tarot-deep" || (chapter.kind === "match" && chapter.cards?.length) ? (
            <span className={s.thumbs} aria-hidden="true">
              {(chapter.cards ?? []).slice(0, THUMBS).map((card) => (
                <TarotCard key={card.position} cardId={card.cardId} orientation={card.orientation} faceUp size="sm" className={s.thumb} deck={chapter.deck ?? "rws1909"} />
              ))}
            </span>
          ) : chapter.kind === "match" ? (
            // saju only (owner 2026-10-17): my own day pillar, as the saju records show it; never the other person's
            <DayPillar chapter={{ birth: chapter.me.birth }} />
          ) : (
            <DayPillar chapter={chapter} />
          )}
          <span className={s.recordText}>
            <span className={s.recordTitle}>{title}</span>
            <span className={s.verdict}>{verdict}</span>
          </span>
        </span>
      </Link>
    </li>
  );
}

/** 내 기록: every reading opened on this device, newest first; each opens the saved reading. */
export function StoryView() {
  const account = useAccount();
  // Readings opened on another device while logged in come onto this one (each visit, at most once a minute).
  useAccountSync(account);
  const topicsOpen = sajuTopicsVisible({ owner: account?.owner === true, locale: useLocale() });
  const stored = useChapters();
  // Account sync: a reading whose account copy came onto this device too shows once.
  const chapters = stored && uniqueChapters(stored);
  if (chapters === undefined) {
    return (
      <div className={s.main}>
        <header className={s.head}>
          <h1 className={s.title}>내 기록</h1>
        </header>
      </div>
    );
  }
  if (chapters.length === 0) return <EmptyStory />;
  const now = Date.now();
  // Every record is on this device; the ones opened while logged in (or moved, account sync) are in the account too.
  const inAccount = chapters.filter((chapter) => chapter.serverId).length;
  const kept = inAccount === 0 ? "이 기기에 보관돼요" : inAccount === chapters.length ? "이 기기와 계정에 보관돼요" : `이 기기에 보관돼요 · ${inAccount}개는 계정에도 있어요`;

  return (
    <div className={s.layout}>
      <div className={s.main}>
        <header className={s.head}>
          <h1 className={s.title}>내 기록</h1>
          <p className={s.count}>{`기록 ${chapters.length}개 · ${kept}`}</p>
        </header>
        <div className={s.move}>
          <MoveToAccount />
        </div>
        <ol className={s.records} aria-label="기록 목록">
          {newestFirst(chapters).map((chapter) => (
            <Record key={chapter.id} chapter={chapter} now={now} topicsOpen={topicsOpen} deviceOnly={Boolean(account?.user) && !chapter.serverId} />
          ))}
        </ol>
      </div>

      {/* Desktop: the next reading sits in a side column. Phones get the floating button instead. */}
      <aside className={s.rail} aria-labelledby="next-title">
        <div className={s.next}>
          <span className={s.nextCat}>
            <Cat outfit="tarot" size={96} />
          </span>
          <h2 id="next-title" className={s.nextTitle}>
            새로 물어볼까요?
          </h2>
          <p className={s.nextText}>요즘 마음에 걸리는 일을 카드 세 장으로 봐요.</p>
          <Button href={NEW_TAROT_HREF} block trailing={<PlusIcon />}>
            새로 물어보기
          </Button>
          <Button href="/today" variant="ghost" size="md" block>
            오늘의 한 장
          </Button>
        </div>
      </aside>

      <div className={s.floating}>
        <Button href={NEW_TAROT_HREF} trailing={<PlusIcon />}>
          새로 물어보기
        </Button>
      </div>
    </div>
  );
}

/** Nothing opened yet: the rabbit waits with an open book. */
export function EmptyStory() {
  return (
    <div className={s.empty}>
      <h1 className={s.title}>내 기록</h1>
      <div className={s.emptyArt}>
        <Rabbit outfit="tarot" action="write" size={176} />
      </div>
      <p className={s.emptyTitle}>아직 기록이 없어요</p>
      <p className={s.emptyText}>풀이를 열면 사주주가 여기에 적어 둬요.</p>
      <div className={s.emptyCta}>
        <Button href={NEW_TAROT_HREF} block trailing="→">
          첫 타로 보기
        </Button>
      </div>
    </div>
  );
}
