import { KASI_DST_DISAGREEMENTS, KOREA_CIVIL_PERIODS, computeChart, solarTermsOfYear, type SajuChart } from "@starlog/core";
import type { GuideArticle, GuideBlock } from "../guideMeta";
import { BIRTH_PLACE_CREDIT_URL, BIRTH_PLACE_ROWS } from "../birthPlaces";
import { withParticle } from "../korean";

/**
 * 원본 자료 articles (AdSense audit 2026-11-06, task C): what Starlog measured while building its 만세력, as tables and
 * charts. Every number comes from data in this repository, and data-articles.test.ts checks each against its source:
 *
 * - 만세력 엔진 11종 비교: docs/research/saju-engine-eval.md (2026-09-30), its tables transcribed below (ENGINE_*);
 * - 2026·2027 절입 시각표: packages/core/tests/fixtures/kasi-solar-terms-2021-2028.json (KASI_TERMS), and the engine's own
 *   minute-rounded instants (solarTermsOfYear);
 * - 한국 서머타임·표준시 연표: the engine's P1 table (KOREA_CIVIL_PERIODS) and KASI_DST_DISAGREEMENTS;
 * - 출생지별 경도 보정표: lib/birthPlaces.ts (OpenStreetMap, ODbL 1.0).
 *
 * They come out one at a time (publishAt, about two a week from 2026-11-12), never as a batch. Each links only to pages
 * out on or before its own day.
 */

const SEOUL = { name: "서울", longitude: 126.978 } as const;
const chart = (year: number, month: number, day: number, hour: number, minute: number, place: { name: string; longitude: number } = SEOUL): SajuChart =>
  computeChart({ calendar: "solar", year, month, day, time: { hour, minute }, gender: "female", place });
const pillarKo = (c: SajuChart) => [c.pillars.year, c.pillars.month, c.pillars.day, c.pillars.hour].map((p) => (p ? `${p.ko}(${p.stem}${p.branch})` : "")).filter(Boolean).join(" ");

/** "YYYY-MM-DD HH:mm" (KST) → "M월 D일 HH:mm". */
const md = (kst: string) => {
  const [date = "", time = ""] = kst.split(" ");
  const [, m, d] = date.split("-").map(Number);
  return `${m}월 ${d}일 ${time}`;
};
/** An instant (UTC ISO) as "YYYY-MM-DD HH:mm" in KST (no DST after 1988). */
const kstOf = (iso: string) => new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");

// ---- 1. 만세력 엔진 11종 비교 (docs/research/saju-engine-eval.md) ----

/** §2: the eleven saju engines installed on 2026-09-30, as name, version and the doc's note. */
export const ENGINE_LIST: ReadonlyArray<readonly [string, string, string]> = [
  ["lunar-javascript", "1.7.7", "중국 농력 기준, 절기는 중국 표준시(UTC+8)"],
  ["lunar-typescript", "1.8.6", "결과가 lunar-javascript와 모든 입력에서 같음"],
  ["manseryeok", "2.0.0", "한국천문연구원 음력, 분 단위 절기표"],
  ["@gracefullight/saju", "1.3.1", "Node에서 바로 불러오지 못해 우회해서 평가"],
  ["ssaju", "0.2.0", "해석 기능이 가장 많음"],
  ["k-saju", "0.1.4", "경계 처리의 한계를 문서에 밝힘"],
  ["@openfate/bazi-engine", "2.0.0", "중국 사용자 대상"],
  ["@fullstackfamily/manseryeok", "1.0.8", "한국천문연구원 음력, 절기는 날짜 단위"],
  ["@jaeyeonling/saju", "0.1.0", "자체 천문 계산, 기본값이 진태양시와 통자시"],
  ["@orrery/core", "0.4.5", "AGPL-3.0 라이선스"],
  ["@krdn/saju", "1.2.2", "lunar-javascript를 그대로 씀"],
];

/** §4.3: 연·월·일주 errors over the 13 cases, per engine (lunar-typescript gives what lunar-javascript gives). */
export const ENGINE_ERRORS: ReadonlyArray<readonly [string, number]> = [
  ["manseryeok", 0],
  ["jaeyeonling", 0],
  ["k-saju", 0],
  ["ssaju", 1],
  ["gracefullight", 1],
  ["orrery", 1],
  ["lunar-javascript", 3],
  ["openfate", 3],
  ["krdn", 3],
  ["fullstackfamily", 5],
];

/** §4.2: the first minute (KST) at which each engine's month pillar changes, for five 절. JPL's instant first. */
export const ENGINE_FIRST_MINUTE: { head: readonly string[]; rows: ReadonlyArray<readonly string[]> } = {
  head: ["엔진", "1990 소한", "2000 입춘", "2024 입춘", "2023 청명", "2026 백로"],
  rows: [
    ["NASA JPL 기준 순간", "23:33:14", "21:40:23", "17:27:08", "10:13:04", "23:41:18"],
    ["manseryeok", "23:33", "21:40", "17:27", "10:13", "23:41"],
    ["jaeyeonling", "23:34", "21:41", "17:28", "10:13", "23:42"],
    ["k-saju", "23:34", "21:41", "17:27", "10:14", "23:42"],
    ["ssaju", "23:32", "21:37", "17:22", "10:09", "23:42"],
    ["gracefullight", "23:31", "21:36", "17:21", "10:08", "23:41"],
    ["lunar-javascript 그대로·openfate·krdn", "22:34", "20:41", "16:28", "09:14", "22:42"],
  ],
};

/** §4.4: solar→lunar mismatches over 1900-01-01–2049-12-31 (54,787 days) against manseryeok. */
export const LUNAR_DAYS = 54787;
export const LUNAR_MISMATCH: ReadonlyArray<readonly [string, number]> = [
  ["korean-lunar-calendar", 0],
  ["lunar-javascript", 1948],
  ["ssaju", 3824],
];

/** 2000-02-04, 입춘 at 21:40:23 KST: before and after, in the app's engine. */
export const before2000 = chart(2000, 2, 4, 21, 0);
export const after2000 = chart(2000, 2, 4, 21, 45);

