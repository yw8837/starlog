import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { SITE } from "@/lib/config";
import { guideIndexPath } from "@/lib/guideMeta";
import { linkHref, type SiteHost } from "@/lib/hosts";
import { INFO_PAGES } from "@/lib/infoPages";
import styles from "./TabBar.module.css";

export type TabId = "home" | "story" | "guide" | "faq" | "me";

const svgProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

type Tab = { id: TabId; href: string; label: string; icon?: ReactNode };

const HOME: Tab = {
  id: "home",
  href: "/",
  label: "홈",
  icon: (
    <svg {...svgProps}>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
    </svg>
  ),
};

const STORY: Tab = {
  id: "story",
  href: "/story",
  label: "내 기록",
  icon: (
    <svg {...svgProps}>
      <path d="M12 6.5C10.4 5.3 8.2 4.8 5 5v13c3.2-.2 5.4.3 7 1.5 1.6-1.2 3.8-1.7 7-1.5V5c-3.2-.2-5.4.3-7 1.5z" />
      <path d="M12 6.5v13" />
    </svg>
  ),
};

const GUIDE: Tab = {
  id: "guide",
  href: guideIndexPath("tarot"),
  label: "가이드",
  icon: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="8" />
      <path d="m15.4 8.6-2 4.8-4.8 2 2-4.8z" />
    </svg>
  ),
};

const ME: Tab = {
  id: "me",
  href: "/me",
  label: "내 정보",
  icon: (
    <svg {...svgProps}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c.6-3.6 3.5-5.5 7-5.5s6.4 1.9 7 5.5" />
    </svg>
  ),
};

const FAQ: Tab = { id: "faq", href: INFO_PAGES.faq.path, label: "FAQ" };

/** Phones and tablets: the bottom bar, four tabs within thumb reach. */
const BAR_TABS: readonly Tab[] = [HOME, STORY, GUIDE, ME];

/** Desktop header: what the site offers first (홈 · 가이드 · FAQ), then what is mine. */
const PILL_TABS: readonly Tab[] = [HOME, GUIDE, FAQ, STORY, ME];

type TabBarProps = {
  /** The page's tab; every /guide/* page passes "guide", so the tab stays lit across the guide. */
  active?: TabId;
  /** "desktop": only the header (pages that keep a back bar on phones, such as /faq). */
  only?: "desktop";
  /**
   * The host serving the page. The guide pages pass "guide": they live on the root domain, so their
   * links to the app go to the app host (when the hosts are split, lib/hosts.ts). Everywhere else the
   * app host serves the page, and only the guide tab leaves it.
   */
  host?: SiteHost;
};

/**
 * Main navigation. Below 1024px a bottom tab bar; from 1024px a header with the wordmark on the left
 * and translucent pill tabs on the top right (the bottom bar is hidden there). Each variant is hidden
 * with display:none at the other width, so only one nav is ever in the accessibility tree. Render it
 * before <main>: on desktop it is the top of the page, and focus order should match.
 */
export function TabBar({ active, only, host = "app" }: TabBarProps) {
  return (
    <header className={styles.header}>
      <div className={styles.top}>
        <Link href={linkHref("/", host)} className={styles.brand} aria-label={`${SITE.nameKo} 홈`}>
          <Wordmark />
        </Link>
        <nav className={styles.pills} aria-label="주요 메뉴">
          <ul className={styles.pillList}>
            {PILL_TABS.map((tab) => {
              const isActive = tab.id === active;
              return (
                <li key={tab.id}>
                  <Link
                    href={linkHref(tab.href, host)}
                    className={isActive ? `${styles.pill} ${styles.pillActive}` : styles.pill}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {only === "desktop" ? null : (
        <nav className={styles.bar} aria-label="주요 메뉴">
          <ul className={styles.inner}>
            {BAR_TABS.map((tab) => {
              const isActive = tab.id === active;
              return (
                <li key={tab.id} className={styles.cell}>
                  <Link
                    href={linkHref(tab.href, host)}
                    className={isActive ? `${styles.tab} ${styles.active}` : styles.tab}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {tab.icon}
                    <span className={styles.label}>{tab.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </header>
  );
}
