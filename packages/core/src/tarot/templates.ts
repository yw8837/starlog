export type Who = "me" | "us" | "work" | "group";
export type When = "today" | "week" | "month" | "year";
export type TemplateId =
  | "relationship-contact"
  | "relationship"
  | "work"
  | "choice"
  | "self-flow"
  | "group"
  | "daily";

export interface SpreadTemplate {
  id: TemplateId;
  /** Korean position names, in tap order */
  positions: string[];
  positionsJa: string[];
}

export const TEMPLATES: Record<TemplateId, SpreadTemplate> = {
  "relationship-contact": {
    id: "relationship-contact",
    positions: ["나의 마음", "두 사람 사이", "먼저 움직이면"],
    positionsJa: ["私の気持ち", "二人のあいだ", "先に動くなら"],
  },
  relationship: {
    id: "relationship",
    positions: ["나의 마음", "상대에게 비친 나", "두 사람의 흐름"],
    positionsJa: ["私の気持ち", "相手に映る私", "二人の流れ"],
  },
  work: {
    id: "work",
    positions: ["지금 상황", "막힌 곳", "나아갈 방향"],
    positionsJa: ["今の状況", "行き詰まっているところ", "進む方向"],
  },
  choice: {
    id: "choice",
    positions: ["이쪽을 고르면", "저쪽을 고르면", "놓치고 있는 것"],
    positionsJa: ["こちらを選ぶなら", "あちらを選ぶなら", "見落としていること"],
  },
  "self-flow": {
    id: "self-flow",
    positions: ["지금의 나", "필요한 것", "이 시기의 흐름"],
    positionsJa: ["今の私", "必要なこと", "この時期の流れ"],
  },
  group: {
    id: "group",
    positions: ["모임의 분위기", "나의 자리", "도움이 될 태도"],
    positionsJa: ["集まりの雰囲気", "私の居場所", "助けになる姿勢"],
  },
  daily: {
    id: "daily",
    positions: ["오늘의 한 장"],
    positionsJa: ["今日の一枚"],
  },
};

export interface ConditionDef {
  id: string;
  label: string;
  /** always ends with an "unsure" option (잘 모르겠어요 / 아직 모르겠어요) */
  options: string[];
}

export interface TopicDef {
  /** English slug, unique within one `who` */
  id: string;
  ko: string;
  ja: string;
  /** Korean noun phrase without `·`, e.g. 직업·이직 -> 일과 이직 */
  phrase: string;
  template: TemplateId;
  conditions: ConditionDef[];
  /** Question templates; `{when}` is replaced by composeQuestion. Punctuation after {when} is part of the template. */
  questionKo: string;
  questionJa: string;
  /** `when` values this topic accepts; omitted = all four. composeQuestion throws for any other value. */
  whens?: When[];
}

const DUNNO = "잘 모르겠어요";
const NOT_YET = "아직 모르겠어요";

const cond = (id: string, label: string, ...options: string[]): ConditionDef => ({ id, label, options });

// Condition groups shared by several topics. Factories, so no two topics ever share an object.
const groupKind = () => cond("group-kind", "모임의 종류", "친구 모임", "직장", "학교", "취미 모임", "가족", DUNNO);
const studyStage = () => cond("stage", "준비 상황", "막 시작함", "한창 준비 중", "마무리 단계", DUNNO);
const careerStatus = () => cond("status", "현재 상황", "재직 중", "구직 중", "쉬는 중", "프리랜서", DUNNO);

