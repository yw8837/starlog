import { DEFAULT_POLICY, SEOUL } from "@starlog/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { Paper } from "@/components/tarot/Paper";
import { Stepper } from "@/components/tarot/Stepper";
import { SITE, businessFields } from "@/lib/config";
import { guideReferences, modernSourceCount } from "@/lib/evidence";
import { GUIDE_ABOUT_PATH, GUIDE_ARTICLES, GUIDE_CATEGORIES, GUIDE_CATEGORY_LABEL, articlesIn, guideIndexPath, lastReviewed } from "@/lib/guide";
import { appHref, linkHref } from "@/lib/hosts";
import { INFO_PAGES } from "@/lib/infoPages";
import { withParticle } from "@/lib/korean";
import { koreanDate } from "@/lib/legal";
import { policyLines } from "@/lib/sajuCriteria";
import { pageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, guideAboutCrumbs } from "@/lib/jsonld";
import { GuideBlocks } from "../GuideBlocks";
import { GuideBreadcrumbs } from "../GuideBreadcrumbs";
import s from "../guide.module.css";

const TITLE = "가이드 소개와 편집 원칙";

export const metadata: Metadata = pageMetadata({
  title: TITLE,
  description:
    "스타로그 가이드를 누가, 어떻게, 왜 쓰는지 적었어요. AI 도구로 쓴 초안을 1909년 원판과 웨이트 원전, 만세력 계산 규칙에 맞춰 확인하고, 틀린 곳은 이메일로 받아 고쳐요.",
  path: GUIDE_ABOUT_PATH,
});

/** What each tab covers, in the tabs' own words (app/guide/GuideIndex.tsx). */
const TAB_SCOPE: Record<(typeof GUIDE_CATEGORIES)[number], string> = {
  tarot: "카드 읽는 법, 스프레드, 메이저 아르카나 22장",
  saju: "오행과 천간·지지, 일간과 십신, 대운과 만세력",
};

/**
 * 가이드 소개와 편집 원칙, on the root domain with the guide (the AdSense review's site): Who makes the guide (SITE.business),
 * How an article is written and checked (AI drafts checked against the sources, said as it is, with no review it cannot
 * show), Why it exists, how often it is checked again, how to report an error (#contact), and that tarot and saju are for
 * fun and reflection. The counts, the latest 마지막 검토, the calendar rules (policyLines, the app's own words) and the
 * sources (guideReferences, the articles' rows) are read from the data, so the page never drifts from the guide. No ads.
 */
