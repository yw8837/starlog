import { Wordmark } from "@/components/brand/Wordmark";
import { SITE } from "@/lib/config";
import s from "./home.module.css";

/**
 * Phones: the wordmark. From 1024px the site header (TabBar) shows the wordmark, so the bar stays
 * empty. The page's <h1> is the hero line.
 */
export function HomeTopBar() {
  return (
    <div className={s.topbar}>
      <p className={s.wordmark}>
        <Wordmark />
        <span className="sr-only">{` ${SITE.nameKo}`}</span>
      </p>
    </div>
  );
}
