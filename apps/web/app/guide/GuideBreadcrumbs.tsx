import Link from "next/link";
import { guideHostServes, linkHref } from "@/lib/hosts";
import type { Crumb } from "@/lib/jsonld";
import s from "./guide.module.css";

/**
 * 현재 위치 above a guide page's title: the very trail its BreadcrumbList JSON-LD carries (the same Crumb[]), each
 * crumb linked to the host that serves it (스타로그 is the app's home), the page itself last and not a link.
 */
export function GuideBreadcrumbs({ crumbs }: { crumbs: readonly Crumb[] }) {
  const last = crumbs.length - 1;
  return (
    <nav className={s.crumbs} aria-label="현재 위치">
      <ol className={s.crumbList}>
        {crumbs.map((crumb, i) =>
          i < last ? (
            <li key={crumb.path} className={s.crumb}>
              <Link href={linkHref(crumb.path, "guide")} prefetch={guideHostServes(crumb.path) ? undefined : false} className={s.crumbLink}>
                {crumb.name}
              </Link>
            </li>
          ) : (
            <li key={crumb.path} className={s.crumb} aria-current="page">
              {crumb.name}
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}
