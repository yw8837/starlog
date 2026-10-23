import type { GuideHowTo } from "../guide";

/**
 * Answer-first fields for every guide article (search snippets, AI answers): a 2-3 sentence 요약
 * that answers the title's question before the sections, and HowTo steps for the step-by-step
 * articles. Summaries restate the article body and add nothing it does not say; HowTo step texts
 * are copied from the body word for word (library.test.ts checks both, and the banned words).
 */
export const GUIDE_SUMMARIES: Readonly<Record<string, string>> = {
  "how-to-read-tarot":
    "타로 카드는 카드가 놓인 자리를 먼저 확인하고, 그림 속 인물과 풍경을 살핀 뒤, 그 장면을 내 상황에 대 보는 순서로 읽어요. 타로는 메이저 아르카나 22장과 마이너 아르카나 56장, 모두 78장이에요. 질문은 '될까, 안 될까'보다 '어떻게 하면 좋을까'처럼 열어 두면 읽을 거리가 많아지죠.",
  "upright-and-reversed":
    "그림이 똑바로 보이면 정방향, 위아래가 뒤집혀 보이면 역방향이에요. 스타로그는 역방향을 정방향의 단순한 반대로 읽지 않고, 그 카드의 힘이 막히거나 안으로 향하거나 지나치거나 약해진 상태 가운데 하나로 읽어요. 역방향이 나왔다고 나쁜 일이 생긴다는 뜻은 아니에요.",
  "saju-without-birth-time":
    "태어난 시를 모르면 시주를 비워 두고 해·달·날 세 기둥, 여섯 글자로 사주를 읽어요. 스타로그는 정오 같은 시각을 대신 넣지 않고, 자녀나 말년처럼 시주가 주로 맡는 해석은 다루지 않아요. 자정 무렵에 태어났다면 보정한 시각에 따라 일주가 전날로 바뀔 수 있어서, 명식 화면의 '적용한 기준'에 그 경우를 적어 둬요.",
  "five-elements":
    "오행은 목(木)·화(火)·토(土)·금(金)·수(水) 다섯 가지 기운이고, 사주의 천간 열 글자와 지지 열두 글자는 모두 이 가운데 하나에 속해요. 나무는 불을, 불은 흙을, 흙은 쇠를, 쇠는 물을, 물은 나무를 살리는 상생과 서로 누르는 상극의 관계로 읽죠. 어떤 오행이 많거나 없다고 해서 좋고 나쁨이 정해지지는 않아요.",
  "the-hermit":
    "은둔자 카드는 멀리 있는 답보다 지금 선 자리를 확인하며 혼자 마음을 고르는 시간을 뜻해요. 거꾸로 나오면 그 시간이 길어져 마음이 닫혔거나 이제 사람들 곁으로 돌아올 때가 된 상태를 보고, 연락이 끊긴다는 예고로는 쓰지 않죠.",
  "the-star":
    "별은 메이저 아르카나 17번 카드로, 정방향에서는 요란하지 않게 조금씩 다시 채워지는 회복과 희망으로 읽어요. 큰 별 하나와 작은 별 일곱 개 아래에서 여인이 두 항아리의 물을 연못과 땅에 붓는 그림이고, 16번 탑 다음 번호라 흔들림 뒤에 다시 채워지는 단계로도 봐요. 역방향이면 희망이 흐려졌거나, 나를 채우기보다 퍼 주기만 해서 회복이 더딘 상태로 읽어요.",

  "celtic-cross-spread":
    "켈틱 크로스는 카드 열 장을 왼쪽 십자 여섯 자리와 오른쪽 기둥 네 자리로 놓고 한 질문을 여러 방향에서 읽는 스프레드예요. 1번 지금의 분위기와 2번 걸림돌을 한 쌍으로 먼저 읽고, 3·4번의 목표와 바탕, 5·1·6번의 시간 흐름, 7·8번의 나와 주변을 차례로 견줘요. 9번 바람과 두려움을 본 뒤 10번 결말을 읽되, 정해진 결과보다 지금 흐름이 이어질 때의 모습으로 받아들이죠.",
  "three-card-spread":
    "타로 3장 스프레드는 카드를 뽑기 전에 세 자리를 먼저 정하고, 한 장씩 읽은 뒤 세 장을 한 문장으로 이어 읽는 방법이에요. 가장 익숙한 짜임은 과거·현재·미래이고, 막힌 일에는 상황·걸림돌·조언처럼 질문에 맞춰 자리 이름을 바꿔도 좋아요. 마지막 자리만 보고 결론을 내리면 무엇을 바꾸면 되는지를 놓치기 쉽죠.",
  "one-card-yes-no":
    "원카드로 예·아니오를 물을 때는 정방향은 예, 역방향은 아니오로 보거나 카드 성격에 따라 예·기다림·다시 생각하기로 나누는 방식 가운데 하나를 뽑기 전에 정해 둬요. 질문은 '오늘 먼저 연락해 보면 어떤 흐름일까?'처럼 내가 움직일 수 있는 일 하나로, 기간을 정해서 만들면 읽기 쉽죠. 건강, 법, 큰돈이 걸린 결정은 예·아니오로 정하지 말고 전문가와 상의해 주세요.",
  "now-card-how-to":
    "지금의 한 장은 고민 하나를 떠올리고 펼쳐진 카드 가운데 마음이 가는 한 장을 고르면, 고민에 건네는 한 문장과 그렇게 읽은 이유를 바로 보여 주는 무료 메뉴예요. 답 문장은 78장의 정방향과 역방향마다 카드 그림에 맞춰 미리 써 둔 문장 가운데 하나가 나오고, 횟수 제한 없이 쓸 수 있어요. 하루 한 번 그날의 운세를 보는 오늘의 한 장과 달리, 지금 붙든 고민 하나에 짧게 답하는 쪽이죠.",
  "redrawing-same-question":
    "원하는 답이 나올 때까지 곧바로 다시 뽑으면 카드를 읽기보다 이미 정해 둔 답을 확인하게 되기 쉬워서 권하지 않아요. 상황이 바뀌었을 때, 정해 둔 기간이 지났을 때, 질문 자체가 달라졌을 때는 다시 봐도 괜찮죠. 마음에 들지 않는 카드가 나왔다면 다시 뽑기 전에 왜 마음에 들지 않는지 적어 보고 그림을 한 번 더 살펴보세요.",
  "minor-arcana-suits":
    "마이너 아르카나는 메이저 아르카나 22장을 뺀 56장으로, 완드·컵·검·펜타클 네 벌에 숫자 카드 열 장과 인물 카드 네 장씩이 있어요. 완드는 불과 의욕, 컵은 물과 감정·관계, 검은 공기와 생각·말, 펜타클은 흙과 돈·생활을 맡아요. 같은 벌 안에서는 에이스가 시작, 10이 한 주기의 끝인 것처럼 숫자가 이야기의 단계를 나타내죠.",
  "court-cards":
    "타로 인물 카드는 네 벌마다 시종·기사·여왕·왕이 한 장씩, 모두 열여섯 장이에요. 스타로그는 인물 카드를 특정한 사람보다 태도로 먼저 읽고, 벌의 영역과 계급의 단계를 겹쳐서 봐요. 시종은 배우는 자리, 기사는 밀고 나가는 자리, 여왕은 안에서 다스리는 자리, 왕은 밖으로 책임지는 자리죠.",

  "the-fool":
    "바보 카드의 뜻은 어리석음보다 경험이 적어 가벼운 첫걸음 쪽이고, 절벽 끝에서 하늘을 보는 젊은이는 떨어지는 중이 아니라 걸음을 떼기 직전이에요. 거꾸로 나오면 그 가벼움이 지나치거나, 겁에 막히거나, 속으로만 떠날 채비를 하는 상태를 짚죠.",
  "the-magician":
    "마법사 카드는 필요한 도구가 이미 탁자 위에 있으니 가진 것으로 지금 시작해 보라는 뜻으로 많이 풀어요. 거꾸로 나오면 재주가 있는데도 시작을 못 누르는 막힘이나, 말과 연출이 준비보다 앞서는 지나침을 먼저 보죠.",
  "the-high-priestess":
    "여사제 카드는 서둘러 정하지 않고 조용히 보고 느낀 것을 믿으라는 뜻에 가까워요. 거꾸로 나와도 상대가 비밀을 숨긴다는 판정이 아니라, 내 쪽에서 품고만 있던 말이 무거워졌거나 바쁨에 가려 직감이 안 들리는 상태를 먼저 보죠.",
  "the-empress":
    "여황제 카드는 돌보고 가꾼 것이 천천히 익어 가는 풍요와 편안함을 뜻해요. 거꾸로 나오면 챙김이 지나쳐 내 몫이 비어 가거나 여유가 말라 가는 상태를 먼저 보고, 큰돈이 들어온다는 예고로는 쓰지 않죠.",
  "the-emperor":
    "황제 카드는 흔들리지 않는 기준을 세우고 내가 책임질 범위를 정하는 힘을 뜻해요. 아버지나 상사로만 좁히지 않고, 거꾸로 나오면 규칙이 지나쳐 숨이 막히는지 세운 틀이 힘을 잃었는지부터 가려 보죠.",
  "the-hierophant":
    "교황 카드는 검증된 방법과 믿을 만한 사람에게 배우며 공식적인 틀을 따르는 쪽을 뜻해요. 결혼과 종교도 그 틀 안에 들지만 날짜를 알려 주는 카드는 아니고, 거꾸로 나오면 관습에 맞추느라 답답해진 상태부터 살피죠.",
  "the-lovers":
    "연인 카드는 끌림을 다루면서도, 그 끌림 앞에서 내가 무엇을 소중히 여기는지 정하는 선택을 뜻해요. 거꾸로 나오면 헤어짐의 예고가 아니라 서로 보는 방향이 달라 선택이 미뤄지거나 끌림에 판단이 흐려진 상태를 먼저 보죠.",
  "the-chariot":
    "전차 카드는 서로 다른 두 힘을 한 방향으로 모아 목표 쪽으로 밀고 나가는 의지를 뜻해요. 고삐도 매인 끈도 없이 지팡이 하나로 선 모습이라 끄는 힘보다 방향을 잡는 힘에 가깝고, 거꾸로 나오면 의욕은 큰데 방향이 엇갈려 제자리를 도는 상태부터 보죠.",
  strength:
    "힘 카드는 센 감정이나 버거운 상황을 억지로 누르지 않고 다정하게 다루는 힘을 뜻해요. 라이더-웨이트-스미스 덱에서는 8번이고, 거꾸로 나오면 버티던 힘과 자신감이 떨어졌거나 감정을 속으로만 눌러 둔 상태를 먼저 보죠.",
  "wheel-of-fortune":
    "운명의 수레바퀴 카드는 상황이 한 바퀴 돌아 흐름이 바뀌는 지점을 뜻해요. 언제 바뀌는지 날짜를 짚지는 않고, 거꾸로 나오면 흐름이 걸려 멈춘 듯하거나 비슷한 일이 되풀이되는 상태를 먼저 보죠.",
  justice:
    "정의 카드는 감정보다 사실을 같은 무게로 달아 보고 분명하게 정하는 판단을 뜻해요. 다툼이나 소송의 승패를 알려 주지는 않고, 거꾸로 나오면 결정이 미뤄지거나 판단이 한쪽으로 쏠린 상태를 먼저 보죠.",
  "the-hanged-man":
    "매달린 사람 카드는 억지로 움직이기보다 잠시 멈춰 거꾸로 보며 새 관점을 얻는 쪽을 뜻해요. 벌을 받는 장면이 아니고, 거꾸로 나오면 기다림과 희생이 지나쳐 나를 소모하는 상태부터 살피죠.",
  death:
    "죽음 카드는 끝을 뜻하지만, 한 국면을 닫고 다음으로 넘어가기 위해 정리하는 쪽으로 받아들여요. 거꾸로 나오면 끝내야 할 것을 붙잡고 있어 넘어가지 못하는 상태부터 보고, 이별이나 퇴사가 정해졌다는 판정으로는 쓰지 않죠.",
  temperance:
    "절제 카드는 극단 대신 알맞은 비율을 찾아 천천히 섞고 맞춰 가는 조율을 뜻해요. 무엇을 참으라는 카드라기보다 두 가지를 섞는 카드이고, 거꾸로 나오면 과로나 과몰입처럼 한쪽으로 지나쳐 비율이 깨진 상태부터 보죠.",
  "the-devil":
    "악마는 메이저 아르카나 15번 카드로, 정방향에서는 알면서도 끊기 어려운 습관이나 관계에 묶여 있는 상태로 읽어요. 사슬이 헐겁게 걸려 있다는 점이 이 카드를 읽는 열쇠예요. 역방향이면 매임이 느슨해지며 벗어날 틈이 보이는 상태로 먼저 읽죠.",
  "the-tower":
    "탑은 메이저 아르카나 16번 카드로, 정방향에서는 억지로 버티던 구조나 착각이 갑자기 흔들리며 드러나는 순간으로 읽어요. 번개는 예상 밖의 충격, 떨어지는 두 사람은 익숙한 자리에서 떠밀려 나오는 경험으로 풀죠. 역방향이면 겉은 멀쩡한데 속에서 먼저 무너지고 있는 상태로 먼저 읽어요.",
  "the-moon":
    "달은 메이저 아르카나 18번 카드로, 정방향에서는 모든 게 흐릿해 불안과 상상이 커지는 상태로 읽어요. 달빛은 해의 빛을 빌려 온 빛이라 모든 게 또렷하지 않게 보인다는 해석이 여기서 나오죠. 역방향이면 흐릿하던 것이 조금씩 걷히며 오해가 풀리고 상황의 윤곽이 보이기 시작하는 쪽으로 먼저 읽어요.",
  "the-sun":
    "태양은 메이저 아르카나 19번 카드로, 정방향에서는 숨길 것 없이 또렷하고 밝게, 기쁨을 드러내도 좋은 흐름으로 읽어요. 역방향이면 해가 구름에 가린 듯 기쁨과 자신감이 약해져, 좋은 일이 있어도 마음이 다 개지 않은 상태로 먼저 읽죠.",
  judgement:
    "심판은 메이저 아르카나 20번 카드로, 정방향에서는 지난 일을 돌아보고 정리한 뒤 새 부름에 응답해 다시 일어서는 쪽으로 읽어요. 역방향이면 해야 한다는 건 알면서도 그 부름에 응답하기를 미루는 막힘으로 먼저 읽죠.",
  "the-world":
    "세계는 메이저 아르카나의 마지막 21번 카드로, 정방향에서는 한 주기를 온전히 마치고 다음 문 앞에 서는 완성으로 읽어요. 역방향이면 거의 다 왔는데 마지막 한 단계가 남아 끝맺음이 미뤄지는 막힘으로 먼저 읽죠. 0번 바보와 짝을 지어 한 바퀴의 끝과 다음 출발로 읽기도 해요.",

  "heavenly-stems":
    "천간은 사주 네 기둥의 위쪽 글자로, 갑(甲)·을(乙)·병(丙)·정(丁)·무(戊)·기(己)·경(庚)·신(辛)·임(壬)·계(癸) 열 글자예요. 두 글자씩 목·화·토·금·수 다섯 오행에 속하고, 짝마다 앞 글자가 양, 뒤 글자가 음이죠. 태어난 해의 천간은 연도 끝자리로 찾을 수 있지만, 사주에서 해가 바뀌는 날은 입춘이라는 점을 함께 봐야 해요.",
  "earthly-branches":
    "지지는 네 기둥의 아래쪽에 놓이는 자·축·인·묘·진·사·오·미·신·유·술·해 열두 글자이고, 글자마다 쥐부터 돼지까지 띠 동물이 하나씩 붙어 있어요. 사주에서 띠는 1월 1일이나 설날이 아니라 입춘(양력 2월 4일 무렵)에 바뀌어요. 그래서 1월이나 2월 초에 태어났다면 앞 해의 띠로 보죠.",
  "day-master":
    "일간은 태어난 날의 기둥인 일주의 위쪽 글자로, 명리에서는 이 한 글자를 나 자신으로 놓고 다른 글자와의 관계를 읽어요. 일간은 열 천간 가운데 하나라서 갑목은 큰 나무, 병화는 하늘의 해, 계수는 이슬과 빗물처럼 자연의 모습을 겹쳐 봐요. 같은 일간이라도 태어난 계절과 주변 글자에 따라 풀이의 결이 달라지죠.",
  "ten-gods":
    "십신(십성)은 일간을 기준으로 명식의 다른 글자가 나와 어떤 관계인지 붙인 열 가지 이름이에요. 같은 오행은 비견·겁재, 내가 살리는 오행은 식신·상관, 내가 누르는 오행은 편재·정재, 나를 누르는 오행은 편관·정관, 나를 살리는 오행은 편인·정인이죠. 십신에는 좋은 이름과 나쁜 이름이 따로 있지 않아요.",
  daewoon:
    "대운은 사주에서 10년 단위로 바뀌는 흐름으로, 태어난 달의 기둥인 월주에서 출발해 한 칸씩 앞으로 가거나 거꾸로 이어져요. 방향은 태어난 해의 천간과 성별로 정하고, 첫 대운이 시작되는 나이는 태어난 날과 절기 사이의 날수를 3으로 나눠 구해요. 스타로그는 대운에 좋고 나쁨의 등급을 매기지 않고, 어떤 성격의 기운이 실리는 10년인지를 읽죠.",
  "saju-vs-astrology":
    "사주는 태어난 해·달·날·시를 간지 여덟 글자로 바꿔 오행과 관계를 읽고, 서양 점성술은 태어난 순간 해와 달, 행성이 황도 열두 별자리의 어디에 있었는지를 차트로 그려 각도를 읽어요. 둘 다 해의 움직임을 기준으로 하지만 사주의 달은 입춘·경칩 같은 절기에서, 별자리는 춘분 같은 다른 절기 무렵에 바뀌어서 경계가 보름 남짓 어긋나죠. 어느 쪽이 더 맞는지보다 무엇을 알고 싶은지에 따라 골라 보면 좋아요.",
  manseryeok:
    "만세력은 날짜마다 양력과 음력, 그날의 간지, 절기가 들어오는 시각을 적은 달력이고, 사주 여덟 글자는 모두 여기서 찾아요. 연주는 입춘, 월주는 절기를 기준으로 정하고, 일주는 그날의 일진을, 시주는 보정한 시각의 시진과 일간으로 정하죠. 같은 생일이 앱마다 다르게 나온다면 대부분 시각을 보정하는 기준이 달라서예요.",
  "saju-compatibility":
    "궁합은 두 사람의 명식을 나란히 놓고, 일간끼리의 오행 관계와 지지의 합·충, 오행을 서로 채워 주는지를 보는 일이에요. 실제로는 서로 채워 주는 부분과 부딪히는 부분이 섞여 나오는 경우가 대부분이죠. 궁합이 좋다고 관계가 저절로 잘되지는 않고, 나쁘다고 헤어져야 하는 것도 아니에요.",
  "new-year-fortune":
    "사주로 보는 신년운세는 그해의 간지인 세운을 내 명식에 겹쳐, 그 두 글자가 내 일간에게 어떤 십신이 되고 명식의 글자와 어떤 관계를 맺는지 읽는 일이에요. 사주에서 새해는 1월 1일이나 설날이 아니라 입춘부터라서, 2027년 정미년의 흐름도 2027년 2월 4일 입춘부터로 봐요. 스타로그는 해마다 좋은 해, 나쁜 해 같은 등급을 매기지 않죠.",

  "major-and-minor-arcana":
    "타로 78장은 0번 바보부터 21번 세계까지 번호와 이름이 있는 메이저 아르카나 22장과, 완드·컵·검·펜타클 네 벌의 숫자 카드와 인물 카드로 이뤄진 마이너 아르카나 56장으로 나뉘어요. 메이저는 삶의 큰 주제와 전환점을, 마이너는 하루하루의 일과 감정, 생각과 생활을 다루죠. 한 스프레드에 메이저가 많으면 큰 흐름이 걸린 질문으로 읽어요.",
  "wands-suit":
    "완드는 잎이 돋은 나무 지팡이로 그리는 벌이라 하고 싶은 마음과 시작하는 힘, 밀고 나가는 기세를 다뤄요. 에이스의 새 불씨가 축하와 경쟁, 인정을 지나 10에서는 혼자 짊어진 짐이 되는 흐름이라 높은 숫자일수록 책임의 무게도 함께 읽죠. 시종·기사·여왕·왕은 같은 불을 서로 다르게 다루는 네 사람이에요.",
  "cups-suit":
    "컵에는 금빛 잔이 그려져 있어서 마음에 무엇이 담겼고 얼마나 차 있는지를 보는 벌로 읽어요. 물에 이어 보며 감정과 관계, 위로와 상상을 다루고, 숫자는 마음이 넘쳤다가 비워지고 다시 채워지는 흐름이죠. 상대의 속마음을 단정하기보다 내 마음이 어떤지를 먼저 보는 데 쓰면 좋아요.",
  "swords-suit":
    "검은 양날 칼로 그리는 벌이라 공기에 이어 보고, 생각과 판단, 말과 결정, 갈등을 다뤄요. 상처를 그린 그림이 많아 무섭게 보이지만 대부분 머릿속에서 커진 생각과 오가는 말을 비추는 카드라서, 스타로그는 검 카드로 실제 사고나 병을 점치지 않아요. 걱정이 커질 때는 사실과 상상을 나눠 적는 데 쓰기 좋아요.",
  "pentacles-suit":
    "펜타클은 별 모양이 새겨진 금빛 원반을 그린 벌이고, 흙처럼 시간을 들여 키우는 돈과 일의 결과, 생활과 기술을 다뤄요. 기회를 받아 기술을 쌓고, 가진 것을 지키거나 나누며, 결실을 누리는 순서로 읽으면 열네 장이 한 줄로 이어지죠. 펜타클이 많다고 돈이 들어온다는 뜻은 아니에요.",
  "major-arcana-overview":
    "메이저 아르카나는 0번 바보부터 21번 세계까지 번호가 붙은 스물두 장으로, 라이더-웨이트-스미스 덱에서는 11번이 정의이고 8번이 힘이에요. 바보는 가벼운 첫걸음, 죽음은 한 국면을 닫는 정리, 별은 조용한 회복, 세계는 한 주기의 완성처럼 카드마다 흔히 읽는 뜻이 있죠. 0번 바보가 21번 세계까지 장면을 차례로 지나는 바보의 여정으로 읽으면 순서를 기억하기 쉬워요.",

  "four-pillars":
    "사주는 태어난 해·달·날·시를 연주·월주·일주·시주 네 기둥으로 세우고, 기둥마다 천간과 지지 두 글자를 놓아 여덟 글자로 읽어요. 명리에서는 연주를 뿌리와 어린 시절, 월주를 부모와 사회, 일주를 나와 가까운 사람, 시주를 자녀와 결실의 자리로 보죠. 명식을 펼치면 일간과 태어난 계절인 월지부터 보는 게 좋아요.",
  "ipchun-jeolgi":
    "사주는 해의 움직임을 스물넷으로 나눈 절기를 따라서, 한 해는 봄이 시작되는 입춘에, 달은 입춘·경칩 같은 절이 들어오는 순간에 바뀌어요. 입춘은 보통 2월 4일 무렵이지만 절입 시각이 해마다 달라 같은 날 태어나도 시각에 따라 연주가 갈리죠. 스타로그는 절입 시각을 분 단위로 계산하고, 그 앞뒤 2분 안에 태어났다면 명식 화면에 따로 알려 드려요.",
  "jasi-birth":
    "자시는 밤 11시부터 새벽 1시까지라 자정을 사이에 두고 이틀에 걸쳐 있어서, 일주와 시주를 정하는 방식이 관법마다 갈려요. 스타로그는 보정한 시각으로 밤 11시부터 자정 사이에 태어났다면 일주는 그날로 두고 시주만 다음 날의 자시로 봐요. 서울은 시계 시각에서 약 32분을 빼서 보니, 시계로 자정을 조금 넘겨 태어났어도 일주가 전날일 수 있죠.",
  "saju-birth-info":
    "사주 계산에는 생년월일과 양력·음력, 음력이면 윤달 여부, 태어난 시각과 곳, 성별이 쓰여요. 시각은 시주와 자정 무렵의 일주를, 태어난 곳은 시각 보정을 정하고, 성별은 대운이 앞으로 갈지 거꾸로 갈지를 정하는 데만 쓰이죠. 시각을 모르면 시주를 비운 채 세 기둥 여섯 글자로 읽어요.",
  "branch-relations":
    "지지 열두 글자 사이에는 짝을 이루는 육합, 세 글자가 모이는 삼합, 정반대에 놓인 충, 그리고 형·파·해 같은 관계가 있어요. 명리에서는 합을 끌어당기는 관계로, 충을 움직임과 긴장이 생기는 관계로 읽죠. 스타로그는 관계가 있다는 사실만 짚고 그 세기나 사건을 판정하지 않아요.",
  "twelve-stages":
    "12운성은 일간의 기운이 열두 지지에서 어느 단계에 있는지를 장생·목욕·관대·건록·제왕·쇠·병·사·묘·절·태·양의 한살이에 빗대 나눈 이름이에요. 병·사·묘·절은 불운이 아니라 기운의 세기와 방향을 나타내는 비유로 읽죠. 스타로그는 양의 천간은 순행, 음의 천간은 역행하는 방식으로 12운성을 계산해요.",
  yongsin:
    "명리에서 오행의 균형은 다섯 기운을 똑같이 맞추는 일이 아니라, 일간을 중심으로 어떤 기운이 넘치고 아쉬운지를 계절과 함께 보는 일이에요. 용신은 그 균형을 잡는 데 가장 쓸모 있는 오행으로, 억부·조후·통관 같은 여러 방법이 있고 유파마다 결과가 갈리죠. 스타로그는 용신이나 신강·신약 라벨 대신 오행 개수와 계절처럼 명식에서 바로 확인할 수 있는 사실을 보여 드려요.",
  "wolun-iljin":
    "사주에서 운은 10년의 대운, 1년의 세운, 한 달의 월운, 하루의 일진으로 층을 이루고, 층이 작을수록 큰 흐름 위에 가볍게 얹어 읽어요. 월운은 절기마다 바뀌는 그달의 간지, 일진은 60일마다 돌아오는 그날의 간지라 둘 다 내 일간에게 어떤 십신인지와 명식 글자와의 관계로 읽죠. 스타로그는 좋은 날이나 조심할 달 같은 등급을 매기지 않아요.",
  "bond-score":
    "별자리 인연의 인연 점수는 두 사람의 생년월일로 세운 세 기둥 명식을 견줘, 일간끼리의 합과 상생, 띠와 일지의 합·충, 서로 부족한 오행을 채워 주는지를 보고 55점에서 99점 사이로 매겨요. 태어난 시간과 친구가 고른 카드는 점수에 쓰지 않아서 같은 두 사람은 언제나 같은 점수가 나오죠. 점수는 재미와 나눔을 위한 숫자라 관계의 좋고 나쁨을 판정하지 않아요.",
  "saju-glossary":
    "사주 풀이에 자주 나오는 말은 명식을 이루는 말, 오행과 음양, 십신, 글자끼리의 관계, 운의 흐름, 달력과 시각, 유파마다 갈리는 라벨로 묶어 보면 쉽게 정리돼요. 일간은 태어난 날 기둥의 천간으로 명리에서 나 자신으로 놓는 글자이고, 대운은 10년마다 바뀌는 흐름이죠. 스타로그는 신강·신약이나 용신처럼 유파마다 갈리는 라벨은 풀이에 붙이지 않아요.",

  "day-master-gapmok":
    "갑목은 천간 맨 앞의 양의 나무예요. 명리에서는 곧게 선 큰 나무처럼 처음 길을 내고 방향을 지키는 힘, 사람을 모으는 그늘로 보고, 혼자 다 짊어지다 꺾이기 쉬운 점을 함께 짚죠. 실제 모습은 태어난 계절과 곁의 글자에 따라 크게 달라져요.",
  "day-master-eulmok":
    "풀과 덩굴에 빗대는 을목은 음의 나무로, 주변에 기대고 휘감기며 길을 찾는 유연함과 끈질긴 생명력으로 풀어요. 휘어도 다시 일어서지만, 맞추다 보면 내 뜻을 말할 기회를 놓치기도 하죠. 곁에 갑목이 있으면 덩굴이 큰 나무를 타고 오르는 등라계갑으로 반기기도 해요.",
  "day-master-byeonghwa":
    "하늘의 해에 빗대는 병화는 숨김없이 드러내고 주변을 데우는 양의 불이에요. 분위기를 단번에 바꾸는 활기만큼 빨리 식는 흐름도 함께 따라오죠. 적천수는 병화가 신금을 만나면 오히려 움츠러든다고 봐서, 신금과의 합도 한쪽으로만 읽지 않아요.",
  "day-master-jeonghwa":
    "정화는 촛불과 등불처럼 가까운 곳을 오래 밝히는 음의 불이에요. 한 사람, 한 가지 일에 마음을 오래 쏟는 대신 서운함도 속으로 오래 태우기 쉽죠. 적천수는 장작이 되는 갑목이 곁에 있으면 정화가 가을과 겨울도 견딘다고 봤어요.",
  "day-master-muto":
    "무토는 산과 너른 땅처럼 듬직하고 쉽게 흔들리지 않는 양의 흙이에요. 어수선할 때 자리를 지키는 힘은 움직여야 할 때 오래 머뭇거리는 모습과 한 몸이죠. 천간충의 짝이 없는 일간이며 빗물인 계수와 천간합을 이뤄요.",
  "day-master-gito":
    "논밭의 흙인 기토는 씨앗을 받아 키워 내듯 사람과 일을 길러 내는 음의 흙이에요. 꼼꼼하게 챙기는 만큼 생각이 길어져 결정이 늦어지기도 해요. 밭에 볕과 비가 필요하듯 곁의 병화와 계수를 함께 보며 풀죠.",
  "day-master-gyeonggeum":
    "경금은 다듬기 전의 바위와 무쇠를 닮은 양의 쇠예요. 모두가 머뭇거릴 때 먼저 정리하는 결단 때문에, 바른말이 차갑게 들린다는 오해도 따라오죠. 적천수가 불을 얻으면 날카로워진다고 했듯 곁의 불을 단련으로 풀곤 해요.",
  "day-master-singeum":
    "다듬은 보석을 닮은 신금은 음의 쇠로, 작은 차이를 알아보는 정교함과 뚜렷한 자기 기준으로 풀어요. 그 기준을 스스로에게도 들이대다 쉽게 지칠 수 있어요. 흙이 겹치는 걸 꺼리고 물이 넉넉한 걸 즐긴다는 적천수의 비유가 신금을 읽는 단서가 되죠.",
  "day-master-imsu":
    "임수는 큰 강과 바다처럼 멀리 흐르는 양의 물이에요. 판을 넓게 보는 시야 덕에 관심이 이곳저곳으로 옮겨 다니기도 하죠. 물길을 잡아 주는 흙이 곁에 있는지에 따라 같은 임수도 다르게 풀려요.",
  "day-master-gyesu":
    "이슬과 빗물을 닮은 계수는 천간의 마지막 글자이자 음의 물이에요. 말하지 않은 마음을 먼저 알아채지만 걱정은 혼자 삭이기 쉽죠. 적천수는 계수를 가장 약한 물이면서 하늘까지 닿는 물로 봤어요.",
};

