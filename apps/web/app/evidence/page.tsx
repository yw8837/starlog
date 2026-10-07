import type { Metadata } from "next";
import Link from "next/link";
import { ChevronIcon } from "@/components/home/icons";
import { InfoPage } from "@/components/info/InfoPage";
import s from "@/components/info/info.module.css";
import legal from "@/components/legal/legal.module.css";
import { evidenceHighlights, evidenceItems, evidenceSources, type EvidenceArea } from "@/lib/evidence";
import { INFO_PAGES } from "@/lib/infoPages";
import { pageMetadata } from "@/lib/seo";
import e from "./evidence.module.css";

const page = INFO_PAGES.evidence;

export const metadata: Metadata = pageMetadata({ title: page.title, description: page.description, path: page.path });

/** One section per area; its id is what the guide articles' source lines link to (lib/evidence.ts evidenceHref). */
const AREAS: ReadonlyArray<{ id: EvidenceArea; label: string; sub: string }> = [
  { id: "tarot", label: "타로", sub: "카드 그림과 원전, 요즘 해석을 무엇과 맞춰 봤는지 모았어요." },
  { id: "saju", label: "사주", sub: "명식을 세우는 달력과 시각을 무엇과 대조했는지 모았어요." },
];

/**
 * How the KB and the readings are written: Waite kept verbatim in the KB and quoted with its page on
 * card articles (content/kb/README.md, lib/evidence.ts), no third-party sentences, and no school-bound
 * saju labels (the saju prompt and validate.ts refuse 신강·신약, 용신, 격국).
 */
const HOW_WE_WRITE = [
  ["원전은 쪽수까지 밝혀 인용해요.", "웨이트의 원전은 저작권이 끝난 공개 자료예요. 카드 데이터에는 원문을 그대로 두고, 카드 가이드 글에는 우리말로 옮긴 문장을 쪽수와 함께 실어요."],
  ["요즘 해석은 우리 말로 써요.", "여러 레퍼런스와 맞춰 보되, 다른 사이트의 문장은 옮기지 않고 직접 쓴 문장으로 담아요."],
  ["유파마다 갈리는 라벨은 붙이지 않아요.", "용신이나 신강·신약처럼 보는 사람마다 결과가 다른 라벨 대신, 명식에서 확인할 수 있는 사실을 보여 드려요."],
] as const;

/** 스타로그의 근거: every fact of content/evidence.json and the two source books, as cards per area. */
export default function EvidencePage() {
  const related = [INFO_PAGES.about, INFO_PAGES.how, INFO_PAGES.faq];

  return (
    <InfoPage eyebrow="EVIDENCE" title={page.title} lead="타로와 사주 풀이가 무엇을 바탕으로 하는지 출처와 숫자로 하나씩 적었어요.">
      <section aria-labelledby="glance-title" className={e.glance}>
        <h2 id="glance-title" className={e.srOnly}>
          한눈에 보기
        </h2>
        <ul className={e.tiles}>
          {evidenceHighlights().map((tile) => (
            <li key={tile.label} className={e.tile}>
              <strong className={e.tileValue}>{tile.value}</strong>
              <span className={e.tileLabel}>{tile.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <nav aria-label="근거 분류">
        <ul className={s.chips}>
          {AREAS.map((area) => (
            <li key={area.id}>
              <a href={`#${area.id}`} className={s.chip}>
                <span className={s.dot} data-tone={area.id} aria-hidden="true" />
                {area.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {AREAS.map((area) => (
        <section key={area.id} id={area.id} className={s.group} aria-labelledby={`${area.id}-title`}>
          <div className={s.groupHead}>
            <h2 id={`${area.id}-title`} className={`${s.groupTitle} ${s.groupTitleDot}`}>
              <span className={s.dot} data-tone={area.id} aria-hidden="true" />
              {area.label}
            </h2>
            <p className={s.groupSub}>{area.sub}</p>
          </div>
          <ul className={s.list}>
            {evidenceItems(area.id).map((item) => (
              <li key={item.id}>
                <div className={e.card}>
                  <h3 className={e.label}>{item.labelKo}</h3>
                  <p className={e.value}>{item.valueKo}</p>
                  <p className={e.detail}>{item.detailKo}</p>
                  {item.link ? (
                    <a href={item.link.href} className={s.more}>
                      {item.link.label}
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="sources-title" className={e.sources}>
        <h2 id="sources-title" className={e.sourcesTitle}>
          주요 원전·자료
        </h2>
        <ul className={e.sourceList}>
          {evidenceSources().map((source) => (
            <li key={source.title} className={e.sourceRow}>
              <span className={e.kind}>{source.kind}</span>
              <span className={e.sourceText}>
                <span className={e.sourceTitle}>{source.title}</span>
                <span className={e.sourceNote}>{source.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section id="how-we-write" className={legal.section} aria-labelledby="write-title">
        <h2 id="write-title" className={legal.sectionTitle}>
          이렇게 써요
        </h2>
        <ul className={legal.list}>
          {HOW_WE_WRITE.map(([title, text]) => (
            <li key={title}>
              <strong>{title}</strong> {text}
            </li>
          ))}
        </ul>
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