const ENGINE_ARTICLE: GuideArticle = {
  slug: "manseryeok-engine-comparison",
  title: "만세력 엔진 11종 비교: 같은 생일에 다른 사주가 나온 이유",
  category: "saju",
  description: "만세력 계산 패키지 11종에 같은 출생 시각 13가지를 넣고 천문 기준값과 대조한 결과를 표와 그래프로 정리했어요.",
  publishAt: "2026-11-12",
  published: "2026-11-12",
  updated: "2026-11-12",
  summary:
    "같은 출생 시각을 넣어도 만세력 프로그램마다 연주나 월주가 다르게 나올 때가 있어요. 스타로그가 엔진을 고르던 2026년 9월 30일, 공개 패키지 11종에 같은 13가지 입력을 넣어 보니 연·월·일주가 기준값과 어긋난 건수가 0건부터 5건까지 갈렸어요. 어긋난 결과는 대부분 절기가 바뀌는 시각을 한국보다 1시간 이른 중국 표준시로 비교하거나, 절기를 날짜 단위로만 다룬 데서 나왔어요.",
  keyPoints: [
    "11종 가운데 3종은 13가지 입력에서 연·월·일주가 기준값과 모두 같았어요.",
    "어긋난 결과는 대부분 절입 시각을 중국 표준시로 비교한 데서 생겼어요.",
    "자시와 경도 보정은 맞고 틀림이 아니라 관례를 고르는 문제예요.",
  ],
  madeHow: {
    short: "AI 도구로 쓴 초안의 숫자를 2026년 9월 30일 엔진 평가 기록에서 옮겨 자동 대조",
    long: "AI 도구로 초안을 쓰고, 스타로그가 2026년 9월 30일 만세력 엔진을 고르며 남긴 평가 기록(패키지 11종, 입력 13가지, 한국천문연구원·NASA JPL 기준값)에서 표의 숫자를 옮겼어요. 글의 표와 그래프 숫자가 그 기록과 같은지 자동 검사로 확인해요.",
  },
  related: ["manseryeok", "ipchun-jeolgi", "jasi-birth", "saju-birth-info", "four-pillars"],
  sections: [
    {
      heading: "무엇을, 어떤 기준으로 비교했나요",
      body: "사주 앱을 만들려면 생년월일시를 네 기둥으로 바꾸는 계산 엔진이 있어야 해요. 스타로그는 직접 고르기 전에 npm에 공개된 사주 계산 패키지 11종을 정확한 버전으로 설치하고, 같은 출생 시각 13가지를 모두에 넣어 결과를 나란히 놓았어요.",
      blocks: [
        { kind: "table", caption: "비교한 패키지 11종 (2026년 9월 30일 설치한 버전)", head: ["패키지", "버전", "평가 기록의 메모"], rows: ENGINE_LIST.map((row) => [...row]) },
        {
          kind: "p",
          text: "기준값은 엔진 밖에서 가져왔어요. 일주와 음력 날짜는 [한국천문연구원 천문우주지식정보](https://astro.kasi.re.kr/)의 음양력 변환 자료로 26개 날짜와 음력 7건을 직접 조회했고, 절기가 바뀌는 순간은 [NASA JPL Horizons](https://ssd.jpl.nasa.gov/) 천체력으로 21건을 초 단위까지 구했어요. 옛 서머타임과 표준시는 국제 시간대 자료(tzdata 2026a)와 맞춰 봤어요.",
        },
        {
          kind: "list",
          items: [
            "입력 13가지: 절입 직전과 직후, 밤 11시대, 서머타임 기간, 윤달, 시간을 모르는 경우처럼 엔진마다 갈리기 쉬운 순간을 골랐어요.",
            "오류로 센 것: 연주·월주·일주가 기준값과 다른 경우예요.",
            "오류로 세지 않은 것: 밤 11시대 시주처럼 학파마다 규칙이 다른 부분은 따로 '관례 차이'로 적었어요.",
          ],
        },
      ],
    },
    {
      heading: "13가지 입력에서 연·월·일주가 어긋난 건수",
      body: "가장 많이 갈린 건 기둥 자체가 바뀌는 경우였어요. 엔진마다 13가지 입력 가운데 연주·월주·일주가 기준값과 다르게 나온 건수를 세면 아래와 같아요.",
      blocks: [
        { kind: "chart", chart: "bar", caption: "엔진별 연·월·일주 오류 건수 (입력 13가지)", unit: "건", rows: ENGINE_ERRORS.map(([label, value]) => ({ label, value })) },
        { kind: "table", caption: "엔진별 연·월·일주 오류 건수", head: ["엔진", "오류 건수 (13가지 중)"], rows: ENGINE_ERRORS.map(([name, n]) => [name, `${n}건`]) },
        {
          kind: "p",
          text: "lunar-typescript는 모든 입력에서 lunar-javascript와 같은 결과를 내서 표에 따로 적지 않았어요. 오류가 3건인 엔진 셋은 모두 lunar-javascript의 절기표를 한국 시각 그대로 비교한 쪽이고, 5건인 엔진은 절기를 날짜 단위로 처리해 절입 날 하루 전체를 새 달로 봤어요.",
        },
      ],
    },
    {
      heading: "절기가 바뀌는 첫 분, 1시간이 갈리는 자리",
      body: "월주는 절기가 들어오는 순간(절입)에 바뀌어요. 그래서 엔진마다 월주가 바뀌는 첫 분을 1분 단위로 찾아보면 절기 시각을 어떻게 다루는지가 그대로 드러나요.",
      blocks: [
        { kind: "table", caption: "월주가 바뀌는 첫 분 (한국 시각, 보정 없는 입력)", head: ENGINE_FIRST_MINUTE.head, rows: ENGINE_FIRST_MINUTE.rows },
        {
          kind: "p",
          text: "맨 아래 줄은 거의 정확히 1시간씩 일러요. lunar-javascript의 절기표는 천체력과 2초 안에서 맞지만 중국 표준시(UTC+8) 기준이라, 한국 시각을 그대로 넣으면 한국보다 1시간 이른 시계로 비교하게 돼요. 예를 들어 2000년 입춘은 한국 시각 2월 4일 21시 40분 23초인데, 같은 날 21시에 태어난 사람을 이 방식으로 계산하면 이미 입춘이 지난 것으로 보고 연주를 경진년으로 내요.",
        },
        { kind: "p", text: `스타로그 앱의 엔진으로 같은 시각을 계산하면 연주는 ${before2000.pillars.year.ko}, 월주는 ${before2000.pillars.month.ko}이라 아직 입춘 전이에요. 입춘 뒤인 21시 45분에 태어났다면 연주 ${after2000.pillars.year.ko}, 월주 ${after2000.pillars.month.ko}으로 바뀌어요.` },
      ],
    },
    {
      heading: "음력 날짜는 한국력과 중국력이 갈려요",
      body: "음력으로 생일을 넣는 사람도 많아서 음력 변환도 따로 봤어요. 1900년 1월 1일부터 2049년 12월 31일까지 54,787일을 양력에서 음력으로 바꿔, manseryeok과 하루하루 맞지 않는 날이 며칠인지 셌어요.",
      blocks: [
        { kind: "chart", chart: "bar", caption: `manseryeok과 음력 날짜가 다른 날 (1900~2049년, ${LUNAR_DAYS.toLocaleString("ko-KR")}일 중)`, unit: "일", rows: LUNAR_MISMATCH.map(([label, value]) => ({ label, value })) },
        {
          kind: "p",
          text: "한국천문연구원 자료를 쓰는 korean-lunar-calendar와는 하루도 다르지 않았어요. 중국력을 쓰는 lunar-javascript와는 1,948일이 달랐는데, 한국과 중국은 경도가 달라 초하루와 윤달이 엇갈리는 해가 있기 때문이에요. 1997년 설날은 한국력으로 2월 8일이지만 중국력으로는 2월 7일이고, 2017년에는 한국이 윤5월을, 중국이 윤6월을 두었어요.",
        },
        { kind: "callout", tone: "note", title: "윤달이 같은 해만 시험하면 놓쳐요", text: "2023년처럼 두 나라의 윤달이 같은 해만 넣어 보면 한국력과 중국력을 구분하지 못해요. 그래서 스타로그는 1997년과 2017년 같은 날짜를 계산 검사에 꼭 넣어 둬요." },
      ],
    },
    {
      heading: "맞고 틀림이 아닌 차이: 자시와 경도 보정",
      body: "기둥이 달라 보여도 오류가 아닌 경우가 있어요. 밤 11시부터 자정 사이를 어느 날로 볼지, 출생지 경도만큼 시계를 고칠지는 학파마다 관례가 달라서 엔진의 기본값도 제각각이었어요.",
      blocks: [
        {
          kind: "table",
          caption: "엔진마다 다른 기본값",
          head: ["항목", "평가에서 본 기본값"],
          rows: [
            ["경도 보정", "manseryeok·ssaju는 보정 없음, k-saju·orrery는 30분 고정, jaeyeonling은 경도와 균시차까지 반영"],
            ["밤 11시대 일주", "jaeyeonling은 밤 11시에 날이 바뀌는 통자시, manseryeok은 그날 천간의 자시"],
            ["시간 모름", "manseryeok은 계산을 멈추고, ssaju는 정오로 가정"],
          ],
        },
        {
          kind: "p",
          text: "스타로그는 이런 관례를 엔진에 맡기지 않고 앞에서 정해 넣어요. [밤 11시 이후 출생](/guide/jasi-birth)은 일주를 그날로 두고 시주만 다음 날 기준으로 봐요. 시주는 출생지의 평균 태양시로 고쳐 읽고, 시간을 모르면 정오를 넣지 않고 시주 없이 봐요. 입력하는 법은 [생년월일과 출생 정보](/guide/saju-birth-info) 글에 있어요.",
        },
      ],
    },
    {
      heading: "스타로그가 고른 것과 이 비교의 한계",
      body: "평가 뒤 스타로그는 manseryeok 2.0.0을 버전을 고정해 쓰고, 그 위에 서머타임·경도 보정·자시·시간 모름 규칙을 얹은 계산 계층을 만들었어요. 그 규칙은 [만세력](/guide/manseryeok) 글과 [네 기둥](/guide/four-pillars) 글에서 풀어 썼어요.",
      blocks: [
        {
          kind: "list",
          items: [
            "이 결과는 2026년 9월 30일에 설치한 버전 기준이에요. 그 뒤에 나온 버전은 다를 수 있어요.",
            "패키지의 전체 품질을 매긴 것이 아니라, 한국 출생자의 네 기둥을 계산할 때 갈리는 지점만 봤어요.",
            "평가 당시에는 한국천문연구원의 절기 공식값을 직접 받지 못해 NASA JPL 천체력으로 판정했어요. 2021~2028년 공표값과의 대조는 그 뒤에 따로 했어요.",
            "절입 순간 앞뒤 1분 안의 출생은 기관과 천체력마다 판정이 갈릴 수 있어요. 앱은 이 구간에 경고를 붙여요([입춘과 절기](/guide/ipchun-jeolgi)).",
          ],
        },
      ],
    },
  ],
};

