import Link from "next/link";
import { guideLinkTarget, inlineParts } from "@/lib/guideLinks";
import { appHref } from "@/lib/hosts";
import s from "./GuideBlocks.module.css";

/**
 * An article's text with its [텍스트](주소) links (lib/guideLinks.ts): a guide page stays a path on the root domain, an app
 * page goes to the app host through appHref (never prefetched from the root domain, F-05), a source opens in a new tab
 * with rel="noopener". A refused address shows as its words only.
 */
export function GuideText({ text }: { text: string }) {
  return inlineParts(text).map((part, i) => {
    if (typeof part === "string") return part;
    const target = guideLinkTarget(part.url);
    if (!target) return part.text;
    if (target.kind === "guide") {
      return (
        <Link key={i} href={target.path} className={s.link}>
          {part.text}
        </Link>
      );
    }
    if (target.kind === "app") {
      return (
        <Link key={i} href={appHref(target.path)} prefetch={false} className={s.link}>
          {part.text}
        </Link>
      );
    }
    return (
      <a key={i} href={target.url} target="_blank" rel="noopener" className={s.link}>
        {part.text}
      </a>
    );
  });
}
