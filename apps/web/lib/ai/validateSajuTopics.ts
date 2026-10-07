import "server-only";
import type { SajuTopicId } from "@/lib/reading/types";
import { TOPIC_SECTIONS, TOPIC_SECTION_LENGTH, TOPIC_TOTAL_LENGTH, otherTopicLabels, topicName } from "@/lib/sajuTopics";
import { maskGanzhiReadings } from "@/lib/ai/ganzhi";
import type { SajuTopicFactSet } from "@/lib/ai/prompts/sajuTopics";
import type { FollowUpAnswer, SajuReading, SajuTeaserDraft } from "@/lib/ai/schemas";
import { SOFT_PREFIX, aiTellViolations } from "@/lib/ai/style";
import {
  HEDGE, OTHER, QUOTED, TIME_UNKNOWN_LINE, TOLERANCE, actionVarietyViolations, allowedFactViolations, charCount, lengthCheck, mentions,
  modelNameViolations, monthlyViolations, moneyPushSentences, observationViolations, sentences, voiceViolations,
} from "@/lib/ai/validate";

/**
 * 주제별 사주 checks (saju-topics spec §8). On top of everything 전체 흐름 checks (model names, the
 * allow-listed facts and the saju blocklist, 해요체, AI tells, action variety), each topic adds hard
 * bans (§8.2), the structure and the anchors of §8.3, and the soft hints of §8.4. A hard violation
 * regenerates once with the findings as feedback, then fails as QUALITY (lib/ai/provider.ts).
 */

const ALL: readonly SajuTopicId[] = ["love", "reunion", "money", "career"];

/**
 * "~지 않아요" declines. "~지 않아도 재회하게 돼요" and "~지 않고도" concede and then say it anyway, so they decline nothing;
 * only a closing "~지 않아도 돼요" ("you need not ask") still does.
 */
const NEGATION = "지\\s?않(?!아도(?!\\s?(?:돼요|되어요|괜찮아요|괜찮습니다|상관없어요)(?:[,.?!]|\\s*$))|더라도|고도)";
/** A sentence that declines the topic it names ("이 풀이로 보지 않아요") is never a verdict. */
const DECLINED = new RegExp(`(?:말하|보|다루|판단하|단정하|약속하|쓰|짐작하|정해\\s?주|읽|묻)${NEGATION}|말하기\\s?어려|말할\\s?수\\s?없|정해\\s?드릴\\s?수\\s?없`);
/** Contrast or a condition ("옮긴다면 ~, 남는다면 ~"): options, not an order. */
const CONDITIONAL = /다면|라면|거나|든지|보다는|대신/;

/** "The other person" for topic readings: the 전체 흐름 list plus the people a topic chip brings up. */
const TOPIC_OTHER = `${OTHER}|헤어진\\s?사람|전\\s?(?:연인|애인|남친|여친)|썸\\s?상대|애인|팀장님?|상사|동료|회사\\s?사람`;
/**
 * The mind is the other person's only when they hold it: "그 사람의 마음은", "그 사람 마음은", "그 사람은 아직 마음이",
 * "팀장님은 성격이". An object, a place, a cause or a verb in between ("그 사람을 떠올릴 때 마음이", "상사 앞에서는 마음이",
 * "그 사람의 마음을 읽으려 애쓰는") is the reader's own mind, and "생각나요" is the reader thinking of them. So this is not validate.ts's
 * `OTHER_MIND` (a person, up to 15 characters, then the mind word) that spec §8.2 says to extend: in a topic reading that one flags most of
 * the reader's own scenes ("그 사람이 떠난 뒤로 마음이 비어 있는 느낌이 있어요").
 */
