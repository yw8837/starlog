import type { Ref } from "react";
import styles from "./ui.module.css";

type SegmentedProps<T extends string> = {
  options: ReadonlyArray<{ value: T; label: string }>;
  /** null: nothing picked yet (W-07), so no segment is pressed. */
  value: T | null;
  onChange: (value: T) => void;
  /** Accessible name for the group (required: a toggle group is never unnamed). */
  label: string;
  /** id of a helper line that describes the choice. */
  describedBy?: string;
  /** The first segment, so a form can move focus to a choice still empty. */
  firstRef?: Ref<HTMLButtonElement>;
};

export function Segmented<T extends string>({ options, value, onChange, label, describedBy, firstRef }: SegmentedProps<T>) {
  return (
    <div className={styles.segmented} role="group" aria-label={label} aria-describedby={describedBy}>
      {options.map((option, i) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={i === 0 ? firstRef : undefined}
            type="button"
            className={active ? `${styles.segment} ${styles.segmentActive}` : styles.segment}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
