/**
 * Where to talk to a person when things are hard: the one source of these numbers. Shown under the
 * calm crisis message on reading screens and as general information (FAQ, 이용 가이드, /how).
 */

export const CRISIS_LEAD = "마음이 많이 힘들다면 풀이보다 사람과 먼저 이야기해 주세요.";

/**
 * Words that mean the person may be in crisis: the one pattern the server checks on every user-written
 * text (lib/api/http.ts isCrisisText) before anything is generated; the user's earlier questions are
 * judged with it too, but only to leave them out of the prompt (lib/ai/history.ts withoutCrisisItems).
 * Kept narrow on purpose, since a hit changes what the reader gets (a reading written with care, or the care screen
 * instead, by tier below) and 결혼·이혼·이직·이사 questions are the
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
/**
 * The tiers (owner 2026-10-31, after a reader on her first free reading met a refusal she took for the service
 * cutting off): what to do follows the Columbia scale's first two questions and the safe-messaging guidance of
 * Anthropic, Samaritans and 보고 듣고 말하기 (acknowledge, point to people, keep the door open).
 * - active: a stated thought of dying or of self-harm (C-SSRS 2). That text gets no reading: the care screen instead.
 * - passive: a wish to be gone with no stated thought of dying (C-SSRS 1: 살기 싫, 사라지고 싶, 다 끝내고 싶 …). The
 *   reading goes on, written with care (lib/api/stream.ts `care`), under the helplines.
 */
const ACTIVE = [
  // not "죽고 싶진 않은데 …" (a denial; what follows is judged on its own), but "죽고 싶지 않은 날이 없어요" is no denial
  String.raw`죽\s*고\s*싶(?!\s?(?:지|진|지는|지도)\s?않(?!은\s?날))`,
  String.raw`죽어\s?버리고\s?싶`,
  String.raw`(?:콱|확|그냥|차라리)\s?죽어\s?버릴(?:까|래)`,
  // not the helpline's or a job's name (자살예방상담전화, 자살 예방 교육)
  String.raw`자살(?!\s?예방)`,
  String.raw`자해`,
  String.raw`극단적\s?(?:인\s?)?선택`,
  String.raw`목숨\s?(?:을\s?)?끊`,
  String.raw`세상을\s?떠나고\s?싶`,
  own("이제|그냥|정말|진짜|차라리") + String.raw`그만\s?살고\s?싶`,
  own("내|제|이|나의|저의|그냥|이제|정말|진짜|차라리") + String.raw`(?:삶|인생|생)을\s?(?:끝내고|마감하고|포기하고)\s?싶`,
  alone("나|난|그냥|이제|차라리") + THEN + String.raw`죽을래(?!\s?(?:살래|[ㅋㅎ]))`,
  String.raw`(?:${STATEMENT_START}(?:(?:나|난|이제)\s)?|(?:나|난|너무)\s)(?:요즘\s)?(?:(?:${HARDSHIP}|힘들어)\s)?(?:그냥|차라리)\s?죽을까(?!\s?(?:봐|요))`,
  String.raw`^(?:그냥|차라리)\s?죽을까요`,
  String.raw`suicid(?:e|al)(?!\s?squad)`,
  String.raw`kill\s?myself`,
  // a means named as a wish (review 2026-10-31: "옥상에서 뛰어내리고 싶어요" was no crisis at all)
  // (a leap for fun right before it, "번지점프 뛰어내리고 싶어요", is taken out first: LEISURE_LEAP below)
  String.raw`뛰어\s?내리고\s?싶`,
  String.raw`투신하고\s?싶`,
  String.raw`목을?\s?매(?:고|달고)\s?싶`,
];
const PASSIVE = [
  String.raw`살\s*기\s*싫`,
  String.raw`사라지고\s?싶`,
  String.raw`살아갈\s?이유가\s?없`,
  own(String.raw`정말|진짜|너무|이제|그냥|요즘|차라리|세상에(?:서)?`) + LIVE_NO_MORE,
  String.raw`(?:${HARDSHIP})\s` + LIVE_NO_MORE + String.raw`(?!은\s?(?!마음|생각|기분|느낌|데)[가-힣])`,
  own("그냥|내가|제가|나는|저는|나도|정말|진짜|차라리") + String.raw`없어지고\s?싶`,
  alone("나|난|그냥|이제|정말|진짜|차라리") + THEN + String.raw`다\s?끝내고\s?(?:싶(?:어요|어|다|네요|네|습니다)(?=\s*(?:[.!?…~ㅠㅜ]|$))|싶다는\s?생각)`,
];
export const CRISIS_ACTIVE = new RegExp(ACTIVE.join("|"), "i");
export const CRISIS_PASSIVE = new RegExp(PASSIVE.join("|"), "i");
/** Any tier: earlier questions with one stay out of the prompt (lib/ai/history.ts), and other locales mirror it. */
export const CRISIS_WORDS = new RegExp([...ACTIVE, ...PASSIVE].join("|"), "i");

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

