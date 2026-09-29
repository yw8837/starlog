import type { ReactNode } from "react";
import styles from "./ui.module.css";

type ChipProps = {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
};

export function Chip({ selected = false, onClick, children }: ChipProps) {
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
