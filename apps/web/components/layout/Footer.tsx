import Link from "next/link";
import { Fragment } from "react";
import { SITE, footerNotice } from "@/lib/config";
import { SERVICE_LINKS } from "@/lib/infoPages";
import { LEGAL_LINKS } from "@/lib/legal";
import styles from "./Footer.module.css";

type FooterLink = { href: string; label: string; emphasis?: boolean };

function LinkRow({ label, links }: { label: string; links: ReadonlyArray<FooterLink> }) {
  return (
    <nav aria-label={label}>
      <ul className={styles.links}>
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className={styles.link}>
              {link.emphasis ? <strong className={styles.strong}>{link.label}</strong> : link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Two link rows (what the service is and how it works; then prices and policies), then the
 * business notice (its fields are chosen in lib/config.ts).
 */
export function Footer() {
  const notice = footerNotice(SITE.business);

  // Each field stays on one line; wrapping only happens between fields.
  return (
    <footer className={styles.footer}>
      <LinkRow label="서비스 안내" links={SERVICE_LINKS} />
      <LinkRow label="약관과 정책" links={LEGAL_LINKS} />
      {notice.length > 0 ? (
        <p className={styles.notice}>
          {notice.map((field, i) => (
            <Fragment key={field}>
              {i > 0 ? " " : null}
              <span className={styles.field}>{i < notice.length - 1 ? `${field} ·` : field}</span>
            </Fragment>
          ))}
        </p>
      ) : null}
    </footer>
  );
}
