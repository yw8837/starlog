/**
 * The banned list of the entry-funnel voice (spec 2026-11-11 entry funnel renewal, 2.4), as code: every new line the
 * characters say (bubbles, nicknames, share texts) and the polite lines around them are tested against it
 * (lib/voice/banned.test.ts and each screen's own test). 살 alone is not banned (살펴, 살려, 살림 are everyday words):
 * only its phrases are.
 */

export type VoiceCategory =
  | "몸·외모"
  | "가족"
  | "돈 형편"
  | "정신 건강"
  | "사람의 가치"
  | "결과 약속·정확도"
  | "겁주기"
  | "판매 압박"
  | "스타로그 규칙"
  | "의료·투자";

export interface VoiceProblem {
  category: VoiceCategory;
  /** The words that matched, as written in the text. */
  word: string;
}

const KOREAN_COUNT = "\\d+|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열";

const RULES: ReadonlyArray<readonly [VoiceCategory, RegExp]> = [
  ["몸·외모", /살\s?쪘|살\s?빼|살이\s?찐|뚱|키\s?작|못생|얼굴|몸매|다이어트/],
  ["가족", /부모|(?:엄마|아빠|장남|장녀)\s?탓|집안|이혼\s?가정/],
  ["돈 형편", /거지|가난|빚|흙수저|월급\s?루팡|텅장/],
  ["정신 건강", /우울|정병|멘헤라|미쳤|사이코|관종|조울/],
  ["사람의 가치", /루저|노답|쓰레기|하수|실패자|찐따|망한\s?인생|모솔\s?확정|노처녀|노총각/],
  ["결과 약속·정확도", /무조건|반드시|100\s?%|확정|적중|소름|운명이\s?정해|대박\s?난다|돈\s?들어온다|헤어진다|당첨/],
  ["겁주기", /액운|저주|살\s?맞|큰일|불행|죽음\s?카드라서|재앙/],
  ["판매 압박", /지금만|오늘만|마감\s?임박|한정|놓치면|보는\s?중|남은\s?시간/],
  ["스타로그 규칙", new RegExp(`첫\\s?풀이|(?:하루|매일|일일|1일)\\s?에?\\s?(?:${KOREAN_COUNT})\\s?(?:번|회)|베타|beta`, "i")],
  ["의료·투자", /치료|완치|처방|투자\s?추천|매수|매도/],
];

/** The login providers: named only in login copy (the login screen, S18), where the visitor has to know them. */
const LOGIN_PROVIDERS = /카카오|kakao|google|구글/i;

/** AI model and company names (R6), the login providers among them. */
const MODEL_OR_COMPANY =
  /claude|anthropic|chat\s?gpt|\bgpt\b|gpt-?\d|openai|gemini|google|kakao|naver|hyperclova|llama|mistral|copilot|microsoft|deepseek|grok|perplexity|wrtn|클로드|앤트로픽|챗\s?gpt|챗지피티|오픈\s?ai|오픈에이아이|제미나이|제미니|구글|카카오|네이버|하이퍼클로바|코파일럿|마이크로소프트|딥시크|퍼플렉시티|뤼튼/gi;

/** Every banned word in `text`, by category; empty when it may be shown. `loginProviders`: login copy may name 카카오 and Google. */
export function voiceProblems(text: string, { loginProviders = false }: { loginProviders?: boolean } = {}): VoiceProblem[] {
  const problems: VoiceProblem[] = [];
  for (const [category, pattern] of RULES) {
    const hit = text.match(pattern);
    if (hit) problems.push({ category, word: hit[0] });
  }
  for (const hit of text.matchAll(MODEL_OR_COMPANY)) {
    if (loginProviders && LOGIN_PROVIDERS.test(hit[0])) continue;
    problems.push({ category: "스타로그 규칙", word: hit[0] });
  }
  return problems;
}

/** Throws when `text` holds a banned word, naming each (category: word). */
export function assertVoice(text: string, options?: { loginProviders?: boolean }): void {
  const problems = voiceProblems(text, options);
  if (problems.length > 0) throw new Error(`금지어: ${problems.map((p) => `${p.category}: ${p.word}`).join(", ")} — "${text}"`);
}
