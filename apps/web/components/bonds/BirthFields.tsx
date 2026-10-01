"use client";

import { useRef, type Ref } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Segmented } from "@/components/ui/Segmented";
import { CALENDAR_LABEL, MIN_BIRTH_YEAR, daysInMonth, todayInKorea, type Calendar, type SajuForm } from "@/lib/sajuForm";
import s from "./bonds.module.css";

/** The date being entered; a part stays null until it is picked (no date is ever assumed). */
export interface BirthValue {
  calendar: Calendar;
  year: number | null;
  month: number | null;
  day: number | null;
  isLeapMonth: boolean;
}

export const EMPTY_BIRTH: BirthValue = { calendar: "solar", year: null, month: null, day: null, isLeapMonth: false };

export const birthComplete = (value: BirthValue): value is BirthValue & { year: number; month: number; day: number } =>
  value.year !== null && value.month !== null && value.day !== null;

export const BIRTH_MISSING = "생년월일을 끝까지 골라 주세요";

/** The date part of this device's saved saju profile (the user's own local data), or null without one. */
export function savedBirth(profile: SajuForm | null | undefined): BirthValue | null {
  return profile ? { calendar: profile.calendar, year: profile.year, month: profile.month, day: profile.day, isLeapMonth: profile.isLeapMonth } : null;
}

const CALENDAR_OPTIONS = (["solar", "lunar"] as const).map((value) => ({ value, label: CALENDAR_LABEL[value] }));
const range = (from: number, to: number) => Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => (from <= to ? from + i : from - i));

/** Days in the picked month; 31 until the month is picked (a leap year until the year is). */
const daysFor = (value: BirthValue) => (value.month === null ? 31 : daysInMonth(value.calendar, value.year ?? 2000, value.month));

/** The value after a change, the day kept inside its month and 윤달 only for lunar dates. */
function withDate(value: BirthValue, patch: Partial<BirthValue>): BirthValue {
  const next = { ...value, ...patch };
  const day = next.day === null ? null : Math.min(next.day, daysFor(next));
  return { ...next, day, isLeapMonth: next.calendar === "lunar" ? next.isLeapMonth : false };
}

/** The body the API takes (윤달 only for lunar dates), or null until every part is picked. */
export function birthBody(value: BirthValue) {
  if (!birthComplete(value)) return null;
  const date = { calendar: value.calendar, year: value.year, month: value.month, day: value.day };
  return value.calendar === "lunar" ? { ...date, isLeapMonth: value.isLeapMonth } : date;
}

type BirthFieldsProps = {
  value: BirthValue;
  onChange: (value: BirthValue) => void;
  /** id prefix, so two forms on one page never share ids */
  id: string;
  error?: string;
  /** the line under the fields (what the date is used for) */
  helper: string;
  /** the date came from the saved saju profile: say so, with 바꾸기 to go to the fields */
  prefilled?: boolean;
};

/** 생년월일: 양력/음력, year · month · day selects (each starts at 선택), 윤달. No time: the 인연 score is date-only. */
export function BirthFields({ value, onChange, id, error, helper, prefilled = false }: BirthFieldsProps) {
  const today = todayInKorea();
  const yearRef = useRef<HTMLSelectElement>(null);
  const describedBy = [`${id}-help`, error ? `${id}-error` : ""].filter(Boolean).join(" ");
  const select = (
    label: string, current: number | null, options: number[], unit: string, patch: (n: number | null) => Partial<BirthValue>,
    ref?: Ref<HTMLSelectElement>,
  ) => (
    <label className={s.dateField}>
      <span className={s.selectWrap}>
        <select
          ref={ref}
          aria-label={label}
          className={s.select}
          value={current ?? ""}
          onChange={(e) => onChange(withDate(value, patch(e.target.value === "" ? null : Number(e.target.value))))}
          aria-invalid={Boolean(error) && current === null}
          aria-describedby={describedBy}
        >
          <option value="">선택</option>
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
      {prefilled ? (
        <p className={s.prefilled}>
          저장된 사주 정보로 채웠어요
          <button type="button" className={s.textButton} onClick={() => yearRef.current?.focus()}>
            바꾸기
          </button>
        </p>
      ) : null}
      <Segmented<Calendar> label="양력 또는 음력" options={CALENDAR_OPTIONS} value={value.calendar} onChange={(calendar) => onChange(withDate(value, { calendar }))} />
      <div className={s.dateRow}>
        {select("태어난 연도", value.year, range(today.year, MIN_BIRTH_YEAR), "년", (year) => ({ year }), yearRef)}
        {select("태어난 월", value.month, range(1, 12), "월", (month) => ({ month }))}
        {select("태어난 일", value.day, range(1, daysFor(value)), "일", (day) => ({ day }))}
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
