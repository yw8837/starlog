import type { LoveStatus, SajuContext, WorkStatus } from "./reading/types";
import { isStale } from "./freshStart";
import { useFlowVisit } from "./useFlowVisit";
import { createLocalStore } from "./sessionStore";
import { sanitizeSajuForm, type SajuForm } from "./sajuForm";

/**
 * The birth profile behind the saju screens (input → chart → reading, 내 정보) and the optional
 * status chips and concern, kept on this device (localStorage). Birth data never goes into a URL
 * (spec §4); 내 정보 can erase it.
 */

export const SAJU_PROFILE_KEY = "starlog.saju-profile";
export const SAJU_CONTEXT_KEY = "starlog.saju-context";

/** Longest one-line concern the saju form accepts. */
export const CONCERN_MAX = 60;

export const LOVE_STATUS_OPTIONS: ReadonlyArray<{ value: LoveStatus; label: string }> = [
  { value: "single", label: "솔로" },
  { value: "dating", label: "연애 중" },
  { value: "engaged", label: "결혼 준비 중" },
  { value: "married", label: "기혼" },
  { value: "fresh-start", label: "새로운 출발" },
  { value: "unsure", label: "잘 모르겠어요" },
];

export const WORK_STATUS_OPTIONS: ReadonlyArray<{ value: WorkStatus; label: string }> = [
  { value: "student", label: "학생" },
  { value: "employee", label: "직장인" },
  { value: "self-employed", label: "자영업·프리랜서" },
  { value: "between-jobs", label: "구직·쉬는 중" },
  { value: "unsure", label: "잘 모르겠어요" },
];

const profileStore = createLocalStore<SajuForm>(SAJU_PROFILE_KEY, sanitizeSajuForm);

/** Keeps only known chip values and a trimmed, capped concern; empty fields are left out. */
export function sanitizeSajuContext(value: unknown): SajuContext | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const loveStatus = LOVE_STATUS_OPTIONS.find((o) => o.value === v.loveStatus)?.value;
  const workStatus = WORK_STATUS_OPTIONS.find((o) => o.value === v.workStatus)?.value;
  const concern = typeof v.concern === "string" ? v.concern.slice(0, CONCERN_MAX) : "";
  return {
    ...(loveStatus ? { loveStatus } : {}),
    ...(workStatus ? { workStatus } : {}),
    ...(concern ? { concern } : {}),
  };
}

/** The saved context with when it was saved (ms), so the form can start clean 30 minutes later. */
type StoredSajuContext = SajuContext & { savedAt?: number };

const contextStore = createLocalStore<StoredSajuContext>(SAJU_CONTEXT_KEY, (value) => {
  const context = sanitizeSajuContext(value);
  if (!context) return null;
  const savedAt = (value as { savedAt?: unknown }).savedAt;
  return typeof savedAt === "number" && Number.isFinite(savedAt) ? { ...context, savedAt } : context;
});

export function saveSajuProfile(form: SajuForm) {
  profileStore.save(form);
}

export function saveSajuContext(context: SajuContext) {
  contextStore.save({ ...(sanitizeSajuContext(context) ?? {}), savedAt: Date.now() });
}

/**
 * On entering the form: unless it was reached from inside the saju flow (lib/freshStart.ts), or
 * when they were saved more than 30 minutes ago, the status chips and concern start clean. The
 * birth profile always stays.
 */
export function freshSajuContextOnEntry(newQuestion: boolean, now = Date.now()) {
  const saved = contextStore.read();
  if (saved && (newQuestion || isStale(saved.savedAt, now))) contextStore.clear();
}

/** The form's entry rule (freshSajuContextOnEntry), before the first paint. */
export function useFreshSajuContextOnEntry() {
  useFlowVisit("saju", (inFlow) => freshSajuContextOnEntry(!inFlow));
}

/** Erases the birth profile and the status chips from this device. */
export function clearSajuProfile() {
  profileStore.clear();
  contextStore.clear();
}

/**
 * `profile` is undefined until the browser snapshot is read (server render and hydration),
 * null when nothing has been saved yet (screens then show the sample profile).
 */
export function useSajuProfile(): { profile: SajuForm | null | undefined; saveProfile: (form: SajuForm) => void } {
  return { profile: profileStore.useValue(), saveProfile: saveSajuProfile };
}

/** The saved status chips and concern: undefined before hydration, {} when none. */
export function useSajuContext(): SajuContext | undefined {
  const value = contextStore.useValue();
  return value === undefined ? undefined : (value ?? {});
}

/** The body fields /api/saju/* take beside `birth`; empty ones are left out (a trimmed concern). */
export function sajuContextBody(context: SajuContext): SajuContext {
  const concern = context.concern?.trim();
  return {
    ...(context.loveStatus ? { loveStatus: context.loveStatus } : {}),
    ...(context.workStatus ? { workStatus: context.workStatus } : {}),
    ...(concern ? { concern } : {}),
  };
}
