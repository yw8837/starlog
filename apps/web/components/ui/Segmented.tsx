import styles from "./ui.module.css";

type SegmentedProps<T extends string> = {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group (required: a toggle group is never unnamed). */
  label: string;
  /** id of a helper line that describes the choice. */
  describedBy?: string;
};

export function Segmented<T extends string>({ options, value, onChange, label, describedBy }: SegmentedProps<T>) {
  return (
    <div className={styles.segmented} role="group" aria-label={label} aria-describedby={describedBy}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
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
