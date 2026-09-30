import { Fragment } from "react";
import s from "./DotLine.module.css";

/** Parts joined by " · " that wrap only between parts, never inside one ("1990년 1월 1일 · 양력 · 시간 모름"). */
export function DotLine({ parts }: { parts: string[] }) {
  return parts.map((part, i) => (
    <Fragment key={`${i}-${part}`}>
      {i > 0 ? " " : null}
      <span className={s.part}>{i < parts.length - 1 ? `${part} ·` : part}</span>
    </Fragment>
  ));
}