// ---- 2. 2026·2027 절입 시각표 (packages/core/tests/fixtures/kasi-solar-terms-2021-2028.json) ----

/** KASI 달력자료, 2026 and 2027 (retrieved 2026-10-07): term name and KST minute, in the order the engine indexes them. */
export const KASI_TERMS: Readonly<Record<"2026" | "2027", ReadonlyArray<readonly [string, string]>>> = {
  "2026": [
    ["소한", "2026-01-05 17:23"], ["대한", "2026-01-20 10:45"], ["입춘", "2026-02-04 05:02"], ["우수", "2026-02-19 00:52"], ["경칩", "2026-03-05 22:59"], ["춘분", "2026-03-20 23:46"],
    ["청명", "2026-04-05 03:40"], ["곡우", "2026-04-20 10:39"], ["입하", "2026-05-05 20:49"], ["소만", "2026-05-21 09:37"], ["망종", "2026-06-06 00:48"], ["하지", "2026-06-21 17:25"],
    ["소서", "2026-07-07 10:57"], ["대서", "2026-07-23 04:13"], ["입추", "2026-08-07 20:43"], ["처서", "2026-08-23 11:19"], ["백로", "2026-09-07 23:41"], ["추분", "2026-09-23 09:05"],
    ["한로", "2026-10-08 15:29"], ["상강", "2026-10-23 18:38"], ["입동", "2026-11-07 18:52"], ["소설", "2026-11-22 16:23"], ["대설", "2026-12-07 11:53"], ["동지", "2026-12-22 05:50"],
  ],
  "2027": [
    ["소한", "2027-01-05 23:10"], ["대한", "2027-01-20 16:30"], ["입춘", "2027-02-04 10:46"], ["우수", "2027-02-19 06:33"], ["경칩", "2027-03-06 04:40"], ["춘분", "2027-03-21 05:25"],
    ["청명", "2027-04-05 09:17"], ["곡우", "2027-04-20 16:18"], ["입하", "2027-05-06 02:25"], ["소만", "2027-05-21 15:18"], ["망종", "2027-06-06 06:26"], ["하지", "2027-06-21 23:11"],
    ["소서", "2027-07-07 16:37"], ["대서", "2027-07-23 10:05"], ["입추", "2027-08-08 02:27"], ["처서", "2027-08-23 17:14"], ["백로", "2027-09-08 05:28"], ["추분", "2027-09-23 15:02"],
    ["한로", "2027-10-08 21:17"], ["상강", "2027-10-24 00:33"], ["입동", "2027-11-08 00:39"], ["소설", "2027-11-22 22:16"], ["대설", "2027-12-07 17:38"], ["동지", "2027-12-22 11:42"],
  ],
};

