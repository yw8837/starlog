import Link from "next/link";
import type { ReactNode } from "react";
import s from "./ToolGuide.module.css";

/** A link the guide shows: a path on this host, or a guide article's URL (lib/hosts guideHref). */
export interface GuideLink {
  href: string;
  label: string;
}

export interface ToolGuideProps {
  /** The heading's id, for aria-labelledby. */
  id: string;
  title: string;
  intro: ReactNode[];
  steps: { title: string; items: ReactNode[] };
  /** More short parts under their own heading: paragraphs, or a bulleted list with `list`; `note` follows the items. */
  parts?: { title: string; items: ReactNode[]; list?: boolean; note?: ReactNode }[];
  links: { title: string; items: GuideLink[] };
  faq: { title: string; items: { q: string; a: ReactNode }[] };
}

/**
 * What a tool page does, how it works, what is free and what to read next, server-rendered under the tool (SEO plan
 * 2026-10-08, B1: the tool pages carry 타로·사주·무료 타로, and their HTML had almost no text).
 */
export function ToolGuide({ id, title, intro, steps, parts = [], links, faq }: ToolGuideProps) {
  return (
    <section className={s.guide} aria-labelledby={id}>
      <h2 id={id} className={s.title}>
        {title}
      </h2>
      {intro.map((p, i) => (
        <p key={i}>{p}</p>
      ))}

      <h3 className={s.heading}>{steps.title}</h3>
      <ol className={s.list}>
        {steps.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>

      {parts.map((part) => (
        <div key={part.title}>
          <h3 className={s.heading}>{part.title}</h3>
          {part.list ? (
            <ul className={s.list}>
              {part.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : (
            part.items.map((item, i) => <p key={i}>{item}</p>)
          )}
          {part.note}
        </div>
      ))}

      <h3 className={s.heading}>{links.title}</h3>
      <ul className={s.links}>
        {links.items.map((link) => (
          <li key={link.href}>
            {/^https?:/.test(link.href) ? <a href={link.href}>{link.label}</a> : <Link href={link.href}>{link.label}</Link>}
          </li>
        ))}
      </ul>

      <h3 className={s.heading}>{faq.title}</h3>
      <dl className={s.faq}>
        {faq.items.map((item) => (
          <div key={item.q}>
            <dt>{item.q}</dt>
            <dd>{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