const OTHER_NAMES = TOPIC_OTHER.replace("그는|그가|", "");
const MIND_ADVERBS = "아직|아직도|여전히|지금|지금도|요즘|이미|정말|진짜|사실|분명|늘|항상|계속|여태|속으로|마음속으로";
const MIND_LEAD = `(?:(?:${MIND_ADVERBS}|당신에게|당신에\\s대한|당신을)\\s){0,2}`;
const MIND = "(?:마음|속마음|감정|진심|성격)";
const THOUGHT = "생각(?![나날하해])";
const OTHER_MIND = new RegExp([
  `(?:(?:${OTHER_NAMES})(?:은|는|이|가|도)|그는|그가|그도)\\s?${MIND_LEAD}(?:${MIND}|${THOUGHT})`,
  `(?:(?:${OTHER_NAMES})의|그의)\\s?${MIND_LEAD}(?:${MIND}|${THOUGHT})(?:은|는|이|가|에|속)`,
  `(?:${OTHER_NAMES})\\s${MIND_LEAD}${MIND}(?:은|는|이|가|에|속)`,
].map((head) => `${head}[^.?!]{0,20}(?:이에요|예요|확실|분명|거예요|있어요)`).join("|"));
const OTHER_FEELS = new RegExp(`(?:${TOPIC_OTHER.replace("그는|그가", "그")})(?:은|는|이|가)\\s[^.?!]{0,30}(?:좋아해|사랑해|싫어해|그리워해|원해|후회해|관심 있어|미워해)요`);
/**
 * The same claim once something stands between the person and the mind word. Only claim shapes are looked for, never "any words in
 * between": "그 사람이 보낸 말에 마음이 …" and "상사가 지시한 일이 많아도 마음이 …" are the reader's own scene, and a gap of any
 * words (even up to 15 characters) flags most such sentences. Three shapes (the "당신" of a reading is the reader):
 * 1. a stance word, or the reader as the partner of a comparison: "속으로는 여전히 마음이", "당신과 같은 마음이에요", "이별 후에도 마음이 확실해요"
 * 2. the reader as the object of the person's mind, no 에 and no word of the reader's scene (때, 면, 내/제 …) between: "당신을 향한 마음이",
 *    "당신에게 미안한 마음이", "당신을 인정하는 성격이에요"
 * 3. one word that is the person's own feeling: "후회하는 마음이 있어요"
 */
const PERSON = `(?:(?:${OTHER_NAMES})(?:\\s?쪽(?:에서(?:는|도|만)?|은|이|도)|은|는|이|가|도)|그는|그가|그도)`;
const STANCE = "분명히|지금쯤|속으로는?|속으론|겉으로는?(?:\\s[가-힣]{1,8}도)?|겉으론(?:\\s[가-힣]{1,8}도)?|내심|같은|이\\s순간에도|(?:이별|헤어진)\\s?(?:후|뒤)(?:에도|에는|에)?(?:\\s내내)?|당신(?:과|처럼)|당신\\s앞에서는?";
const CLAIM_LEAD = `(?:(?:${MIND_ADVERBS}|${STANCE})\\s){0,3}`;
const ADDRESSED = "(?:당신(?:을|에게|한테|과|와|처럼|에\\s대한)|당신의\\s[가-힣]{1,6}[을를]|당신\\s앞에서는?)";
const READER_SCENE = "(?<![가-힣])(?:내|제)(?:가)?\\s|때|면\\s|다면|라면|려고|느라|전에|동안|까지|순간|(?<![가-힣])(?:뒤|후|이후)(?:로|에|에는|에도|부터)?\\s";
/** The predicate belongs to this mind word, not to a second one ("같은 마음이라고 믿고 싶은 마음이 있어요" is a wish). */
const MIND_PREDICATE = `(?:(?!${MIND})[^.?!]){0,20}(?:이에요|예요|확실|분명|거예요|있어요)`;
const MIND_SUBJECT = `${MIND}(?:(?:이(?!면)|가|은|는|도|일|만)${MIND_PREDICATE}|이에요)`;
const CLAIMED_MIND = new RegExp([
  `${PERSON}\\s?${CLAIM_LEAD}${MIND_SUBJECT}`,
  `${PERSON}\\s?${CLAIM_LEAD}${ADDRESSED}(?:(?!${READER_SCENE})[^.?!에]){0,12}(?<!의\\s)${MIND_SUBJECT}`,
  `${PERSON}\\s?${CLAIM_LEAD}(?:[가-힣]{1,8}[는은한]|큰)\\s${MIND}(?:(?:이|가|은|는|도)\\s?(?:있(?:어요|을\\s?거예요|었을\\s?거예요)|확실|분명)|일\\s?거예요)`,
].join("|"));
/** "당신을 생각하고 있어요", "당신 생각을 하고 있을 거예요": someone is thinking of the reader. */
const THINKS_OF_YOU = /당신(?:을|에\s?대해)\s?생각(?:하고\s?있|해요|합니다|하는\s?(?:마음|중|사람))|당신\s?생각(?:을\s?(?:[가-힣]{1,4}\s)?(?:하고\s?있|해요|합니다)|이\s?(?:많|확실|분명)|뿐)/;
/** Wondering or wishing about the other person's mind is not claiming it: "같은 마음일까 궁금한 날이 있어요", "같은 마음이면 좋겠다는 생각이 들 때가 있어요". */
const UNSURE = /궁금|걱정|[는은인을할될]지|[일할될]까|면\s?좋/;

