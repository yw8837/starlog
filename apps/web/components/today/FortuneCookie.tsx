import s from "./FortuneCookie.module.css";

type FortuneCookieProps = {
  /** Width in px; the height is 0.78 of it. */
  size?: number;
  /** `cracked`: the halves part and the paper slip shows. */
  state?: "whole" | "cracked";
  /** Gentle bob while waiting to be tapped. */
  floating?: boolean;
  className?: string;
};

/**
 * A 2.5D fortune cookie (SVG): two baked halves folded over a crease, a soft shadow below. It
 * cracks open by moving each half apart (under reduced motion the change is instant).
 */
export function FortuneCookie({ size = 200, state = "whole", floating = false, className }: FortuneCookieProps) {
  // Same gradients wherever a cookie is drawn, so a repeated id on one page stays harmless.
  const bake = "fortune-cookie-bake";
  const shine = "fortune-cookie-shine";
  return (
    <svg
      className={[s.cookie, className].filter(Boolean).join(" ")}
      data-state={state}
      data-floating={floating ? "" : undefined}
      width={size}
      height={Math.round(size * 0.78)}
      viewBox="0 0 200 156"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={bake} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6d38a" />
          <stop offset="0.55" stopColor="#e3a650" />
          <stop offset="1" stopColor="#b9742c" />
        </linearGradient>
        <radialGradient id={shine} cx="0.35" cy="0.3" r="0.6">
          <stop offset="0" stopColor="#fff4d6" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff4d6" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse className={s.shadow} cx="100" cy="142" rx="70" ry="9" fill="rgba(5, 3, 15, 0.45)" />

      {/* The slip sits behind the halves; it slides up once they part. */}
      <g className={s.slip}>
        <rect x="64" y="66" width="72" height="18" rx="2" fill="#fffdf7" stroke="#e8dcc0" />
        <path d="M72 73h44M72 78h30" stroke="#c9a15b" strokeWidth="2" strokeLinecap="round" />
      </g>

      <g className={s.left}>
        <path d="M100 38C72 18 22 30 18 76c-3 34 30 52 62 40 12-5 18-16 20-28z" fill={`url(#${bake})`} />
        <path d="M100 38C72 18 22 30 18 76c-3 34 30 52 62 40 12-5 18-16 20-28z" fill={`url(#${shine})`} />
        <path d="M86 98c6 8 10 14 14 18" stroke="#9c5f22" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.55" />
      </g>
      <g className={s.right}>
        <path d="M100 38c28-20 78-8 82 38 3 34-30 52-62 40-12-5-18-16-20-28z" fill={`url(#${bake})`} />
        <path d="M100 38c28-20 78-8 82 38 3 34-30 52-62 40-12-5-18-16-20-28z" fill={`url(#${shine})`} opacity="0.6" />
        <path d="M114 98c-6 8-10 14-14 18" stroke="#9c5f22" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.55" />
      </g>
      {/* The crease where the two halves fold. */}
      <path className={s.crease} d="M100 38c-4 18-2 36 0 50" stroke="#a8672a" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}
