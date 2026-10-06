// Props shared by more than one card (II and V share the pillars; V uses the recoloured extras).
import { r2, C } from "./kit.mjs";

/** Flat stone pillar: capital, shaft with a lit right edge, base. x = shaft centre, w = shaft width. */
export function pillar({ x, w = 118, top = 96, bottom = 904, fill, light, dark }) {
  const cap = w + 44;
  const x0 = x - w / 2;
  const c0 = x - cap / 2;
  return `<g>
    <rect x="${r2(x0)}" y="${top + 52}" width="${w}" height="${bottom - top - 104}" fill="${fill}"/>
    <rect x="${r2(x0 + w * 0.8)}" y="${top + 52}" width="${r2(w * 0.2)}" height="${bottom - top - 104}" fill="${light}"/>
    <rect x="${r2(c0)}" y="${top}" width="${cap}" height="56" rx="10" fill="${fill}"/>
    <rect x="${r2(c0)}" y="${top + 40}" width="${cap}" height="14" fill="${dark}"/>
    <path d="M${r2(x - cap * 0.3)} ${top + 12}l12 24l12 -24M${r2(x - 12)} ${top + 12}l12 24l12 -24M${r2(x + cap * 0.3 - 24)} ${top + 12}l12 24l12 -24" stroke="${light}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <rect x="${r2(c0)}" y="${bottom - 56}" width="${cap}" height="56" rx="10" fill="${fill}"/>
    <rect x="${r2(c0)}" y="${bottom - 56}" width="${cap}" height="14" fill="${dark}"/>
  </g>`;
}

/** Recoloured extras: same parts, other fur (grey kitten, brown bunny). Add VARIANT_DEFS to the card's defs. */
export const VARIANT_DEFS = `
  <radialGradient id="sk-cat-grey" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#F4F2F9"/><stop offset=".55" stop-color="#C7C2D8"/><stop offset="1" stop-color="#8E88AA"/></radialGradient>
  <radialGradient id="sk-cat-dark" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#A7A2C2"/><stop offset=".55" stop-color="#6C6788"/><stop offset="1" stop-color="#413D61"/></radialGradient>
  <radialGradient id="sk-rabbit-brown" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#F6EDE6"/><stop offset=".6" stop-color="#D9C3B2"/><stop offset="1" stop-color="#A88C7C"/></radialGradient>`;
export const recolor = (markup, { cat, rabbit } = {}) => {
  let m = markup;
  if (cat) m = m.replaceAll("url(#sl-cat-fur)", `url(#${cat})`);
  if (rabbit) m = m.replaceAll("url(#sl-rabbit-fur)", `url(#${rabbit})`);
  return m;
};

/** Gold cross with three bars (triple cross) or one bar; centred on x, from y to y + h. */
export function cross({ x, y, h, w = 14, bars = 1, bar = 64, fill = C.gold }) {
  const gap = h * 0.17;
  const rects = Array.from({ length: bars }, (_, i) => {
    const bw = bar * (1 - (bars - 1 - i) * 0.28);
    return `<rect x="${r2(x - bw / 2)}" y="${r2(y + i * gap)}" width="${r2(bw)}" height="${r2(w)}" rx="${w / 2}" fill="${fill}"/>`;
  }).join("");
  return `<rect x="${r2(x - w / 2)}" y="${r2(y)}" width="${w}" height="${h}" rx="${w / 2}" fill="${fill}"/>${rects}`;
}