/** A claim about another person's mind or feelings. A HEDGE word ("알 수 없어요", "수도 있어요") makes it a possibility. */
function claimsOtherMind(sentence: string): boolean {
  const claimed =
    OTHER_MIND.test(sentence) || OTHER_FEELS.test(sentence) || ((CLAIMED_MIND.test(sentence) || THINKS_OF_YOU.test(sentence)) && !UNSURE.test(sentence));
  return claimed && !HEDGE.test(sentence);
}

const COUNTDOWN = /(?<!\d)\d{1,3}\s?(?:일|주일?|개월|달|년)\s?(?:뒤|후(?!반)|안에|이내|만에)|D\s?-\s?\d+|디데이|D데이/i;
const CLOCK_DATE = /\d{1,2}\s?월\s?\d{1,2}\s?일|[월화수목금토일]요일|\d{1,2}\s?시\s?(?:에|쯤|경|까지|부터)/;
const SEASON_TIMING = /(?:올해|내년|다음\s?해|다가오는\s?해|이번|오는|새해)\s?(?:봄|여름|가을|겨울)|(?:봄|여름|가을|겨울)\s?(?:쯤|무렵|부터|까지)|(?:봄|여름|가을|겨울)(?:이|가)\s?(?:오면|되면)/;
const GENDERED_STAR = /(?:재성|정재|편재|관성|정관|편관)[^.?!]{0,12}(?:아내|남편|부인|와이프|배우자|남자\s?친구|여자\s?친구)|(?:아내|남편)(?:의|를\s?뜻하는|를\s?나타내는)\s?(?:별|자리|글자|십성)|(?:남자|여자|남성|여성)(?:에게|에겐|의\s?경우|라면|한테)[^.?!]{0,15}(?:재성|관성|정재|편재|정관|편관)/;
const PARTNER_CHART = new RegExp(`(?:${TOPIC_OTHER})(?:의|이|가)?\\s?(?:사주|명식|띠|생일|생년월일|일간|일주)(?!\\s?없이)`);
const AMOUNT = /\d[\d,]*\s?(?:만|천|백|억)?\s?원|\d+\s?억|\d+(?:\.\d+)?\s?%|퍼센트/;
/**
 * What follows "가능성이" when it is a verdict (high, low, there is, there is none), in sentence-final 해요체 or 합니다체. A question
 * ("있을까요?"), a decline ("알 수 없어요") or an aside ("자꾸 마음에 걸리는 건") does not end this way. The match keeps its ending, so a
 * follow-up answer cannot hide the verdict behind the stem its question already holds (see `topicHardViolations`).
 */
