/**
 * Guide articles (P1 fixtures, public and indexable). Written in 해요체, factual, no promises
 * about outcomes. Card articles describe the RWS 1909 scans the app shows; saju articles follow
 * saju-policy@1 (no hour pillar when the time is unknown, LMT day boundary, visible-glyph 오행 count).
 */

export type GuideCategory = "tarot" | "saju";

export const GUIDE_CATEGORY_LABEL: Record<GuideCategory, string> = { tarot: "타로", saju: "사주" };

/**
 * The guide index is one tab per category, in this order, each a static route `/guide/<category>`.
 * A static segment wins over `/guide/[slug]`, so no article slug may equal a category.
 */
export const GUIDE_CATEGORIES: readonly GuideCategory[] = ["tarot", "saju"];

export const guideIndexPath = (category: GuideCategory): string => `/guide/${category}`;

export interface GuideSection {
  heading: string;
  body: string;
}

export interface GuideArticle {
  slug: string;
  title: string;
  category: GuideCategory;
  /** Meta description and the one-line teaser on the guide index. */
  description: string;
  /** Card shown with a card article. */
  cardId?: string;
  sections: GuideSection[];
}

export const GUIDE_ARTICLES: readonly GuideArticle[] = [
  {
    slug: "how-to-read-tarot",
    title: "타로 카드 읽는 법",
    category: "tarot",
    description: "타로 78장의 구성과 라이더-웨이트-스미스 덱, 자리·그림·내 상황 순서로 카드를 읽는 방법을 정리했어요.",
    sections: [
      {
        heading: "78장의 구성",
        body: "타로는 78장으로 이뤄져 있어요. 인생의 큰 장면을 담은 메이저 아르카나 22장과, 일상의 장면을 담은 마이너 아르카나 56장이에요. 마이너 아르카나는 완드·컵·소드·펜타클 네 벌로 나뉘고, 벌마다 에이스부터 10까지의 숫자 카드 열 장과 시종·기사·여왕·왕 인물 카드 네 장이 있어요.",
      },
      {
        heading: "스타로그의 카드",
        body: "스타로그는 1909년에 나온 라이더-웨이트-스미스 덱의 원판 그림을 써요. 아서 에드워드 웨이트가 구성하고 파멜라 콜먼 스미스가 그렸어요. 대부분의 숫자 카드까지 사람과 풍경이 있는 장면으로 그려져 있어서, 그림을 보며 읽기 좋은 덱으로 오래 쓰여 왔어요.",
      },
      {
        heading: "자리, 그림, 내 상황 순서로",
        body: "같은 카드라도 '지금의 분위기' 자리에 나왔는지 '앞으로의 흐름' 자리에 나왔는지에 따라 읽는 방향이 달라져요. 그래서 먼저 자리를 확인하고, 그다음 그림 속 인물이 무엇을 들고 어디를 보는지, 어떤 풍경에 서 있는지 살펴요. 마지막으로 그 장면을 내 상황에 대 보고, 맞물리는 부분과 덜 맞는 부분을 나눠 보세요.",
      },
      {
        heading: "질문을 여는 법",
        body: "질문은 '될까, 안 될까'보다 '어떻게 하면 좋을까'처럼 열어 두면 읽을 거리가 많아져요. 누구의 일인지, 언제까지의 일인지를 정해 두면 풀이도 그만큼 구체적이 돼요.",
      },
      {
        heading: "타로가 하는 일",
        body: "타로는 앞일을 정해 주는 도구라기보다, 지금 상황을 다른 각도에서 보게 돕는 도구에 가까워요. 건강이나 돈, 법률처럼 중요한 결정은 전문가와 꼭 상의해 주세요.",
      },
    ],
  },
  {
    slug: "upright-and-reversed",
    title: "정방향과 역방향은 뭐가 달라요?",
    category: "tarot",
    description: "카드가 거꾸로 나오는 역방향은 어떻게 읽을까요? 여러 읽기 방식과 스타로그가 역방향을 보여 주는 방법을 알려 드려요.",
    sections: [
      {
        heading: "거꾸로 놓인 카드",
        body: "카드를 펼쳤을 때 그림이 똑바로 보이면 정방향, 위아래가 뒤집혀 보이면 역방향이에요. 카드를 섞는 동안 위아래도 함께 섞이면서 생겨요.",
      },
      {
        heading: "역방향을 읽는 여러 방식",
        body: "역방향을 읽는 방식은 하나로 정해져 있지 않아요. 정방향 뜻의 반대로 읽기도 하고, 같은 기운이 약하거나 늦게 나타난다고 보기도 해요. 밖으로 드러나기보다 마음속에서 일어나는 일로 읽기도 하고, 역방향을 아예 쓰지 않는 사람도 있어요.",
      },
      {
        heading: "나쁜 카드라는 뜻은 아니에요",
        body: "역방향이 나왔다고 나쁜 일이 생긴다는 뜻은 아니에요. 예를 들어 별 카드의 정방향을 회복과 희망으로 읽는다면, 역방향은 그 희망이 잠시 흐려졌거나 나를 돌볼 여유가 줄어든 상태로 읽을 수 있어요. 같은 주제를 다른 쪽에서 비춰 보는 셈이에요.",
      },
      {
        heading: "스타로그에서는",
        body: "스타로그는 카드를 섞을 때 카드마다 위아래도 함께 정해요. 역방향으로 나온 카드는 그림을 거꾸로 보여 주고 '역방향' 표시를 붙여요. 풀이에서는 카드가 놓인 자리의 의미와 함께 읽어요.",
      },
    ],
  },
  {
    slug: "saju-without-birth-time",
    title: "출생시간을 모를 때 사주는?",
    category: "saju",
    description: "태어난 시를 모르면 사주를 어떻게 볼까요? 시주 없이 여섯 글자로 읽는 방법과 일주가 달라질 수 있는 경우를 정리했어요.",
    sections: [
      {
        heading: "네 기둥, 여덟 글자",
        body: "사주는 태어난 해·달·날·시를 네 기둥으로 세우고, 기둥마다 천간과 지지 두 글자씩, 모두 여덟 글자로 읽어요. 그래서 사주를 팔자라고도 불러요.",
      },
      {
        heading: "시를 모르면 세 기둥으로",
        body: "태어난 시를 모르면 시주를 비워 두고 나머지 세 기둥, 여섯 글자로 읽어요. 스타로그는 이때 정오 같은 시각을 대신 넣지 않아요. 넣은 시각이 틀리면 실제로는 없는 글자로 풀이하게 되기 때문이에요. 그 대신 자녀나 말년처럼 시주가 주로 맡는 해석은 다루지 않고, 대운이 시작되는 나이에도 앞뒤로 조금 오차가 생겨요.",
      },
      {
        heading: "일주가 바뀔 수 있는 시각",
        body: "스타로그는 태어난 곳의 경도에 맞춰 시각을 보정해요. 지금의 표준시(동경 135도)로 태어났다면 서울은 시계에 적힌 시각에서 약 32분을 빼서 봐요. 옛 표준시(동경 127.5도)를 쓰던 시기나 서머타임이 있던 해에는 빼는 시간이 달라져요. 그래서 지금의 표준시로 서울에서 0시 30분쯤 태어났다면 보정한 시각이 전날 밤이 되어, 일주가 전날로 바뀔 수 있어요. 시간을 모르면 이런 경우를 가를 수 없어서, 명식 화면의 '적용한 기준'에 어느 시각에 태어났다면 일주가 달라지는지 적어 둬요.",
      },
      {
        heading: "밤 11시대에 태어났다면",
        body: "보정한 시각으로 밤 11시부터 자정 사이(자시)는 관법에 따라 다음 날로 보기도 해요. 스타로그는 이 시간대의 일주를 그날로 두고, 시주만 다음 날 기준으로 봐요.",
      },
      {
        heading: "나중에 시간을 알게 되면",
        body: "출생 당시의 병원 기록이나 가족의 기억으로 태어난 시를 확인해 볼 수 있어요. 시간을 알게 되면 내 정보에서 사주 정보를 고치고 명식을 다시 볼 수 있어요.",
      },
    ],
  },
  {
    slug: "five-elements",
    title: "오행이 뭐예요?",
    category: "saju",
    description: "목·화·토·금·수 다섯 기운이 서로 살리고 누르는 관계와, 스타로그가 명식에서 오행 개수를 세는 방법을 알려 드려요.",
    sections: [
      {
        heading: "다섯 가지 기운",
        body: "오행은 목(木)·화(火)·토(土)·금(金)·수(水) 다섯 가지 기운이에요. 사주의 천간 열 글자와 지지 열두 글자는 모두 이 다섯 가운데 하나에 속해요. 예를 들어 천간 병(丙)은 불인 화, 지지 인(寅)은 나무인 목이에요.",
      },
      {
        heading: "살리고 누르는 관계",
        body: "오행은 서로 살리기도 하고 누르기도 해요. 나무는 불을, 불은 흙을, 흙은 쇠를, 쇠는 물을, 물은 다시 나무를 살려요. 반대로 나무는 흙을, 흙은 물을, 물은 불을, 불은 쇠를, 쇠는 나무를 눌러요. 앞의 관계를 상생, 뒤의 관계를 상극이라고 해요.",
      },
      {
        heading: "스타로그가 세는 방법",
        body: "스타로그 명식 화면의 오행 개수는 천간과 지지에 보이는 글자만 세요. 태어난 시를 알면 여덟 글자, 모르면 여섯 글자예요. 지지 속에 숨은 글자(지장간)는 개수에 넣지 않고, 풀이에서 따로 다뤄요.",
      },
      {
        heading: "많고 적음보다 자리",
        body: "어떤 오행이 많거나 하나도 없다고 해서 좋고 나쁨이 정해지지는 않아요. 명리에서는 글자가 놓인 자리와 태어난 계절, 글자끼리의 관계를 함께 봐요. 겉으로 보이는 개수가 0이어도 지장간에 숨어 있을 수 있어요.",
      },
      {
        heading: "화면의 색",
        body: "전통적으로 목은 푸른색, 화는 붉은색, 토는 누런색, 금은 흰색, 수는 검은색과 이어 봐요. 스타로그 화면에서는 밤하늘 위에서도 잘 보이도록 목을 초록, 수를 파랑으로 표시해요.",
      },
    ],
  },
  {
    slug: "the-hermit",
    title: "은둔자 카드 이야기",
    category: "tarot",
    description: "메이저 아르카나 9번 은둔자 카드의 그림 속 장면과 흔히 읽는 뜻, 역방향으로 나왔을 때의 읽기를 소개해요.",
    cardId: "major-09-hermit",
    sections: [
      {
        heading: "그림 속 장면",
        body: "은둔자는 메이저 아르카나 9번(IX) 카드예요. 두건 달린 회색 망토를 입은 흰 수염의 노인이 눈 덮인 산꼭대기에 홀로 서 있어요. 한 손에는 불 밝힌 등불을, 다른 손에는 긴 노란 지팡이를 들고 고개를 숙이고 있어요. 이 덱을 구성한 웨이트는 등불 속에서 빛나는 것을 별이라고 설명했어요.",
      },
      {
        heading: "흔히 읽는 뜻",
        body: "은둔자는 흔히 혼자 생각을 정리하는 시간, 바깥보다 안에서 답을 찾는 일로 읽어요. 등불이 먼 곳이 아니라 바로 앞을 비춘다는 데 주목해, 서두르지 않고 한 걸음씩 나아가는 태도로 읽기도 해요.",
      },
      {
        heading: "역방향일 때",
        body: "역방향으로 나오면 혼자 있는 시간이 고립처럼 길어진 상태로 읽기도 하고, 반대로 돌아볼 틈 없이 바쁘게 지나가는 때로 읽기도 해요. 어느 쪽인지는 카드가 놓인 자리와 내 상황을 함께 보고 가려요.",
      },
      {
        heading: "관계를 묻는 자리에서",
        body: "관계를 묻는 자리에 은둔자가 나왔다고 해서 멀어진다는 뜻으로만 읽을 필요는 없어요. 내 마음을 먼저 정리할 시간이 필요하다는 쪽으로 읽을 수도 있어요. 다만 상대의 마음은 카드 한 장으로 단정하지 않아요.",
      },
    ],
  },
  {
    slug: "the-star",
    title: "별 카드 이야기",
    category: "tarot",
    description: "메이저 아르카나 17번 별 카드의 여덟 개의 별과 두 항아리, 흔히 읽는 뜻과 역방향으로 나왔을 때의 읽기를 소개해요.",
    cardId: "major-17-star",
    sections: [
      {
        heading: "그림 속 장면",
        body: "별은 메이저 아르카나 17번(XVII) 카드예요. 하늘에는 커다란 노란 별 하나와 작은 흰 별 일곱 개, 모두 여덟 개의 별이 떠 있고, 별마다 빛줄기가 여덟 갈래예요. 그 아래에서 옷을 입지 않은 여인이 한쪽 무릎은 땅에, 한 발은 물 위에 두고 두 항아리의 물을 붓고 있어요. 한쪽 물은 연못으로, 다른 쪽 물은 땅으로 흘러 여러 갈래 물줄기가 되고, 뒤편 나무 위에는 새 한 마리가 앉아 있어요.",
      },
      {
        heading: "흔히 읽는 뜻",
        body: "별은 흔히 회복과 희망, 다시 채워지는 마음으로 읽어요. 무너짐을 그린 16번 탑 카드 바로 다음에 오는 카드라서, 큰일이 지나간 뒤 숨을 고르는 장면으로 읽기도 해요. 물을 아낌없이 붓는 모습에서 가진 것을 나누는 태도를 읽는 사람도 있어요.",
      },
      {
        heading: "역방향일 때",
        body: "역방향으로 나오면 희망이 잠시 잘 보이지 않거나, 나를 돌볼 여유가 줄어든 때로 읽기도 해요. 기대를 내려놓으라는 뜻보다는 작은 회복부터 챙기라는 쪽으로 읽을 수도 있어요.",
      },
      {
        heading: "별 카드가 나왔다면",
        body: "별은 무언가를 당장 이뤄 준다는 뜻보다, 방향을 잃지 않게 돕는 표지에 가까워요. 별 카드가 나온 날에는 지금 나를 조금 회복시키는 일이 무엇인지 하나만 적어 보세요.",
      },
    ],
  },
];

export const findArticle = (slug: string): GuideArticle | undefined => GUIDE_ARTICLES.find((article) => article.slug === slug);

/** One tab's list: the category's articles in their GUIDE_ARTICLES order. */
export const articlesIn = (category: GuideCategory): GuideArticle[] => GUIDE_ARTICLES.filter((article) => article.category === category);
