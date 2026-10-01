import Link from "next/link";
import { CONSTELLATIONS, type SignId } from "@starlog/core";
import { ConstellationArt } from "./ConstellationArt";
import s from "./Dogam.module.css";

type DogamProps = {
  completed: readonly SignId[];
  filling: { sign: SignId; filled: number } | null;
};

/**
 * 도감: the 12 signs in zodiac order. A completed one glows, the one being filled shows its progress,
 * the rest are faint silhouettes. Every cell opens that sign's ranking.
 */
export function Dogam({ completed, filling }: DogamProps) {
  const done = new Set(completed);
  return (
    <ul className={s.grid}>
      {CONSTELLATIONS.map((c) => {
        const state = done.has(c.id) ? "complete" : filling?.sign === c.id ? "filling" : "none";
        const status = state === "complete" ? "완성" : state === "filling" ? `${filling!.filled}/${c.slots}` : "";
        return (
          <li key={c.id}>
            <Link href={`/ranking/${c.id}`} className={s.cell} data-state={state} aria-label={`${c.ko}${status ? ` ${status}` : ""} · 랭킹 보기`}>
              <ConstellationArt
                sign={c.id}
                lit={state === "complete" ? c.slots : state === "filling" ? filling!.filled : 0}
                size={64}
                decorative
                className={s.art}
              />
              <span className={s.name}>{c.ko}</span>
              <span className={s.status}>{status || " "}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
