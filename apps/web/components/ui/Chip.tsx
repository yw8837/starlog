import type { ReactNode } from "react";
import styles from "./ui.module.css";

type ChipProps = {
  /**
   * Toggle chips pass `selected` (announced as a pressed/unpressed toggle). Leave it out for a
   * one-shot action chip, e.g. a suggested question: it is then a plain button.
   */
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
};

export function Chip({ selected, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      className={selected ? `${styles.chip} ${styles.chipSelected}` : styles.chip}
      aria-pressed={selected}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
