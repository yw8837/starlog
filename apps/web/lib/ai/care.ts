/**
 * 돌봄 모드 (owner 2026-10-31: 단계별로 바꾸기): a request whose words carry a passive-tier crisis phrase
 * (lib/crisis.ts CRISIS_PASSIVE: 살기 싫, 사라지고 싶 …) is written with care instead of refused. The block rides on the
 * user turn (lib/ai/anthropic.ts buildRequest), so the cached system prompt stays the same, and careViolations checks
 * the draft (lib/ai/provider.ts generateValidated). The screen shows the helplines itself (components/ui/CareBanner).
 */
export const CARE_PROMPT = `<care>
사용자가 적은 글에 많이 지치고 힘든 마음이 보여요. 이번 풀이는 아래를 지켜 써요.
- 그 마음을 탓하거나 충고하지 않고, 풀이 앞부분에서 먼저 알아주는 말을 한 번 해요.
- 죽음, 끝, 운명을 단정하지 않아요. 죽음 카드나 탑 카드가 나와도 실제 죽음이나 파국이 아니라 한 국면이 바뀌는 흐름으로만 읽어요.
- 결과를 판정하지 않고, 오늘 할 수 있는 아주 작은 돌봄(잠, 밥, 바깥 공기, 믿는 사람 한 명에게 연락하기)과 혼자 버티지 않아도 된다는 점을 담아요.
- 상담 창구는 화면이 따로 안내해요. 풀이에서 말하고 싶다면 '24시간 상담전화 109'처럼 짧게 한 번만 써요.
- 죽음, 자살, 자해를 말하는 표현은 쓰지 않아요.
</care>`;

/** What a draft written with care must not say; the card name 죽음 and the helpline's name (자살예방상담전화) are not among them. */
// Narrow (review 2026-10-31): "목숨 걸고 준비한 시험" or "극단적인 결정" must not cost a regeneration or a failed reading.
const CARE_BANNED = /죽고\s?싶|죽을\s?(?:거|것|래)|죽어\s?버리|자살(?!\s?예방)|자해|목숨\s?(?:을\s?)?끊|극단적\s?(?:인\s?)?선택/;

export const CARE_VIOLATION = "돌봄이 필요한 글인데 죽음이나 자해를 말하는 표현이 있어요. 마음을 알아주는 말과 오늘 할 수 있는 작은 돌봄으로 바꿔 주세요.";

/** A hard violation (regenerate) when a draft written with care names dying or self-harm. */
export function careViolations(data: unknown): string[] {
  return CARE_BANNED.test(JSON.stringify(data) ?? "") ? [CARE_VIOLATION] : [];
}
