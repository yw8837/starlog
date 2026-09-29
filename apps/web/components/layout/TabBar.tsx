import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./TabBar.module.css";

export type TabId = "home" | "story" | "guide" | "me";

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

const TABS: ReadonlyArray<{ id: TabId; href: string; label: string; icon: ReactNode }> = [
  {
    id: "home",
    href: "/",
    label: "홈",
    icon: (
      <svg {...svgProps}>
        <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    id: "story",
    href: "/story",
    label: "내 이야기",
    icon: (
      <svg {...svgProps}>
        <path d="M12 6.5C10.4 5.3 8.2 4.8 5 5v13c3.2-.2 5.4.3 7 1.5 1.6-1.2 3.8-1.7 7-1.5V5c-3.2-.2-5.4.3-7 1.5z" />
        <path d="M12 6.5v13" />
      </svg>
    ),
  },
  {
    id: "guide",
    href: "/guide",
    label: "가이드",
    icon: (
      <svg {...svgProps}>
        <circle cx="12" cy="12" r="8" />
        <path d="m15.4 8.6-2 4.8-4.8 2 2-4.8z" />
      </svg>
    ),
  },
  {
    id: "me",
    href: "/me",
    label: "내 정보",
    icon: (
      <svg {...svgProps}>
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 19.5c.6-3.6 3.5-5.5 7-5.5s6.4 1.9 7 5.5" />
      </svg>
    ),
  },
];

export function TabBar({ active }: { active: TabId }) {
  return (
    <nav className={styles.bar} aria-label="주요 메뉴">
      <ul className={styles.inner}>
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <li key={tab.id} className={styles.cell}>
              <Link
                href={tab.href}
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
  );
}