/** Step-by-step articles. Each step's text is a sentence (or run of sentences) from the article body. */
export const GUIDE_HOWTO: Readonly<Record<string, GuideHowTo>> = {
  "how-to-read-tarot": {
    name: "타로 카드 읽는 순서",
    steps: [
      { name: "질문을 열어 두기", text: "질문은 '될까, 안 될까'보다 '어떻게 하면 좋을까'처럼 열어 두면 읽을 거리가 많아져요." },
      { name: "자리 확인하기", text: "먼저 카드가 놓인 자리를 확인해요." },
      { name: "그림 살피기", text: "그다음 그림 속 인물이 무엇을 들고 어디를 보는지, 어떤 풍경에 서 있는지 살펴요." },
      { name: "내 상황에 대 보기", text: "마지막으로 그 장면을 내 상황에 대 보고, 맞물리는 부분과 덜 맞는 부분을 나눠 보세요." },
    ],
  },
  "three-card-spread": {
    name: "타로 3장 스프레드 읽는 순서",
    steps: [
      { name: "자리 먼저 정하기", text: "세 장 스프레드에서 가장 중요한 건 카드를 뽑기 전에 자리를 먼저 정해 두는 거예요." },
      { name: "벌 세어 보기", text: "먼저 벌을 세어 보세요." },
      { name: "인물이 보는 방향 살피기", text: "그림 속 인물이 바라보는 방향도 단서가 돼요." },
      { name: "한 문장으로 묶기", text: "마지막으로 세 장을 한 문장으로 묶어 보세요." },
    ],
  },
  "one-card-yes-no": {
    name: "원카드로 예·아니오 묻는 순서",
    steps: [
      { name: "질문 정하기", text: "원카드에는 내가 직접 움직일 수 있는 질문이 잘 맞아요." },
      { name: "읽는 방식 정하기", text: "어떤 방식을 쓰든 뽑기 전에 정해 두는 게 핵심이에요." },
      { name: "그림부터 보기", text: "카드를 뒤집었다면 먼저 그림부터 봐요." },
      { name: "예·아니오·기다림 고르기", text: "그다음 정방향인지 역방향인지 확인하고 미리 정해 둔 방식대로 예, 아니오, 기다림 가운데 하나를 골라요." },
      { name: "오늘 할 일로 바꾸기", text: "마지막으로 그 답을 내 상황에 대 보며 오늘 할 수 있는 일 하나로 바꿔 보세요." },
    ],
  },
  "now-card-how-to": {
    name: "지금의 한 장 사용법",
    steps: [
      { name: "고민 떠올리기", text: "먼저 고민을 한 줄로 떠올려요. 화면의 칸에 40자까지 적어 둘 수 있고 적지 않고 마음속으로만 떠올려도 괜찮아요." },
      { name: "카드 한 장 고르기", text: "다음으로 부채처럼 펼쳐진 카드 가운데 마음이 가는 한 장을 골라요." },
      { name: "답 읽기", text: "고민에 건네는 한 문장이 가장 먼저 크게 보이고 그 아래에 카드 이름과 그렇게 읽은 이유가 차례로 나와요." },
    ],
  },
  manseryeok: {
    name: "만세력으로 사주 여덟 글자 찾는 순서",
    steps: [
      { name: "연주 찾기", text: "연주는 태어난 해의 간지예요. 여기서 해는 1월 1일이나 설날보다 입춘을 기준으로 바뀌어요." },
      { name: "월주 찾기", text: "월주도 같은 원리로 음력 1일 대신 절기가 들어오는 순간에 바뀌어요." },
      { name: "일주 찾기", text: "일주는 만세력에 적힌 그날의 간지, 곧 일진을 그대로 써요." },
      { name: "시주 찾기", text: "시주의 지지는 보정한 시각이 두 시간짜리 시진 가운데 어디에 드는지로 정해요." },
    ],
  },
};

