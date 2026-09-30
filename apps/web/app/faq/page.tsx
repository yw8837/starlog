import type { Metadata } from "next";
import Link from "next/link";
import { AccordionItem, InfoPage } from "@/components/info/InfoPage";
import s from "@/components/info/info.module.css";
import { faqGroups, faqJsonLd, jsonLdScript } from "@/lib/faq";
import { INFO_PAGES } from "@/lib/infoPages";

const page = INFO_PAGES.faq;

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  alternates: { canonical: page.path },
};

/** 자주 묻는 질문: the 이용 가이드 cards with a Q mark, and the same text as FAQPage JSON-LD. */
export default function FaqPage() {
  const groups = faqGroups();

  return (
    <InfoPage eyebrow="FAQ" title={page.title} lead="처음 쓰기 전에 많이 묻는 것부터 모았어요.">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(groups)) }} />

      {groups.map((group) => (
        <section key={group.id} id={group.id} className={s.group} aria-labelledby={`${group.id}-title`}>
          <h2 id={`${group.id}-title`} className={s.groupTitle}>
            {group.label}
          </h2>
          <ul className={s.list}>
            {group.entries.map((entry) => (
              <li key={entry.id}>
                <AccordionItem id={entry.id} title={entry.q}>
                  {entry.a.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {entry.link ? (
                    <Link href={entry.link.href} className={s.more}>
                      {entry.link.label}
                    </Link>
                  ) : null}
                </AccordionItem>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className={s.closing} aria-labelledby="faq-more">
        <h2 id="faq-more" className={s.closingTitle}>
          기능이 궁금하다면
        </h2>
        <p className={s.closingText}>카드 고르기, 시간 모를 때 사주 보기, 이어서 물어보기처럼 쓰는 법은 이용 가이드에 하나씩 적어 두었어요.</p>
        <Link href={INFO_PAGES.help.path} className={s.more}>
          이용 가이드 보기
        </Link>
      </section>
    </InfoPage>
  );
}
