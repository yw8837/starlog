"use client";

import { CONSTELLATIONS, type SignId } from "@starlog/core";
import { ConstellationArt } from "./ConstellationArt";
import s from "./SignPicker.module.css";

type SignPickerProps = {
  /** the sun sign of the owner's birthday: marked `내 별자리` as the suggested first pick */
  mySign: SignId | null;
  completed: readonly SignId[];
  /** the sign being filled now (shown, not pickable) */
  current?: SignId | null;
  selected: SignId | null;
  onSelect: (sign: SignId) => void;
};

/** The 12 signs as figures to choose from; completed ones (and the one in progress) cannot be picked. */
export function SignPicker({ mySign, completed, current = null, selected, onSelect }: SignPickerProps) {
  const done = new Set(completed);
  return (
    <ul className={s.grid} aria-label="별자리 고르기">
      {CONSTELLATIONS.map((c) => {
        const blocked = done.has(c.id) || c.id === current;
        const note = done.has(c.id) ? "완성" : c.id === current ? "채우는 중" : `별 ${c.slots}개`;
        return (
          <li key={c.id}>
            <button
              type="button"
              className={s.cell}
              aria-pressed={selected === c.id}
              disabled={blocked}
              onClick={() => onSelect(c.id)}
              data-mine={c.id === mySign ? "" : undefined}
            >
              {c.id === mySign ? <span className={s.badge}>내 별자리</span> : null}
              <ConstellationArt sign={c.id} lit={blocked ? c.slots : selected === c.id ? c.slots : 0} size={88} decorative className={s.art} />
              <span className={s.name}>{c.ko}</span>
              <span className={s.note}>{note}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
