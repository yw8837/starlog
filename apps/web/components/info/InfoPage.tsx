import type { ReactNode } from "react";
import legal from "@/components/legal/legal.module.css";
import { Footer } from "@/components/layout/Footer";
import { TabBar, type TabId } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { Stepper } from "@/components/tarot/Stepper";
import { InfoIcon } from "./icons";
import type { HelpIcon } from "@/lib/helpGuide";
import type { SiteHost } from "@/lib/hosts";
import s from "./info.module.css";

type InfoPageProps = {
  title: string;
  /** Small spaced caps line above the title. */
  eyebrow?: string;
  lead?: ReactNode;
  /** The desktop header's pill to light (/faq has one); phones keep the back bar only. */
  tab?: TabId;
  /** "either" for a page the root domain serves too (/about): its header and footer links then name their host. */
  host?: SiteHost | "either";
  children: ReactNode;
};

/**
 * Frame for the service pages (/about, /how, /help, /faq): the policy pages' reading column and
 * back bar, with an eyebrow over the one <h1>. Desktop adds the site header, so the header's FAQ
 * pill never leads to a page without it.
 */
export function InfoPage({ title, eyebrow, lead, tab, host = "app", children }: InfoPageProps) {
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={31} />
      <TabBar active={tab} only="desktop" host={host} />
      <main className={legal.col}>
        <Stepper label={title} backHref="/" backLabel="홈으로" />
        <article className={`${legal.doc} ${s.doc}`} aria-labelledby="doc-title">
          <header className={legal.head}>
            {eyebrow ? <p className={s.eyebrow}>{eyebrow}</p> : null}
            <h1 id="doc-title" className={legal.title}>
              {title}
            </h1>
            {lead ? <p className={legal.lead}>{lead}</p> : null}
          </header>
          {children}
        </article>
      </main>
      <Footer host={host} />
    </div>
  );
}

type AccordionItemProps = {
  id?: string;
  /** Line icon in a round badge (이용 가이드); leave out for the FAQ's Q mark. */
  icon?: HelpIcon;
  title: string;
  sub?: string;
  children: ReactNode;
};

/**
 * One card that opens in place: native <details>, so it works before hydration, with the keyboard,
 * and with find-in-page. The whole summary row is the 44px+ target. The summary holds phrasing
 * content only (a heading there would be flattened into the disclosure button anyway).
 */
export function AccordionItem({ id, icon, title, sub, children }: AccordionItemProps) {
  return (
    <details id={id} className={s.item}>
      <summary className={s.summary}>
        <span className={icon ? s.badge : `${s.badge} ${s.badgeQ}`} aria-hidden="true">
          {icon ? <InfoIcon name={icon} /> : "Q"}
        </span>
        <span className={s.summaryText}>
          <span className={s.itemTitle}>{title}</span>
          {sub ? <span className={s.itemSub}>{sub}</span> : null}
        </span>
        <span className={s.toggle} aria-hidden="true" />
      </summary>
      <div className={s.body}>{children}</div>
    </details>
  );
}

/** Numbered how-to steps inside a card. */
export function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className={s.steps}>
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}

/** A quiet aside inside a card. */
export function Tip({ children }: { children: ReactNode }) {
  return (
    <p className={s.tip}>
      <span className={s.tipLabel}>팁</span>
      <span>{children}</span>
    </p>
  );
}
