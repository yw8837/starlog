import type { Metadata } from "next";
import Link from "next/link";
import { ChevronIcon } from "@/components/home/icons";
import { InfoPage } from "@/components/info/InfoPage";
import { StarNode } from "@/components/info/icons";
import s from "@/components/info/info.module.css";
import legal from "@/components/legal/legal.module.css";
import { SITE } from "@/lib/config";
import { INFO_PAGES } from "@/lib/infoPages";

const page = INFO_PAGES.how;

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  alternates: { canonical: page.path },
};

/** The steps a reading goes through (계산 → AI 해석 → 검수), each linking to its section below. */
const FLOW = [
  { id: "calc", title: "계산이 먼저예요", text: "명식과 카드의 사실을 먼저 세워요" },
  { id: "writing", title: "AI가 풀어요", text: "그 위에서 내 질문에 맞춰 써요" },
  { id: "check", title: "보여 드리기 전에 살펴요", text: "기준에 맞는 풀이만 보여 드려요" },
  { id: "keep", title: "연 풀이는 그대로 보관", text: "다시 열어도 새로 쓰지 않아요" },
] as const;

export default function HowPage() {
  const { nameKo, reading } = SITE;
  const related = [INFO_PAGES.about, INFO_PAGES.help, INFO_PAGES.faq];

  return (
    <InfoPage
      eyebrow="HOW IT WORKS"
      title={page.title}
      lead="풀이 한 편은 계산을 먼저 끝내고, AI가 풀고, 보여 드리기 전에 한 번 더 살펴요. 어디까지 믿으면 되는지도 함께 적었어요."
    >
      <nav aria-label="풀이가 만들어지는 순서">
        <ol className={s.flow}>
          {FLOW.map((step) => (
            <li key={step.id} className={s.flowStep}>
              <span className={s.flowNode}>
                <StarNode />
              </span>
              <a href={`#${step.id}`} className={s.flowLink}>
                <span className={s.flowTitle}>{step.title}</span>
                <span className={s.flowText}>{step.text}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <section id="calc" className={legal.section} aria-labelledby="calc-title">
        <h2 id="calc-title" className={legal.sectionTitle}>
          계산이 먼저예요
        </h2>
        <p>
          사주 명식은 AI에게 맡기지 않아요. 태어난 날과 시, 태어난 곳으로 만세력에 따라 네 기둥을 먼저 세워요. 태어난 시를 모르면 시주를
          비워 두고, 짐작해서 채우지 않아요.
        </p>
        <p>타로는 1909년 원판 그림에 실제로 그려진 것을 카드마다 정리해 두고, 그 사실을 바탕으로 삼아요.</p>
        <p className={legal.muted}>지금의 한 장은 AI를 거치지 않아요. 카드마다 미리 써 둔 문장 가운데 하나를 바로 보여 드려요.</p>
      </section>

      <section id="writing" className={legal.section} aria-labelledby="writing-title">
        <h2 id="writing-title" className={legal.sectionTitle}>
          AI가 풀어요
        </h2>
        <p>
          계산한 명식이나 카드의 사실, 내가 만든 질문과 고른 상황을 바탕으로 AI가 해요체로 풀이를 써요. 바탕에 없는 이야기는 지어내지 않고,
          내가 적지 않은 사정은 넘겨짚지 않도록 해요.
        </p>
      </section>

      <section id="check" className={legal.section} aria-labelledby="check-title">
        <h2 id="check-title" className={legal.sectionTitle}>
          보여 드리기 전에 살펴요
        </h2>
        <p>
          다 쓴 풀이는 화면에 나오기 전에 한 번 더 살펴요. 그림이나 명식에 없는 이야기, 질문과 다른 주제, 결과를 약속하는 말이 보이면 다시
          쓰고, 그래도 기준에 맞지 않으면 보여 드리지 않아요. 이때는 오늘 열 수 있는 횟수도 줄지 않아요.
        </p>
      </section>

      <section id="keep" className={legal.section} aria-labelledby="keep-title">
        <h2 id="keep-title" className={legal.sectionTitle}>
          연 풀이는 그대로 남아요
        </h2>
        <p>
          한 번 연 풀이는 이 기기에 저장돼요. 다시 열어도 새로 만들지 않고 저장된 글을 그대로 보여 드려요. 이어서 물어보기의 답은 앞의 풀이를
          이어받아 써요.
        </p>
      </section>

      <section id="compare" className={legal.section} aria-labelledby="compare-title">
        <h2 id="compare-title" className={legal.sectionTitle}>
          AI 챗봇에 직접 묻는 것과 뭐가 달라요?
        </h2>
        <p>{`${nameKo}는 직접 만든 만세력 계산과 카드 지식 위에서 AI가 내 질문에 맞춰 풀어요.`}</p>
        <div className={s.compare}>
          <section className={`${s.compareCol} ${s.compareOurs}`} aria-labelledby="ours-title">
            <h3 id="ours-title" className={s.compareTitle}>
              {`${nameKo}에서는`}
            </h3>
            <ul className={s.compareList}>
              <li>명식은 계산으로 먼저 세우고, AI는 그 위에서 풀이만 써요.</li>
              <li>카드마다 원판 그림에 실제로 그려진 것을 바탕으로 삼아요.</li>
              <li>누구, 무엇, 언제와 상황 칩으로 필요한 맥락을 먼저 모아요.</li>
              <li>한 번 더 살핀 풀이만 보여 드리고, 연 풀이는 그대로 보관해요.</li>
              <li>며칠 뒤 돌아보기로 풀이가 맞았는지 남기면 다음 풀이에 참고해요.</li>
            </ul>
          </section>
          <section className={s.compareCol} aria-labelledby="direct-title">
            <h3 id="direct-title" className={s.compareTitle}>
              직접 물으면 더 편한 점
            </h3>
            <ul className={s.compareList}>
              <li>{`원하는 만큼 길게 이어서 대화할 수 있어요. ${nameKo}는 풀이 하나에 이어서 물어보기 ${reading.followUps}번이에요.`}</li>
              <li>형식 없이 아무 질문이나 바로 던질 수 있어요.</li>
            </ul>
          </section>
        </div>
        <p className={legal.muted}>어느 쪽이 더 잘 맞는지 숫자로 비교한 적은 없어요. 그래서 정확도 수치는 적지 않았어요.</p>
      </section>

      <section id="limits" className={legal.section} aria-labelledby="limits-title">
        <h2 id="limits-title" className={legal.sectionTitle}>
          어디까지 믿으면 될까요
        </h2>
        <ul className={legal.list}>
          <li>풀이는 AI가 만든 글이고, 재미와 자기 성찰을 위한 참고용이에요.</li>
          <li>틀리거나 내 상황과 맞지 않는 내용이 들어 있을 수 있어요. 보여 드리기 전에 살피지만, 모든 실수를 잡지는 못해요.</li>
          <li>다른 사람의 마음은 풀이로 알 수 없어요. 관계 풀이는 내가 볼 수 있는 흐름과 내가 해 볼 일을 다뤄요.</li>
          <li>의료, 법률, 투자, 진로처럼 중요한 결정은 그 분야 전문가와 상의해 주세요.</li>
          <li>
            마음이 많이 힘들다면 풀이보다 사람과 먼저 이야기해 주세요. 자살예방상담전화 <a href="tel:109">109</a>는 24시간 열려 있어요.
          </li>
        </ul>
        <p>
          {"자세한 이용 조건은 "}
          <Link href="/terms">이용약관</Link>
          {"에 적어 두었어요."}
        </p>
      </section>

      <nav aria-label="더 알아보기">
        <ul className={s.related}>
          {related.map((info) => (
            <li key={info.path}>
              <Link href={info.path} className={s.relatedLink}>
                <span>{info.label}</span>
                <ChevronIcon />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </InfoPage>
  );
}