export const TOPICS_BY_WHO: Record<Who, TopicDef[]> = {
  me: [
    {
      id: "love", ko: "연애운", ja: "恋愛運", phrase: "연애", template: "self-flow",
      questionKo: "{when}, 나의 연애는 어떻게 흘러갈까",
      questionJa: "{when}、私の恋愛運はどう流れていくかな",
      conditions: [
        cond("status", "지금 상태", "솔로", "썸 타는 중", "연애 중", "헤어진 지 얼마 안 됨", DUNNO),
        cond("focus", "가장 궁금한 것", "새로운 인연", "지금 관계의 흐름", "마음 정리", NOT_YET),
      ],
    },
    {
      id: "money", ko: "재물운", ja: "金運", phrase: "재물", template: "self-flow",
      questionKo: "{when}, 나의 재물 흐름은 어떨까",
      questionJa: "{when}、私のお金の流れはどうなるかな",
      conditions: [
        cond("situation", "지금 상황", "수입이 안정적", "수입이 들쭉날쭉", "지출이 늘어남", DUNNO),
        cond("focus", "관심 방향", "지출 줄이기", "수입 늘리기", "큰 결정 준비하기", NOT_YET),
      ],
    },
    {
      id: "career", ko: "직업·이직", ja: "仕事・転職", phrase: "일과 이직", template: "work",
      questionKo: "{when}, 나의 일과 이직의 흐름은 어떨까",
      questionJa: "{when}、私の仕事と転職の流れはどうなるかな",
      conditions: [
        careerStatus(),
        cond("concern", "고민의 종류", "일이 잘 맞지 않음", "성장이 막힌 느낌", DUNNO),
        cond("goal", "원하는 방향", "지금 자리에서 버티기", "새 길 알아보기", "잠시 쉬어 가기", NOT_YET),
      ],
    },
    {
      id: "study", ko: "학업·시험", ja: "勉強・試験", phrase: "학업과 시험", template: "work",
      questionKo: "{when}, 나의 학업과 시험 준비는 어떻게 풀려 갈까",
      questionJa: "{when}、私の勉強と試験はどう進んでいくかな",
      conditions: [
        studyStage(),
        cond("difficulty", "어려운 점", "집중이 잘 안 됨", "진도가 느림", "불안감이 큼", DUNNO),
      ],
    },
    {
      id: "health", ko: "건강·컨디션", ja: "健康・体調", phrase: "건강과 컨디션", template: "self-flow",
      questionKo: "{when}, 나의 컨디션은 어떤 리듬으로 이어질까",
      questionJa: "{when}、私の体調はどう流れていくかな",
      conditions: [
        cond("state", "요즘 컨디션", "괜찮은 편", "피로가 쌓임", "잠이 불규칙함", DUNNO),
        cond("focus", "궁금한 것", "생활 리듬", "쉬는 방법", "마음이 몸에 주는 영향", NOT_YET),
      ],
    },
    {
      id: "mind", ko: "마음·감정", ja: "心・気持ち", phrase: "마음과 감정", template: "self-flow",
      questionKo: "{when}, 나의 마음은 어디를 향하고 있을까",
      questionJa: "{when}、私の心はどこに向かっているのかな",
      conditions: [
        cond("feeling", "요즘 마음", "불안함", "답답함", "설렘", "무기력함", DUNNO),
        cond("cause", "이유", "사람 때문에", "일 때문에", "이유 없이", DUNNO),
        cond("goal", "원하는 방향", "마음 정리하기", "나를 이해하기", "기운 내기", NOT_YET),
      ],
    },
    {
      id: "move", ko: "이사·선택", ja: "引っ越し・選択", phrase: "이사와 선택", template: "choice",
      questionKo: "{when}, 갈림길에 선 나는 무엇을 살펴봐야 할까",
      questionJa: "{when}、分かれ道に立つ私は何を見ればいいかな",
      conditions: [
        cond("subject", "고민하는 것", "이사", "이직", "진학", "그 밖의 선택", DUNNO),
        cond("options", "선택지", "두 가지로 좁혀짐", "아직 여러 개", DUNNO),
        cond("deadline", "결정 시기", "곧 정해야 함", "여유가 있음", NOT_YET),
      ],
    },
    {
      id: "daily", ko: "오늘의 운", ja: "今日の運勢", phrase: "오늘의 운", template: "daily",
      questionKo: "{when} 나의 하루는 어떨까",
      questionJa: "{when}の私の一日はどうなるかな",
      whens: ["today"],
      conditions: [
        cond("mood", "오늘 상태", "가벼운 마음", "조금 지침", "바쁜 하루", DUNNO),
        cond("want", "바라는 것", "힘 얻기", "차분해지기", "조심할 점 알기", NOT_YET),
      ],
    },
  ],
  us: [
    {
      id: "crush", ko: "썸·고백", ja: "気になる人・告白", phrase: "썸과 고백", template: "relationship",
      questionKo: "{when}, 그 사람과 나의 썸은 어떤 쪽으로 나아갈까",
      questionJa: "{when}、あの人との距離はどう変わっていくかな",
      conditions: [
        cond("relation", "관계", "이제 막 알게 됨", "자주 연락함", "자주 만남", DUNNO),
        cond("response", "내가 느끼는 상대의 반응", "적극적", "미지근함", "알쏭달쏭함", DUNNO),
        cond("goal", "원하는 방향", "마음 확인하기", "고백하기", "천천히 지켜보기", NOT_YET),
      ],
    },
    {
      id: "relationship", ko: "연애", ja: "恋愛", phrase: "연애", template: "relationship",
      questionKo: "{when}, 그 사람과 나의 연애는 어떻게 흘러갈까",
      questionJa: "{when}、あの人との恋はどう流れていくかな",
      conditions: [
        cond("duration", "사귄 기간", "3개월 미만", "3개월~1년", "1년 넘음", DUNNO),
        cond("mood", "요즘 분위기", "좋은 편", "평범함", "다툼이 잦음", DUNNO),
        cond("goal", "원하는 방향", "더 가까워지기", "서로 이해하기", "마음 정리하기", NOT_YET),
      ],
    },
    {
      id: "contact", ko: "연락", ja: "連絡", phrase: "연락", template: "relationship-contact",
      questionKo: "{when}, 그 사람에게 먼저 연락해도 될까",
      questionJa: "{when}、あの人に自分から連絡してもいいかな",
      conditions: [
        cond("relation", "관계", "알아가는 중", "연인", "친구", "헤어진 사이", DUNNO),
        cond("recent-contact", "최근 연락", "이어지고 있음", "뜸해짐", "끊긴 지 오래", DUNNO),
        cond("goal", "원하는 방향", "가볍게 안부", "대화 다시 시작", "오해 풀기", NOT_YET),
      ],
    },
    {
      id: "reunion", ko: "재회", ja: "復縁", phrase: "재회", template: "relationship-contact",
      questionKo: "{when}, 헤어진 그 사람과의 재회를 어떻게 바라보면 좋을까",
      questionJa: "{when}、別れたあの人との再会をどう見ればいいかな",
      conditions: [
        cond("since", "헤어진 지", "1개월 미만", "1~6개월", "6개월~1년", "1년 넘음", DUNNO),
        cond("reason", "이별의 이유", "서로 바빠서", "다툼이 쌓여서", "마음이 멀어져서", DUNNO),
        cond("goal", "원하는 방향", "다시 연락해 보기", "마음 정리하기", "시간을 두기", NOT_YET),
      ],
    },
    {
      id: "conflict", ko: "갈등·화해", ja: "すれ違い・仲直り", phrase: "갈등과 화해", template: "relationship",
      questionKo: "{when}, 그 사람과의 갈등을 어떻게 풀어 가면 좋을까",
      questionJa: "{when}、あの人とのすれ違いをどう解いていけばいいかな",
      conditions: [
        cond("relation", "관계", "연인", "친구", "가족", "직장 동료", DUNNO),
        cond("degree", "갈등의 정도", "작은 오해", "반복되는 다툼", "크게 틀어짐", DUNNO),
        cond("goal", "원하는 방향", "먼저 사과하기", "대화 나누기", "거리 두기", NOT_YET),
      ],
    },
  ],
  work: [
    {
      id: "career", ko: "직업·이직", ja: "仕事・転職", phrase: "일과 이직", template: "work",
      questionKo: "{when}, 나의 일은 어떤 방향으로 나아갈까",
      questionJa: "{when}、私の仕事はどんな方向に進むかな",
      conditions: [
        careerStatus(),
        cond("blocker", "막힌 점", "인정받지 못하는 느낌", "일이 너무 많음", "성장이 멈춤", "사람 관계가 어려움", DUNNO),
        cond("goal", "원하는 방향", "지금 자리에서 버티기", "새 길 알아보기", "역할 바꾸기", NOT_YET),
      ],
    },
    {
      id: "money", ko: "재물운", ja: "金運", phrase: "재물", template: "self-flow",
      questionKo: "{when}, 일에서 들어오는 돈의 흐름은 어떨까",
      questionJa: "{when}、仕事でのお金の流れはどうなるかな",
      conditions: [
        cond("income", "수입 상황", "월급이 안정적", "수입이 들쭉날쭉", "수입이 줄어듦", DUNNO),
        cond("goal", "원하는 방향", "수입 늘리기", "지출 관리하기", "일하는 방식 바꾸기", NOT_YET),
      ],
    },
    {
      id: "study", ko: "학업·시험", ja: "勉強・試験", phrase: "학업과 시험", template: "work",
      questionKo: "{when}, 지금 하는 공부와 시험 준비를 어떻게 해 나가면 좋을까",
      questionJa: "{when}、今の勉強と試験の準備をどう進めればいいかな",
      conditions: [
        studyStage(),
        cond("time", "남은 시간", "넉넉함", "빠듯함", "시험이 코앞임", DUNNO),
        cond("difficulty", "어려운 점", "집중이 잘 안 됨", "진도가 느림", "불안감이 큼", DUNNO),
      ],
    },
    {
      id: "creative", ko: "창작·도전", ja: "創作・挑戦", phrase: "창작과 도전", template: "work",
      questionKo: "{when}, 나의 창작과 도전은 어떤 방향으로 나아갈까",
      questionJa: "{when}、私の創作と挑戦はどんな方向に進むかな",
      conditions: [
        cond("stage", "진행 단계", "구상 중", "시작한 지 얼마 안 됨", "한창 진행 중", "마무리를 앞둠", DUNNO),
        cond("blocker", "막히는 점", "아이디어", "실행할 용기", "시간 부족", "반응에 대한 걱정", DUNNO),
        cond("goal", "원하는 방향", "일단 시작하기", "다듬기", "세상에 내놓기", NOT_YET),
      ],
    },
    {
      id: "negotiation", ko: "협상·대화", ja: "交渉・対話", phrase: "협상과 대화", template: "work",
      questionKo: "{when}, 중요한 협상과 대화를 어떻게 풀어 가면 좋을까",
      questionJa: "{when}、大事な交渉と話し合いをどう進めればいいかな",
      conditions: [
        cond("counterpart", "상대", "상사", "동료", "거래처", DUNNO),
        cond("mood", "분위기", "협조적", "팽팽함", "어색함", DUNNO),
        cond("goal", "원하는 방향", "조건 조율하기", "오해 풀기", "관계 유지하기", NOT_YET),
      ],
    },
  ],
  group: [
    {
      id: "people", ko: "인간관계", ja: "人間関係", phrase: "인간관계", template: "group",
      questionKo: "{when}, 우리 모임 안의 인간관계는 어떻게 흘러갈까",
      questionJa: "{when}、私たちの集まりの人間関係はどう流れていくかな",
      conditions: [
        groupKind(),
        cond("mood", "요즘 분위기", "화기애애함", "조용함", "서먹함", DUNNO),
        cond("focus", "궁금한 것", "특정 사람과의 거리", "내 자리", "전체 흐름", NOT_YET),
      ],
    },
    {
      id: "conflict", ko: "갈등·화해", ja: "対立・仲直り", phrase: "갈등과 화해", template: "group",
      questionKo: "{when}, 우리 모임의 갈등을 어떻게 풀어 가면 좋을까",
      questionJa: "{when}、私たちの集まりの衝突をどう解いていけばいいかな",
      conditions: [
        groupKind(),
        cond("kind", "갈등의 모습", "의견 차이", "서운함이 쌓임", "역할 분담", DUNNO),
        cond("goal", "원하는 방향", "대화 자리 만들기", "한 발 물러서기", "중재 부탁하기", NOT_YET),
      ],
    },
    {
      id: "together", ko: "함께 하는 일", ja: "一緒に進めること", phrase: "함께 하는 일", template: "group",
      questionKo: "{when}, 우리가 함께하는 일은 어떤 흐름을 탈까",
      questionJa: "{when}、私たちが一緒に進めていることはどう流れていくかな",
      conditions: [
        cond("kind", "함께 하는 일", "프로젝트", "행사 준비", "모임 운영", DUNNO),
        cond("progress", "진행 상황", "막 시작함", "순조로움", "지연되고 있음", DUNNO),
        cond("role", "나의 역할", "이끄는 쪽", "돕는 쪽", DUNNO),
      ],
    },
    {
      id: "mood", ko: "모임의 분위기", ja: "集まりの雰囲気", phrase: "모임의 분위기", template: "group",
      questionKo: "{when}, 우리 모임의 분위기는 어떻게 흘러갈까",
      questionJa: "{when}、私たちの集まりの雰囲気はどう流れていくかな",
      conditions: [
        groupKind(),
        cond("mood", "요즘 분위기", "화기애애함", "조용함", "서먹함", DUNNO),
      ],
    },
  ],
};

const WHEN_KO: Record<When, string> = { today: "오늘", week: "이번 주", month: "이번 달", year: "올해" };
const WHEN_JA: Record<When, string> = { today: "今日", week: "今週", month: "今月", year: "今年" };

/**
 * Fills the `{when}` token of the topic's question template. Subject and wording live in the
 * template, so words are never duplicated by string surgery. Throws when `topic` is not one of the
 * `TOPICS_BY_WHO[who]` objects (checked by identity, so pass the object from that list, not a copy)
 * or when `when` is not allowed for the topic (`topic.whens`).
 */
export function composeQuestion(who: Who, topic: TopicDef, when: When, locale: "ko" | "ja" = "ko"): string {
  if (!TOPICS_BY_WHO[who].includes(topic)) {
    throw new Error(`Topic "${topic.id}" does not belong to who "${who}"`);
  }
  if (topic.whens && !topic.whens.includes(when)) {
    throw new Error(`Topic "${topic.id}" does not allow when "${when}"`);
  }
  const template = locale === "ja" ? topic.questionJa : topic.questionKo;
  const whenText = (locale === "ja" ? WHEN_JA : WHEN_KO)[when];
  return template.replace("{when}", whenText);
}
