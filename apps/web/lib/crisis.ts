/**
 * Where to talk to a person when things are hard: the one source of these numbers. Shown under the
 * calm crisis message on reading screens and as general information (FAQ, 이용 가이드, /how).
 */

export const CRISIS_LEAD = "마음이 많이 힘들다면 풀이보다 사람과 먼저 이야기해 주세요.";

/**
 * Words that mean the person may be in crisis: the one pattern the server checks on every user-written
 * text (lib/api/http.ts isCrisisText) before anything is generated. Kept narrow on purpose: bare words
 * such as 끝내고 싶, 목숨, ㅈㅅ or a spaced 자 살 (남자 살 빼는 법) would refuse ordinary questions, and so
 * would 끝내주게 (인생을 끝내주게 살고 싶어) or 생을 마감 inside another word (모집 학생을 마감했어요).
 */
export const CRISIS_WORDS =
  /죽\s*고\s*싶|죽\s*고\s*파|죽어\s?버리고\s?싶|자살|자해|극단적\s?(인\s?)?선택|살\s*기\s*싫|살고\s?싶지\s?않|사라지고\s?싶|없어지고\s?싶|목숨을\s?끊|뛰어\s?내리고\s?싶|(?:삶|인생)을\s?(?:끝내(?!주)|마감)|(?<![가-힣])생을\s?마감|suicide|kill\s?myself/i;

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