const POSSIBLE_VERDICT = [
  "(?:높|낮|작|적|많|있|없)(?:아요|어요|습니다)",
  "(?:높|낮|작|적|많)은\\s?편(?:이에요|입니다)|(?:있|없)는\\s?편(?:이에요|입니다)",
  "(?:높|낮|작|적|많|있|없)(?:아|어)\\s?보(?:여요|입니다)",
  "커요|큽니다|큰\\s?편(?:이에요|입니다)|커\\s?보(?:여요|입니다)",
  "(?:높|낮|크|작|적|많|있)지\\s?않(?:아요|습니다)",
  "(?:희박|충분)(?:해요|합니다)",
  "열려\\s?있(?:어요|습니다)|(?:엿)?보(?:여요|입니다)|느껴(?:져요|집니다)",
].join("|");
const POSSIBLE_END = `(?:이|은|도)?\\s?(?:(?:꽤|매우|아주|상당히|충분히|거의|훨씬|제법|분명히|여전히|아직|크게|많이|전혀|별로|안)\\s)?(?:${POSSIBLE_VERDICT})(?!\\s?\\?)`;
/** "만날 거라면", "나타날 거면", "만날 것이라면": the encounter is the condition, not the prediction. */
const NO_CONDITION = "(?!\\s?(?:이?라면|이?면|이?든|이?라도|이?더라도))";
const ENCOUNTER = new RegExp(
  `인연이\\s?(?:나타나|찾아오|찾아와|생기|들어오|들어와|닿)|(?:곧|머지않아|조만간)\\s?(?:만나|생기|인연)|만나게\\s?(?:돼|될|됩)|새로운\\s?(?:사람|인연)이\\s?(?:나타|와|찾아|생기)|(?:헤어지|이별하|멀어지)게\\s?(?:돼|될|됩)|이별(?:이|을)\\s?(?:맞게|겪게|하게)|(?:사람|인연|귀인)(?:이|을)[^.?!]{0,10}(?:(?:나타|만)날\\s?(?:(?:거|것)${NO_CONDITION}|수(?:도)?\\s?있(?:어요|겠|을\\s?(?:거|것)|습니다))|나타(?:나요|납니다|나게\\s?(?:돼|될|됩)))`,
);
const ENCOUNTER_POSSIBILITY = new RegExp(`(?:사람|인연|귀인)(?:이|을)[^.?!]{0,10}(?:나타|만)날\\s?(?:가능성|운)${POSSIBLE_END}`);
const PARTNER_TRAITS = new RegExp(`(?:${TOPIC_OTHER}|남편|아내|연인)[^.?!]{0,12}(?:키가|외모|얼굴|직업|나이가|MBTI|학벌|연봉)|연상(?:을|과|이)?\\s?(?:만나|맞|어울)|연하(?:를|와|가)?\\s?(?:만나|맞|어울)|MBTI`, "i");
const REUNION_VERDICT = /재회(?:하게\s?(?:돼|될|됩)|할\s?(?:거|것|수\s?있어요)|해요|합니다|가\s?(?:돼요|이뤄|이루어|가능))|다시\s?(?:이어질\s?(?:거|것)|이어져요|만나게\s?(?:돼|될)|만날\s?(?:거|것))|재회운이\s?(?:있|없|강|약|좋|나쁘|높|낮)|다시\s?(?:이어질|만날)\s?수(?:도)?\s?있(?:어요|겠|을\s?(?:거|것)|습니다)|인연[^.?!]{0,10}이어질\s?(?:거|것|수(?:도)?\s?있(?:어요|겠|을\s?(?:거|것)|습니다))/;
/** "재회 가능성이 높아요", "다시 이어질 가능성이 커요", "재회할 가능성이 없어요": the possibility with its verdict, not the bare words. */
const REUNION_POSSIBILITY = new RegExp(`(?:재회(?:의|할)?|이어질|만날)\\s?가능성${POSSIBLE_END}`);
/** "그 사람이 돌아올 거예요" (a person comes back), never "리듬이 돌아와요". */
const PERSON_RETURNS = new RegExp(`(?:${TOPIC_OTHER}|연인)[^.?!]{0,15}돌아(?:와요|올\\s?(?:거|것))`);
const CONTACT = new RegExp(`연락이\\s?(?:와요|올\\s?(?:거|것)|오게\\s?(?:돼|될)|닿을\\s?(?:거|것))|먼저\\s?연락(?:하세요|해\\s?보세요|하는\\s?게\\s?좋)|(?:${TOPIC_OTHER})(?:에게|한테)\\s?연락(?:하세요|해\\s?보세요|하는\\s?게\\s?좋)`);
const WIN_BACK = /붙잡는\s?(?:법|방법)|마음을\s?(?:돌리|되돌리)|돌아오게\s?(?:만드|하는|할)|재회\s?(?:비법|방법|전략)|다시\s?(?:사로잡|붙잡)/;
const WEALTH_GRADE = /재물운이\s?(?:약|강|좋|나쁘|없|있|타고|크|작)|돈복이\s?(?:없|있|많|적|타고)|재복이\s?(?:없|있|많|적)|부자가\s?(?:될|되는)\s?(?:사주|운|팔자)|돈이\s?(?:안\s?)?붙(?:는|지\s?않는)\s?사주/;
const WEALTH_TIMING = /(?:돈|재물|목돈|큰돈)이\s?(?:들어오|풀리|생기|모이)는\s?(?:해|달|때|시기|날)/;
const CAREER_ORDER = /(?:이직|퇴사|전직)하세요|그만두세요|옮기세요|남으세요|버티세요|(?:이직|퇴사)할\s?때(?:예요|이에요|가\s?왔)|(?:이직|퇴사)하는\s?(?:게|것이)\s?(?:좋아요|나아요|맞아요)|(?:이직|퇴사|전직)(?:을|를)?\s?(?:하는\s?편이\s?(?:더\s)?(?:좋(?:아요|습니다|겠어요|을\s?거예요)|나(?:아요|을\s?거예요)|낫(?:습니다|겠어요)|맞(?:아요|습니다|을\s?거예요))|(?:추천|권)(?:해요|합니다|드려요|드립니다|할게요|드릴게요|해\s?드려요|해\s?드립니다|해\s?드릴게요))(?!\s?\?)/;
const EXAM_VERDICT = /합격(?:해요|할\s?(?:거|것|수\s?있어요)|하게\s?(?:돼|될)|이에요|운|\s?가능성)|붙을\s?(?:거|것|수\s?있)|승진운|승진(?:해요|할\s?(?:거|것)|하게\s?(?:돼|될))|불합격|낙방|점수가\s?(?:오르|나오|높)|(?:합격|승진)하실|붙으실/;
/** Verdict words only beside an exam word: "시험에 떨어질 수 있어요", "이번 면접은 붙어요", but never "일에 속도가 붙어요". */
const GATED_VERDICT = /떨어(?:질|져|지|집)|붙어요/;
const EXAM_WORDS = /시험|자격증|면접|합격|지원/;

