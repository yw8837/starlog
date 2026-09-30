import type { ReactNode } from "react";
import s from "./Paper.module.css";

type PaperProps = {
  as?: "article" | "section" | "div";
  className?: string;
  children: ReactNode;
  "aria-labelledby"?: string;
};

/** Brightest surface: reading prose on warm paper, with a navy focus ring. */
export function Paper({ as: Tag = "section", className, children, ...rest }: PaperProps) {
  return (
    <Tag className={className ? `${s.paper} ${className}` : s.paper} {...rest}>
      {children}
    </Tag>
  );
}