/**
 * Text instead of a call (보건복지부 2024-09; 마들랜 is run by 한국생명존중희망재단): a text message to 109, or 마들랜 on
 * KakaoTalk, both around the clock. Many people in distress will not phone.
 */
export const TEXT_HELP = { sms: "109", name: "마들랜", how: "카카오톡에서 '마들랜'을 검색해 채팅", note: "24시간" } as const;

/** A plan, a means or a time next to crisis words: the emergency lines come first. */
export const EMERGENCY_LINES: readonly CrisisContact[] = [
  { name: "구급", number: "119" },
  { name: "경찰", number: "112" },
];

/** The care screen for an active-tier text (no reading): not an error, the reason in one line, the door left open. */
export const CARE_TITLE = "마음이 많이 무거웠군요";
export const CARE_BODY =
  "이런 마음일 땐 카드보다 사람의 목소리가 더 힘이 돼서, 이 질문에는 풀이 대신 이야기할 곳을 먼저 알려 드려요. 지금 마음은 달라질 수 있어요. 이 일로 줄어든 횟수나 결제는 없어요.";
export const CARE_URGENT = "지금 바로 위험하다면 망설이지 말고 전화해 주세요.";
/** Above a reading written with care (passive tier), once until it is closed. */
export const CARE_BANNER = "마음이 많이 지쳐 보여요. 혼자 버티지 않아도 괜찮아요.";

/**
 * "쪽팔려서 사라지고 싶어요": embarrassment, not a wish to die. Only the plain "창피해서 / 쪽팔려서 / 부끄러워서 (너무) 사라지고
 * 싶" clears a passive hit: "부끄럽고 힘들어서 사라지고 싶어요" stays one (review 2026-10-31).
 */
const EMBARRASSED = /(?:창피|쪽팔|부끄|민망|쑥스)[가-힣]{0,2}?(?:해서|려서|워서)\s?(?:(?:너무|진짜|정말|좀|그냥)\s?)?사라지고\s?싶/g;
/**
 * Means (C-SSRS 4-5): with crisis words of any tier anywhere in the request, in any sentence or field (lib/api/http.ts
 * crisisCheck), the emergency lines lead. Kept to words that name a means, so they need no sentence of their own.
 */
export const CRISIS_MEANS = /유서|번개탄|수면제|농약|뛰어\s?내리|투신|목을?\s?매|목매|한강\s?다리|(?:자살|죽는)\s?방법/;
/** A time or a place: urgent only in the same sentence as a stated thought of dying (not "살기 싫어요. 오늘 밤 연락 올까요?"). */
const CRISIS_WHEN_WHERE = /오늘\s?밤|오늘\s?안에|지금\s?당장|옥상/;
/** A leap for fun, not a means: "번지점프 뛰어내리고 싶어요" passes (lib/api/http.test.ts), only with the leisure word right before. */
const LEISURE_LEAP = /(?:번지\s?점프|다이빙|패러글라이딩|낙하산|스카이\s?다이빙)[가-힣\s]{0,6}?뛰어\s?내리고\s?싶/g;
const SENTENCE_BREAK = /[.!?…\n]+/;

export type CrisisTier = "passive" | "active" | "urgent";

/** A means named in this text, a leap for fun aside (lib/api/http.ts crisisCheck reads every field with it). */
export const namesMeans = (text: string): boolean => CRISIS_MEANS.test(text.replace(LEISURE_LEAP, ""));

/** The tier of one text already cleaned the way the prompt sees it (lib/api/http.ts crisisTierOf); null for none. */
export function crisisTier(text: string): CrisisTier | null {
  const plain = text.replace(LEISURE_LEAP, "");
  const active = CRISIS_ACTIVE.test(plain);
  const passive = !active && CRISIS_PASSIVE.test(plain.replace(EMBARRASSED, ""));
  if (!active && !passive) return null;
  // A means anywhere ("살기 싫어요. 유서도 써놨어요"); a time or a place only beside a stated thought of dying in one sentence
  // (review 2026-10-31: "오늘 밤 연락 올까요", "옥상 정원" sent passive texts to the emergency screen).
  const urgent =
    CRISIS_MEANS.test(plain) || plain.split(SENTENCE_BREAK).some((part) => CRISIS_ACTIVE.test(part.trim()) && CRISIS_WHEN_WHERE.test(part));
  if (urgent) return "urgent";
  return active ? "active" : "passive";
}
