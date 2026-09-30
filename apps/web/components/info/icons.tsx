import type { ReactNode } from "react";
import type { HelpIcon } from "@/lib/helpGuide";

/** Line glyphs for the 이용 가이드 cards. Decorative: the card title next to each one names it. */
const PATHS: Record<HelpIcon, ReactNode> = {
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m14.8 9.2-1.6 4-4 1.6 1.6-4z" />
    </>
  ),
  device: (
    <>
      <rect x="7" y="3.5" width="10" height="17" rx="2.2" />
      <path d="M10.5 17.5h3" />
    </>
  ),
  question: (
    <>
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V16h0.5A2.5 2.5 0 0 1 5 13.5z" />
      <path d="M10.3 8.4a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1" />
      <path d="M12 13.2h.01" />
    </>
  ),
  pencil: (
    <>
      <path d="m14.5 5.5 4 4L9 19H5v-4z" />
      <path d="m12.5 7.5 4 4" />
    </>
  ),
  cards: (
    <>
      <rect x="4" y="6.5" width="9" height="13" rx="1.6" transform="rotate(-10 8.5 13)" />
      <rect x="11" y="4.5" width="9" height="13" rx="1.6" transform="rotate(8 15.5 11)" />
    </>
  ),
  shuffle: (
    <>
      <path d="M4 7.5h3.2c2.6 0 3.8 9 6.6 9H20" />
      <path d="M4 16.5h3.2c1.1 0 1.9-1.5 2.6-3.2M13.2 10.7c.7-1.7 1.5-3.2 2.6-3.2H20" />
      <path d="m17.5 5 2.5 2.5-2.5 2.5M17.5 14l2.5 2.5-2.5 2.5" />
    </>
  ),
  open: (
    <>
      <path d="M4 5.5h5.5A2.5 2.5 0 0 1 12 8v11a2 2 0 0 0-2-2H4z" />
      <path d="M20 5.5h-5.5A2.5 2.5 0 0 0 12 8v11a2 2 0 0 1 2-2h6z" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3.5c.6 4.4 2.1 5.9 6.5 6.5-4.4.6-5.9 2.1-6.5 6.5-.6-4.4-2.1-5.9-6.5-6.5 4.4-.6 5.9-2.1 6.5-6.5z" />
      <path d="M18.5 16.5c.2 1.4.7 1.9 2 2-1.3.2-1.8.7-2 2-.2-1.3-.7-1.8-2-2 1.3-.1 1.8-.6 2-2z" />
    </>
  ),
  cookie: (
    <>
      <path d="M3.5 13.5C4 8.5 8 5 12.5 5c3.5 0 6.8 2.1 8 5.3-2.7.2-4.6 1.7-5.6 4.2-1.8-1.3-4-1.5-6.1-.5-1.6.8-3.4.8-5.3-.5z" />
      <path d="M8.5 13.5c.3 2.4 1.6 4.3 3.5 5.5M14.9 14.5c.9 1.6 2.4 2.5 4.1 2.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="2.2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
      <path d="M8 14h.01M12 14h.01M16 14h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  chips: (
    <>
      <rect x="3.5" y="5" width="10" height="5.5" rx="2.75" />
      <rect x="10.5" y="13.5" width="10" height="5.5" rx="2.75" />
      <path d="M17 7.75h3.5M3.5 16.25H7" />
    </>
  ),
  chat: (
    <>
      <path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v6.5A2.5 2.5 0 0 1 17 15.5h-6l-4 3.5v-3.5H7a2.5 2.5 0 0 1-2.5-2.5z" />
      <path d="M8.5 9.8h7M8.5 12.2h4" />
    </>
  ),
  book: (
    <>
      <path d="M6.5 3.5h11a1 1 0 0 1 1 1v15h-11a2 2 0 0 1-2-2v-12a2 2 0 0 1 1-2z" />
      <path d="M5.5 17.5a2 2 0 0 1 2-2h11" />
      <path d="m10 7.5.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.2 12.3 2.6 2.6 5-5.4" />
    </>
  ),
  share: (
    <>
      <circle cx="17" cy="6" r="2.5" />
      <circle cx="7" cy="12" r="2.5" />
      <circle cx="17" cy="18" r="2.5" />
      <path d="m9.2 10.8 5.6-3.4M9.2 13.2l5.6 3.4" />
    </>
  ),
  gift: (
    <>
      <rect x="4" y="9" width="16" height="11" rx="1.6" />
      <path d="M3.5 9h17M12 9v11" />
      <path d="M12 9c-1.5-3.8-5.5-4.3-5.5-2 0 1.4 2.2 2 5.5 2zM12 9c1.5-3.8 5.5-4.3 5.5-2 0 1.4-2.2 2-5.5 2z" />
    </>
  ),
  tag: (
    <>
      <path d="M3.8 12.2V5.3a1.5 1.5 0 0 1 1.5-1.5h6.9l8 8-8.4 8.4z" />
      <circle cx="8.3" cy="8.3" r="1.4" />
    </>
  ),
};

export function InfoIcon({ name, size = 22 }: { name: HelpIcon; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Four-point star for the 풀이 과정 line on /how. */
export function StarNode({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 1.5c.8 6.2 4.3 9.7 10.5 10.5-6.2.8-9.7 4.3-10.5 10.5-.8-6.2-4.3-9.7-10.5-10.5C7.7 11.2 11.2 7.7 12 1.5z" fill="currentColor" />
    </svg>
  );
}
