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

/** The steps a reading goes through, each linking to its section below. */
const FLOW = [
  { id: "saju", title: "사주는 계산이 먼저", text: "만세력 계산 엔진이 명식을 먼저 세워요" },
  { id: "tarot", title: "타로는 그림이 근거", text: "1909년 원판 그림에서 확인한 사실을 넘겨요" },
  { id: "writing", title: "글은 Claude가 써요", text: "받은 사실 위에서 내 질문에 맞춰 써요" },
  { id: "check", title: "보여 드리기 전에 검사", text: "지어낸 그림, 벗어난 주제, 약속하는 말을 걸러요" },
  { id: "keep", title: "연 풀이는 그대로 보관", text: "다시 열어도 새로 쓰지 않아요" },
] as const;

const CHECKS = [
  "카드 그림에 없는 장면이나 물건을 지어냈는지",
  "명식에 없는 글자나 십신, 해를 끌어왔는지",
  "내 질문과 다른 주제로 흘렀는지",
  "합격, 재회, 수익을 약속하거나 병과 수명을 점치는 말이 있는지",
  "번역투나 상투구처럼 AI가 쓴 티가 나는 문장이 여럿 쌓였는지",
];

export default function HowPage() {
  const { nameKo, reading } = SITE;
  const related = [INFO_PAGES.about, INFO_PAGES.help, INFO_PAGES.faq];

  return (
    <InfoPage
      eyebrow="HOW IT WORKS"
      title={page.title}
      lead="풀이 한 편은 계산과 확인을 먼저 끝낸 뒤에 써요. 어떤 순서로 만들어지는지, 어디까지 믿으면 되는지 그대로 적었어요."
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

      <section id="saju" className={legal.section} aria-labelledby="saju-title">
        <h2 id="saju-title" className={legal.sectionTitle}>
          사주는 계산이 먼저예요
        </h2>
        <p>명식은 AI에게 맡기지 않아요. 만세력을 바탕으로 한 계산 엔진이 태어난 날과 시, 태어난 곳으로 네 기둥을 먼저 세워요.</p>
        <ul className={legal.list}>
          <li>연주와 월주는 태어난 순간이 절기가 바뀌는 시각(절입)보다 앞인지 뒤인지로 정해요.</li>
          <li>일주와 시주는 태어난 곳의 경도만큼 시계를 보정한 시각으로 읽어요. 그 시절의 표준시와 서머타임도 반영해요.</li>
          <li>태어난 시를 모르면 시주를 비워 두고 여섯 글자로 읽어요. 시간을 짐작해서 채우지 않고, 시주가 맡는 이야기는 풀이에서 다루지 않아요.</li>
          <li>태어난 시각이 기둥이 바뀌는 경계에 가까우면 명식 아래 적용한 기준에서 알려 드려요.</li>
        </ul>
      </section>

      <section id="tarot" className={legal.section} aria-labelledby="tarot-title">
        <h2 id="tarot-title" className={legal.sectionTitle}>
          타로는 그림이 근거예요
        </h2>
        <p>
          카드 78장마다 지식베이스를 만들어 두었어요. 1909년에 처음 나온 라이더-웨이트-스미스 덱의 원판 그림을 한 장씩 보고, 그림에
          실제로 그려진 것만 사실로 적었어요. 인물이 어느 쪽을 보는지, 손에 무엇을 몇 개 들었는지까지요.
        </p>
        <p>풀이를 쓸 때는 뽑은 카드와 자리, 정방향과 역방향, 내가 만든 질문과 고른 상황을 이 사실과 함께 넘겨요.</p>
        <p className={legal.muted}>
          지금의 한 장은 AI를 거치지 않아요. 카드마다 정방향과 역방향으로 나눠 미리 써 둔 문장 가운데 하나를 골라 바로 보여 드려요.
        </p>
      </section>

      <section id="writing" className={legal.section} aria-labelledby="writing-title">
        <h2 id="writing-title" className={legal.sectionTitle}>
          글은 Claude가 써요
        </h2>
        <p>
          계산한 명식이나 카드 사실, 내 질문을 받아 Anthropic의 AI 모델 Claude가 해요체로 풀이를 써요. 받은 사실 밖의 이야기를 지어내지
          말고, 내가 적지 않은 사정을 넘겨짚지 말라는 규칙을 함께 줘요.
        </p>
        <p>사람이 한 편씩 쓰거나 고치지는 않아요. 대신 다 쓴 글은 모두 아래 검사를 거쳐요.</p>
      </section>

      <section id="check" className={legal.section} aria-labelledby="check-title">
        <h2 id="check-title" className={legal.sectionTitle}>
          보여 드리기 전에 검사해요
        </h2>
        <p>다 쓴 풀이는 자동 품질 검사를 통과해야 화면에 나와요. 검사는 이런 것을 봐요.</p>
        <ul className={legal.list}>
          {CHECKS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>
          걸린 곳이 있으면 이유를 붙여 한 번 다시 쓰게 해요. 다시 써도 사실이나 안전 기준에 걸리면 그 글은 보여 드리지 않고, 오늘 열 수 있는
          횟수도 차감하지 않아요.
        </p>
        <h3 className={legal.sub}>품질은 가린 채 비교해요</h3>
        <p>
          글쓰기 규칙이나 검사 기준을 바꿀 때는 새 방식과 이전 방식의 풀이를 나란히 놓고, 어느 쪽이 만든 글인지 가린 채 비교해요. 내 상황을
          얼마나 짚었는지, 근거가 있는지, 실제로 해 볼 일이 있는지, 안전한지, 문장이 자연스러운지를 봐요.
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

      <section id="chatgpt" className={legal.section} aria-labelledby="chatgpt-title">
        <h2 id="chatgpt-title" className={legal.sectionTitle}>
          ChatGPT에 직접 묻는 것과 뭐가 달라요?
        </h2>
        <p>{`ChatGPT 같은 대화형 AI도 타로와 사주 이야기를 잘 해요. ${nameKo} 풀이 역시 AI가 쓰고요. 차이는 글을 쓰기 전과 쓴 뒤에 하는 일이에요.`}</p>
        <div className={s.compare}>
          <section className={`${s.compareCol} ${s.compareOurs}`} aria-labelledby="ours-title">
            <h3 id="ours-title" className={s.compareTitle}>
              {`${nameKo}에서는`}
            </h3>
            <ul className={s.compareList}>
              <li>명식을 계산 엔진이 먼저 세우고, AI는 그 결과를 받아 글만 써요.</li>
              <li>카드마다 1909년 원판 그림에서 확인한 사실을 근거로 줘요.</li>
              <li>누구, 무엇, 언제와 상황 칩으로 필요한 맥락을 먼저 모아요.</li>
              <li>검사를 통과한 글만 보여 드리고, 연 풀이는 그대로 보관해요.</li>
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
              <li>이미 쓰고 있는 서비스라면 따로 들어올 필요가 없어요.</li>
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
          <li>틀리거나 내 상황과 맞지 않는 내용이 들어 있을 수 있어요. 검사는 지어낸 그림이나 약속하는 말을 걸러 내지만, 모든 실수를 잡지는 못해요.</li>
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
