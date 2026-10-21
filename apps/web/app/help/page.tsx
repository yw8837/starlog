import type { Metadata } from "next";
import Link from "next/link";
import { AccordionItem, InfoPage, Steps, Tip } from "@/components/info/InfoPage";
import s from "@/components/info/info.module.css";
import { CrisisContacts } from "@/components/ui/CrisisContacts";
import { OpeningOnly } from "@/components/ui/OpeningOnly";
import { helpGroups } from "@/lib/helpGuide";
import { INFO_PAGES } from "@/lib/infoPages";
import { pageMetadata } from "@/lib/seo";

const page = INFO_PAGES.help;

export const metadata: Metadata = pageMetadata({ title: page.title, description: page.description, path: page.path });

/** 이용 가이드: category chips jump to groups of cards that open in place. */
export default function HelpPage() {
  const groups = helpGroups();

  return (
    <InfoPage eyebrow="USER GUIDE" title={page.title} lead="궁금한 기능을 누르면 쓰는 법이 펼쳐져요.">
      <nav aria-label="이용 가이드 분류">
        <ul className={s.chips}>
          {groups.map((group) => (
            <li key={group.id}>
              <a href={`#${group.id}`} className={s.chip}>
                <span className={s.dot} data-tone={group.id} aria-hidden="true" />
                {group.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {groups.map((group) => (
        <section key={group.id} id={group.id} className={s.group} aria-labelledby={`${group.id}-title`}>
          <div className={s.groupHead}>
            <h2 id={`${group.id}-title`} className={`${s.groupTitle} ${s.groupTitleDot}`}>
              <span className={s.dot} data-tone={group.id} aria-hidden="true" />
              {group.label}
            </h2>
            <p className={s.groupSub}>{group.sub}</p>
          </div>
          <ul className={s.list}>
            {group.items.map((item) => {
              const card = (
                <li key={item.id}>
                  <AccordionItem id={`${group.id}-${item.id}`} icon={item.icon} title={item.title} sub={item.sub}>
                    {item.body ? <p>{item.body}</p> : null}
                    {item.steps ? <Steps steps={item.steps} /> : null}
                    {item.tip ? <Tip>{item.tip}</Tip> : null}
                    {item.crisis ? <CrisisContacts /> : null}
                    {item.link ? (
                      <Link href={item.link.href} className={s.more}>
                        {item.link.label}
                      </Link>
                    ) : null}
                  </AccordionItem>
                </li>
              );
              return item.opening ? <OpeningOnly key={item.id}>{card}</OpeningOnly> : card;
            })}
          </ul>
        </section>
      ))}

      <section className={s.closing} aria-labelledby="help-more">
        <h2 id="help-more" className={s.closingTitle}>
          더 궁금한 게 있다면
        </h2>
        <p className={s.closingText}>무료 범위, 저장, 환불처럼 쓰기 전에 많이 묻는 것은 자주 묻는 질문에 모아 두었어요.</p>
        <Link href={INFO_PAGES.faq.path} className={s.more}>
          자주 묻는 질문 보기
        </Link>
      </section>
    </InfoPage>
  );
}
