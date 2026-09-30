import { SITE } from "@/lib/config";
import s from "./Wordmark.module.css";

/** Five-point star in a 24×24 box; the OG image draws the same path. */
export const WORDMARK_STAR_PATH = "M12 2.5l2.8 6.2 6.7.6-5.1 4.4 1.6 6.6L12 16.8 6 20.3l1.6-6.6-5.1-4.4 6.7-.6z";

/** Splits the service name around its last "o", which the wordmark draws as a star. */
export function wordmarkParts(name: string = SITE.name): { head: string; tail: string } {
  const at = name.lastIndexOf("o");
  return at < 0 ? { head: name, tail: "" } : { head: name.slice(0, at), tail: name.slice(at + 1) };
}

/** "Starl★g": the o is a gold five-point star. Assistive tech reads the plain service name. */
export function Wordmark({ className }: { className?: string }) {
  const { head, tail } = wordmarkParts();
  return (
    <span className={className ? `${s.wordmark} ${className}` : s.wordmark} role="img" aria-label={SITE.name}>
      <span aria-hidden="true">{head}</span>
      <svg className={s.star} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={WORDMARK_STAR_PATH} />
      </svg>
      <span aria-hidden="true">{tail}</span>
    </span>
  );
}