/** The fixture's 2021–2028 comparison: terms equal to the minute per year (24 each; the five +1 cases are in 2022 ×2, 2024, 2027, 2028). */
export const KASI_EQUAL_BY_YEAR: ReadonlyArray<readonly [number, number]> = [
  [2021, 24], [2022, 22], [2023, 24], [2024, 23], [2025, 24], [2026, 24], [2027, 23], [2028, 23],
];

/** docs/research/manseryeok-references-2026-10.md §3: JPL seconds (saju-engine-eval.md §4.1) next to KASI's published minute. */
export const JPL_VS_KASI: ReadonlyArray<readonly [string, string, string]> = [
  ["2023 입춘", "11:42:34", "11:43"],
  ["2023 청명", "10:13:04", "10:13"],
  ["2024 입춘", "17:27:08", "17:27"],
  ["2024 경칩", "11:22:47", "11:23"],
  ["2026 백로", "23:41:18", "23:41"],
  ["2026 한로", "15:29:18", "15:29"],
];

/** The month a 절 opens, as the engine gives it an hour after the term (the even indices are the 12 절). */
function opensMonth(kst: string): string {
  const at = new Date(Date.parse(`${kst.replace(" ", "T")}:00Z`) + 3_600_000);
  const c = chart(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate(), at.getUTCHours(), at.getUTCMinutes());
  return `${c.pillars.month.ko}월`;
}

function termRows(year: "2026" | "2027"): string[][] {
  const engine = solarTermsOfYear(Number(year));
  return KASI_TERMS[year].map(([name, kst], index) => {
    const ours = kstOf(engine[index]?.instantUTC ?? "");
    return [name, md(kst), index % 2 === 0 ? opensMonth(kst) : "중기(월 그대로)", ours === kst ? "같음" : `${md(ours).split(" ").at(-1)} (1분 늦음)`];
  });
}

const birthYear = (kst: string, deltaMinutes: number) => {
  const at = new Date(Date.parse(`${kst.replace(" ", "T")}:00Z`) + deltaMinutes * 60_000);
  return chart(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate(), at.getUTCHours(), at.getUTCMinutes()).pillars.year.ko;
};

