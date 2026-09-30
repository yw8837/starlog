/** Small currency and UI glyphs shared by the home top bar and 내 정보. Decorative; the text next to them names them. */

export function MoonIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M19.5 14.8A8 8 0 0 1 9.2 4.5a8 8 0 1 0 10.3 10.3z" fill="#f3dca1" />
    </svg>
  );
}

export function StarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2.5l2.4 6.3 6.6.4-5.1 4.2 1.7 6.5L12 16.3l-5.6 3.6 1.7-6.5L3 9.2l6.6-.4z" fill="#cfc6ff" />
    </svg>
  );
}

export function ChevronIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M9 5.5 15.5 12 9 18.5" />
    </svg>
  );
}
