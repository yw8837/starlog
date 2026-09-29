import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./Button.module.css";

type ButtonProps = {
  variant?: "primary" | "secondary" | "ghost";
  size?: "lg" | "md";
  /** Stretch to the width of its container. */
  block?: boolean;
  /** Renders a link instead of a button. */
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  /** Icon or arrow shown after the label. */
  trailing?: ReactNode;
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
  children,
}: ButtonProps) {
  const className = [styles.btn, styles[variant], styles[size], block ? styles.block : ""]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      <span>{children}</span>
      {trailing ? <span className={styles.trailing} aria-hidden="true">{trailing}</span> : null}
    </>
  );

  if (href && !disabled) {
    return (
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
