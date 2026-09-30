import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./Button.module.css";

type ButtonProps = {
  variant?: "primary" | "secondary" | "ghost";
  size?: "lg" | "md";
  /** Stretch to the width of its container. */
  block?: boolean;
  /** Renders a link instead of a button. With `disabled`, a dimmed link that cannot be followed. */
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  /** Icon or arrow shown after the label. */
  trailing?: ReactNode;
  /** Dark-ink secondary/ghost styles for buttons placed on a paper card. */
  onPaper?: boolean;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "lg",
  block = false,
  href,
  onClick,
  disabled = false,
  type = "button",
  trailing,
  onPaper = false,
  children,
}: ButtonProps) {
  const className = [styles.btn, styles[variant], styles[size], block ? styles.block : "", onPaper ? styles.onPaper : ""]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      <span>{children}</span>
      {trailing ? <span className={styles.trailing} aria-hidden="true">{trailing}</span> : null}
    </>
  );

  if (href) {
    // A disabled link stays a link for assistive tech ("link, dimmed") but has no href, so it
    // cannot be focused or followed; it never silently turns into a button.
    return disabled ? (
      <a role="link" aria-disabled="true" className={className}>
        {content}
      </a>
    ) : (
      <Link href={href} className={className} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <button type={type} className={className} onClick={onClick} disabled={disabled}>
      {content}
    </button>
  );
}
