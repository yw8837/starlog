import { STEMS, STEMS_KO } from "@starlog/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { Stepper } from "@/components/tarot/Stepper";
import { ILJU, KEYWORD_PATH, KEYWORD_TITLE, keywordPath } from "@/lib/keyword2027";
import { KEYWORD_NOTES, STEM_GODS, STEM_MEETING, contentOf } from "@/lib/keyword2027Content";
import { pageMetadata } from "@/lib/seo";
import { KeywordForm } from "./KeywordForm";
import s from "./keyword.module.css";

export const metadata: Metadata = pageMetadata({
  title: `${KEYWORD_TITLE} · 생일로 보는 무료 사주 테스트`,
  description: "생일만 넣으면 태어난 날의 일주로 2027년 정미년 나의 키워드를 골라 드려요. 2027년에 올 것, 조심할 것, 작게 해 볼 일까지 60일주마다 달라요.",
  path: KEYWORD_PATH,
});

/**
 * 2027년 나의 키워드 (free test ②): the birth date form, how the keyword is chosen, and the 60 일주 pages linked by
 * name, so a friend's 일주 is one tap away and a crawler finds them from here as well as from the sitemap.
 */
export default function KeywordTestPage() {
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={27} />
      <main className={`page-col ${s.screen}`}>
        <Stepper label={KEYWORD_TITLE} backHref="/" backLabel="홈으로" />
        <header className={s.intro}>
          <p className={s.eyebrow}>무료 사주 테스트</p>
          <h1 className={s.title}>{KEYWORD_TITLE}</h1>
          <p className={s.lead}>생일만 넣으면 태어난 날의 두 글자(일주)로 2027년 정미년의 키워드를 골라 드려요.</p>
        </header>

        <KeywordForm />

        <section className={s.section} aria-labelledby="keyword-how">
          <h2 id="keyword-how" className={s.sectionTitle}>
            이렇게 골라요
          </h2>
          <ol className={s.notes}>
            <li>생일로 태어난 날의 두 글자(일주)를 찾아요. 일주는 모두 60가지예요.</li>
            <li>2027년 정미년의 두 글자 丁(정)과 未(미)가 나를 나타내는 글자(일간)에게 어떤 관계(십성)인지 봐요.</li>
            <li>未가 태어난 날의 아래 글자(일지)와 맺는 관계(합·충·형·파·해)를 더해, 일주마다 다른 키워드를 정했어요.</li>
          </ol>
          <ul className={s.notes}>
            {KEYWORD_NOTES.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>

        {/* The first half of the rule above, for all ten day stems: the same table the 60 keywords are written on (lib/keyword2027Content.ts). */}
        <section className={s.section} aria-labelledby="keyword-stems">
          <h2 id="keyword-stems" className={s.sectionTitle}>
            일간마다 정미년이 맡는 자리
          </h2>
          <p className={s.prose}>나를 나타내는 글자(일간)에 따라 2027년의 두 글자가 맡는 자리(십성)가 달라요. 아래 글자 未는 그 안의 본기 己로 봐요.</p>
          <table className={s.table}>
            <caption className={s.caption}>일간별로 본 정미년의 두 글자</caption>
            <thead>
              <tr>
                <th scope="col">일간</th>
                <th scope="col">丁(위 글자)</th>
                <th scope="col">未(아래 글자)</th>
                <th scope="col">丁과 만나는 방식</th>
              </tr>
            </thead>
            <tbody>
              {STEMS.map((stem, i) => (
                <tr key={stem}>
                  <th scope="row">{`${stem}(${STEMS_KO[i]})`}</th>
                  <td>{STEM_GODS[stem].stemGod}</td>
                  <td>{STEM_GODS[stem].branchGod}</td>
                  <td>{STEM_MEETING[stem] ?? "없음"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <details className={s.all}>
          <summary>60일주 키워드 모두 보기</summary>
          <ul className={s.grid}>
            {ILJU.map((ilju) => (
              <li key={ilju.slug}>
                <Link href={keywordPath(ilju)} prefetch={false}>
                  <span className={s.gridName}>{ilju.ko}일주</span>
                  <span className={s.gridKeyword}>{contentOf(ilju).keyword}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      </main>
      <Footer />
    </div>
  );
}
