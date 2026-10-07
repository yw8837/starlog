"use client";

import { useId, useState, type ReactElement } from "react";
import { Modal } from "@/components/ui/Modal";
import b from "./bonds.module.css";
import s from "./HowTo.module.css";

/**
 * The three steps of 별자리 인연, worded to what the screens really do:
 * - ①: the first screen asks for the nickname and the owner's own birth date (used once for the 궁합 basis,
 *   not stored), and the sign is chosen right after;
 * - ②: a friend opens the link without any login (app/b/[code]), types a nickname and a birth date (used for
 *   the score inside the request, never stored), picks one card and joins;
 * - ③: a full constellation is a 도감 card and, by its total, a place on the sign's ranking, where 1~3위 wear
 *   a gold, silver or bronze medal (app/ranking/[sign]).
 */
const STEPS: ReadonlyArray<{ id: "pick" | "send" | "done"; title: string; text: string }> = [
  { id: "pick", title: "별자리 고르기", text: "닉네임과 생년월일을 넣고 채울 별자리를 골라요" },
  { id: "send", title: "친구에게 보내기", text: "링크를 보내면 친구가 닉네임과 생년월일을 넣고 카드를 한 장 골라 내 별이 돼요 (로그인 없이, 생년월일은 저장 안 해요)" },
  { id: "done", title: "다 채우면 완성", text: "도감 카드가 생기고, 인연 점수 합계로 랭킹에 올라요" },
];

/** A small line icon per step (24×24, drawn in the gold of the chip around it). */
const ICONS: Record<(typeof STEPS)[number]["id"], ReactElement> = {
  // a little constellation: four stars joined by a line
  pick: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <path d="M5 18l5-8 4 5 5-10" />
      <circle cx="5" cy="18" r="1.7" fill="currentColor" />
      <circle cx="10" cy="10" r="1.7" fill="currentColor" />
      <circle cx="14" cy="15" r="1.7" fill="currentColor" />
      <circle cx="19" cy="5" r="1.7" fill="currentColor" />
    </svg>
  ),
  // a paper plane: the link going to a friend
  send: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <path d="M21 3L3 10.5l7 3 3 7z" />
      <path d="M10 13.5L21 3" />
    </svg>
  ),
  // a medal on its ribbon: the finished constellation and the ranking
  done: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <path d="M8 3l3.2 7M16 3l-3.2 7" />
      <circle cx="12" cy="15.5" r="5.2" />
      <path d="M12 12.8l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" fill="currentColor" stroke="none" />
    </svg>
  ),
};

/** The three steps as a numbered list, each with its icon. */
export function HowToSteps() {
  return (
    <ol className={s.steps}>
      {STEPS.map((step, i) => (
        <li key={step.id} className={s.step}>
          <span className={s.icon} aria-hidden="true">
            {ICONS[step.id]}
          </span>
          <span className={s.text}>
            <strong className={s.title}>
              <span className={s.num} aria-hidden="true">
                {i + 1}
              </span>
              {step.title}
            </strong>
            <span className={s.body}>{step.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** 이렇게 해요: the card on the start screen. */
export function HowToCard() {
  const id = useId();
  return (
    <section className={`${b.panel} ${s.card}`} aria-labelledby={id}>
      <h2 id={id} className={b.sectionTitle}>
        이렇게 해요
      </h2>
      <HowToSteps />
    </section>
  );
}

/** A quiet 사용법 button for owners: the same three steps in the app's Modal. */
export function HowToButton() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button type="button" className={s.quiet} onClick={() => setOpen(true)} aria-haspopup="dialog">
        사용법
      </button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy={id}>
        <h2 id={id} className={b.dialogTitle}>
          이렇게 해요
        </h2>
        <div className={s.inDialog}>
          <HowToSteps />
        </div>
      </Modal>
    </>
  );
}
