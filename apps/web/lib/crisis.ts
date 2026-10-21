/**
 * Where to talk to a person when things are hard: the one source of these numbers. Shown under the
 * calm crisis message on reading screens and as general information (FAQ, 이용 가이드, /how).
 */

export const CRISIS_LEAD = "마음이 많이 힘들다면 풀이보다 사람과 먼저 이야기해 주세요.";

/**
 * Words that mean the person may be in crisis: the one pattern the server checks on every user-written
 * text (lib/api/http.ts isCrisisText) before anything is generated; the user's earlier questions are
 * judged with it too, but only to leave them out of the prompt (lib/ai/history.ts withoutCrisisItems).
 * Kept narrow on purpose, since a hit refuses the reading and 결혼·이혼·이직·이사 questions are the
 * service's own (lib/api/http.test.ts lists the questions that must pass and the phrases that must hit):
 * - phrases that mean one thing anywhere: 죽고 싶, 자살, 자해, 목숨 (을) 끊, 세상을 떠나고 싶, 살아갈 이유가 없
 * - phrases that are also ordinary questions (살고 싶지 않: 혼자·이렇게·남편과 …; 인생을 끝내고 싶: 솔로 인생…;
 *   그만 살고 싶: 월세 그만 살고; 없어지고 싶: 뱃살이; 죽어버릴까: 강아지가 … 봐) only at the start of a
 *   sentence or right after a word that makes them the person's own (내·그냥·요즘·이제·정말 …, and for
 *   살고 싶지 않 how hard things are: 힘들어서·괴로워서·지쳐서, unless a thing follows: 살고 싶지 않은 집·시골,
 *   not 마음·생각·기분·느낌 or 살고 싶지 않은데)
 * - phrases that are mostly everyday words (다 끝내고 싶: 일 다 끝내고, 다 끝내고 싶은데 재회운은?; 죽을래:
 *   배고파 죽을래, 너 죽을래?, 죽을래 살래, ㅋㅋ; 그냥 죽을까: 강아지가 아파요. 그냥 죽을까요?, … 죽을까 봐)
 *   only when they open a sentence, after the person's own words at most, never after a comma or ~ (일이
 *   많은데, 다 끝내고 싶어요); 다 끝내고 싶 only as the end of that sentence; 그냥 죽을까 also after 요즘 or
 *   how hard things are there or after 나·난·너무 (not 화분이 요즘 그냥 죽을까), politely (죽을까요) only as
 *   the very first words
 * A line break is a sentence break (lib/api/http.ts isCrisisText).
 * No lookbehind: the pattern also ships in the client bundle (CrisisContacts), and Safari before 16.4
 * cannot parse one. Bare words such as 끝내고 싶, 목숨, ㅈㅅ or a spaced 자 살 (남자 살 빼는 법) would refuse
 * ordinary questions.
 */
const SENTENCE_START = String.raw`(?:^|[.!?,~…]\s*)`;
const own = (words: string) => String.raw`(?:${SENTENCE_START}|(?:${words})\s)`;
const STATEMENT_START = String.raw`(?:^|[.!?…]\s*)`;
const alone = (words: string) => String.raw`${STATEMENT_START}(?:(?:${words})\s)?`;
const THEN = String.raw`(?:(?:그냥|이제|정말|진짜|차라리)\s)?`;
/** 살고 싶지 않, after 더는, 더 이상(은) or 더 at most; 싶지가 않 too */
const LIVE_NO_MORE = String.raw`(?:(?:더는|더\s?이상(?:은)?|더)\s?)?살고\s?싶지\s?(?:가\s?)?않`;
const HARDSHIP = "힘들어서|괴로워서|지쳐서";
export const CRISIS_WORDS = new RegExp(
  [
    String.raw`죽\s*고\s*싶`,
    String.raw`죽어\s?버리고\s?싶`,
    String.raw`(?:콱|확|그냥|차라리)\s?죽어\s?버릴(?:까|래)`,
    String.raw`자살`,
    String.raw`자해`,
    String.raw`극단적\s?(?:인\s?)?선택`,
    String.raw`살\s*기\s*싫`,
    String.raw`사라지고\s?싶`,
    String.raw`목숨\s?(?:을\s?)?끊`,
    String.raw`세상을\s?떠나고\s?싶`,
    String.raw`살아갈\s?이유가\s?없`,
    own(String.raw`정말|진짜|너무|이제|그냥|요즘|차라리|세상에(?:서)?`) + LIVE_NO_MORE,
    String.raw`(?:${HARDSHIP})\s` + LIVE_NO_MORE + String.raw`(?!은\s?(?!마음|생각|기분|느낌|데)[가-힣])`,
    own("이제|그냥|정말|진짜|차라리") + String.raw`그만\s?살고\s?싶`,
    own("그냥|내가|제가|나는|저는|나도|정말|진짜|차라리") + String.raw`없어지고\s?싶`,
    own("내|제|이|나의|저의|그냥|이제|정말|진짜|차라리") + String.raw`(?:삶|인생|생)을\s?(?:끝내고|마감하고|포기하고)\s?싶`,
    alone("나|난|그냥|이제|정말|진짜|차라리") + THEN + String.raw`다\s?끝내고\s?(?:싶(?:어요|어|다|네요|네|습니다)(?=\s*(?:[.!?…~ㅠㅜ]|$))|싶다는\s?생각)`,
    alone("나|난|그냥|이제|차라리") + THEN + String.raw`죽을래(?!\s?(?:살래|[ㅋㅎ]))`,
    String.raw`(?:${STATEMENT_START}(?:(?:나|난|이제)\s)?|(?:나|난|너무)\s)(?:요즘\s)?(?:(?:${HARDSHIP}|힘들어)\s)?(?:그냥|차라리)\s?죽을까(?!\s?(?:봐|요))`,
    String.raw`^(?:그냥|차라리)\s?죽을까요`,
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
