import Link from "next/link";
import { Fragment } from "react";
import { SITE, footerNotice } from "@/lib/config";
import { LEGAL_LINKS } from "@/lib/legal";
import styles from "./Footer.module.css";

export function Footer() {
  const notice = footerNotice(SITE.business);

  // Each field stays on one line; wrapping only happens between fields.
  return (
    <footer className={styles.footer}>
      <nav aria-label="약관과 정책">
        <ul className={styles.links}>
          {LEGAL_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className={styles.link}>
                {"emphasis" in link && link.emphasis ? <strong className={styles.strong}>{link.label}</strong> : link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
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