export default function GuideAboutPage() {
  const latest = GUIDE_ARTICLES.map(lastReviewed)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);
  const email = SITE.business.email.trim();
  const phone = SITE.business.phone.trim();
  const home = linkHref(guideIndexPath("tarot"), "guide");

  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed seed={41} moon={false} />
      <TabBar active="guide" host="guide" />
      <main className="page-col page-wide">
        <JsonLd data={breadcrumbJsonLd(guideAboutCrumbs(TITLE))} />
        <article className={s.article}>
          <Stepper label="가이드" backHref={home} backLabel="가이드 홈으로" />

          <header className={s.head}>
            <GuideBreadcrumbs crumbs={guideAboutCrumbs(TITLE)} />
            <h1 className={s.title}>{TITLE}</h1>
            <p className={s.lead}>스타로그 가이드를 누가, 어떻게, 왜 쓰는지 적었어요. 글이 무엇에 기대는지, 틀린 곳은 어디로 알리면 되는지도 여기 있어요.</p>
          </header>

          <Paper className={s.body}>
            <section className={s.section} aria-labelledby="what-title">
              <h2 id="what-title" className={s.sectionTitle}>
                이 가이드는 무엇인가요
              </h2>
              <p className={s.prose}>
                타로 카드의 뜻과 읽는 법, 사주 명식을 보는 법을 풀어 쓴 글 모음이에요. 타로나 사주를 처음 접하는 분, 풀이를 보기 전에 용어와 기본을 알고 싶은
                분이 카드와 명식을 직접 읽어 볼 수 있게 돕는 참고 자료로 써요.
              </p>
              <GuideBlocks
                id="what"
                blocks={[{ kind: "list", items: GUIDE_CATEGORIES.map((category) => `${GUIDE_CATEGORY_LABEL[category]} 글 ${articlesIn(category).length}편: ${TAB_SCOPE[category]}`) }]}
              />
            </section>

            <section className={s.section} aria-labelledby="who-title">
              <h2 id="who-title" className={s.sectionTitle}>
                누가 만드나요
              </h2>
              <p className={s.prose}>{`타로·사주 앱 ${withParticle(SITE.nameKo, "을/를")} 만드는 ${withParticle(SITE.business.name, "이/가")} 가이드도 쓰고 운영해요.`}</p>
              {/* A list, not a table: the address and the email wrap on a phone instead of scrolling sideways. */}
              <GuideBlocks id="who" blocks={[{ kind: "list", items: businessFields(SITE.business).map(([label, value]) => `${label}: ${value}`) }]} />
            </section>

            <section className={s.section} aria-labelledby="how-title">
              <h2 id="how-title" className={s.sectionTitle}>
                글은 어떻게 쓰나요
              </h2>
              <p className={s.prose}>글은 AI 도구로 초안을 쓰고, 아래 자료와 계산 규칙에 맞춰 사실을 확인한 뒤 올려요. 근거와 맞지 않는 문장은 고치거나 빼요.</p>
              <GuideBlocks
                id="how"
                blocks={[
                  {
                    kind: "steps",
                    items: [
                      { title: "카드 그림", text: "카드 그림을 설명할 때는 1909년 라이더-웨이트-스미스 덱 원판 스캔에 실제로 그려진 것만 적어요." },
                      {
                        title: "카드 뜻",
                        text: `덱을 기획한 A. E. 웨이트의 해설서 『The Pictorial Key to the Tarot』(1910)를 기준으로 삼아요. 저작권 보호 기간이 끝난 퍼블릭 도메인 책이라 원문을 그대로 대조할 수 있어요. 요즘 해석 레퍼런스 ${modernSourceCount()}곳과도 맞춰 봐요.`,
                      },
                      {
                        title: "카드 지식 베이스",
                        text: "78장마다 그림 요소와 정방향·역방향 키워드를 원전에서 옮겨 정리한 스타로그 카드 지식 베이스가 있어요. 카드 글의 키워드 표는 이 지식 베이스의 낱말을 그대로 써요.",
                      },
                      { title: "사주 명식", text: `사주 글의 예시 명식은 ${SITE.nameKo} 앱이 쓰는 만세력 계산으로 직접 세워요. 계산 규칙은 아래와 같아요(서울에서 태어난 경우).` },
                    ],
                  },
                  { kind: "list", items: policyLines(DEFAULT_POLICY, SEOUL) },
                  { kind: "p", text: "결과를 약속하는 말, 다른 사람의 마음을 사실처럼 말하는 문장, 병이나 수명, 사고를 점치는 문장은 쓰지 않아요." },
                ]}
              />
            </section>

            <section className={s.section} aria-labelledby="checks-title">
              <h2 id="checks-title" className={s.sectionTitle}>
                어떻게 확인하나요
              </h2>
              <p className={s.prose}>글을 고칠 때마다 자동 검사를 돌려 아래 내용을 확인해요.</p>
              <GuideBlocks
                id="checks"
                blocks={[
                  {
                    kind: "list",
                    items: [
                      "카드 글의 키워드 표가 카드 지식 베이스의 낱말과 글자 하나까지 같은지",
                      "사주 글의 오행·천간·지지 표와 시각 표가 앱의 만세력 엔진이 내는 값과 같은지",
                      "합격, 재회, 100%처럼 결과를 약속하는 말이 들어가지 않았는지",
                      "글마다 요약과 처음 쓴 날, 마지막 검토 날짜가 있는지",
                    ],
                  },
                  { kind: "callout", tone: "note", title: "자동 검사가 하지 않는 일", text: "자동 검사는 정해 둔 규칙만 확인해요. 해석이 잘 읽히는지까지 판정하지는 않으니, 어색하거나 틀린 곳이 보이면 알려 주세요." },
                ]}
              />
            </section>

            <section className={s.section} aria-labelledby="review-title">
              <h2 id="review-title" className={s.sectionTitle}>
                얼마나 자주 다시 보나요
              </h2>
              <p className={s.prose}>
                모든 글을 석 달에 한 번 이상 근거 자료와 다시 맞춰 봐요. 앱의 계산 규칙이나 근거 자료가 바뀌면 그때 관련 글을 바로 고쳐요.
              </p>
              <GuideBlocks
                id="review"
                blocks={[
                  {
                    kind: "p",
                    text: `글마다 제목 아래에 처음 쓴 날과 마지막 검토 날짜를 적어요. 마지막 검토는 글을 근거와 다시 맞춰 보고 고친 마지막 날이에요.${latest ? ` 지금 가장 최근 검토일은 ${koreanDate(latest)}이에요.` : ""}`,
                  },
                ]}
              />
            </section>

            <section className={s.section} aria-labelledby="disclaimer-title">
              <h2 id="disclaimer-title" className={s.sectionTitle}>
                타로와 사주는 이렇게 읽어 주세요
              </h2>
              <p className={s.prose}>타로와 사주는 재미로 보고, 나를 돌아보는 데 쓰는 참고 콘텐츠예요. 앞일을 맞히거나 결과를 약속하지 않아요.</p>
              <GuideBlocks
                id="disclaimer"
                blocks={[
                  {
                    kind: "callout",
                    tone: "caution",
                    title: "전문가의 판단이 필요한 일",
                    text: "가이드 글은 의료, 법률, 재정 조언이 아니에요. 건강이나 법률 문제, 돈과 투자처럼 전문적인 판단이 필요한 일은 의사, 변호사, 재무 상담사 같은 전문가와 상의해 주세요.",
                  },
                ]}
              />
            </section>

            <section id="contact" className={s.section} aria-labelledby="contact-title">
              <h2 id="contact-title" className={s.sectionTitle}>
                틀린 곳을 알려 주세요
              </h2>
              <p className={s.prose}>
                글에서 틀린 내용이나 오래된 정보를 찾으면 알려 주세요. 글 주소와 어느 문장이 왜 틀렸는지 적어 주시면 확인이 빨라요. 확인해서 고치면 그 글의 마지막 검토
                날짜를 바꿔요.
              </p>
              <ul className={s.contactList}>
                {email ? (
                  <li>
                    {"이메일 "}
                    <a href={`mailto:${email}`} className={s.paperLink}>
                      {email}
                    </a>
                  </li>
                ) : null}
                {phone ? (
                  <li>
                    {"전화 "}
                    <a href={`tel:${phone.replaceAll("-", "")}`} className={s.paperLink}>
                      {phone}
                    </a>
                  </li>
                ) : null}
              </ul>
            </section>

            <section className={s.section} aria-labelledby="sources-title">
              <h2 id="sources-title" className={s.sectionTitle}>
                참고하는 자료
              </h2>
              <p className={s.prose}>타로 글과 사주 글은 각각 아래 자료에 기대요. 글 끝의 이 글에 대해 상자에도 같은 목록이 있어요.</p>
              {/* Lists, not tables: a title and its use wrap on a phone instead of squeezing into two columns. */}
              {GUIDE_CATEGORIES.map((category) => (
                <div key={category}>
                  <h3 className={s.paperSub}>{`${GUIDE_CATEGORY_LABEL[category]} 글이 기대는 자료`}</h3>
                  <GuideBlocks id={`sources-${category}`} blocks={[{ kind: "list", items: guideReferences(category).map((row) => `${row.title}: ${row.note}`) }]} />
                </div>
              ))}
              <p className={s.prose}>
                출처마다 무엇을 어떻게 대조했는지는{" "}
                <Link href={appHref(INFO_PAGES.evidence.path)} prefetch={false} className={s.paperLink}>
                  {INFO_PAGES.evidence.label}
                </Link>
                에 숫자와 함께 적어 뒀어요.
              </p>
            </section>
          </Paper>

          <nav className={s.more} aria-labelledby="about-more-title">
            <h2 id="about-more-title" className={s.moreTitle}>
              더 둘러보기
            </h2>
            <ul className={s.list}>
              {[
                ...GUIDE_CATEGORIES.map((category) => ({ href: linkHref(guideIndexPath(category), "guide"), label: `${GUIDE_CATEGORY_LABEL[category]} 가이드`, desc: TAB_SCOPE[category] })),
                { href: linkHref(INFO_PAGES.about.path, "guide"), label: INFO_PAGES.about.label, desc: "스타로그 앱과 만드는 곳 소개" },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} prefetch={link.href.startsWith("/guide") || link.href === "/" ? undefined : false} className={`${s.item} ${s.itemCompact} ${s.itemPlain}`}>
                    <span className={s.itemText}>
                      <span className={s.itemTitle}>{link.label}</span>
                      <span className={s.itemDesc}>{link.desc}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </article>
      </main>
      <Footer host="guide" />
    </div>
  );
}
