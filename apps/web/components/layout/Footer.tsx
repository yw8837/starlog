import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { SITE, businessFields } from "@/lib/config";
import { SERVICE_LINKS } from "@/lib/infoPages";
import { LEGAL_LINKS } from "@/lib/legal";
import styles from "./Footer.module.css";

type FooterLink = { href: string; label: string; emphasis?: boolean };

/** What the service is and how it works, then prices and policies: one wrapped row. */
const LINKS: ReadonlyArray<FooterLink> = [...SERVICE_LINKS, ...LEGAL_LINKS];

/**
 * One block: the wordmark and a one-line tagline, one wrapped row of links, then the business
 * notice (its fields come from businessFields in lib/config.ts). Items are spaced with gaps, never
 * with "·", so a wrapped line never starts or ends on a separator, and every line may wrap inside
 * the column (the address is longer than a phone is wide).
 */
export function Footer() {
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
              <li key={link.href}>
                <Link href={link.href} className={styles.link}>
                  {link.emphasis ? <strong className={styles.strong}>{link.label}</strong> : link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
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
