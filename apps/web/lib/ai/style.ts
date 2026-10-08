import { BOLD, boldSegments, stripBold } from "@/lib/reading/bold";

/**
 * "AI 티 없이" (owner request; .superpowers/sdd/2026-09-30-starlog-p2b/style-rules.md, from the
 * humanize-korean taxonomy and humanizer). Two parts: the 문체 규칙 block that every cached system
 * prompt carries, and a soft AI-tell score. Soft means: three or more distinct high-signal hits
 * make one regeneration with the hits as feedback, and never fail a reading on their own.
 */

/**
 * Owner order ("모델명, 같은건 철저하게 블라인드로"): no generated text names or hints at the model,
 * vendor or technology behind it. Stable (cached) prompt block for every generation system prompt.
 */
export const MODEL_BLIND_RULE = `# 풀이 도우미의 정체
- 이 풀이를 어떤 AI 모델·회사·기술이 쓰는지 말하지도 암시하지도 않아요. Claude, Anthropic, Opus, Sonnet, Haiku, GPT, ChatGPT, OpenAI, Gemini, LLM, 언어 모델, 학습 데이터 같은 말을 어떤 언어로도 쓰지 않아요.
- 사용자가 무슨 AI인지, 어떤 모델인지, 누가 만들었는지 물으면 "저는 스타로그의 풀이 도우미예요. 어떤 기술로 만들었는지는 알려 드리지 않아요."처럼 따뜻한 한 문장으로만 답하고, 곧바로 그 사람의 풀이 이야기로 돌아가요.`;

/** Model, vendor and technology names in Korean, English, Japanese and Chinese that no generated text may contain: a hard violation. */
export const MODEL_NAMES =
  /클로드|claude|앤트로픽|anthropic|오푸스|opus|소네트|sonnet|하이쿠|haiku|챗\s?gpt|chat\s?gpt|gpt|오픈\s?ai|open\s?ai|gemini|제미나이|llm|언어\s?모델|クロード|アンソロピック|チャット\s?gpt|ジェミニ|言語モデル|克勞德|克劳德|語言模型|语言模型|大型語言模型/i;

/** Stable (cached) prompt block. JSON array items are lists already; the bullet rule is about text inside strings. */
export const STYLE_RULES = `# 문체 규칙
말투는 곁에서 카드를 같이 보는 사람이 말하듯 자연스러운 해요체로 써요.
- 번역투를 쓰지 않아요: "~에 대해", "~를 통해", "~에 있어", "~와 관련해", "~을 가지고 있어요", "~되어져요", 문장마다 붙는 "~할 수 있어요".
- 상투구를 쓰지 않아요: 결론적으로·요약하면·정리하자면·종합하면·이를 통해·따라서로 시작하는 문장, "~라고 할 수 있어요", "매우 중요해요", "주목할 만해요", "의미가 커요", "새로운 장이 열려요", "~할 때예요", "~에서 ~로 나아가요" 같은 변환 공식, 혁신적·획기적·압도적 같은 과장어.
- 형식으로 꾸미지 않아요: 문자열 안에 글머리표, 번호, 굵은 글씨, 이모지, 줄표(—), 강조용 따옴표를 쓰지 않아요. 굵은 글씨(**구**)는 작업별 형식이 허락한 칸에서만 그 형식이 정한 만큼 써요. 목록이 필요한 곳은 JSON 배열 항목이 이미 목록이에요. 따옴표는 사용자가 쓴 말이나 보낼 문장 예시를 옮길 때만 써요.
- 대구 공식을 쓰지 않아요: "A일까요, B일까요?"를 되풀이하거나, 문단마다 "먼저… 반면… 결국…" 순서로 짜지 않아요.
- 문장 길이를 섞어요. 같은 끝맺음을 세 번 넘게 잇지 않고 ~죠, ~거든요, ~네요, ~예요, 명사로 끝내기를 자연스럽게 섞어요. "~고 있어요"는 꼭 필요할 때만 써요.
- 근거가 있는 말은 망설이지 않고 말해요. 해석임을 밝히는 "~로 읽어요"는 그대로 쓰되, "~인 것 같아요", "~로 보여요"는 정말 불확실한 한 곳에만 쓰고 "~일 수도 있을 것 같아요" 같은 겹완곡은 쓰지 않아요. "양쪽 모두", "신중하게", "균형"으로 얼버무리지 않고 조건으로 나눠 말해요(예: 답이 빨리 오면 ~, 늦으면 ~).
- 문장 맨 앞에 또한·게다가·더불어·즉·나아가·아울러를 쓰지 않고, 하지만·그러나를 문단마다 쓰지 않아요. "이는 ~를 뜻해요"로 앞 문장을 받지 않아요.
- "~것이에요"로 끝내기, "~할 필요가 있어요", "정말·매우·굉장히·너무"를 되풀이하지 않아요.
- 카드나 개념을 사람처럼 주어로 세우지 않아요("이 카드가 말해 줘요", "별이 속삭여요"). 그림 속 장면을 묘사하고, 그 장면을 내 상황에 비춰 읽어 줘요.

좋은 예와 나쁜 예
- 나쁜 예: "결론적으로, 은둔자 카드는 당신이 내면의 목소리에 귀 기울여야 할 때임을 시사해요."
  좋은 예: "등불을 높이 든 노인이 고개를 숙여 발밑을 봐요. 멀리 있는 답보다 지금 선 자리를 먼저 확인하라는 그림이에요."
- 나쁜 예: "이번 주는 재정적 측면에서 매우 중요한 시기이며, 신중한 접근이 필요할 것으로 보여요."
  좋은 예: "이번 주는 새 수입원을 찾는 쪽에 힘이 실려요. 다만 계약서에 서명하는 일은 다음 주로 미뤄도 늦지 않아요."`;

