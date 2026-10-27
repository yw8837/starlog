import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { JsonLd } from "@/components/seo/JsonLd";
import { NightSky } from "@/components/sky/NightSky";
import { Stepper } from "@/components/tarot/Stepper";
import { ShareButton } from "@/components/ui/ShareButton";
import { SITE } from "@/lib/config";
import { breadcrumbJsonLd } from "@/lib/jsonld";
import { ILJU, KEYWORD_PATH, KEYWORD_TITLE, iljuBySlug, keywordImagePath, keywordPath, type Ilju } from "@/lib/keyword2027";
import { KEYWORD_NOTES, contentOf, reasonLines } from "@/lib/keyword2027Content";
import { particle } from "@/lib/korean";
import { NOINDEX_FOLLOW, NOT_FOUND_METADATA, pageMetadata } from "@/lib/seo";
import { KeywordForm } from "../KeywordForm";
import s from "../keyword.module.css";
import { KeywordCtas } from "./KeywordCtas";

/** The 60 일주, built ahead; any other address is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return ILJU.map((ilju) => ({ ilju: ilju.slug }));
}

/** "'꺼내 보이기'예요", "'무대 체질'이에요": the copula follows the keyword's last syllable. */
const isKeyword = (keyword: string) => `'${keyword}'${particle(keyword, "이/가") === "이" ? "이에요" : "예요"}`;

export async function generateMetadata({ params }: PageProps<"/2027-keyword/[ilju]">): Promise<Metadata> {
  const ilju = iljuBySlug((await params).ilju);
  if (!ilju) return NOT_FOUND_METADATA;
  const { keyword, brings } = contentOf(ilju);
  const base = pageMetadata({
    title: `${ilju.ko}일주 2027년 키워드 '${keyword}'`,
    description: `${ilju.ko}일주의 2027년 정미년 키워드는 ${isKeyword(keyword)}. ${brings} 조심할 것과 작게 해 볼 일도 함께 보고, 내 키워드도 찾아보세요.`,
    path: keywordPath(ilju),
  });
  // The 일주's own card (the keyword big), in place of the site's picture.
  const image = { url: keywordImagePath(ilju), width: 1200, height: 630, alt: `${ilju.ko}일주의 2027년 키워드: ${keyword} · ${KEYWORD_TITLE} · ${SITE.nameKo}` };
  return { ...base, robots: NOINDEX_FOLLOW, openGraph: { ...base.openGraph, images: [image] } };
}

const MARK = { good: "✔︎", care: "⚠︎", then: "→" } as const;

/**
 * One 일주's 2027 keyword, the same page for whoever opens it: the person who just entered a birth date (the date
 * itself never reaches this page) and a friend who opened a shared link, who finds their own below.
 */
export default async function KeywordResultPage({ params }: PageProps<"/2027-keyword/[ilju]">) {
  const ilju: Ilju | null = iljuBySlug((await params).ilju);
  if (!ilju) notFound();
  const content = contentOf(ilju);
  const url = `${SITE.url}${keywordPath(ilju)}`;
  const items = [
    { key: "brings", tone: s.good, mark: MARK.good, label: "2027년엔", text: content.brings },
    { key: "watch", tone: s.care, mark: MARK.care, label: "조심할 것", text: content.watch },
    { key: "action", tone: s.then, mark: MARK.then, label: "작게 해 볼 일", text: content.action },
  ];
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={27} />
      <main className={`page-col ${s.screen}`}>
        <JsonLd
          data={breadcrumbJsonLd([
            { name: SITE.nameKo, path: "/" },
            { name: KEYWORD_TITLE, path: KEYWORD_PATH },
            { name: `${ilju.ko}일주`, path: keywordPath(ilju) },
          ])}
        />
        <Stepper label={KEYWORD_TITLE} backHref={KEYWORD_PATH} backLabel="내 키워드 찾기로" />

        <section className={s.result} aria-labelledby="keyword-title">
          <h1 id="keyword-title" className={s.title}>
            {`${ilju.ko}일주의 2027년`}
          </h1>
          <div className={s.keywordBlock}>
            <p className={s.keywordLabel}>키워드</p>
            <p className={s.keyword}>{content.keyword}</p>
          </div>
          <dl className={s.list}>
            {items.map((item) => (
              <div key={item.key} className={`${s.item} ${item.tone}`}>
                <dt className={s.label}>
                  <span className={s.mark} aria-hidden="true">
                    {item.mark}
                  </span>
                  <span>{item.label}</span>
                </dt>
                <dd className={s.text}>{item.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className={s.share}>
          <ShareButton
            text={`${ilju.ko}일주의 2027년 키워드는 '${content.keyword}' · ${KEYWORD_TITLE}`}
            target={{ url, imageUrl: `${SITE.url}${keywordImagePath(ilju)}`, button: "내 키워드 찾기", description: content.brings, imageSize: { width: 1200, height: 630 } }}
          />
        </div>

        <KeywordCtas />
        <a href="#find" className={s.friend}>
          친구 생일로도 해 보기
        </a>

        <section className={s.section} aria-labelledby="keyword-why">
          <h2 id="keyword-why" className={s.sectionTitle}>
            이렇게 골랐어요
          </h2>
          {reasonLines(ilju).map((line) => (
            <p key={line} className={s.prose}>
              {line}
            </p>
          ))}
        </section>

        <section id="find" className={`${s.section} ${s.find}`} aria-labelledby="keyword-find">
          <h2 id="keyword-find" className={s.sectionTitle}>
            내 키워드 찾기
          </h2>
          <p className={s.prose}>생일을 넣으면 그 일주의 2027년 키워드로 바로 가요.</p>
          <KeywordForm primary={false} />
        </section>

        <ul className={s.notes}>
          {KEYWORD_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </main>
      <Footer />
    </div>
  );
}
