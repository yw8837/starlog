"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type RefObject } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Chip } from "@/components/ui/Chip";
import { Segmented } from "@/components/ui/Segmented";
import { BIRTH_PLACE_CREDIT_URL } from "@/lib/birthPlaces";
import type { SajuContext } from "@/lib/reading/types";
import {
  LOVE_STATUS_OPTIONS,
  WORK_STATUS_OPTIONS,
  useFreshSajuContextOnEntry,
  saveSajuContext,
  saveSajuProfile,
  useSajuContext,
  useSajuProfile,
} from "@/lib/sajuFlow";
import {
  BIRTH_PLACE_GROUPS,
  CALENDAR_LABEL,
  EMPTY_SAJU_DRAFT,
  GENDER_LABEL,
  LEAP_CHOICE_LABEL,
  MIN_BIRTH_YEAR,
  checkSajuDraft,
  draftConfirmation,
  draftDays,
  draftOf,
  findPlace,
  leapChoice,
  sanitizeSajuForm,
  showLeapMonthOption,
  todayInKorea,
  withDraftDate,
  withLeapChoice,
  type Calendar,
  type Gender,
  type LeapChoice,
  type SajuDraft,
  type SajuField,
} from "@/lib/sajuForm";
import { isSajuTopicId } from "@/lib/sajuTopics";
import s from "./SajuForm.module.css";

type ErrorKey = SajuField | "consent";
type Errors = Partial<Record<ErrorKey, string>>;

const CALENDAR_OPTIONS = (["solar", "lunar"] as const).map((value) => ({ value, label: CALENDAR_LABEL[value] }));
const LEAP_OPTIONS = (["regular", "leap", "unknown"] as const).map((value) => ({ value, label: LEAP_CHOICE_LABEL[value] }));
const GENDER_OPTIONS = (["female", "male"] as const).map((value) => ({ value, label: GENDER_LABEL[value] }));
const TIME_OPTIONS = [
  { value: "known", label: "알아요" },
  { value: "unknown", label: "몰라요" },
] as const;

const CONSENT_ERROR = "출생 정보를 풀이에 쓰는 데 먼저 동의해 주세요.";
/** Focus goes to the first problem, top to bottom. */
const ERROR_ORDER: readonly ErrorKey[] = ["date", "time", "gender", "place", "consent", "form"];

const range = (from: number, to: number) => Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => (from <= to ? from + i : from - i));

/**
 * Saju input. Starts from the saved profile (고치기). A first visit starts with the date and the
 * gender empty (W-07): nobody gets the sample's chart by leaving the fields as they are. Birth data
 * and the optional status chips stay on this device (never in a URL).
 */
export function SajuForm() {
  const { profile } = useSajuProfile();
  const context = useSajuContext();
  // The chips stay only on a move inside the saju flow; a refresh or an entry from
  // elsewhere starts them clean (the birth profile stays), before the first paint.
  useFreshSajuContextOnEntry();
  // Remount once saved values are read, so the fields start from them. A first visit has none: its
  // key stays the same through hydration, so an early tap is never thrown away by a remount.
  const savedContext = Boolean(context && (context.loveStatus || context.workStatus));
  return (
    <SajuFormFields
      key={`${profile ? "saved" : "fresh"}-${savedContext ? "context" : "none"}`}
      initial={profile ? draftOf(profile) : EMPTY_SAJU_DRAFT}
      initialContext={context ?? {}}
      ready={profile !== undefined}
    />
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className={s.error} role="alert">
      {message}
    </p>
  );
}

/**
 * `ready`: the saved values have been read (after hydration). Until then the selects take no pick: the
 * render that reads them puts the draft's values back on every select, so an earlier pick was lost and a
 * year read back as "" became year 0.
 */
