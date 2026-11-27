import type { ReactNode } from "react";
import s from "./Paper.module.css";

type PaperProps = {
  as?: "article" | "section" | "div";
  className?: string;
  children: ReactNode;
  "aria-labelledby"?: string;
  /** A fixed place in the reading (골라 읽기, spec 2026-11-26 beyond trend §2), focusable by script (tabIndex -1). */
  id?: string;
  tabIndex?: number;
};

/** Brightest surface: reading prose on warm paper, with a navy focus ring. */
export function Paper({ as: Tag = "section", className, children, ...rest }: PaperProps) {
  return (
    <Tag className={className ? `${s.paper} ${className}` : s.paper} {...rest}>
      {children}
    </Tag>
  );
}