interface HardCheck {
  /** what the feedback names */
  label: string;
  /** how to fix it (sent back to the model) */
  fix: string;
  topics: readonly SajuTopicId[];
  /** timing checks read only 2~5절, the observation, the teaser and answers (1·6절 carry the birth date and the calculation's dates) */
  timing?: boolean;
  /** a sentence that declines it passes (DECLINED) */
  declinable?: boolean;
  /** the offending text in `sentence`, or null */
  find: (sentence: string, facts: SajuTopicFactSet) => string | null;
}

const hit = (re: RegExp) => (sentence: string) => re.exec(sentence)?.[0] ?? null;

/** "2027년 8월" and "2027-08" the facts give (a 대운 change) pass; any other month or season timing is found. */
function monthTiming(sentence: string, facts: SajuTopicFactSet): string | null {
  const allowed = facts.allowed.yearMonths;
  const stripped = sentence
    .replace(/(\d{4})\s?년\s?(\d{1,2})\s?월/g, (all, y: string, m: string) => (allowed.includes(`${y}-${m.padStart(2, "0")}`) ? "□" : all))
    .replace(/\d{4}-\d{2}/g, (ym) => (allowed.includes(ym) ? "□" : ym));
  return /(?<!\d)(?:1[0-2]|[1-9])\s?월/.exec(stripped)?.[0] ?? /상반기|하반기|분기/.exec(stripped)?.[0] ?? SEASON_TIMING.exec(stripped)?.[0] ?? null;
}

