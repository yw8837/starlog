import type { ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { Stepper } from "@/components/tarot/Stepper";
import { SITE, businessFields } from "@/lib/config";
import { koreanDate } from "@/lib/legal";
import s from "./legal.module.css";

type LegalPageProps = {
  title: string;
  /** Small pill after the title (e.g. "베타"). */
  badge?: string;
  lead?: ReactNode;
  /** ISO date; shown as "시행일 2026년 10월 1일". */
  effective?: string;
  children: ReactNode;
};

/** Frame for the pricing and policy pages: back bar, one <h1>, a 720px reading column, footer. */
export function LegalPage({ title, badge, lead, effective, children }: LegalPageProps) {
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} seed={23} />
      <main className={s.col}>
        <Stepper label={title} backHref="/" backLabel="홈으로" />
        <article className={s.doc} aria-labelledby="doc-title">
          <header className={s.head}>
            <h1 id="doc-title" className={s.title}>
              {title}
              {badge ? <span className={s.badge}>{badge}</span> : null}
            </h1>
            {lead ? <p className={s.lead}>{lead}</p> : null}
            {effective ? (
              <p className={s.meta}>
                {"시행일 "}
                <time dateTime={effective}>{koreanDate(effective)}</time>
              </p>
            ) : null}
          </header>
          {children}
        </article>
      </main>
      <Footer />
    </div>
  );
}

type SectionProps = { id: string; title: string; children: ReactNode };

/** One numbered article or topic: an <h2> and its body, linkable by id. */
export function LegalSection({ id, title, children }: SectionProps) {
  return (
    <section id={id} className={s.section} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={s.sectionTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Calm boxed notice inside a document (not an alert). */
export function LegalNote({ children }: { children: ReactNode }) {
  return <div className={s.note}>{children}</div>;
}

/** Business details as label/value rows: only filled fields, never the postal address. */
export function BusinessFacts() {
  return <Facts rows={businessFields(SITE.business)} />;
}

type FactsProps = {
  rows: ReadonlyArray<readonly [string, ReactNode]>;
  /** Put each label above its value on narrow screens (long labels and values). */
  stack?: boolean;
};

/** Label/value rows, e.g. business details or one processor's transfer facts. */
export function Facts({ rows, stack = false }: FactsProps) {
  return (
    <dl className={stack ? `${s.facts} ${s.factsStack}` : s.facts}>
      {rows.map(([label, value]) => (
        <div key={label} className={s.fact}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
