/** Example line for the optional note, per topic id (topic ids repeat across `who`, meaning the same). */
const BY_TOPIC: Readonly<Record<string, string>> = {
  love: "예: 소개팅을 몇 번 했는데 마음이 가는 사람이 없었어요",
  marriage: "예: 3년째 연애 중인데 결혼 이야기는 아직 안 했어요",
  money: "예: 요즘 수입이 없어서 모아 둔 돈으로 지내고 있어요",
  career: "예: 3년째 같은 회사인데 이직을 고민하고 있어요",
  study: "예: 시험이 한 달 남았는데 집중이 잘 안 돼요",
  health: "예: 요즘 잠을 설쳐서 오후만 되면 지쳐요",
  mind: "예: 별일 없는데 마음이 자꾸 가라앉아요",
  move: "예: 회사 근처로 옮길지 지금 집에 있을지 고민이에요",
  daily: "예: 오늘 중요한 미팅이 있어요",
  crush: "예: 요즘 자주 연락하는 사람이 있는데 마음을 모르겠어요",
  relationship: "예: 사귄 지 1년인데 요즘 대화가 줄었어요",
  contact: "예: 지난달엔 자주 연락했는데 요즘은 뜸해요",
  reunion: "예: 헤어진 지 석 달 됐는데 아직 생각나요",
  conflict: "예: 사소한 일로 다툰 뒤로 서먹해졌어요",
  creative: "예: 준비하던 작업을 공개할지 망설이고 있어요",
  negotiation: "예: 다음 주에 연봉 협상이 있어요",
  people: "예: 새 팀에 온 지 한 달인데 아직 어색해요",
  together: "예: 친구들과 함께 여행 계획을 짜고 있어요",
  mood: "예: 모임 분위기가 예전 같지 않아요",
};

export const DEFAULT_NOTE_PLACEHOLDER = "예: 요즘 가장 마음에 걸리는 일을 한 줄로 적어 보세요";

export function notePlaceholder(topicId: string | undefined): string {
  return (topicId && BY_TOPIC[topicId]) || DEFAULT_NOTE_PLACEHOLDER;
}
