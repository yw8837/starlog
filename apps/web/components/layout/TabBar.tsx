import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { SITE } from "@/lib/config";
import { GUIDE_ABOUT_PATH, guideIndexPath } from "@/lib/guideMeta";
import { linkHref, type SiteHost } from "@/lib/hosts";
import { INFO_PAGES } from "@/lib/infoPages";
import styles from "./TabBar.module.css";

/** The app's tabs, then the guide host's own (GUIDE_TABS). */
export type TabId = "home" | "story" | "guide" | "faq" | "me" | "guide-tarot" | "guide-saju" | "guide-about" | "app";

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

/** `out`: the one tab that leaves the guide host for the app, marked with a ↗ that assistive tech skips. */
type Tab = { id: TabId; href: string; label: string; icon?: ReactNode; out?: boolean };

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

const GUIDE_TABS: readonly Tab[] = [
  {
    id: "guide-tarot",
    href: guideIndexPath("tarot"),
    label: "타로 가이드",
    icon: (
      <svg {...svgProps}>
        <rect x="4" y="6.5" width="9" height="13" rx="1.6" transform="rotate(-10 8.5 13)" />
        <rect x="11" y="4.5" width="9" height="13" rx="1.6" transform="rotate(8 15.5 11)" />
      </svg>
    ),
  },
  {
    id: "guide-saju",
    href: guideIndexPath("saju"),
    label: "사주 가이드",
    icon: (
      <svg {...svgProps}>
        <rect x="4" y="5.5" width="16" height="14" rx="2.2" />
        <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
      </svg>
    ),
  },
  {
    id: "guide-about",
    href: GUIDE_ABOUT_PATH,
    label: "가이드 소개",
    icon: (
      <svg {...svgProps}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
    ),
  },
  {
    id: "app",
    href: "/",
    label: "스타로그 앱",
    out: true,
    icon: (
      <svg {...svgProps}>
        <path d="M13.5 5H19v5.5M19 5l-8 8" />
        <path d="M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" />
      </svg>
    ),
  },
];

type TabBarProps = {
  /** The page's tab: an app page names its own; the guide host's pages name their tab, the category or 가이드 소개. */
  active?: TabId;
  /** "desktop": only the header (pages that keep a back bar on phones, such as /faq). */
  only?: "desktop";
  /**
   * The host serving the page. The guide pages pass "guide": the root domain reads as a content site of its own
   * (AdSense audit 2026-10-27), so its bar holds the guide's sections (GUIDE_TABS) and one labelled link out to the app
   * (the app host when the hosts are split, lib/hosts.ts), and its wordmark goes to the guide's home. Everywhere else
   * the app host serves the page, and only the guide tab leaves it. "either": a page served as it is on both hosts
   * (/about, /privacy, /terms): every link names the host that serves it (lib/hosts.ts linkHref).
   */
  host?: SiteHost | "either";
};

function TabLabel({ tab }: { tab: Tab }) {
  return (
    <>
      {tab.label}
      {tab.out ? <span aria-hidden="true"> ↗</span> : null}
    </>
  );
}

/**
 * Main navigation. Below 1024px a bottom tab bar; from 1024px a header with the wordmark on the left
 * and translucent pill tabs on the top right (the bottom bar is hidden there). Each variant is hidden
 * with display:none at the other width, so only one nav is ever in the accessibility tree. Render it
 * before <main>: on desktop it is the top of the page, and focus order should match.
 */
export function TabBar({ active, only, host = "app" }: TabBarProps) {
  const guide = host === "guide";
  return (
    <header className={styles.header}>
      <div className={styles.top}>
        <Link
          href={linkHref(guide ? guideIndexPath("tarot") : "/", host)}
          className={styles.brand}
          aria-label={guide ? `${SITE.nameKo} 가이드 홈` : `${SITE.nameKo} 홈`}
        >
          <Wordmark />
        </Link>
        <nav className={styles.pills} aria-label="주요 메뉴">
          <ul className={styles.pillList}>
            {(guide ? GUIDE_TABS : PILL_TABS).map((tab) => {
              const isActive = tab.id === active;
              return (
                <li key={tab.id}>
                  <Link
                    href={linkHref(tab.href, host)}
                    prefetch={tab.out ? false : undefined}
                    className={isActive ? `${styles.pill} ${styles.pillActive}` : styles.pill}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <TabLabel tab={tab} />
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
            {(guide ? GUIDE_TABS : BAR_TABS).map((tab) => {
              const isActive = tab.id === active;
              return (
                <li key={tab.id} className={styles.cell}>
                  <Link
                    href={linkHref(tab.href, host)}
                    prefetch={tab.out ? false : undefined}
                    className={isActive ? `${styles.tab} ${styles.active}` : styles.tab}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {tab.icon}
                    <span className={styles.label}>
                      <TabLabel tab={tab} />
                    </span>
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
