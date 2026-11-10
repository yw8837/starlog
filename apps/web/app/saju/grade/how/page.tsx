import { GRADE_LETTERS, GRADE_POPULATION, SAJU_GRADE_RULE } from "@starlog/core";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BackLink } from "@/app/birth-card/BackLink";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { Button } from "@/components/ui/Button";
import { CrisisContacts } from "@/components/ui/CrisisContacts";
import { pageMetadata } from "@/lib/seo";
import { GRADE_NICKNAME, GRADE_NOTICE, gradeLine } from "@/lib/sajuGrade";
import { GRADE_MEASURED, type DayMasterElement, type MeasuredPopulation } from "@/lib/sajuGradeMeasured";
import s from "../grade.module.css";

export const metadata: Metadata = pageMetadata({
  title: "사주 등급은 이렇게 계산해요 · 규칙과 분포 공개",
  description:
    "올해의 사주 등급을 정하는 규칙 전체예요. 보이는 글자의 오행과 세운만 보고, 신강·용신·격국처럼 유파마다 갈리는 판단은 일부러 빼요. 가능한 사주 조합 561,600개로 잰 분포와 근거 자료도 그대로 적었어요.",
  path: "/saju/grade/how",
});

const ELEMENTS: readonly DayMasterElement[] = ["목", "화", "토", "금", "수"];
const YEARS = [
  [2026, "병오"],
  [2027, "정미"],
  [2028, "무신"],
] as const;
const percent = (x: number) => `${x.toFixed(1)}%`;
const count = (n: number) => n.toLocaleString("ko-KR");

const WIKI = {
  wuxing: "https://zh.wikisource.org/wiki/五行大義/2",
  sanming2: "https://zh.wikisource.org/wiki/三命通會/卷二",
  ditian: "https://zh.wikisource.org/wiki/滴天髓/03",
  yuanhai: "https://zh.wikisource.org/zh-hant/淵海子平大全",
} as const;

function Mark({ children }: { children: ReactNode }) {
  return <span className={s.mark}>{children}</span>;
}