export const HARD_CHECKS: readonly HardCheck[] = [
  { label: "시기를 지정한 문장", fix: "날짜·요일·시각이나 'n일 뒤' 대신 '앞으로 몇 주 동안'처럼 말해 주세요.", topics: ALL, timing: true, find: (s) => hit(COUNTDOWN)(s) ?? hit(CLOCK_DATE)(s) },
  { label: "달·계절로 시기를 짚은 문장", fix: "달 이름·분기·상·하반기·계절 시기 대신 '올해 남은 기간'과 '다가오는 해'로만 말해 주세요. 해가 바뀌는 때는 '입춘 무렵'이에요.", topics: ALL, timing: true, find: monthTiming },
  { label: "성별로 배우자 별을 정한 문장", fix: "재성·관성을 아내·남편으로 읽지 말고, 관계를 맺는 방식의 축으로만 말해 주세요.", topics: ALL, find: hit(GENDERED_STAR) },
  { label: "상대의 정보를 다룬 문장", fix: "상대의 사주·띠·생일은 묻거나 짐작하지 않아요. 내 명식만 읽어 주세요.", topics: ALL, declinable: true, find: hit(PARTNER_CHART) },
  {
    label: "다른 사람의 마음을 단정한 문장",
    fix: "그 사람의 마음이나 성격은 분위기·가능성으로만 말해 주세요.",
    topics: ALL,
    find: (s) => (claimsOtherMind(s) ? s.slice(0, 30) : null),
  },
  { label: "금액이나 비율을 쓴 문장", fix: "금액·비율은 쓰지 말고 흐름과 습관으로 말해 주세요.", topics: ALL, find: hit(AMOUNT) },
  {
    label: "만남·이별을 예언한 문장",
    fix: "만남이나 이별이 생긴다고 말하지 말고, 관계를 대하는 나의 방식과 생활 반경으로 말해 주세요.",
    topics: ["love", "reunion"],
    declinable: true,
    find: (s) => hit(ENCOUNTER)(s) ?? hit(ENCOUNTER_POSSIBILITY)(s),
  },
  { label: "상대의 특징을 말한 문장", fix: "상대의 외모·나이·직업·성격은 말하지 않아요.", topics: ["love", "reunion"], find: hit(PARTNER_TRAITS) },
  { label: "재회를 판정한 문장", fix: "재회가 된다·안 된다를 말하지 말고, 다시 이어진다면 되풀이되기 쉬운 것과 스스로 정할 기준을 말해 주세요.", topics: ["reunion"], declinable: true, find: (s) => hit(REUNION_VERDICT)(s) ?? hit(REUNION_POSSIBILITY)(s) ?? hit(PERSON_RETURNS)(s) },
  { label: "연락을 예언하거나 시킨 문장", fix: "연락이 온다고 하거나 먼저 연락하라고 하지 말고, 연락할지 말지 정할 기준을 줘 주세요.", topics: ["reunion"], declinable: true, find: hit(CONTACT) },
  { label: "붙잡는 법을 다룬 문장", fix: "상대의 마음을 돌리는 법은 쓰지 않아요. 내 마음과 생활을 지키는 행동으로 바꿔 주세요.", topics: ["love", "reunion"], declinable: true, find: hit(WIN_BACK) },
  { label: "투자를 권하거나 수익을 약속한 문장", fix: "투자 판단은 이 풀이로 말하기 어렵다고만 밝히고, 돈을 다루는 습관으로 말해 주세요.", topics: ["money"], find: (s) => moneyPushSentences(s)[0] ?? null },
  { label: "재물운의 세기를 매긴 문장", fix: "재물운이 강하다·약하다 대신 돈이 들어오는 길과 지키는 힘이 어디에 놓였는지로 말해 주세요.", topics: ["money"], declinable: true, find: hit(WEALTH_GRADE) },
  { label: "돈이 들어오는 때를 짚은 문장", fix: "돈이 들어오는 해·달 대신 재성이 드러나는 국면처럼 말해 주세요.", topics: ["money"], declinable: true, find: hit(WEALTH_TIMING) },
  { label: "이직·퇴사를 정해 주는 문장", fix: "정해 주지 말고 '옮긴다면 ~, 남는다면 ~'처럼 두 길과 판단 기준을 줘 주세요.", topics: ["career"], find: (s) => (CONDITIONAL.test(s) ? null : hit(CAREER_ORDER)(s)) },
  {
    label: "합격·승진을 판정한 문장",
    fix: "합격·불합격·승진은 이 풀이로 보지 않는다고만 밝히고, 배우는 방식과 기준으로 말해 주세요.",
    topics: ["career"],
    declinable: true,
    find: (s) => hit(EXAM_VERDICT)(s) ?? (EXAM_WORDS.test(s) ? hit(GATED_VERDICT)(s) : null),
  },
];

/**
 * §8.2 for one topic. `whole` is every checked text, `timing` the part the time checks read. Words
 * the user wrote themselves (`userText`: a follow-up question) may be quoted back.
 */
export function topicHardViolations(texts: { whole: string; timing: string }, facts: SajuTopicFactSet, out: string[], userText = ""): void {
  const others = otherTopicLabels(facts.topic).filter((label) => texts.whole.includes(label) && !userText.includes(label));
  if (others.length) out.push(`다른 주제의 상황 칩 문구가 나왔어요: ${others.map((l) => `'${l}'`).join(", ")}. 고른 주제(${topicName(facts.topic)})의 상황만 다뤄 주세요.`);
  for (const check of HARD_CHECKS) {
    if (!check.topics.includes(facts.topic)) continue;
    const text = (check.timing ? texts.timing : texts.whole).replace(QUOTED, "''");
    const found = sentences(text)
      .filter((sentence) => !(check.declinable && DECLINED.test(sentence)))
      .map((sentence) => check.find(sentence, facts))
      .find((match): match is string => match !== null && !userText.includes(match));
    if (found !== undefined) out.push(`주제별 사주에서 쓰지 않는 ${check.label}이 있어요("${found.slice(0, 30)}"). ${check.fix}`);
  }
}

/** The user's own words for the saju blocklist: the topic's name (재회운 may say 재회) and the chip. */
const topicUserText = (f: SajuTopicFactSet) => `${topicName(f.topic)} ${f.situation?.label ?? ""}`;
/** 결혼 is the reading's subject only for 연애운 with "결혼을 생각 중이에요" (spec §16 default 8). */
const marriageTopic = (f: SajuTopicFactSet) => f.topic === "love" && f.situation?.id === "marriage";

const has = (text: string, keys: readonly string[]) => keys.some((key) => key !== "" && text.includes(key));

