import { Fragment } from "react";
import { SITE, footerNotice } from "@/lib/config";
import styles from "./Footer.module.css";

export function Footer() {
  const notice = footerNotice(SITE.business);
  if (notice.length === 0) return null;

  // Each field stays on one line; wrapping only happens between fields.
  return (
    <footer className={styles.footer}>
      <p className={styles.notice}>
        {notice.map((field, i) => (
          <Fragment key={field}>
            {i > 0 ? " " : null}
            <span className={styles.field}>{i < notice.length - 1 ? `${field} ·` : field}</span>
          </Fragment>
        ))}
      </p>
    </footer>
  );
}
