/**
 * Where to talk to a person when things are hard: the one source of these numbers. Shown under the
 * calm crisis message on reading screens and as general information (FAQ, 이용 가이드, /how).
 */

export const CRISIS_LEAD = "마음이 많이 힘들다면 풀이보다 사람과 먼저 이야기해 주세요.";

/**
 * Words that mean the person may be in crisis: the one pattern the server checks on every user-written
 * text (lib/api/http.ts isCrisisText) before anything is generated; the user's earlier questions are
 * judged with it too, but only to leave them out of the prompt (lib/ai/history.ts withoutCrisisItems).
 * Kept narrow on purpose, since a hit refuses the reading. Each phrase carries the guard that keeps the
 * common question it resembles out (lib/api/http.test.ts lists both):
 * - 인생·삶을 끝내/마감 only alone or with 내·제·그냥…, not after another noun (솔로 인생을 끝내고 싶어요,
 *   30년 직장 인생을 마감하고) nor as 끝내주게; 생을 마감 not inside a word (모집 학생을 마감했어요)
 * - 살고 싶지 않 not after a place or a person (이 집에서, 시댁 근처에, 그 사람이랑 같이 …), except 세상에서
 * - 죽고 파 not as 죽고 파산; 없어지고 싶 not after another subject (뱃살이 없어지고 싶어요); suicide not
 *   in Suicide Squad
 * Bare words such as 끝내고 싶, 목숨, ㅈㅅ or a spaced 자 살 (남자 살 빼는 법) would refuse ordinary questions.
 */
export const CRISIS_WORDS = new RegExp(
  [
    String.raw`죽\s*고\s*싶`,
    String.raw`죽\s*고\s*파(?!산|견|티)`,
    String.raw`죽어\s?버리고\s?싶`,
    String.raw`죽어\s?버릴까`,
    String.raw`자살`,
    String.raw`자해`,
    String.raw`극단적\s?(?:인\s?)?선택`,
    String.raw`살\s*기\s*싫`,
    String.raw`(?<!(?:(?<!세상)에서|랑|하고|같이|함께|근처에?|옆에|동네에)[^.!?\n]{0,12})살고\s?싶지\s?않`,
    String.raw`그만\s?살고\s?싶`,
    String.raw`사라지고\s?싶`,
    String.raw`(?<![가-힣]{2,}[이가]\s?)없어지고\s?싶`,
    String.raw`목숨\s?(?:을\s?)?끊`,
    String.raw`뛰어\s?내리고\s?싶`,
    String.raw`세상을\s?떠나고\s?싶`,
    String.raw`살아갈\s?이유가\s?없`,
    String.raw`(?:(?:내|제|나의|저의|그냥|이제|그만)\s?|(?<![가-힣]\s?))(?:삶|인생)을\s?(?:끝내(?!주)|마감)`,
    String.raw`(?<![가-힣])생을\s?마감`,
    String.raw`suicid(?:e|al)(?!\s?squad)`,
    String.raw`kill\s?myself`,
  ].join("|"),
  "i",
);

export interface CrisisContact {
  name: string;
  /** As dialled (tel: link) and as shown. */
  number: string;
  note?: string;
}

export const CRISIS_CONTACTS: readonly CrisisContact[] = [
  { name: "자살예방상담전화", number: "109", note: "24시간" },
  { name: "정신건강위기상담", number: "1577-0199" },
  { name: "청소년상담", number: "1388" },
  { name: "생명의전화", number: "1588-9191" },
];

/** "자살예방상담전화 109 · 24시간" */
export const contactLine = (contact: CrisisContact) => `${contact.name} ${contact.number}${contact.note ? ` · ${contact.note}` : ""}`;

/** The lines as plain text (structured data must say exactly what the page shows). */
export const crisisLines = (withLead = true): string[] => [...(withLead ? [CRISIS_LEAD] : []), ...CRISIS_CONTACTS.map(contactLine)];