export interface AiTell {
  id: string;
  label: string;
  hint: string;
}

const count = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].length;
const sentencesOf = (text: string) => text.split(/(?<=[.?!])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

/** Sentence endings: the last two syllables before the final punctuation. */
function repeatedEndings(text: string): boolean {
  let run = 1;
  let previous = "";
  for (const sentence of sentencesOf(text)) {
    const ending = sentence.replace(/[.?!…"'’”)\s]+$/, "").slice(-2);
    run = ending && ending === previous ? run + 1 : 1;
    if (run >= 4) return true;
    previous = ending;
  }
  return false;
}

/** Four or more sentences in a row with the same last two characters. */
export function repeatedEndingsBy(sentences: readonly string[]): boolean {
  let run = 1;
  let previous = "";
  for (const sentence of sentences) {
    const ending = sentence.replace(/[.?!…"'’”)\s。！？」』）]+$/, "").slice(-2);
    run = ending && ending === previous ? run + 1 : 1;
    if (run >= 4) return true;
    previous = ending;
  }
  return false;
}

const TELLS: Array<AiTell & { test: (text: string) => boolean }> = [
  { id: "D1", label: "결산어", hint: "결론적으로·요약하면·따라서로 문장을 열지 마세요", test: (t) => /(^|[.!?]\s*)(결론적으로|요약하면|정리하자면|종합하면|이를 통해|따라서|그러므로)/m.test(t) },
  { id: "D2", label: "의의 과장", hint: "'시사해요·주목할 만해요·매우 중요해요' 대신 그림과 상황을 말하세요", test: (t) => /시사하는 바|시사해|주목할 만|의미가 (크|적지 않)|매우 중요|간과할 수 없/.test(t) },
  { id: "D4", label: "과장어", hint: "혁신적·획기적·압도적 같은 말을 빼세요", test: (t) => /혁신적|획기적|압도적|폭발적|파격적|전례 없/.test(t) },
  { id: "D6", label: "완결 공식", hint: "'~할 때예요·~시점이에요'로 맺지 말고 조건과 행동으로 말하세요", test: (t) => /(할|될|볼) 때(예요|입니다)[.!]|시점(이에요|입니다)/.test(t) },
  { id: "D7", label: "변환 공식", hint: "'~에서 ~로 나아가요' 공식 대신 구체적인 장면을 쓰세요", test: (t) => /에서 [가-힣]+(으)?로 나아가|을 넘어 [가-힣]+(으)?로/.test(t) },
  // `**` counts when it is left in the text scored: the validators take bold within a format's budget out first (allowBold)
  { id: "C", label: "서식", hint: "글머리표·번호·이모지·줄표(—)를 문장 안에 쓰지 말고, 굵은 글씨는 형식이 허락한 곳에 정한 만큼만 쓰세요", test: (t) => /^\s*[-*•]\s|^\s*\d+[.)]\s|\*\*|—/m.test(t) || /\p{Extended_Pictographic}/u.test(t) },
  { id: "C8", label: "대구 질문", hint: "'A일까요, B일까요?'를 되풀이하지 마세요", test: (t) => count(t, /[가-힣]+(일까요|인가요),\s*[가-힣]+(일까요|인가요)\?/g) >= 2 },
  { id: "A", label: "번역투", hint: "'~에 대해·~를 통해·~와 관련해' 대신 바로 말하세요", test: (t) => count(t, /에 대(해|하여)|를 통(해|하여)|에 있어(서)?|와 관련(해|하여|된)|을 가지고 있|되어(져|지)/g) >= 3 },
  { id: "G", label: "겹완곡", hint: "'~일 수도 있을 것 같아요'를 한 번의 조건문으로 바꾸세요", test: (t) => /(일|할) 수도 있을 (것 같|듯)|로 보여질 수/.test(t) },
  { id: "H", label: "문두 접속어", hint: "문장 맨 앞의 또한·게다가·즉·나아가를 빼세요", test: (t) => sentencesOf(t).filter((s) => /^(또한|게다가|더불어|즉|나아가|아울러)[\s,]/.test(s)).length >= 2 },
  { id: "E2", label: "종결 반복", hint: "같은 끝맺음이 네 문장 넘게 이어져요. ~죠·~네요·명사 끝맺음을 섞으세요", test: repeatedEndings },
];

/** Distinct AI tells in the text (each pattern counts once). */
export function aiTells(text: string): AiTell[] {
  return TELLS.filter((tell) => tell.test(text)).map(({ id, label, hint }) => ({ id, label, hint }));
}

/**
 * Soft violations carry this prefix. They never fail a reading, and they cost a regeneration only
 * together (softWarrantsRegeneration): cost and latency (style-rules.md).
 */
export const SOFT_PREFIX = "[문체] ";

/** The soft marker for en, ja and zh-hant feedback (P6). */
export const SOFT_PREFIX_INTL = "[style] ";

/**
 * The reading voice's findings (docs/research/reading-voice-2026-10.md §4.3): soft, and fed back with a regeneration
 * that happens for another reason, but never one of their own. They are measured first; joining the ≥3 rule is the
 * owner's later call.
 */
export const VOICE_PREFIX = "[목소리] ";

export const isSoftViolation = (violation: string) =>
  violation.startsWith(SOFT_PREFIX) || violation.startsWith(SOFT_PREFIX_INTL) || violation.startsWith(VOICE_PREFIX);

export const AI_TELL_THRESHOLD = 3;

const AI_TELL_MESSAGE = `${SOFT_PREFIX}AI가 쓴 티가 나는 문장이 있어요.`;

/**
 * The ≥3 rule for soft findings: regenerate for style only when the AI-tell score fired (itself 3+
 * distinct tells) or when 3+ distinct soft checks fired together. One or two soft hits never do, nor
 * do voice findings, however many.
 */
export function softWarrantsRegeneration(violations: readonly string[]): boolean {
  const soft = violations.filter((v) => isSoftViolation(v) && !v.startsWith(VOICE_PREFIX));
  return soft.some((v) => v.startsWith(AI_TELL_MESSAGE)) || soft.length >= AI_TELL_THRESHOLD;
}

// ---- bold (reading-voice-2026-10 §2.2) ----

/** `**구**`: the one mark a task's format may allow (the saju body sections and card, the tarot reading's card sections), read as the screen reads it. */
export { BOLD, stripBold };

/** A bold phrase as §2.2 allows it: 4–20 characters without spaces, not a question, no hanja, not a bare number. */
export function boldPhraseOk(phrase: string): boolean {
  const n = phrase.replace(/\s/g, "").length;
  return n >= 4 && n <= 20 && !/[?？]|[一-鿿]/.test(phrase) && !/^[\d\s.,%~-]+$/.test(phrase);
}

/** The bold phrases of a text, and whether its marks pair up as the screen reads them (BoldText falls back to plain text otherwise). */
export function boldSpans(text: string): { phrases: string[]; paired: boolean } {
  return { phrases: [...text.matchAll(BOLD)].map((m) => m[1]!), paired: boldSegments(text) !== null };
}

/**
 * `text` as the AI-tell score reads it where a format allows up to `max` bold phrases: within that budget the marks are
 * not formatting and go; beyond it (too many, a question, too long, marks that do not pair up) they stay, and TELLS C
 * counts them.
 */
export function allowBold(text: string, max: number): string {
  const { phrases, paired } = boldSpans(text);
  return paired && phrases.length <= max && phrases.every(boldPhraseOk) ? stripBold(text) : text;
}

/** Adds one soft violation listing the hits when the texts show three or more distinct tells. */
export function aiTellViolations(texts: string[], out: string[]): void {
  const hits = aiTells(texts.join("\n"));
  if (hits.length >= AI_TELL_THRESHOLD) {
    out.push(`${AI_TELL_MESSAGE} ${hits.map((h) => `${h.id} ${h.label}: ${h.hint}`).join(" / ")}.`);
  }
}
