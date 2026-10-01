"use client";

import { useId, useRef } from "react";
import s from "./CustomField.module.css";

type CustomFieldProps = {
  /** Accessible name, e.g. "무엇을 볼지 직접 쓰기". */
  label: string;
  /** Show `label` as a small line above the field instead of only naming it for screen readers. */
  showLabel?: boolean;
  /** Shown in the empty field, e.g. "직접 쓰기 (예: 창업 준비, 전세 계약)". */
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
};

const ClearIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
    <path d="M7 7l10 10M17 7 7 17" />
  </svg>
);

/**
 * An optional one-line "직접 쓰기" field under a chip group: quieter than the chips (dashed line,
 * no fill), with a count and a clear button once something is typed.
 */
export function CustomField({ label, showLabel = false, placeholder, value, onChange, maxLength }: CustomFieldProps) {
  const countId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const filled = value.length > 0;
  return (
    <>
      {showLabel ? (
        <label htmlFor={inputId} className={s.label}>
          {label}
        </label>
      ) : null}
      <div className={s.field} data-filled={filled ? "" : undefined}>
        <input
          ref={inputRef}
          id={inputId}
          className={s.input}
          type="text"
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label={showLabel ? undefined : label}
          aria-describedby={filled ? countId : undefined}
          onChange={(e) => onChange(e.target.value)}
          enterKeyHint="done"
        />
        {filled ? (
          <>
            <span id={countId} className={s.count}>
              <span className="sr-only">글자 수 </span>
              {`${value.length}/${maxLength}`}
            </span>
            <button
              type="button"
              className={s.clear}
              onClick={() => {
                onChange("");
                // The button goes away with the text; keep the user's place in the field.
                inputRef.current?.focus();
              }}
              aria-label={`${label} 지우기`}
            >
              <ClearIcon />
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}