/**
 * First published and last content change (YYYY-MM-DD), for Article dates, the page's 업데이트 line
 * and the sitemap's lastmod. Bump `updated` whenever an article's text changes.
 */
export const GUIDE_DATES: Readonly<Record<string, { published: string; updated: string }>> = Object.fromEntries(
  [
    // 2026-10-08: the six first-wave articles rewritten at the length of the later ones, with question
    // headings; 은둔자 and 별 follow the card template (KB keyword table, 연애·일·돈, 비슷한 카드) and are
    // titled "타로 … 카드 뜻" like the other twenty cards.
    ...["how-to-read-tarot", "upright-and-reversed", "saju-without-birth-time"].map(
      (slug) => [slug, { published: "2026-09-30", updated: "2026-10-08" }] as const,
    ),
    // 2026-10-07: the same words restructured into tables, diagrams, steps, callouts and card rows, with
    // 한눈에 보기 added (death had changed on 10-06: "unrelated to real death" became "an ending, but not
    // read only negatively").
    ...[
      "celtic-cross-spread", "three-card-spread", "one-card-yes-no", "now-card-how-to", "redrawing-same-question", "minor-arcana-suits", "court-cards",
      "earthly-branches", "day-master", "ten-gods", "manseryeok", "saju-compatibility",
    ].map((slug) => [slug, { published: "2026-10-01", updated: "2026-10-07" }] as const),
    ...[
      "wands-suit", "cups-suit", "swords-suit", "pentacles-suit",
      "four-pillars", "ipchun-jeolgi", "jasi-birth", "saju-birth-info", "branch-relations", "yongsin", "wolun-iljin", "bond-score", "saju-glossary",
      "day-master-gapmok", "day-master-eulmok", "day-master-byeonghwa", "day-master-jeonghwa", "day-master-muto",
      "day-master-gito", "day-master-gyeonggeum", "day-master-singeum", "day-master-imsu", "day-master-gyesu",
    ].map((slug) => [slug, { published: "2026-10-06", updated: "2026-10-07" }] as const),
    // 2026-10-14 (AdSense review ADS-04, SEO-05): every card article names its card in all five headings; the
    // picture, 연애·일·돈 and look-alike headings say what that card shows instead of one shared wording.
    // The six shortest saju articles (ADS-03) gain a worked example on one chart (1995-08-20 12:00 Seoul, computeChart),
    // step-by-step reading and common misreadings.
    ...["the-hermit", "the-star", "five-elements"].map((slug) => [slug, { published: "2026-09-30", updated: "2026-10-14" }] as const),
    ...["heavenly-stems", "daewoon", "saju-vs-astrology", "new-year-fortune"].map((slug) => [slug, { published: "2026-10-01", updated: "2026-10-14" }] as const),
    ...["twelve-stages"].map((slug) => [slug, { published: "2026-10-06", updated: "2026-10-14" }] as const),
    ...[
      "the-fool", "the-magician", "the-high-priestess", "the-empress", "the-emperor", "the-hierophant", "the-lovers", "the-chariot", "strength",
      "wheel-of-fortune", "justice", "the-hanged-man", "death", "temperance", "the-devil", "the-tower", "the-moon", "the-sun", "judgement", "the-world",
    ].map((slug) => [slug, { published: "2026-10-01", updated: "2026-10-23" }] as const),
    // 2026-10-22 (AdSense "가치가 별로 없는 콘텐츠"): all 22 card articles gain the Starlog deck's own scene, three worked
    // examples, their own 자주 묻는 질문 and links on; the frames two cards shared once their names were taken out are rewritten.
    // 2026-10-23: every section opens in the card's own words and 연애·일·돈 starts from the card's own situation.
    ...["the-hermit", "the-star"].map((slug) => [slug, { published: "2026-09-30", updated: "2026-10-23" }] as const),
    // 2026-10-23: the four suit articles read their suit from angles of their own, with worked examples; the minor arcana
    // overview compares the four and links on instead of retelling them.
    ...["wands-suit", "cups-suit", "swords-suit", "pentacles-suit"].map((slug) => [slug, { published: "2026-10-06", updated: "2026-10-23" }] as const),
    ...["minor-arcana-suits"].map((slug) => [slug, { published: "2026-10-01", updated: "2026-10-23" }] as const),
    // 2026-10-23: the 22-card overview reads the cards as the 바보의 여정 (0 the traveller, three rows of seven) instead of
    // repeating each card's 한눈에 보기; the two arcana article points to the suit hub instead of listing the four suits.
    ...["major-and-minor-arcana", "major-arcana-overview"].map((slug) => [slug, { published: "2026-10-06", updated: "2026-10-23" }] as const),
    // 2026-10-23 (AdSense "가치가 별로 없는 콘텐츠"): the 29 saju articles rewritten with their own worked examples, the date
    // each entry carries itself (GuideDates.test.tsx keeps the two the same).
    ...["heavenly-stems", "earthly-branches", "day-master", "ten-gods", "daewoon", "saju-vs-astrology", "manseryeok", "saju-compatibility", "new-year-fortune"].map(
      (slug) => [slug, { published: "2026-10-01", updated: "2026-10-23" }] as const,
    ),
    ...[
      "four-pillars", "ipchun-jeolgi", "jasi-birth", "saju-birth-info", "branch-relations", "twelve-stages", "yongsin", "wolun-iljin", "bond-score", "saju-glossary",
      "day-master-gapmok", "day-master-eulmok", "day-master-byeonghwa", "day-master-jeonghwa", "day-master-muto",
      "day-master-gito", "day-master-gyeonggeum", "day-master-singeum", "day-master-imsu", "day-master-gyesu",
    ].map((slug) => [slug, { published: "2026-10-06", updated: "2026-10-23" }] as const),
    // 2026-10-23: 오행이 뭐예요? keeps its facts with varied sentence endings (10 of 61 ended in 않아요), and links 십신 and 용신.
    ...["five-elements"].map((slug) => [slug, { published: "2026-09-30", updated: "2026-10-23" }] as const),
  ],
);