function YearTable({ population, year, ko, label }: { population: MeasuredPopulation; year: 2026 | 2027 | 2028; ko: string; label: string }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <caption>{`${year} ${ko}년 일간별 등급 비율 (${label})`}</caption>
        <thead>
          <tr>
            <th scope="col">일간</th>
            {GRADE_LETTERS.map((g) => (
              <th key={g} scope="col">
                {g}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ELEMENTS.map((e) => (
            <tr key={e}>
              <th scope="row">{e}</th>
              {population.years[year][e].map((x, i) => (
                <td key={GRADE_LETTERS[i]}>{percent(x)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * /saju/grade/how (spec 2026-11-11 A1–A8, E): the whole rule in plain words, what it leaves out and why, the population, the
 * distribution `pnpm grade:table` measured (lib/sajuGradeMeasured.ts, checked by its test) and the sources with what could not
 * be confirmed (docs/research/saju-tables-sources-2026-11.md). Static; open to search.
 */
export default function SajuGradeHowPage() {
  const { known, unknown } = GRADE_MEASURED;
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={27} />
      <main className={`page-col ${s.screen}`}>
        <BackLink href="/saju/grade" label="사주 등급으로 돌아가기" />
        <header className={s.intro}>
          <h1 className={s.title}>사주 등급은 이렇게 계산해요</h1>
          <p className={s.lead}>
            {`올해의 사주 등급은 AI가 아니라 정해진 규칙(판 번호 ${SAJU_GRADE_RULE.id}, ${SAJU_GRADE_RULE.date})으로 계산해요. 같은 입력이면 언제나 같은 결과가 나오고, 규칙과 잰 분포를 여기에 모두 적어 두었어요.`}
          </p>
        </header>

        <section className={s.block} aria-labelledby="how-what">
          <h2 id="how-what" className={s.blockTitle}>
            무엇을 보나요
          </h2>
          <ul className={s.list}>
            <li>보이는 글자만 세요. 태어난 시를 알면 여덟 글자, 모르면 여섯 글자예요. 글자 속에 숨은 기운(지장간)은 세지 않아요.</li>
            <li>글자마다 정해진 다섯 기운(오행: 목·화·토·금·수)과, 서로 살려 주는 순서(상생: 나무 → 불 → 흙 → 쇠 → 물 → 다시 나무)를 써요.</li>
            <li>그해 들어오는 간지(세운) 두 글자를 봐요. 세운은 입춘에 바뀌어요.</li>
          </ul>
        </section>

        <section className={s.block} aria-labelledby="how-formula">
          <h2 id="how-formula" className={s.blockTitle}>
            세 가지를 18 : 12 : 70으로 더해요
          </h2>
          <ul className={s.list}>
            <li>고르기(18): 다섯 기운이 얼마나 고르게 나뉘었는지예요. 가장 고르게 나뉘면 1, 한 기운에 모두 몰리면 0이에요.</li>
            <li>
              흐름(12): 이웃한 글자 10쌍(시를 모르면 7쌍)을 봐요. 위 글자끼리 좌우, 아래 글자끼리 좌우, 같은 기둥의 위아래예요. 서로 살려 주는 사이(상생)면 1, 같은
              기운이면 0.5, 서로 누르는 사이(상극)면 0을 주고 평균을 내요.
            </li>
            <li>
              올해 순위(70): 세운 두 글자를 더했을 때 고르기가 얼마나 나아지는지와, 새로 이어지는 상생 고리가 몇 개인지로 그해의 맞음 값을 내요. 그리고 내 명식이 만나는
              60가지 해 가운데 그해가 몇 번째로 맞는 해인지(0~1, 같으면 평균)를 써요.
            </li>
          </ul>
          <p className={s.prose}>
            더한 값(0~100)은 화면에 나오지 않아요. 같은 해의 가능한 조합을 모두 같은 방식으로 계산해서 위에서 8%까지 S, 30%까지 A, 70%까지 B, 나머지는 C예요. 값이 같으면
            같은 등급이에요. 낙제처럼 읽히지 않게 D는 두지 않았어요.
          </p>
          <ul className={s.list}>
            {GRADE_LETTERS.map((g) => (
              <li key={g}>{`${g} · ${GRADE_NICKNAME[g]}: ${gradeLine(g, true)}`}</li>
            ))}
          </ul>
        </section>

        <section className={s.block} aria-labelledby="how-exact">
          <h2 id="how-exact" className={s.blockTitle}>
            식 그대로
          </h2>
          <p className={s.prose}>아래 식과 숫자가 규칙의 전부예요. 손으로 계산해도 화면과 같은 등급이 나와요.</p>
          <ul className={s.list}>
            <li>
              고르기: 글자 수를 n(시를 알면 8, 모르면 6), 기운마다 글자 개수를 c라고 해요. 치우침 D = Σ|5 × c − n|(다섯 기운을 더해요)이고, n개를 가장
              고르게 나눴을 때의 D를 D최소라고 하면 g = 1 − (D − D최소) ÷ (8n − D최소)예요.
            </li>
            <li>흐름: 이웃한 쌍마다 상생 1, 같은 기운 0.5, 상극 0을 주고 평균을 낸 값이 f예요.</li>
            <li>
              상생 고리: 서로 살려 주는 두 기운(목·화, 화·토, 토·금, 금·수, 수·목)이 명식에 둘 다 있는 쌍의 수예요. 세운 두 글자를 더한 뒤의 고르기를 g′,
              고리를 고리′라고 하면 e = (g′ − g + 0.2) ÷ 0.5이고, e가 0보다 작으면 0, 1보다 크면 1로 잘라요. 그해의 맞음 값은 m = 30 × e + 20 × (고리′ −
              고리) ÷ 2예요.
            </li>
            <li>올해 순위: 내 명식이 만나는 60가지 세운의 m을 견줘서 r = (m이 더 작은 해의 수 + (m이 같은 해의 수 − 1) ÷ 2) ÷ 59예요.</li>
            <li>더한 값: 18 × g + 12 × f + 70 × r을 반올림한 정수(0~100)예요.</li>
            <li>
              등급: 같은 해의 가능한 조합을 모두 이 식으로 계산해서, 내 값보다 큰 조합이 8% 미만이면 S, 30% 미만이면 A, 70% 미만이면 B, 그 밖은 C예요. 그래서
              값이 같으면 같은 등급이에요.
            </li>
          </ul>
        </section>

        <section className={s.block} aria-labelledby="how-left-out">
          <h2 id="how-left-out" className={s.blockTitle}>
            일부러 쓰지 않는 것
          </h2>
          <ul className={s.list}>
            <li>
              신강·신약(일간의 힘), 용신(필요한 기운), 격국(명식의 틀), 조후(계절의 덥고 추움): 유파마다 판단이 갈려서 같은 명식도 책마다 답이 달라요. 누가 계산해도 같은 결과가
              나와야 해서 뺐어요.
            </li>
            <li>합화(합해서 다른 기운으로 바뀜): 바뀌는 조건이 유파마다 달라요.</li>
            <li>
              합·충·형·파·해: 충(정면으로 마주 보는 짝)을 깎는 점수로 넣으면 등급이 사건 예고처럼 읽힐 수 있고, 합을 더하는 점수로 넣으면 합화 판단이 갈려요. 두 글자만 모인
              반합을 어디까지 세는지도 스타로그 안에서 두 가지 기준이 함께 있어요.
            </li>
            <li>대운(10년 흐름): 성별과 태어난 시각에 따라 달라져서, 가능한 조합을 같은 무게로 셀 수 없어요.</li>
          </ul>
          <p className={s.prose}>
            반대 의견도 적어 둘게요. 일간의 힘을 보는 쪽에서는 &ldquo;화 기운이 약한 화 일간에게 병오년은 힘이 되는 해&rdquo;라고 볼 수 있고, 그 말도 맞아요. 그래서 이 등급은
            좋은 해를 가리지 않고, 다섯 기운이 고르게 채워지는 정도만 재요.
          </p>
        </section>

        <section className={s.block} aria-labelledby="how-population">
          <h2 id="how-population" className={s.blockTitle}>
            가능한 사주 조합
          </h2>
          <ul className={s.list}>
            <li>
              {`시를 알 때 ${count(GRADE_POPULATION.hourKnown)}개 = 연 60 × 월 12 × 일 60 × 시 13이에요. 하루의 시주가 13개인 까닭은 밤 11시대를 다음 날 천간으로 세는 스타로그 기준(야자시) 때문이에요. 밤 11시에 날을 바꾸는 기준이라면 518,400개가 돼요.`}
            </li>
            <li>{`시를 모를 때 ${count(GRADE_POPULATION.hourUnknown)}개 = 연 60 × 월 12 × 일 60이에요.`}</li>
          </ul>
          <p className={s.prose}>
            &ldquo;등급은 어떻게 나와요?&rdquo;에 나오는 상위 %는 이 조합을 하나씩 같은 무게로 센 순위예요. 실제로 태어난 사람 수는 조합마다 달라서, 인구 통계가 아니에요.
          </p>
        </section>

        <section className={s.block} aria-labelledby="how-measured">
          <h2 id="how-measured" className={s.blockTitle}>
            잰 분포
          </h2>
          <p className={s.prose}>
            {`가능한 조합을 60가지 세운 모두로 계산해 봤어요(${SAJU_GRADE_RULE.date}). 시를 알 때 ${count(known.size)}개, 모를 때 ${count(unknown.size)}개 기준이에요.`}
          </p>
          <ul className={s.list}>
            <li>{`등급 비율은 목표(8 / 22 / 40 / 30%)와 해마다 많아야 ${known.maxGapFromTarget}%p(시 모름 ${unknown.maxGapFromTarget}%p) 달라요.`}</li>
            <li>{`어느 10년을 잡아도 열 해 내내 C인 명식은 ${known.allCTenYears}개예요(시 모름 ${unknown.allCTenYears}개).`}</li>
            <li>{`10년 안에 S를 한 번 이상 받는 명식은 적어도 ${percent(known.someSTenYears)}, S나 A가 한 번도 없는 명식은 많아야 ${percent(known.noBrightTenYears)}예요(시 모름 ${percent(unknown.someSTenYears)}, ${percent(unknown.noBrightTenYears)}).`}</li>
            <li>{`60해 동안 받는 등급은 3종 ${percent(known.kinds[2])}, 4종 ${percent(known.kinds[3])}이고, 한 종류만 받는 명식은 없어요.`}</li>
            <li>{`60해 평균 S 비율(일간 목 · 화 · 토 · 금 · 수): ${known.meanS.map(percent).join(" · ")}`}</li>
            <li>{`여덟 글자가 모두 흙(토)인 ${known.neverBright}개 명식은 60가지 해 동안 S·A가 나오지 않아요. 카드에도 그 사실을 그대로 적어요.`}</li>
          </ul>
          <p className={s.prose}>
            알려 드려야 할 쏠림이 하나 있어요. 그해 세운과 같은 기운의 일간은 그해 등급이 낮게 나와요. 같은 기운이 겹쳐서 빈칸을 채우는 몫이 작아지기 때문이에요. 규칙은
            그대로 두고, 카드에는 다음 S·A 해를 함께 보여 드려요.
          </p>
          {YEARS.map(([year, ko]) => (
            <YearTable key={year} population={known} year={year} ko={ko} label={`시를 알 때 ${count(known.size)}개`} />
          ))}
          <details className={s.how}>
            <summary className={s.howSummary}>{`시를 모를 때(${count(unknown.size)}개)`}</summary>
            <div className={s.howBody}>
              {YEARS.map(([year, ko]) => (
                <YearTable key={year} population={unknown} year={year} ko={ko} label={`시를 모를 때 ${count(unknown.size)}개`} />
              ))}
            </div>
          </details>
        </section>

        <section className={s.block} aria-labelledby="how-sources">
          <h2 id="how-sources" className={s.blockTitle}>
            근거 자료
          </h2>
          <p className={s.prose}>원문은 위키문헌에서 직접 읽고 맞춰 봤어요. 확인하지 못한 것과 스타로그가 정한 것도 그대로 적어요.</p>
          <ul className={s.sources}>
            <li>
              글자마다의 오행: <a href={WIKI.wuxing}>五行大義 卷二 第五 論配支幹</a> <Mark>원문 확인</Mark>
            </li>
            <li>
              상생·상극 순서: <a href={WIKI.wuxing}>五行大義 卷二 第四 論相生, 第十 論相剋</a> <Mark>원문 확인</Mark>
            </li>
            <li>
              월주·시주 천간(오호둔·오서둔): <a href={WIKI.sanming2}>三命通會 卷二 論遁月時</a> <Mark>원문 확인</Mark>
            </li>
            <li>
              흐름(이웃 글자): <a href={WIKI.ditian}>滴天髓 地支論</a>의 &ldquo;上下貴乎情協 左右貴乎志同&rdquo; <Mark>원문 확인</Mark>. 이 구절을 상생 쌍을 세는 점수로
              옮긴 건 스타로그의 해석이에요 <Mark>자체 기준</Mark>
            </li>
            <li>
              고르기: 고전의 중화(中和)는 일간의 힘을 기준으로 보는데, 여기서는 다섯 기운의 나뉨으로 단순하게 바꿨어요 <Mark>자체 기준</Mark>
            </li>
            <li>
              올해 순위(내 명식의 60해 안에서 매기는 순위)와 8 / 30 / 70% 경계, 달 별칭: 고전 근거가 없어요 <Mark>자체 기준</Mark>
            </li>
            <li>
              세운이 입춘에 바뀌는 기준: 三命通會 卷二에서 그 문장을 찾지 못했어요. 스타로그 만세력의 규칙이에요 <Mark>출처 미확인</Mark>
            </li>
            <li>
              밤 11시대를 다음 날 천간으로 세는 기준(야자시): 고전 원문으로 확인하지 못했어요. 스타로그의 정책이에요 <Mark>출처 미확인</Mark>
            </li>
            <li>
              <a href={WIKI.yuanhai}>淵海子平大全</a>: 위키문헌판이 미완성이라 어느 표도 맞춰 보지 못했어요 <Mark>출처 미확인</Mark>
            </li>
          </ul>
        </section>

        <section className={s.block} aria-labelledby="how-same">
          <h2 id="how-same" className={s.blockTitle}>
            같은 입력, 같은 결과
          </h2>
          <p className={s.prose}>
            {`같은 입력이면 언제나 같은 결과예요. 생일은 이 기기의 브라우저에서만 계산하고, 주소와 서버로 보내지 않아요. 규칙이 바뀌면 판 번호(지금은 ${SAJU_GRADE_RULE.id})도 바꿔서 알려 드려요.`}
          </p>
        </section>

        <p className={s.notice}>{GRADE_NOTICE}</p>
        <Button href="/saju/grade" block trailing="→">
          내 등급 보기
        </Button>
        <p className={s.prose}>
          사주 계산 기준 전체는 <Link href="/evidence#saju">근거와 방법</Link>에 있어요.
        </p>
        <CrisisContacts />
      </main>
      <Footer />
    </div>
  );
}
