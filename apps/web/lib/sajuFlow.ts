import { createSessionStore } from "./sessionStore";
import { sanitizeSajuForm, type SajuForm } from "./sajuForm";

/**
 * The birth profile behind the saju screens (input → chart → prologue, 내 정보), kept in
 * sessionStorage for P1. Birth data never goes into a URL (spec §4).
 */

export const SAJU_PROFILE_KEY = "starlog.saju-profile";

const store = createSessionStore<SajuForm>(SAJU_PROFILE_KEY, sanitizeSajuForm);

export function saveSajuProfile(form: SajuForm) {
  store.save(form);
}

/**
 * `profile` is undefined until the browser snapshot is read (server render and hydration),
 * null when nothing has been saved yet (screens then show the sample profile).
 */
export function useSajuProfile(): { profile: SajuForm | null | undefined; saveProfile: (form: SajuForm) => void } {
  return { profile: store.useValue(), saveProfile: saveSajuProfile };
}
