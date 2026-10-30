/**
 * Answer-first fields for every guide article (search snippets, AI answers): a 2-3 sentence 요약
 * that answers the title's question before the sections. Summaries restate the article body and add
 * nothing it does not say (library.test.ts checks them, and the banned words). No HowTo steps since
 * Google retired that rich result (SEO audit 2026-10-27).
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
    "은둔자 카드의 뜻은 고립보다, 지금 선 자리를 등불로 비추며 혼자 마음을 고르는 시간에 있어요. 웨이트는 그를 진리를 찾아 헤매는 현자가 아니라 이미 도달해 뒤따라올 이에게 빛을 비추는 사람으로 봤어요.",
  "the-star":
    "탑 다음 번호인 별 카드는 요란하지 않게 조금씩 다시 채워지는 회복을 뜻해요. 두 항아리의 물을 연못과 땅에 나눠 붓는 그림처럼, 마음과 일상을 함께 채우는 느린 회복이에요.",

  "celtic-cross-spread":
    "켈틱 크로스는 카드 열 장을 왼쪽 십자 여섯 자리와 오른쪽 기둥 네 자리로 놓고 한 질문을 여러 방향에서 읽는 스프레드예요. 1번 지금의 분위기와 2번 걸림돌을 한 쌍으로 먼저 읽고, 3·4번의 목표와 바탕, 5·1·6번의 시간 흐름, 7·8번의 나와 주변을 차례로 견줘요. 9번 바람과 두려움을 본 뒤 10번 결말을 읽되, 정해진 결과보다 지금 흐름이 이어질 때의 모습으로 받아들이죠.",
  "three-card-spread":
    "타로 3장 스프레드는 카드를 뽑기 전에 세 자리를 먼저 정하고, 한 장씩 읽은 뒤 세 장을 한 문장으로 이어 읽는 방법이에요. 가장 익숙한 짜임은 과거·현재·미래이고, 막힌 일에는 상황·걸림돌·조언처럼 질문에 맞춰 자리 이름을 바꿔도 좋아요. 마지막 자리만 보고 결론을 내리면 무엇을 바꾸면 되는지를 놓치기 쉽죠.",
  "one-card-yes-no":
    "원카드로 예·아니오를 물을 때는 정방향은 예, 역방향은 아니오로 보거나 카드 성격에 따라 예·기다림·다시 생각하기로 나누는 방식 가운데 하나를 뽑기 전에 정해 둬요. 질문은 '오늘 먼저 연락해 보면 어떤 흐름일까?'처럼 내가 움직일 수 있는 일 하나로, 기간을 정해서 만들면 읽기 쉽죠. 건강, 법, 큰돈이 걸린 결정은 예·아니오로 정하지 말고 전문가와 상의해 주세요.",
  "redrawing-same-question":
    "원하는 답이 나올 때까지 곧바로 다시 뽑으면 카드를 읽기보다 이미 정해 둔 답을 확인하게 되기 쉬워서 권하지 않아요. 상황이 바뀌었을 때, 정해 둔 기간이 지났을 때, 질문 자체가 달라졌을 때는 다시 봐도 괜찮죠. 마음에 들지 않는 카드가 나왔다면 다시 뽑기 전에 왜 마음에 들지 않는지 적어 보고 그림을 한 번 더 살펴보세요.",
  "reunion-tarot":
    "재회 타로는 그 사람이 돌아올지 맞히기보다 내 마음이 머문 자리와 다시 이어진다면 되풀이되기 쉬운 모습을 살피는 데 알맞아요. 질문은 '그 사람이 돌아올까?' 대신 '다시 만난다면 무엇을 먼저 정해 둘까?'처럼 내가 움직일 수 있는 쪽으로 바꿔 물어요. 상대가 연락을 끊었다면 그 뜻을 먼저 존중해요.",
  "minor-arcana-suits":
    "마이너 아르카나는 메이저 아르카나 22장을 뺀 56장으로, 완드·컵·검·펜타클 네 벌에 숫자 카드 열 장과 인물 카드 네 장씩이 있어요. 완드는 불과 의욕, 컵은 물과 감정·관계, 검은 공기와 생각·말, 펜타클은 흙과 돈·생활을 맡아요. 같은 벌 안에서는 에이스가 시작, 10이 한 주기의 끝인 것처럼 숫자가 이야기의 단계를 나타내죠.",
  "court-cards":
    "타로 인물 카드는 네 벌마다 시종·기사·여왕·왕이 한 장씩, 모두 열여섯 장이에요. 스타로그는 인물 카드를 특정한 사람보다 태도로 먼저 읽고, 벌의 영역과 계급의 단계를 겹쳐서 봐요. 시종은 배우는 자리, 기사는 밀고 나가는 자리, 여왕은 안에서 다스리는 자리, 왕은 밖으로 책임지는 자리죠.",

  "the-fool":
    "절벽 끝에서 하늘을 보는 젊은이, 바보 카드의 뜻은 어리석음보다 경험이 적어 가벼운 첫걸음에 가까워요. 웨이트도 그를 경험을 찾아 나선 영혼이라 불렀으니, 이름만 보고 나쁜 선택으로 받아들일 필요는 없어요.",
  "the-magician":
    "가진 것으로 지금 시작해 보라는 게 마법사 카드의 뜻이에요. 옛 장터 재주꾼의 탁자가 네 벌의 도구로 바뀐 그림이라, 새로 갖출 것보다 이미 손에 쥔 것을 세어 보게 하죠.",
  "the-high-priestess":
    "말하기 전에 조용히 보고 느낀 것을 믿으라는 뜻에서, 여사제는 기다림과 직감의 카드예요. 두루마리 일부가 옷자락에 가려 있어서, 감춘 쪽은 상대가 아니라 그림 속 인물 자신이라는 점이 핵심이죠.",
  "the-empress":
    "밀밭이 천천히 익듯 돌보고 가꾼 것이 무르익는 풍요, 그게 여황제 카드의 정방향 뜻이에요. 웨이트가 수많은 이의 열매 맺는 어머니라 부른 만큼, 감각과 편안함 속에서 자라는 관계도 이 카드의 몫이에요.",
  "the-emperor":
    "황제 카드의 뜻은 성별이나 나이보다 기준을 세우고 책임질 범위를 정하는 역할에 있어요. 거꾸로 나오면 규칙이 지나쳐 숨이 막히는지, 세운 틀이 힘을 잃었는지를 먼저 가려 보죠.",
  "the-hierophant":
    "검증된 방법과 믿을 만한 스승에게서 배우는 길, 교황 카드는 그런 공식적인 틀을 뜻해요. 웨이트의 옛 점술 목록이 결혼과 동맹을 맨 앞에 둔 까닭에 결혼 카드로도 불리지만, 날짜를 정해 주는 카드는 아니죠.",
  "the-lovers":
    "연애 카드로 알려졌지만 연인 카드의 중심 뜻은 끌림 앞에서 내가 무엇을 소중히 여기는지 정하는 선택이에요. 옛 마르세유 그림에서는 여인 둘 사이에 선 젊은이였고, 웨이트 덱에서 아담과 이브를 닮은 두 사람으로 바뀌었어요.",
  "the-chariot":
    "전차 카드는 서로 다른 두 힘을 의지로 한 방향에 모으는 뜻을 담고 있어요. 고삐도 매인 끈도 없이 지팡이 하나로 선 모습이라 끄는 힘보다 방향을 잡는 힘에 가깝죠.",
  strength:
    "센 감정을 억지로 누르지 않고 다정하게 다루는 손, 힘 카드의 정방향은 그 장면이에요. 라이더-웨이트-스미스 덱에서는 8번이고, 꾹 참기만 하는 모습은 오히려 거꾸로 선 쪽에 가까워요.",
  "wheel-of-fortune":
    "날짜를 짚기보다 상황이 한 바퀴 돌아 흐름이 바뀌는 지점에 왔다는 것, 그게 운명의 수레바퀴 카드의 뜻이에요. 카드 번호를 날짜로 바꾸지 않고, 바뀌는 흐름이 왔을 때 무엇을 준비할지에 초점을 둬요.",
  justice:
    "정의 카드는 누가 이길지가 아니라, 감정보다 사실을 같은 무게로 달아 보라는 뜻이에요. 칼은 분명하게 가르는 판단을, 저울은 공정함을 맡고, 법이 걸린 일은 전문가와 상의하는 게 먼저죠.",
  "the-hanged-man":
    "잠시 멈춰 거꾸로 보면 달리 보이는 것이 있다는 뜻에서, 매달린 사람 카드는 벌이 아니라 스스로 고른 멈춤이에요. 거꾸로라면 기다림과 희생이 지나쳐 나를 소모하는 상태를 먼저 살펴요.",
  death:
    "끝을 뜻하는 죽음 카드지만, 한 국면을 닫고 다음으로 넘어가기 위한 정리 쪽으로 받아들여요. 무기 없이 흰 장미 깃발을 든 기사처럼, 그 끝은 공격이 아니라 지나감으로 오는 장면이에요.",
  temperance:
    "참는 카드가 아니라 섞는 카드, 절제 카드의 뜻은 두 가지를 알맞은 비율로 천천히 맞춰 가는 데 있어요. 웨이트도 이 이름이 정신과 물질의 성질을 누그러뜨려 섞는 원리에서 왔다고 설명했어요.",
  "the-devil":
    "알면서도 끊기 어려운 습관이나 관계에 묶인 상태가 악마 카드의 정방향 뜻이에요. 두 사람 목의 사슬이 헐겁게 걸려 있어 스스로 풀 여지가 있다는 점이 핵심이죠.",
  "the-tower":
    "버티던 구조나 착각이 번개처럼 한순간에 드러나는 장면, 탑 카드의 뜻은 거기에 있어요. 무너지는 건 대개 건물보다 덮어 두었던 생각이고, 거꾸로라면 겉은 멀쩡한데 속에서 먼저 무너지는 상태를 봐요.",
  "the-moon":
    "달 카드의 뜻은 누군가 나를 속인다는 경고보다, 빌려 온 빛 아래서 짐작이 커지는 상태에 가까워요. 그래서 상대의 속마음을 판정하기보다 확인할 수 있는 것부터 보게 하는 카드로 써요.",
  "the-sun":
    "숨길 것 없이 밝게 기쁨을 드러내도 좋은 흐름이 태양 카드의 정방향 뜻이에요. 그래도 모든 일이 저절로 풀린다는 확정은 아니고, 웨이트도 역방향을 '같은 것이 조금 덜한 정도'로만 적었어요.",
  judgement:
    "심판 카드는 벌보다 부름에 가까운 뜻을 담고 있어요. 지난 일을 돌아보고 정리한 뒤 다시 일어서는 장면이라, 거꾸로 나오면 들리는 부름에 응답하기를 미루는 상태부터 보죠.",
  "the-world":
    "세계 카드의 뜻은 모든 게 끝난다는 게 아니라, 한 주기를 온전히 마치고 다음 문 앞에 선다는 데 있어요. 세계 다음에 다시 0번 바보가 오는 순서처럼, 이 마침은 다음 출발과 맞닿아 있어요.",

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
  "reunion-saju":
    "사주에는 재회운이라는 글자가 따로 없어서, 가까운 관계를 맡는 일지와 인성·식상, 일지가 맺는 합·충을 보고 대운과 세운을 겹쳐 읽어요. 내 명식만으로는 상대의 마음이나 다시 만나게 될지를 알 수 없어요. 합과 충은 사건이 아니라 관계를 대하는 마음이 움직이는 쪽으로 읽어요.",
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
  "saju-glossary":
    "사주 풀이에 자주 나오는 말은 명식을 이루는 말, 오행과 음양, 십신, 글자끼리의 관계, 운의 흐름, 달력과 시각, 유파마다 갈리는 라벨로 묶어 보면 쉽게 정리돼요. 일간은 태어난 날 기둥의 천간으로 명리에서 나 자신으로 놓는 글자이고, 대운은 10년마다 바뀌는 흐름이죠. 스타로그는 신강·신약이나 용신처럼 유파마다 갈리는 라벨은 풀이에 붙이지 않아요.",

  "day-master-gapmok":
    "곧게 선 큰 나무에 빗대는 갑목은 처음 길을 내고 방향을 지키는 힘으로 읽혀요. 다만 적천수가 껍질을 벗으려면 불이 있어야 한다고 했듯, 쌓인 힘을 꺼낼 통로가 있는지와 태어난 계절에 따라 같은 갑목도 결이 크게 달라지죠.",
  "day-master-eulmok":
    "부드럽기는 해도 끝내 자리를 잡는 풀과 덩굴, 그게 을목이에요. 축·미 같은 단단한 흙에도 뿌리를 뻗고, 가을 쇠 사이에서는 곁의 불과 큰 나무인 갑목에 기대 버틴다고 봐요.",
  "day-master-byeonghwa":
    "병화는 겨울에 약할까요? 적천수는 병화를 서리와 눈을 업신여기는 불로 그렸고, 실제로는 계절과 곁의 불씨·땔감을 함께 봐요. 여름 병화에게 강물인 임수가 반가운 것도 같은 이치죠.",
  "day-master-jeonghwa":
    "촛불과 등불인 정화는 멀리보다 가까운 곳을 오래 비추는 쪽으로 읽어요. 큰 강인 임수를 만나도 꺼지기보다 천간합으로 묶이고, 갑목 같은 장작이 곁에 있으면 가을과 겨울도 견딘다고 봐요.",
  "day-master-muto":
    "산과 너른 땅의 일간 무토에게는 천간충의 짝이 없어요. 대신 빗물인 계수와 천간합을 이루고, 물이 적셔 주면 살고 불이 말리면 앓는다는 적천수의 기준으로 계절을 먼저 따지죠.",
  "day-master-gito":
    "씨앗을 받아 길러 내는 논밭의 흙이 기토예요. 나무가 무성해도 물이 날뛰어도 받아 내는 흙으로 보지만, 작물이 자라려면 볕이 되는 불과 함께 땅을 이룰 흙의 도움이 있어야 한다고 봐요.",
  "day-master-gyeonggeum":
    "아직 연장이 되지 않은 무쇠, 경금은 불을 만나 날이 서고 물을 만나 맑아진다고 읽어요. 촉촉한 흙은 쇠를 기르고 마른 흙은 쇠를 무르게 한다는 구절처럼, 곁의 흙이 어떤 흙인지도 함께 보죠.",
  "day-master-singeum":
    "다듬은 보석에 빗대는 신금은 흙이 겹치면 묻히고 물이 넉넉하면 빛난다고 봐요. 여름에는 촉촉한 흙을, 겨울에는 등불인 정화를 반긴다는 구절처럼 계절마다 반가운 글자가 달라지죠.",
  "day-master-imsu":
    "멀리 흐르는 큰 강, 임수는 태어난 계절에 따라 수위가 크게 달라지는 일간이에요. 물이 불어나는 겨울에는 둑이 되는 무토와 볕이 되는 병화를, 말라 가는 여름에는 수원이 되는 쇠를 먼저 찾아요.",
  "day-master-gyesu":
    "가장 약한 물이 하늘까지 닿는다, 적천수가 계수를 그린 말이에요. 이슬과 빗물처럼 드러나지 않게 스며드는 일간으로, 무토와는 천간합을, 정화와는 천간충을 이뤄요.",
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
      "celtic-cross-spread", "three-card-spread", "one-card-yes-no", "redrawing-same-question", "minor-arcana-suits", "court-cards",
      "earthly-branches", "day-master", "ten-gods", "manseryeok", "saju-compatibility",
    ].map((slug) => [slug, { published: "2026-10-01", updated: "2026-10-07" }] as const),
    ...[
      "wands-suit", "cups-suit", "swords-suit", "pentacles-suit",
      "four-pillars", "ipchun-jeolgi", "jasi-birth", "saju-birth-info", "branch-relations", "yongsin", "wolun-iljin", "saju-glossary",
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
    // overview compares the four and links on instead of retelling them, then (second review) tells where the suits came
    // from (the Italian and Spanish playing-card suits), reads one question through the four aces and adds the elemental
    // dignities.
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
      "four-pillars", "ipchun-jeolgi", "jasi-birth", "saju-birth-info", "branch-relations", "twelve-stages", "yongsin", "wolun-iljin", "saju-glossary",
      "day-master-gapmok", "day-master-eulmok", "day-master-byeonghwa", "day-master-jeonghwa", "day-master-muto",
      "day-master-gito", "day-master-gyeonggeum", "day-master-singeum", "day-master-imsu", "day-master-gyesu",
    ].map((slug) => [slug, { published: "2026-10-06", updated: "2026-10-23" }] as const),
    // 2026-10-23: 오행이 뭐예요? keeps its facts with varied sentence endings (10 of 61 ended in 않아요), and links 십신 and 용신.
    ...["five-elements"].map((slug) => [slug, { published: "2026-09-30", updated: "2026-10-23" }] as const),
    // 2026-10-27 (third review of 2026-10-23): the 22 card articles take their own length, shape, description, 한눈에 보기
    // and 요약; the ten thin tarot basics, spreads and how-tos grow past 2,500 characters on their own facts and link down
    // to the card (or saju) articles; the 22-card overview links the cards it names.
    ...[
      "the-fool", "the-magician", "the-high-priestess", "the-empress", "the-emperor", "the-hierophant", "the-lovers", "the-chariot", "strength",
      "wheel-of-fortune", "justice", "the-hanged-man", "death", "temperance", "the-devil", "the-tower", "the-moon", "the-sun", "judgement", "the-world",
      "celtic-cross-spread", "three-card-spread", "one-card-yes-no", "redrawing-same-question", "court-cards",
    ].map((slug) => [slug, { published: "2026-10-01", updated: "2026-10-27" }] as const),
    ...["the-hermit", "the-star", "how-to-read-tarot", "upright-and-reversed", "saju-without-birth-time"].map(
      (slug) => [slug, { published: "2026-09-30", updated: "2026-10-27" }] as const,
    ),
    ...["major-and-minor-arcana", "major-arcana-overview"].map((slug) => [slug, { published: "2026-10-06", updated: "2026-10-27" }] as const),
    // 2026-10-27 (saju third review of 2026-10-23): the 19 saju concept pages link on in their text and the nine thin ones
    // grow past 2,500 shown characters; the ten day masters (bodies reworked on 2026-10-23) get 요약 of their own. Each
    // entry carries the same date itself (saju.ts, saju-concepts.ts, day-masters.ts).
    ...["heavenly-stems", "earthly-branches", "day-master", "ten-gods", "daewoon", "saju-vs-astrology", "manseryeok", "saju-compatibility", "new-year-fortune"].map(
      (slug) => [slug, { published: "2026-10-01", updated: "2026-10-27" }] as const,
    ),
    ...[
      "four-pillars", "ipchun-jeolgi", "jasi-birth", "saju-birth-info", "branch-relations", "twelve-stages", "yongsin", "wolun-iljin", "saju-glossary",
      "day-master-gapmok", "day-master-eulmok", "day-master-byeonghwa", "day-master-jeonghwa", "day-master-muto",
      "day-master-gito", "day-master-gyeonggeum", "day-master-singeum", "day-master-imsu", "day-master-gyesu",
    ].map((slug) => [slug, { published: "2026-10-06", updated: "2026-10-27" }] as const),
    // 2026-10-31 (owner 2026-10-30: 재회운이 인기라 타로와 사주에 추가): 재회 타로와 재회운 사주, 결과를 약속하지 않고 읽는 법.
    ...["reunion-tarot", "reunion-saju"].map((slug) => [slug, { published: "2026-10-31", updated: "2026-10-31" }] as const),
  ],
);
