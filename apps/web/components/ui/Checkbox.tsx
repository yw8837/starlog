import type { ReactNode, Ref } from "react";
import s from "./Checkbox.module.css";

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Marks the box as missing (red edge) and points screen readers at the error. */
  invalid?: boolean;
  describedBy?: string;
  /** Announced as required (the form still explains a missing tick itself). */
  required?: boolean;
  ref?: Ref<HTMLInputElement>;
  children: ReactNode;
};

/** 48px glass row with a real checkbox inside a label; the whole row toggles it. */
export function Checkbox({ checked, onChange, invalid = false, describedBy, required = false, ref, children }: CheckboxProps) {
  return (
    <label className={s.check}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        aria-required={required || undefined}
      />
      <span className={s.box} aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      </span>
      <span>{children}</span>
    </label>
  );
}