/** §8.3: each topic section names its anchor; a group counted 0 is named as missing or hidden. */
function anchorViolations(bodies: string[], f: SajuTopicFactSet, out: string[]): void {
  const a = f.allowed.anchors;
  const h = TOPIC_SECTIONS[f.topic];
  const [s2 = "", s3 = "", s4 = "", s5 = ""] = bodies.slice(1, 5);
  if (!has(s2, a.s2)) out.push(`'${h[1]}' 절에 이 주제의 근거(${a.s2.slice(0, 4).join("·")} 가운데 하나)를 불러 주세요.`);
  if (!has(s3, a.s3)) out.push(`'${h[2]}' 절에 이 주제의 근거(${a.s3.slice(0, 4).join("·")} 가운데 하나)를 불러 주세요.`);
  if (!has(s4, a.s4)) out.push(`'${h[3]}' 절에 지금 대운(${a.s4.join(" 또는 ")})을 불러 주세요.`);
  if (!has(s5, a.s5[0]) || !has(s5, a.s5[1])) out.push(`'${h[4]}' 절에 올해 세운(${a.s5[0][1]})과 다가오는 해 세운(${a.s5[1][1]})을 모두 불러 주세요.`);
  for (const [text, names, heading] of [[s2, a.zeroS2, h[1]], [s3, a.zeroS3, h[2]]] as const) {
    const missing = names.filter((name) => !(text.includes(name) && /없|숨/.test(text)));
    if (missing.length) out.push(`'${heading}' 절에서 겉에 없는 ${missing.join("·")}을 없거나 숨어 있다고 밝혀 주세요.`);
    if (names.length && !f.input.timeKnown && !/여섯 글자|시주/.test(text)) out.push(`'${heading}' 절에서 개수는 시주 없이 여섯 글자 기준이라고 밝혀 주세요.`);
  }
}

/** §8.3: the time-unknown line, the day-pillar window, the 대운 edge, the next 대운 and a 대운 not computed. */
function basisViolations(bodies: string[], f: SajuTopicFactSet, out: string[]): void {
  const h = TOPIC_SECTIONS[f.topic];
  const s2 = bodies[1] ?? "";
  const s4 = bodies[3] ?? "";
  if (!f.input.timeKnown && !TIME_UNKNOWN_LINE.test(bodies[5] ?? "")) out.push("계산 기준 절에 태어난 시를 몰라 시주 없이 읽었다는 한계를 넣어 주세요.");
  if (f.dayWindow && !s2.includes(f.dayWindow.range)) out.push(`'${h[1]}' 절에 일주가 바뀔 수 있는 시각 범위(${f.dayWindow.range})를 한 번 옮겨 주세요.`);
  if (f.allowed.anchors.nextLuck && !has(s4, f.allowed.anchors.nextLuck)) out.push(`'${h[3]}' 절에서 곧 바뀌는 다음 대운(${f.allowed.anchors.nextLuck.join(" 또는 ")})을 먼저 말해 주세요.`);
  if (f.luckEdge && !/앞뒤|달라질 수/.test(s4)) out.push(`'${h[3]}' 절에서 대운이 바뀌는 때가 태어난 시각에 따라 앞뒤로 달라질 수 있다고 밝혀 주세요.`);
  if (!f.luck && !/계산하지|정해지지|계산할 수 없/.test(s4)) out.push(`'${h[3]}' 절에서 대운을 계산하지 않은 까닭을 밝혀 주세요.`);
}

const occurrences = (text: string, phrase: string) => (phrase ? text.split(phrase).length - 1 : 0);

/** §8.4 (soft): the chip shows in 2절, is quoted at most twice, and 결혼 is there for the 결혼 chip. */
function situationViolations(s2: string, all: string, f: SajuTopicFactSet, out: string[]): void {
  const chip = f.situation;
  if (!chip) return;
  if (!mentions(s2, chip.label, 0.3)) out.push(`${SOFT_PREFIX}고른 상황('${chip.label}')이 2절에 보이지 않아요. 2절 앞부분에서 그 상황에 명식으로 먼저 답해 주세요.`);
  if (occurrences(all, chip.label) > 2) out.push(`${SOFT_PREFIX}상황 칩 문구를 두 번 넘게 그대로 썼어요. 한 번만 인용하고 그 상황에서 나오는 구체적인 말로 바꿔 주세요.`);
  if (chip.id === "marriage" && !all.includes("결혼")) out.push(`${SOFT_PREFIX}결혼을 생각 중이라고 골랐는데 결혼 이야기가 보이지 않아요. 함께 사는 생활과 함께 내리는 결정을 이 명식이 다루는 방식으로 한두 문장 써 주세요.`);
}