function SajuFormFields({ initial, initialContext, ready }: { initial: SajuDraft; initialContext: SajuContext; ready: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<SajuDraft>(initial);
  const [context, setContext] = useState<SajuContext>(initialContext);
  // Optional, so folded until asked for (open when something was saved before).
  const [moreOpen, setMoreOpen] = useState(Boolean(initialContext.loveStatus || initialContext.workStatus));
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const yearRef = useRef<HTMLSelectElement>(null);
  const hourRef = useRef<HTMLSelectElement>(null);
  const genderRef = useRef<HTMLButtonElement>(null);
  const placeRef = useRef<HTMLSelectElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLDivElement>(null);
  const focusTargets: Record<ErrorKey, RefObject<HTMLElement | null>> = {
    date: yearRef,
    time: hourRef,
    gender: genderRef,
    place: placeRef,
    consent: consentRef,
    form: submitRef,
  };

  const maxYear = todayInKorea().year;
  const years = range(maxYear, MIN_BIRTH_YEAR);
  const days = range(1, draftDays(draft));
  const confirmation = draftConfirmation(draft);
  // A 시·도 id saved before the 시·군 list shows as the city it stands for; the id is kept until another pick.
  const placeValue = findPlace(draft.placeId)?.id ?? draft.placeId;

  // Any edit clears the field errors (they can depend on several fields); consent keeps its own.
  const change = (next: SajuDraft) => {
    setDraft(next);
    setErrors((prev) => (prev.consent ? { consent: prev.consent } : {}));
  };

  /** The field's helper line (if any) plus its error (when shown). */
  const describedBy = (key: ErrorKey, helper?: string) => [helper, errors[key] ? `${key}-error` : undefined].filter(Boolean).join(" ") || undefined;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const result = checkSajuDraft(draft, todayInKorea());
    const next: Errors = {};
    if ("errors" in result) for (const error of result.errors) next[error.field] ??= error.message;
    if (!consent) next.consent = CONSENT_ERROR;
    setErrors(next);

    const first = ERROR_ORDER.find((key) => next[key]);
    if (first) {
      focusTargets[first].current?.focus();
      return;
    }
    if (!("form" in result)) return;
    saveSajuProfile(sanitizeSajuForm(result.form) ?? result.form);
    saveSajuContext(context);
    // The 운 picked at the topic step rides in the address (/saju/new?topic=…); the chart opens on it.
    const topic = new URLSearchParams(window.location.search).get("topic");
    router.push(isSajuTopicId(topic) ? `/saju/chart?topic=${topic}` : "/saju/chart");
  };

  return (
    <form className={s.form} onSubmit={onSubmit} noValidate>
      <fieldset className={s.group}>
        <legend className={s.label}>태어난 날</legend>
        <Segmented<Calendar> label="양력 또는 음력" options={CALENDAR_OPTIONS} value={draft.calendar} onChange={(calendar) => change(withDraftDate(draft, { calendar }))} />

        <div className={s.row}>
          <label className={s.field}>
            <span className={s.selectWrap}>
              <select
                ref={yearRef}
                aria-label="태어난 연도"
                className={s.select}
                disabled={!ready}
                value={draft.year ?? ""}
                onChange={(e) => change(withDraftDate(draft, { year: Number(e.target.value) }))}
                aria-invalid={Boolean(errors.date)}
                aria-describedby={describedBy("date")}
              >
                <option value="" disabled>
                  연도
                </option>
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </span>
            {draft.year === null ? null : <span className={s.unit}>년</span>}
          </label>
          <label className={s.field}>
            <span className={s.selectWrap}>
              <select
                aria-label="태어난 월"
                className={s.select}
                disabled={!ready}
                value={draft.month ?? ""}
                onChange={(e) => change(withDraftDate(draft, { month: Number(e.target.value) }))}
                aria-invalid={Boolean(errors.date)}
                aria-describedby={describedBy("date")}
              >
                <option value="" disabled>
                  월
                </option>
                {range(1, 12).map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </span>
            {draft.month === null ? null : <span className={s.unit}>월</span>}
          </label>
          <label className={s.field}>
            <span className={s.selectWrap}>
              <select
                aria-label="태어난 일"
                className={s.select}
                disabled={!ready}
                value={draft.day ?? ""}
                onChange={(e) => change(withDraftDate(draft, { day: Number(e.target.value) }))}
                aria-invalid={Boolean(errors.date)}
                aria-describedby={describedBy("date")}
              >
                <option value="" disabled>
                  일
                </option>
                {days.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </span>
            {draft.day === null ? null : <span className={s.unit}>일</span>}
          </label>
        </div>

        {showLeapMonthOption(draft) ? (
          <>
            <Segmented<LeapChoice>
              label="평달 또는 윤달"
              describedBy="leap-help"
              options={LEAP_OPTIONS}
              value={leapChoice(draft)}
              onChange={(choice) => change(withLeapChoice(draft, choice))}
            />
            <p id="leap-help" className={s.helper}>
              모르면 평달로 보고, 윤달이면 달라지는 기둥을 함께 알려 드려요
            </p>
          </>
        ) : null}

        <p className={s.confirm} aria-live="polite">
          {confirmation}
        </p>
        <FieldError id="date-error" message={errors.date} />
      </fieldset>

      <fieldset className={s.group}>
        <legend className={s.label}>태어난 시</legend>
        <Segmented
          label="태어난 시를 아는지"
          describedBy="time-help"
          options={TIME_OPTIONS}
          value={draft.timeKnown ? "known" : "unknown"}
          onChange={(value) => change({ ...draft, timeKnown: value === "known" })}
        />
        {draft.timeKnown ? (
          <div className={`${s.row} ${s.timeRow}`}>
            <label className={s.field}>
              <span className={s.selectWrap}>
                <select
                  ref={hourRef}
                  aria-label="태어난 시"
                  className={s.select}
                  value={draft.hour ?? ""}
                  onChange={(e) => change({ ...draft, hour: e.target.value === "" ? null : Number(e.target.value) })}
                  aria-invalid={Boolean(errors.time)}
                  aria-describedby={describedBy("time", "time-help")}
                >
                  <option value="">--</option>
                  {range(0, 23).map((hour) => (
                    <option key={hour} value={hour}>
                      {hour}
                    </option>
                  ))}
                </select>
              </span>
              <span className={s.unit}>시</span>
            </label>
            <label className={s.field}>
              <span className={s.selectWrap}>
                <select
                  aria-label="태어난 분"
                  className={s.select}
                  value={draft.minute ?? ""}
                  onChange={(e) => change({ ...draft, minute: e.target.value === "" ? null : Number(e.target.value) })}
                  aria-invalid={Boolean(errors.time)}
                  aria-describedby={describedBy("time", "time-help")}
                >
                  <option value="">--</option>
                  {range(0, 59).map((minute) => (
                    <option key={minute} value={minute}>
                      {String(minute).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </span>
              <span className={s.unit}>분</span>
            </label>
          </div>
        ) : null}
        <p id="time-help" className={s.helper}>
          시간을 모르면 시주 없이 풀어요
        </p>
        <FieldError id="time-error" message={errors.time} />
      </fieldset>

      <fieldset className={s.group}>
        <legend className={s.label}>성별</legend>
        <Segmented<Gender>
          label="성별"
          describedBy={describedBy("gender", "gender-help")}
          options={GENDER_OPTIONS}
          value={draft.gender}
          onChange={(gender) => change({ ...draft, gender })}
          firstRef={genderRef}
        />
        <p id="gender-help" className={s.helper}>
          10년 흐름(대운)의 방향을 정하는 데만 써요
        </p>
        <FieldError id="gender-error" message={errors.gender} />
      </fieldset>

      <div className={s.group}>
        <label htmlFor="birth-place" className={s.label}>
          태어난 곳
        </label>
        <span className={s.selectWrap}>
          <select
            id="birth-place"
            ref={placeRef}
            className={s.select}
            disabled={!ready}
            value={placeValue}
            onChange={(e) => change({ ...draft, placeId: e.target.value })}
            aria-invalid={Boolean(errors.place)}
            aria-describedby={describedBy("place")}
          >
            {BIRTH_PLACE_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.places.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </span>
        {/* ODbL attribution for the longitudes (lib/birthPlaces.ts); a new tab keeps what is filled in */}
        <p className={s.helper}>
          출생지 좌표{" "}
          <a href={BIRTH_PLACE_CREDIT_URL} target="_blank" rel="noopener noreferrer">
            © OpenStreetMap 기여자
          </a>
        </p>
        <FieldError id="place-error" message={errors.place} />
      </div>

      <div className={s.group}>
        <button type="button" className={s.more} aria-expanded={moreOpen} aria-controls="saju-more" onClick={() => setMoreOpen((open) => !open)}>
          <span>
            요즘 상황도 알려 주기 <span className={s.optional}>(선택)</span>
          </span>
          <svg className={s.moreChevron} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="m6 9.5 6 6 6-6" />
          </svg>
        </button>
        {moreOpen ? (
          <div id="saju-more" className={s.moreBody}>
            <p className={s.helper}>고르면 지금 상황에 맞춰 조금 더 구체적으로 풀어요</p>
            <fieldset className={s.group}>
              <legend className={s.subLabel}>연애</legend>
              <div className={s.chips}>
                {LOVE_STATUS_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    selected={context.loveStatus === option.value}
                    onClick={() => setContext((prev) => ({ ...prev, loveStatus: prev.loveStatus === option.value ? undefined : option.value }))}
                  >
                    {option.label}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset className={s.group}>
              <legend className={s.subLabel}>일</legend>
              <div className={s.chips}>
                {WORK_STATUS_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    selected={context.workStatus === option.value}
                    onClick={() => setContext((prev) => ({ ...prev, workStatus: prev.workStatus === option.value ? undefined : option.value }))}
                  >
                    {option.label}
                  </Chip>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}
      </div>

      <div className={s.consent}>
        <Checkbox
          ref={consentRef}
          checked={consent}
          onChange={(checked) => {
            setConsent(checked);
            if (checked) setErrors(({ consent: _cleared, ...rest }) => rest);
          }}
          invalid={Boolean(errors.consent)}
          describedBy={describedBy("consent")}
          required
        >
          출생 정보를 풀이에 쓰는 데 동의해요
        </Checkbox>
        <FieldError id="consent-error" message={errors.consent} />
      </div>

      <div ref={submitRef} tabIndex={-1} className={s.submit}>
        <FieldError id="form-error" message={errors.form} />
        <Button type="submit" block trailing="→">
          명식 보기
        </Button>
      </div>
    </form>
  );
}
