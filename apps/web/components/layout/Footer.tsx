import Link from "next/link";
import { Fragment } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { SITE, businessFields } from "@/lib/config";
import { guideHostServes, linkHref, type SiteHost } from "@/lib/hosts";
import { INFO_PAGES, SERVICE_LINKS } from "@/lib/infoPages";
import { LEGAL_LINKS } from "@/lib/legal";
import { PremiumFooterLink } from "./PremiumFooterLink";
import styles from "./Footer.module.css";

type FooterLink = { href: string; label: string; emphasis?: boolean };

/** Shorter footer labels, so the row holds one line beside the wordmark on desktop. */
const SHORT_LABEL: Readonly<Record<string, string>> = { [INFO_PAGES.how.path]: "풀이 과정", [INFO_PAGES.evidence.path]: "근거 자료", [INFO_PAGES.faq.path]: "FAQ" };

/** On the guide host: the articles are not advice (the terms say the same of the readings, in the same words). */
const GUIDE_NOTICE = "가이드 글은 오락과 자기 성찰을 위한 참고 콘텐츠예요. 의료, 법률, 투자, 진로 같은 전문적인 판단을 대신하지 않아요.";

/**
 * The 방문 통계 setting (app/privacy/page.tsx #analytics), last. A path on every host: both serve /privacy, and the choice
 * is kept per host, so it must open where the visitor is.
 */
const ANALYTICS_SETTING = { href: "/privacy#analytics", label: "방문 통계 설정" };

/** What the service is and how it works, then prices and policies: one wrapped row. */
const LINKS: ReadonlyArray<FooterLink> = [...SERVICE_LINKS, ...LEGAL_LINKS].map((link) => ({ ...link, label: SHORT_LABEL[link.href] ?? link.label }));

/**
 * One block: the wordmark and a one-line tagline, one wrapped row of links, then the business
 * notice (its fields come from businessFields in lib/config.ts). Items are spaced with gaps, never
 * with "·", so a wrapped line never starts or ends on a separator, and every line may wrap inside
 * the column (the address is longer than a phone is wide). The guide pages pass `host="guide"`: they
 * live on the root domain, so their links to the app go to the app host when the hosts are split
 * (lib/hosts.ts), except the operator's page and the policies it serves itself; on the app host only
 * the guide link leaves the page. They also say what the articles are: reference content, not advice.
 * The 404 page is the same on both hosts and passes `host="either"`: every link names the host that
 * serves it, so none takes a redirect.
 */
export function Footer({ host = "app" }: { host?: SiteHost | "either" }) {
  const fields = businessFields(SITE.business);
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Wordmark className={styles.logo} />
          <p className={styles.tagline}>카드와 사주로 쌓는 나의 이야기</p>
        </div>
        <nav className={styles.nav} aria-label="사이트 안내">
          <ul className={styles.links}>
            {LINKS.map((link) => (
              <Fragment key={link.href}>
                <li>
                  {/* The root domain renders this footer on /about, /privacy and /terms too (F-05). */}
                  <Link href={linkHref(link.href, host)} prefetch={guideHostServes(link.href) ? undefined : false} className={styles.link}>
                    {link.emphasis ? <strong className={styles.strong}>{link.label}</strong> : link.label}
                  </Link>
                </li>
                {/* 프리미엄 풀이 after 가격 안내 where premium is visible (plan-reconciled §4.5); nothing while it is off. */}
                {link.href === "/pricing" ? <PremiumFooterLink host={host} /> : null}
              </Fragment>
            ))}
            <li>
              <Link href={ANALYTICS_SETTING.href} className={styles.link}>
                {ANALYTICS_SETTING.label}
              </Link>
            </li>
          </ul>
        </nav>
        {host === "guide" ? <p className={styles.business}>{GUIDE_NOTICE}</p> : null}
        {fields.length > 0 ? (
          <ul className={styles.business} aria-label="사업자 정보">
            {fields.map(([label, value]) => (
              <li key={label} className={styles.field}>
                <span className={styles.fieldLabel}>{label}</span> {value}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </footer>
  );
}