export function validateSajuTopicTeaser(d: SajuTeaserDraft, f: SajuTopicFactSet): string[] {
  const out: string[] = [];
  modelNameViolations(d, out);
  const titleLength = charCount(d.title);
  if (titleLength < 2 || titleLength > 16) out.push("title은 4~12자로 써 주세요.");
  lengthCheck("summary", d.summary, 250, 400, out);
  if (!f.input.timeKnown && !TIME_UNKNOWN_LINE.test(d.summary)) out.push("태어난 시를 몰라 여섯 글자로 읽었다는 한계를 summary에 한 문장 넣어 주세요.");
  const masked = maskGanzhiReadings(`${d.title}\n${d.summary}`);
  allowedFactViolations(masked, f.allowed, out, topicUserText(f), { marriage: marriageTopic(f) });
  topicHardViolations({ whole: masked, timing: maskGanzhiReadings(d.summary) }, f, out);
  if (!has(d.summary, f.allowed.anchors.s2)) out.push(`summary에 이 주제의 핵심 사실(${f.allowed.anchors.s2.slice(0, 4).join("·")} 가운데 하나)을 넣어 주세요.`);
  voiceViolations(d.summary, out);
  if (f.situation && !mentions(d.summary, f.situation.label, 0.3)) out.push(`${SOFT_PREFIX}고른 상황('${f.situation.label}')에 닿는 문장이 summary에 보이지 않아요.`);
  aiTellViolations([d.summary], out);
  return out;
}

export function validateSajuTopicReading(r: SajuReading, f: SajuTopicFactSet): string[] {
  const out: string[] = [];
  modelNameViolations(r, out);
  const headings = TOPIC_SECTIONS[f.topic];
  if (r.sections.length !== headings.length) out.push(`sections는 정확히 ${headings.length}개여야 해요.`);
  r.sections.forEach((section, i) => {
    const [min, max] = TOPIC_SECTION_LENGTH[i] ?? [500, 650];
    const n = charCount(section.body);
    if (n < Math.floor(min * 0.6) || n > Math.ceil(max * 1.5)) out.push(`'${headings[i] ?? `${i + 1}번째 절`}' 절이 공백 제외 ${n}자예요. ${min}~${max}자로 써 주세요.`);
  });
  const total = r.sections.reduce((sum, s) => sum + charCount(s.body), 0);
  const [lo, hi] = TOPIC_TOTAL_LENGTH;
  if (total < lo * (1 - TOLERANCE) || total > hi * (1 + TOLERANCE)) out.push(`풀이 분량이 공백 제외 ${total}자예요. ${lo.toLocaleString("ko-KR")}~${hi.toLocaleString("ko-KR")}자로 맞춰 주세요.`);
  observationViolations(r.observation.body, out);
  if (r.followUps.length < 1 || r.followUps.length > 3 || r.followUps.some((q) => !q.trim() || charCount(q) > 40)) out.push("followUps는 30자 이하 질문 2개로 써 주세요.");
  const bodies = r.sections.map((s) => s.body);
  monthlyViolations(headings, bodies, f, out);
  const all = [...bodies, r.observation.body, ...r.followUps].join("\n");
  const masked = maskGanzhiReadings(all);
  allowedFactViolations(masked, f.allowed, out, topicUserText(f), { marriage: marriageTopic(f) });
  topicHardViolations({ whole: masked, timing: maskGanzhiReadings([...bodies.slice(1, 5), r.observation.body].join("\n")) }, f, out);
  anchorViolations(bodies, f, out);
  basisViolations(bodies, f, out);
  voiceViolations(all, out);
  situationViolations(bodies[1] ?? "", all, f, out);
  actionVarietyViolations([...bodies, r.observation.body], out);
  aiTellViolations([...bodies, r.observation.body], out);
  return out;
}

export function validateSajuTopicFollowUp(a: FollowUpAnswer, f: SajuTopicFactSet, question = ""): string[] {
  const out: string[] = [];
  modelNameViolations(a, out);
  lengthCheck("answer", a.answer, 150, 450, out);
  const masked = maskGanzhiReadings(a.answer);
  allowedFactViolations(masked, f.allowed, out, `${question} ${topicUserText(f)}`, { marriage: marriageTopic(f) });
  topicHardViolations({ whole: masked, timing: masked }, f, out, question);
  voiceViolations(a.answer, out);
  aiTellViolations([a.answer], out);
  return out;
}