const JEOLIP_ARTICLE: GuideArticle = {
  slug: "jeolip-times-2026-2027",
  title: "2026·2027년 절입 시각표: 한국천문연구원 값과 맞춰 봤어요",
  category: "saju",
  description: "2026년과 2027년 24절기가 들어오는 시각을 한국천문연구원 자료로 정리하고, 앱의 계산값과 분 단위로 대조했어요.",
  publishAt: "2026-11-16",
  published: "2026-11-16",
  updated: "2026-11-16",
  summary:
    "사주에서 해와 달은 1월 1일이나 초하루가 아니라 절기가 들어오는 순간(절입)에 바뀌어요. 2026년과 2027년 24절기 시각을 한국천문연구원 달력자료에서 옮겨 표로 정리하고, 스타로그 앱의 만세력 계산값과 분 단위로 대조했어요. 2021~2028년 192개 가운데 187개가 같았고, 나머지 5개는 앱 값이 1분 늦었어요.",
  keyPoints: [
    "2026년 입춘은 2월 4일 05:02, 2027년 입춘은 2월 4일 10:46이에요.",
    "2026년 24개는 앱 계산값과 분까지 같고, 2027년은 청명 하나가 1분 달라요.",
    "절입 앞뒤 2분 안에 태어났다면 앱이 따로 경고를 붙여요.",
  ],
  madeHow: {
    short: "AI 도구로 쓴 초안의 표를 한국천문연구원 달력자료(2026년 10월 7일 수집)와 앱 계산값에 자동 대조",
    long: "AI 도구로 초안을 쓰고, 2026년 10월 7일 한국천문연구원 달력자료 페이지에서 그대로 옮겨 둔 2021~2028년 절기 192개를 표의 기준으로 삼았어요. 표의 시각이 그 자료와 같은지, 앱 계산값 열이 스타로그 만세력 엔진의 값과 같은지 자동 검사로 확인해요.",
  },
  related: ["ipchun-jeolgi", "wolun-iljin", "manseryeok", "manseryeok-engine-comparison", "new-year-fortune"],
  sections: [
    {
      heading: "절입 시각이 왜 필요한가요",
      body: "사주의 연주는 입춘이 들어오는 순간에, 월주는 열두 절기가 들어오는 순간에 바뀌어요. 같은 날 태어나도 절입 몇 분 전과 후는 다른 해, 다른 달의 기둥을 가져요.",
      blocks: [
        {
          kind: "p",
          text: `2026년 입춘은 2월 4일 05:02예요. 스타로그 앱으로 그날 서울 출생을 계산하면 새벽 4시 30분은 ${birthYear("2026-02-04 05:02", -32)}년, 오전 5시 30분은 ${birthYear("2026-02-04 05:02", 28)}년이에요. 날짜가 같아도 한 시간 사이에 띠가 바뀌는 셈이에요.`,
        },
        { kind: "p", text: "24절기는 소한부터 '절'과 '중기'가 번갈아 와요. 소한, 입춘, 경칩, 청명 같은 절 열두 개가 달을 열고, 대한, 우수, 춘분 같은 중기는 달을 바꾸지 않아요. 아래 표에는 절마다 그날부터 시작되는 달의 간지를 함께 적었어요." },
      ],
    },
    {
      heading: "2026년 24절기 시각",
      body: "시각은 모두 한국 표준시(KST)이고, 2026년에는 서머타임이 없어요. 마지막 열은 같은 절기를 스타로그 앱의 만세력 엔진이 몇 시 몇 분으로 갖고 있는지 비교한 결과예요.",
      blocks: [{ kind: "table", caption: "2026년 24절기 (한국천문연구원 달력자료)", head: ["절기", "들어오는 시각", "그날부터의 달", "앱 계산값"], rows: termRows("2026") }],
    },
    {
      heading: "2027년 24절기 시각",
      body: "2027년은 정미년이에요. 입춘인 2월 4일 10:46부터 정미년이 시작되고, 그 전에 태어나면 연주는 아직 병오년이에요.",
      blocks: [
        { kind: "table", caption: "2027년 24절기 (한국천문연구원 달력자료)", head: ["절기", "들어오는 시각", "그날부터의 달", "앱 계산값"], rows: termRows("2027") },
        { kind: "p", text: "2027년 청명은 한국천문연구원 값이 4월 5일 09:17이고 앱 계산값은 09:18이에요. 그 1분 사이에 태어난 사람은 자료에 따라 월주가 갈릴 수 있어서, 앱은 이런 출생에 절입 경계 경고를 붙여요." },
      ],
    },
    {
      heading: "어떻게 맞춰 봤나요",
      body: "2026년 10월 7일 한국천문연구원 천문우주지식정보의 달력자료 페이지에서 2021년부터 2028년까지 해마다 24절기의 월·일·시·분을 그대로 옮겼어요. 그 192개를 앱 엔진의 절기 시각과 하나씩 비교했어요.",
      blocks: [
        { kind: "chart", chart: "bar", caption: "연도별로 앱 계산값과 분까지 같은 절기 수 (24개 중)", unit: "개", rows: KASI_EQUAL_BY_YEAR.map(([year, n]) => ({ label: `${year}년`, value: n })) },
        {
          kind: "table",
          caption: "앱 계산값이 다른 5개 (모두 1분 늦음)",
          head: ["연도", "절기", "한국천문연구원", "앱 계산값"],
          rows: [
            ["2022", "입동", "11월 7일 19:45", "19:46"],
            ["2022", "소설", "11월 22일 17:20", "17:21"],
            ["2024", "소설", "11월 22일 04:56", "04:57"],
            ["2027", "청명", "4월 5일 09:17", "09:18"],
            ["2028", "곡우", "4월 19일 22:09", "22:10"],
          ],
        },
        {
          kind: "p",
          text: "한국천문연구원은 해와 달의 위치를 NASA JPL 천체위치표로 계산해 분 단위로 공표해요. 엔진을 고를 때 NASA JPL Horizons로 초까지 구해 둔 절입 시각과 공표값을 나란히 놓으면, 공표값은 모두 가장 가까운 분으로 반올림한 값이었어요.",
        },
        { kind: "table", caption: "초 단위 천체력과 분 단위 공표값", head: ["절기", "NASA JPL (초)", "한국천문연구원 (분)"], rows: JPL_VS_KASI.map((row) => [...row]) },
      ],
    },
    {
      heading: "이 표를 쓸 때 알아 둘 것",
      body: "한국천문연구원 달력자료 페이지는 스스로 '공식 발표 자료가 아니'라고 밝히고, 공식 값은 해마다 관보에 실리는 월력요항을 보라고 안내해요. 이 글의 표는 그 페이지에서 옮긴 값이에요.",
      blocks: [
        {
          kind: "list",
          items: [
            "2028년 값은 월력요항이 나오기 전의 자료라고 페이지에 적혀 있어요.",
            "1분이 갈리는 다섯 경우처럼, 절입 앞뒤 1~2분 안의 출생은 자료마다 판정이 다를 수 있어요. 앱은 앞뒤 2분 안이면 경고를 붙여요.",
            "태어난 시를 모르는 날이 절입 날이라면 월주 후보가 둘이 될 수 있어요([태어난 시간을 모를 때](/guide/saju-without-birth-time)).",
          ],
        },
        { kind: "p", text: "절기가 사주에서 어떤 뜻인지는 [입춘과 절기](/guide/ipchun-jeolgi) 글에, 달과 날의 흐름을 읽는 법은 [월운과 일진](/guide/wolun-iljin) 글에 정리해 두었어요." },
      ],
    },
  ],
};

// ---- 3. 한국 서머타임·표준시 연표 (the engine's P1 table) ----

