import type { Metadata } from "next";
import Link from "next/link";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { ChevronIcon } from "@/components/home/icons";
import { InfoPage } from "@/components/info/InfoPage";
import s from "@/components/info/info.module.css";
import { BusinessFacts, Facts } from "@/components/legal/LegalPage";
import legal from "@/components/legal/legal.module.css";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import { INFO_PAGES } from "@/lib/infoPages";
import { pageMetadata } from "@/lib/seo";
import { withParticle } from "@/lib/korean";
import { contactChannels } from "@/lib/legal";
import { NEW_TAROT_HREF, NEW_SAJU_HREF } from "@/lib/freshStart";

const page = INFO_PAGES.about;

export const metadata: Metadata = pageMetadata({ title: page.title, description: page.description, path: page.path });

const WONT = [
  "합격, 재회, 수익 같은 결과를 약속하지 않아요.",
  "다른 사람의 마음을 사실처럼 말하지 않아요.",
  "병이나 수명, 사고를 점치지 않아요.",
  "입력하지 않은 내 사정을 지어내지 않아요.",
  "타로와 사주 풀이 화면에는 광고를 싣지 않아요.",
];

function Slash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6 18 12-12" />
    </svg>
  );
}

export default function AboutPage() {
  const { nameKo, business } = SITE;
  const email = contactChannels().find(([label]) => label === "이메일")?.[1];
  const related = [INFO_PAGES.how, INFO_PAGES.evidence, INFO_PAGES.help, INFO_PAGES.faq];

  return (
    <InfoPage
      eyebrow="ABOUT"
      title={page.title}
      lead={`${nameKo}는 내 질문과 상황에 맞춘 타로와 사주 풀이를 보는 곳이에요. 연 풀이는 밤하늘에 별을 하나씩 적어 두듯 내 기록으로 쌓여요.`}
    >
      <section className={s.group} aria-labelledby="cast-title">
        <h2 id="cast-title" className={s.groupTitle}>
          두 안내자가 읽어 줘요
        </h2>
        <div className={s.cast}>
          <div className={s.castCard}>
            <span className={s.castMode}>타로</span>
            <Cat outfit="tarot" size={96} reactOnTap={false} />
            <p className={s.castName}>고양이 점성술사</p>
            <p className={s.castRole}>카드를 섞고, 그림에 담긴 장면을 내 이야기에 비춰 읽어요</p>
          </div>
          <div className={s.castCard}>
            <span className={s.castMode}>사주</span>
            <Rabbit outfit="hanbok" size={96} reactOnTap={false} />
            <p className={s.castName}>토끼 선생님</p>
            <p className={s.castRole}>한복을 입고, 태어난 날로 세운 명식을 차근차근 읽어요</p>
          </div>
        </div>
      </section>

      <section className={legal.section} aria-labelledby="what-title">
        <h2 id="what-title" className={legal.sectionTitle}>
          무엇을 볼 수 있나요
        </h2>
        <Facts
          stack
          rows={[
            ["타로", "누구, 무엇, 언제를 골라 질문을 만들고 카드 세 장을 뽑아요. 카드 그림에 그려진 장면을 내 상황에 비춰 읽어 드려요."],
            ["사주", "태어난 날과 곳으로 명식을 세우고, 타고난 결과 지금 지나는 10년의 흐름을 읽어요."],
            ["매일", "고민 하나에 한 장을 뽑는 지금의 한 장, 하루 한 번 여는 오늘의 한 장이 있어요."],
          ]}
        />
      </section>

      <section className={legal.section} aria-labelledby="records-title">
        <h2 id="records-title" className={legal.sectionTitle}>
          내 기록은 내 기기에 남아요
        </h2>
        <p>
          로그인하지 않아도 쓸 수 있어요. 연 풀이와 입력한 정보는 지금 쓰는 기기의 브라우저에 보관돼요. 로그인해 결제하고 연 풀이는
          계정에도 보관돼 다른 기기에서 볼 수 있어요. 로그인하지 않고 연 풀이는 {nameKo} 서버에 저장하지 않아요. 풀이를 만드는
          동안에만 필요한 내용을 AI에게 보내요.
        </p>
      </section>

      <section className={legal.section} aria-labelledby="wont-title">
        <h2 id="wont-title" className={legal.sectionTitle}>
          {`${nameKo}가 하지 않는 것`}
        </h2>
        <ul className={s.notList}>
          {WONT.map((line) => (
            <li key={line}>
              <Slash />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className={legal.muted}>풀이는 AI가 만든 글이고, 재미와 자기 성찰을 위한 참고용이에요.</p>
      </section>

      <section className={legal.section} aria-labelledby="maker-title">
        <h2 id="maker-title" className={legal.sectionTitle}>
          만드는 곳
        </h2>
        <p>
          {`${withParticle(business.name, "이/가")} 만들고 운영해요.`}
          {email ? ` 궁금한 점이나 풀이 오류는 ${email}로 알려 주세요.` : null}
        </p>
        <BusinessFacts />
      </section>

      <div className={s.actions}>
        <Button href={NEW_TAROT_HREF} block>
          타로 보기
        </Button>
        <Button href={NEW_SAJU_HREF} variant="secondary" block>
          사주 보기
        </Button>
      </div>

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
