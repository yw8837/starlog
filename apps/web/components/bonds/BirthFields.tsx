"use client";

import { Checkbox } from "@/components/ui/Checkbox";
import { Segmented } from "@/components/ui/Segmented";
import { CALENDAR_LABEL, MIN_BIRTH_YEAR, daysInMonth, todayInKorea, type Calendar } from "@/lib/sajuForm";
import s from "./bonds.module.css";

export interface BirthValue {
  calendar: Calendar;
  year: number;
  month: number;
  day: number;
  isLeapMonth: boolean;
}

export const DEFAULT_BIRTH: BirthValue = { calendar: "solar", year: 2000, month: 1, day: 1, isLeapMonth: false };

const CALENDAR_OPTIONS = (["solar", "lunar"] as const).map((value) => ({ value, label: CALENDAR_LABEL[value] }));
const range = (from: number, to: number) => Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => (from <= to ? from + i : from - i));

/** The value after a change, the day kept inside its month and 윤달 only for lunar dates. */
function withDate(value: BirthValue, patch: Partial<BirthValue>): BirthValue {
  const next = { ...value, ...patch };
  const day = Math.min(next.day, daysInMonth(next.calendar, next.year, next.month));
  return { ...next, day, isLeapMonth: next.calendar === "lunar" ? next.isLeapMonth : false };
}

/** The body the API takes (윤달 only for lunar dates). */
export const birthBody = (value: BirthValue) =>
  value.calendar === "lunar" ? value : { calendar: value.calendar, year: value.year, month: value.month, day: value.day };

type BirthFieldsProps = {
  value: BirthValue;
  onChange: (value: BirthValue) => void;
  /** id prefix, so two forms on one page never share ids */
  id: string;
  error?: string;
  /** the line under the fields (what the date is used for) */
  helper: string;
};

/** 생년월일: 양력/음력, year · month · day selects, 윤달. No time: the 인연 score is date-only. */
export function BirthFields({ value, onChange, id, error, helper }: BirthFieldsProps) {
  const today = todayInKorea();
  const describedBy = [`${id}-help`, error ? `${id}-error` : ""].filter(Boolean).join(" ");
  const select = (label: string, current: number, options: number[], unit: string, patch: (n: number) => Partial<BirthValue>) => (
    <label className={s.dateField}>
      <span className={s.selectWrap}>
        <select
          aria-label={label}
          className={s.select}
          value={current}
          onChange={(e) => onChange(withDate(value, patch(Number(e.target.value))))}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        >
          {options.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </span>
      <span className={s.unit}>{unit}</span>
    </label>
  );

  return (
    <fieldset className={s.group}>
      <legend className={s.label}>생년월일</legend>
      <Segmented<Calendar> label="양력 또는 음력" options={CALENDAR_OPTIONS} value={value.calendar} onChange={(calendar) => onChange(withDate(value, { calendar }))} />
      <div className={s.dateRow}>
        {select("태어난 연도", value.year, range(today.year, MIN_BIRTH_YEAR), "년", (year) => ({ year }))}
        {select("태어난 월", value.month, range(1, 12), "월", (month) => ({ month }))}
        {select("태어난 일", value.day, range(1, daysInMonth(value.calendar, value.year, value.month)), "일", (day) => ({ day }))}
      </div>
      {value.calendar === "lunar" ? (
        <Checkbox checked={value.isLeapMonth} onChange={(isLeapMonth) => onChange({ ...value, isLeapMonth })}>
          윤달이에요
        </Checkbox>
      ) : null}
      <p id={`${id}-help`} className={s.helper}>
        {helper}
      </p>
      {error ? (
        <p id={`${id}-error`} className={s.error} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
