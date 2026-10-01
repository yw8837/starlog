/**
 * Where to talk to a person when things are hard: the one source of these numbers. Shown under the
 * calm crisis message on reading screens and as general information (FAQ, 이용 가이드, /how).
 */

export const CRISIS_LEAD = "마음이 많이 힘들다면 풀이보다 사람과 먼저 이야기해 주세요.";

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
