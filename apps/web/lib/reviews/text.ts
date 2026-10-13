/**
 * What a review may say (spec §6): its length, and nothing that reaches a person outside the service
 * or names one. Checked on the server before anything is saved; the screen shows the same message.
 */

export const REVIEW_MIN = 5;
export const REVIEW_MAX = 200;

/** Contact details, identity numbers, links and spam, each with the line the writer sees. */
const BLOCKED: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  { pattern: /\d{6}\s?-\s?[1-4]\d{6}/, message: "주민등록번호처럼 보이는 숫자는 쓸 수 없어요." },
  { pattern: /(?<!\d)01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}(?!\d)|(?<!\d)0\d{1,2}-\d{3,4}-\d{4}(?!\d)/, message: "전화번호는 쓸 수 없어요." },
  { pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/, message: "이메일 주소는 쓸 수 없어요." },
  { pattern: /(?<!\d)\d{2,6}-\d{2,6}-\d{2,7}(?!\d)/, message: "계좌번호처럼 보이는 숫자는 쓸 수 없어요." },
  { pattern: /https?:\/\/|www\.|open\.kakao|(?<![가-힣\w])[a-z0-9-]+\.(?:com|net|org|kr|io|me|co)(?![a-z])/i, message: "링크는 쓸 수 없어요." },
  { pattern: /오픈\s?채팅|카톡\s?(?:아이디|id)|텔레\s?그램|인스타\s?(?:아이디|id)/i, message: "연락처나 다른 곳으로 부르는 말은 쓸 수 없어요." },
  { pattern: /(?<![가-힣])(?:씨발|시발(?!점)|ㅅㅂ|병신|ㅄ|좆|개새끼|지랄|느금|니애미|꺼져)/, message: "욕설이 들어간 후기는 남길 수 없어요." },
  { pattern: /(.)\1{9,}/, message: "같은 글자를 너무 많이 이어 썼어요." },
];

/** Why this line cannot be saved, or null when it can. An empty line is fine: the stars alone are a review. */
export function reviewProblem(text: string): string | null {
  const body = text.trim();
  if (body.length === 0) return null;
  if (body.length < REVIEW_MIN) return `한 줄 후기는 ${REVIEW_MIN}자 이상 써 주세요.`;
  if (body.length > REVIEW_MAX) return `한 줄 후기는 ${REVIEW_MAX}자까지 쓸 수 있어요.`;
  return BLOCKED.find(({ pattern }) => pattern.test(body))?.message ?? null;
}

/** The nickname a review shows: the first and last characters, the rest hidden ("별빛냥" → "별*냥"). */
export function maskNickname(nickname: string | null | undefined): string {
  const name = [...(nickname ?? "").trim()];
  if (name.length === 0) return "스타로그 이용자";
  if (name.length === 1) return "*";
  if (name.length === 2) return `${name[0]}*`;
  return `${name[0]}${"*".repeat(name.length - 2)}${name[name.length - 1]}`;
}
