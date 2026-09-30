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

// The cookie seen from the front: one baked dome folded shut, pinched at the bottom middle where
// the inside of the fold shows, with the paper slip peeking out of the pinch (as the emoji draws
// it). Each half is drawn separately so it can hinge open along the crease.
const LEFT = "M100 26C58 26 18 54 18 104c22 8 48 4 64-8l18 16z";
const RIGHT = "M100 26c42 0 82 28 82 78-22 8-48 4-64-8l-18 16z";
const LEFT_FOLD = "M82 96l18 16V88c-7 0-13 3-18 8z";
const RIGHT_FOLD = "M118 96l-18 16V88c7 0 13 3 18 8z";

/**
 * A 2.5D fortune cookie (SVG) with a soft shadow below. It cracks open by hinging each half apart
 * while the slip rises (under reduced motion the change is instant).
 */
export function FortuneCookie({ size = 200, state = "whole", floating = false, className }: FortuneCookieProps) {
  // Same gradients wherever a cookie is drawn, so a repeated id on one page stays harmless.
  const bake = "fortune-cookie-bake";
  const fold = "fortune-cookie-fold";
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
          <stop offset="0" stopColor="#f8d98f" />
          <stop offset="0.6" stopColor="#e6a955" />
          <stop offset="1" stopColor="#c07b30" />
        </linearGradient>
        <linearGradient id={fold} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9a5a1f" />
          <stop offset="1" stopColor="#c98a3e" />
        </linearGradient>
        <radialGradient id={shine} cx="0.32" cy="0.25" r="0.55">
          <stop offset="0" stopColor="#fff6dc" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff6dc" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse className={s.shadow} cx="100" cy="138" rx="74" ry="8" fill="rgba(5, 3, 15, 0.45)" />

      {/* The slip sits behind the halves, peeking out of the pinch; it rises once they part. */}
      <g className={s.slip}>
        <rect x="96" y="100" width="70" height="16" rx="2" fill="#fffdf7" stroke="#e8dcc0" />
        <path d="M106 106h40M106 111h26" stroke="#c9a15b" strokeWidth="2" strokeLinecap="round" />
      </g>

      <g className={s.left}>
        <path d={LEFT} fill={`url(#${bake})`} />
        <path d={LEFT} fill={`url(#${shine})`} />
        <path d={LEFT_FOLD} fill={`url(#${fold})`} />
      </g>
      <g className={s.right}>
        <path d={RIGHT} fill={`url(#${bake})`} />
        <path d={RIGHT} fill={`url(#${shine})`} opacity="0.45" />
        <path d={RIGHT_FOLD} fill={`url(#${fold})`} />
      </g>
      {/* The crease where the two halves are pinched together. */}
      <path className={s.crease} d="M100 30c-4 20-3 40 0 58" stroke="#b06f2c" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.7" />
    </svg>
  );
}
