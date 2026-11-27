import Link from "next/link";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { ArrowIcon } from "@/components/home/icons";
import { TarotEntryLink } from "@/components/home/TarotEntryLink";
import { ENTRY_SAJU_HREF } from "@/lib/freshStart";
import { HOME_WORRY_IDS, WORRIES_PATH, methodLine, visibleWorries, worryPath, type Worry } from "@/lib/worries";
import s from "./worries.module.css";

/**
 * One worry as a card (spec 2026-11-26 worry catalog §5.4, §12.3): its reader (타로로 or 사주주, a picture only: the text names
 * the card), the name, the reader's line, its own way of reading and price from the catalog. Glass, never gold. The whole
 * card is the link to /w/<id>.
 */
export function WorryCard({ worry }: { worry: Worry }) {
  return (
    <Link href={worryPath(worry.id)} className={s.card}>
      <span className={s.reader} aria-hidden="true">
        {worry.reader === "cat" ? <Cat outfit="tarot" size={44} reactOnTap={false} /> : <Rabbit outfit="hanbok" size={44} reactOnTap={false} />}
      </span>
      <span className={s.name}>{worry.name}</span>
      <span className={s.line}>{worry.line}</span>
      <span className={s.method}>{methodLine(worry)}</span>
    </Link>
  );
}

export function WorryCards({ worries }: { worries: readonly Worry[] }) {
  return (
    <ul className={s.cards}>
      {worries.map((worry) => (
        <li key={worry.id}>
          <WorryCard worry={worry} />
        </li>
      ))}
    </ul>
  );
}

/** The home's 고민 판 (§5.4): its title, six worries in their order, the way to all of them. None of the six is premium. */
export function WorryBoard() {
  const shown = visibleWorries(null);
  const worries = HOME_WORRY_IDS.flatMap((id) => shown.filter((worry) => worry.id === id));
  return (
    <section className={s.board} aria-labelledby="worry-board-title">
      <h2 id="worry-board-title" className={s.boardTitle}>
        지금 무슨 고민이야?
      </h2>
      <WorryCards worries={worries} />
      <Link href={WORRIES_PATH} className={s.more}>
        고민 전체 보기
        <ArrowIcon />
      </Link>
    </section>
  );
}

/**
 * 도구로 바로 보기 (§5.3, §5.4): the readings by their tools' names, for whoever looks for them so. 타로 3장 보기 is the home's
 * tarot entry as it was (the builder, or the 다리 화면 where premium is visible); /worries adds 가격 안내.
 */
export function WorryTools({ pricing = false }: { pricing?: boolean }) {
  return (
    <section className={s.tools} aria-labelledby="worry-tools-title">
      <h2 id="worry-tools-title" className={s.toolsTitle}>
        도구로 바로 보기
      </h2>
      <ul className={s.toolLinks}>
        <li>
          <TarotEntryLink className={s.tool!}>타로 3장 보기</TarotEntryLink>
        </li>
        <li>
          <Link href={ENTRY_SAJU_HREF} className={s.tool}>
            사주 보기
          </Link>
        </li>
        {pricing ? (
          <li>
            <Link href="/pricing" className={s.tool}>
              가격 안내
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

/** 다음 고민 (§7, §12.5): one row above 더 깊게 보고 싶다면, after a reading whose chosen situation says it. */
export function NextWorry({ worry }: { worry: Worry }) {
  return (
    <section className={s.next} aria-labelledby="next-worry-title">
      <h2 id="next-worry-title" className={s.nextTitle}>
        다음 고민
      </h2>
      <Link href={worryPath(worry.id)} className={s.nextRow}>
        <span className={s.name}>{worry.name}</span>
        <span className={s.line}>{methodLine(worry)}</span>
      </Link>
    </section>
  );
}