const hm = (minutes: number) => `UTC+${Math.floor(minutes / 60)}${minutes % 60 ? `:${minutes % 60}` : ""}`;
const decimalYear = (wall: string) => {
  const t = Date.parse(`${wall}Z`);
  const year = new Date(t).getUTCFullYear();
  return year + (t - Date.UTC(year, 0, 1)) / (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1));
};
/** "YYYY-MM-DDTHH:mm" → "YYYY년 M월 D일 H시". */
const wallKo = (wall: string) => {
  const [date = "", time = ""] = wall.split("T");
  const [y, m, d] = date.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일 ${Number(time.slice(0, 2))}시`;
};

/** Standard-time eras: start, end, offset (the periods whose standard offset changes). */
const STANDARD_ERAS = KOREA_CIVIL_PERIODS.reduce<Array<{ from: string; offset: number }>>((eras, [wall, , standard]) => (eras.at(-1)?.offset === standard ? eras : [...eras, { from: wall, offset: standard }]), []);
/** DST spans: start and end wall clock, total offset. */
const DST_SPANS = KOREA_CIVIL_PERIODS.flatMap(([wall, offset, standard], i) => (offset > standard ? [{ from: wall, to: KOREA_CIVIL_PERIODS[i + 1]?.[0] ?? wall, offset }] : []));

const dstExample = chart(1988, 5, 10, 1, 30);
const noHistory = computeChart(
  { calendar: "solar", year: 1988, month: 5, day: 10, time: { hour: 1, minute: 30 }, gender: "female", place: SEOUL },
  { version: dstExample.policy.version, clock: "WALL", jasi: "SPLIT_NEXT_DAY_STEM", applyHistoricalDst: false, termBoundaryWarnSeconds: 120, hourBoundaryWarnMinutes: 10 },
);

const DST_ARTICLE: GuideArticle = {
  slug: "korea-dst-standard-time",
  title: "한국 서머타임·표준시 변경 연표와 출생 시각 보정",
  category: "saju",
  description: "1908년부터 1988년까지 한국의 표준시와 서머타임이 바뀐 날을 표로 정리하고, 그때 태어난 시각을 사주에서 어떻게 고쳐 읽는지 적었어요.",
  publishAt: "2026-11-19",
  published: "2026-11-19",
  updated: "2026-11-19",
  summary:
    "한국의 시계는 1908년 이후 표준시가 네 번 바뀌었고, 열두 해 동안 서머타임을 했어요. 그 시기에 태어났다면 출생 기록의 시각은 당시 시계 기준이라, 사주를 볼 때는 그 시계를 되돌려 실제 순간을 찾아야 해요. 스타로그 앱이 쓰는 연표 28줄을 그대로 옮기고, 한국천문연구원 자료와 국제 시간대 자료가 다른 열 군데도 함께 적었어요.",
  keyPoints: [
    "표준시는 동경 127.5도와 135도 사이를 두 번 오갔어요.",
    "서머타임은 1948~51년, 1955~60년, 1987~88년에 있었어요.",
    "앱은 서머타임 시작 때 건너뛴 한 시간은 계산하지 않아요.",
  ],
  madeHow: {
    short: "AI 도구로 쓴 초안의 연표를 앱 만세력 엔진의 표준시·서머타임 표에서 그대로 생성",
    long: "AI 도구로 초안을 쓰고, 표와 그래프는 스타로그 만세력 엔진이 실제로 쓰는 표준시·서머타임 표(국제 시간대 자료 tzdata와 대조된 28줄)와 한국천문연구원 역서와 다른 구간 목록에서 그대로 만들었어요. 예시 계산은 앱 엔진으로 다시 계산해 글과 같은지 자동 검사로 확인해요.",
  },
  related: ["saju-birth-info", "jasi-birth", "jeolip-times-2026-2027", "manseryeok", "manseryeok-engine-comparison"],
  sections: [
    {
      heading: "옛 출생 시각은 왜 고쳐 읽어야 하나요",
      body: "출생 기록의 시각은 그날 벽시계가 가리킨 시각이에요. 그런데 한국의 벽시계는 시대마다 기준이 달랐어요. 서머타임 기간에는 시계를 한 시간 앞당겼고, 어떤 시기에는 표준시 자체가 30분 달랐어요.",
      blocks: [
        { kind: "p", text: "사주의 기둥은 태어난 실제 순간과 해의 위치로 정해요. 그래서 스타로그 앱은 입력한 시각을 당시 시계로 읽어 실제 순간을 찾은 뒤, 거기서 연·월주를 정하고 일·시주는 출생지 경도로 고친 시각으로 봐요." },
        { kind: "chart", chart: "timeline", caption: "한국 표준시와 서머타임 (1908~1990년)", from: 1905, to: 1990, lanes: [
          { label: "UTC+8:30", spans: STANDARD_ERAS.flatMap((era, i) => (era.offset === 510 ? [[decimalYear(era.from), decimalYear(STANDARD_ERAS[i + 1]?.from ?? "1990-01-01T00:00")] as const] : [])) },
          { label: "UTC+9", spans: STANDARD_ERAS.flatMap((era, i) => (era.offset === 540 ? [[decimalYear(era.from), decimalYear(STANDARD_ERAS[i + 1]?.from ?? "1990-01-01T00:00")] as const] : [])) },
          { label: "서머타임", spans: DST_SPANS.map((span) => [decimalYear(span.from), decimalYear(span.to)] as const) },
        ] },
      ],
    },
    {
      heading: "표준시가 바뀐 네 번",
      body: "한국 표준시는 동경 127.5도(UTC+8:30)와 135도(UTC+9)를 오갔어요. 1961년 8월 10일부터 지금까지는 동경 135도, UTC+9예요.",
      blocks: [
        {
          kind: "table",
          caption: "표준시 시기 (앱 엔진의 연표)",
          head: ["시작", "기준", "UTC와의 차이"],
          rows: STANDARD_ERAS.map((era) => [wallKo(era.from), era.offset === 510 ? "동경 127.5도" : "동경 135도", hm(era.offset)]),
        },
        { kind: "p", text: "같은 정오라도 UTC+8:30 시기의 정오는 UTC+9 시기의 정오보다 30분 늦은 순간이에요. 스타로그 앱은 출생 시각을 그 시기의 표준시로 읽어요." },
      ],
    },
    {
      heading: "서머타임을 한 열두 해",
      body: "서머타임 동안에는 시계를 한 시간 앞당겼어요. 1955~60년에는 표준시가 UTC+8:30이라 서머타임 시계가 UTC+9:30이었고, 1948~51년과 1987·1988년에는 UTC+10이었어요.",
      blocks: [
        {
          kind: "table",
          caption: "서머타임 기간 (시작과 끝은 바뀌기 직전의 시계로 적었어요)",
          head: ["연도", "시작", "끝", "그동안의 시계"],
          rows: DST_SPANS.map((span) => [`${span.from.slice(0, 4)}년`, wallKo(span.from).slice(6), wallKo(span.to).slice(6), hm(span.offset)]),
        },
      ],
    },
    {
      heading: "서머타임 중에 태어났다면: 1988년 5월 10일 새벽 1시 30분",
      body: "1988년 5월 10일은 서머타임 기간이에요. 그날 새벽 1시 30분 서울 출생으로 넣으면, 앱은 시계를 한 시간 되돌리고 서울 경도만큼 더 고쳐서 일·시주를 정해요.",
      blocks: [
        {
          kind: "table",
          caption: "같은 입력, 연표를 쓸 때와 쓰지 않을 때 (1988년 5월 10일 01:30 서울)",
          head: ["계산 방식", "고친 시각", "네 기둥"],
          rows: [
            ["연표와 경도 보정 적용 (앱 기본)", `${dstExample.correctedLocalTime}`, pillarKo(dstExample)],
            ["입력 시각 그대로", `${noHistory.correctedLocalTime}`, pillarKo(noHistory)],
          ],
        },
        { kind: "p", text: `연표와 경도 보정을 쓰면 고친 시각이 전날 밤 ${dstExample.correctedLocalTime}으로 넘어가서 일주는 ${dstExample.pillars.day.ko}, 시주는 ${dstExample.pillars.hour?.ko ?? ""}예요. 입력 시각을 그대로 쓰면 일주 ${noHistory.pillars.day.ko}, 시주 ${noHistory.pillars.hour?.ko ?? ""}이 나와 두 기둥이 모두 달라져요.` },
      ],
    },
    {
      heading: "없었던 한 시간과 두 번 있었던 한 시간",
      body: "서머타임이 시작하는 날에는 시계를 앞당기면서 한 시간이 통째로 사라졌고, 끝나는 날에는 같은 한 시간이 두 번 지나갔어요.",
      blocks: [
        {
          kind: "list",
          items: [
            "1987년 5월 10일 02:00~02:59처럼 건너뛴 시각은 실제로 없었던 시각이라, 앱은 계산하지 않고 출생 기록을 다시 확인해 달라고 안내해요.",
            "1987년 10월 11일 02:00~02:59처럼 두 번 지나간 시각은 먼저 지나간 쪽(서머타임 시계)으로 계산하고, 같은 시각이 두 번 있었던 날이라는 안내를 붙여요.",
            "1988년 5월 8일과 10월 9일에도 같은 일이 있었어요.",
          ],
        },
      ],
    },
    {
      heading: "한국천문연구원 표와 국제 시간대 자료가 다른 곳",
      body: "한국천문연구원 역서의 서머타임 표와, 앱이 따르는 국제 시간대 자료(tzdata)는 몇 해의 시작이나 끝에서 한 시간씩 달라요. 앱은 tzdata를 따르고, 아래 구간에 태어났다면 다른 자료로 계산한 기둥도 함께 알려 줘요.",
      blocks: [
        {
          kind: "table",
          caption: "두 자료가 다른 열 구간",
          head: ["연도", "경계", "구간 (당시 시계)", "한국천문연구원 표"],
          rows: KASI_DST_DISAGREEMENTS.map((d) => [`${d.year}년`, d.edge === "start" ? "시작" : "끝", `${wallKo(d.from).slice(6)}~${wallKo(d.to).slice(6)}`, d.kasiDst ? "서머타임으로 봄" : "서머타임 아님"]),
        },
        { kind: "p", text: "1987년과 1988년은 두 자료가 같아요. 어느 쪽이 실제 시계였는지는 확인하지 못해서, 앱은 이 구간의 출생에 다른 자료로 계산하면 달라지는 기둥을 안내로 함께 보여 줘요. 출생 정보를 넣는 법은 [생년월일과 출생 정보](/guide/saju-birth-info) 글에 있어요." },
      ],
    },
  ],
};

// ---- 4. 출생지별 경도 보정표 (lib/birthPlaces.ts) ----

/** Minutes the LMT clock differs from KST (UTC+9, 동경 135°) at a longitude: (longitude − 135) × 4. */
export const lmtMinutes = (longitude: number): number => (longitude - 135) * 4;
const minutesKo = (longitude: number) => `${lmtMinutes(longitude).toFixed(1)}분`;

const byLongitude = [...BIRTH_PLACE_ROWS].sort((a, b) => a.longitude - b.longitude);
const GROUPS = [...new Set(BIRTH_PLACE_ROWS.map((row) => row.group))];
/** How many places fall in each whole minute of correction (−36분대 means −36.x). */
const BUCKETS = (() => {
  const counts = new Map<number, number>();
  for (const row of BIRTH_PLACE_ROWS) counts.set(Math.trunc(lmtMinutes(row.longitude)), (counts.get(Math.trunc(lmtMinutes(row.longitude))) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]);
})();

const busan = BIRTH_PLACE_ROWS.find((row) => row.id === "busan") as (typeof BIRTH_PLACE_ROWS)[number];
/** The 시진 a branch names. */
const SIJIN: Readonly<Record<string, string>> = { 子: "자시", 丑: "축시", 寅: "인시", 卯: "묘시", 辰: "진시", 巳: "사시", 午: "오시", 未: "미시", 申: "신시", 酉: "유시", 戌: "술시", 亥: "해시" };
const seoulMorning = chart(1990, 5, 15, 7, 25);
const busanMorning = chart(1990, 5, 15, 7, 25, { name: busan.label, longitude: busan.longitude });

const groupTables: GuideBlock[] = GROUPS.map((group) => ({
  kind: "table",
  caption: `${group} (${BIRTH_PLACE_ROWS.filter((row) => row.group === group).length}곳)`,
  head: ["지역", "청사 경도", "한국 표준시와의 차이"],
  rows: BIRTH_PLACE_ROWS.filter((row) => row.group === group).map((row) => [row.label, `동경 ${row.longitude.toFixed(3)}도`, minutesKo(row.longitude)]),
}));

const LONGITUDE_ARTICLE: GuideArticle = {
  slug: "birthplace-longitude-table",
  title: "출생지별 경도 보정표: 시·군 161곳의 시각 차이",
  category: "saju",
  description: "전국 시·군 161곳 청사의 경도로, 사주 시주를 볼 때 출생 시각에서 몇 분을 빼는지 계산한 표예요.",
  publishAt: "2026-11-23",
  published: "2026-11-23",
  updated: "2026-11-23",
  summary: `한국 표준시는 동경 135도에 맞춘 시계라, 그보다 서쪽인 한국 땅에서는 해가 시계보다 늦게 떠요. 스타로그 앱은 출생지 경도만큼 시각을 고쳐 일주와 시주를 정해요. 시·군 161곳 청사의 경도로 그 차이를 계산하면 가장 동쪽인 ${withParticle(byLongitude.at(-1)?.label ?? "", "은/는")} ${minutesKo(byLongitude.at(-1)?.longitude ?? 135)}, 가장 서쪽인 ${withParticle(byLongitude[0]?.label ?? "", "은/는")} ${minutesKo(byLongitude[0]?.longitude ?? 135)}이에요.`,
  keyPoints: [
    "보정 분 = (출생지 경도 − 135) × 4예요.",
    `서울은 ${minutesKo(126.978)}, 부산은 ${minutesKo(busan.longitude)}이에요.`,
    "연주와 월주는 보정하지 않고, 일주와 시주만 고친 시각으로 봐요.",
  ],
  madeHow: {
    short: "AI 도구로 쓴 초안의 표를 앱이 쓰는 출생지 161곳 경도 목록에서 그대로 계산",
    long: "AI 도구로 초안을 쓰고, 표는 스타로그 앱의 출생지 목록(OpenStreetMap 청사 좌표 161곳, 2026년 10월 7일 수집)에서 그대로 계산했어요. 표의 분 값과 예시 계산이 그 목록과 앱 엔진의 값과 같은지 자동 검사로 확인해요.",
  },
  related: ["korea-dst-standard-time", "saju-birth-info", "jasi-birth", "four-pillars", "manseryeok"],
  sections: [
    {
      heading: "경도 보정이 뭔가요",
      body: "한국 표준시는 동경 135도에서 해가 남쪽 하늘 가장 높이 뜨는 때를 낮 12시로 맞춘 시계예요. 경도가 1도 서쪽으로 갈 때마다 해는 4분씩 늦게 떠서, 서울에서는 1년을 평균하면 시계로 12시 32분쯤에 해가 가장 높아요.",
      blocks: [
        { kind: "p", text: "스타로그 앱은 일주와 시주를 출생지의 평균 태양시로 봐요. 입력한 시각에 (경도 − 135) × 4분을 더해 고친 시각을 만들고, 그 시각으로 날과 시진을 정해요. 연주와 월주는 절입 순간과 비교하는 거라 고치지 않아요." },
        { kind: "chart", chart: "bar", caption: "보정 분의 크기별 시·군 수 (161곳)", unit: "곳", rows: BUCKETS.map(([minute, n]) => ({ label: `${minute}분대`, value: n })) },
      ],
    },
    {
      heading: "가장 동쪽과 가장 서쪽",
      body: `161곳 가운데 보정이 가장 작은 곳과 가장 큰 곳의 차이는 ${(lmtMinutes(byLongitude.at(-1)?.longitude ?? 135) - lmtMinutes(byLongitude[0]?.longitude ?? 135)).toFixed(1)}분이에요. 같은 시각에 태어나도 출생지에 따라 시진 경계를 넘을 수 있는 폭이에요.`,
      blocks: [
        {
          kind: "table",
          caption: "보정이 작은 다섯 곳과 큰 다섯 곳",
          head: ["지역", "청사 경도", "한국 표준시와의 차이"],
          rows: [...byLongitude.slice(-5).reverse(), ...byLongitude.slice(0, 5)].map((row) => [row.label, `동경 ${row.longitude.toFixed(3)}도`, minutesKo(row.longitude)]),
        },
      ],
    },
    {
      heading: "같은 시각, 서울과 부산의 시주",
      body: `1990년 5월 15일 오전 7시 25분에 태어났다고 넣어 볼게요. 서울과 부산은 경도가 ${(busan.longitude - 126.978).toFixed(1)}도 달라서 고친 시각이 ${((busan.longitude - 126.978) * 4).toFixed(1)}분 차이 나요.`,
      blocks: [
        {
          kind: "table",
          caption: "1990년 5월 15일 07:25 출생, 출생지만 바꿔 계산",
          head: ["출생지", "고친 시각", "시주"],
          rows: [
            ["서울", `${seoulMorning.correctedLocalTime}`, `${seoulMorning.pillars.hour?.ko ?? ""}`],
            [busan.label, `${busanMorning.correctedLocalTime}`, `${busanMorning.pillars.hour?.ko ?? ""}`],
          ],
        },
        { kind: "p", text: `서울은 고친 시각이 ${seoulMorning.correctedLocalTime}이라 ${SIJIN[seoulMorning.pillars.hour?.branch ?? ""]}이고, 부산은 ${busanMorning.correctedLocalTime}이라 ${SIJIN[busanMorning.pillars.hour?.branch ?? ""]}예요. 고친 시각이 시진 경계 앞뒤 10분 안이면 앱이 따로 알려 줘요. 출생 기록의 분까지 확인하는 법은 [생년월일과 출생 정보](/guide/saju-birth-info) 글에 있어요.` },
      ],
    },
    {
      heading: "옛 표준시 시절에는 보정 폭이 달라요",
      body: "1908~1911년과 1954~1961년의 한국 표준시는 동경 127.5도 기준이었어요. 그 시기의 시계는 서울 태양시와 2분 남짓만 차이 나서, 보정 폭도 그만큼 작아요.",
      blocks: [
        { kind: "p", text: `같은 서울이라도 UTC+9 시기에는 ${minutesKo(126.978)}, UTC+8:30 시기에는 ${((126.978 - 127.5) * 4).toFixed(1)}분을 고쳐요. 어느 시기에 어떤 표준시를 썼는지는 [한국 서머타임·표준시 연표](/guide/korea-dst-standard-time) 글에 표로 있어요.` },
      ],
    },
    {
      heading: "시·도별 보정표",
      body: "아래 표의 분 값은 UTC+9 시기 기준이에요. 출생지가 목록에 없다면 가장 가까운 시·군의 값을 보면 돼요. 이웃한 시·군끼리는 대개 1분 안팎으로 달라요.",
      blocks: groupTables,
    },
    {
      heading: "이 표의 출처와 이용 조건",
      body: "경도는 각 시청·군청 건물의 OpenStreetMap 좌표를 소수점 셋째 자리까지 반올림한 값이에요. 2026년 10월 7일에 읽었고, 위키데이터의 지역 좌표와 0.03도 안에서 맞는지 대조했어요.",
      blocks: [
        { kind: "p", text: "파주, 철원, 아산, 신안, 사천, 거제는 위키데이터 좌표가 지역 한가운데를 가리키거나 맞지 않아 청사 좌표를 그대로 썼어요." },
        { kind: "p", text: `이 목록은 OpenStreetMap 데이터에서 만든 파생 데이터라 Open Database License 1.0을 따르고, 출처 표기는 © OpenStreetMap 기여자예요. 자세한 조건은 OpenStreetMap의 [저작권과 라이선스](${BIRTH_PLACE_CREDIT_URL}) 페이지에 있어요.` },
      ],
    },
  ],
};

/** In release order; each comes out on its publishAt day. */
export const DATA_ARTICLES: readonly GuideArticle[] = [ENGINE_ARTICLE, JEOLIP_ARTICLE, DST_ARTICLE, LONGITUDE_ARTICLE];
