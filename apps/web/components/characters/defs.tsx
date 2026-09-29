import { CAPE_LEFT, CAPE_RIGHT, CAT_HEAD, DURUMAGI, RABBIT_HEAD } from "./parts/silhouettes";

/**
 * Shared SVG paint servers and clip paths for every character on the page. Mounted once in the root
 * layout; characters reference these by id, so any number of instances can share a page
 * without duplicating ids. Kept out of display:none, which would disable the gradients.
 */
export function CharacterDefs() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        {/* fur */}
        <radialGradient id="sl-cat-fur" cx="38%" cy="30%" r="75%">
          <stop offset="0" stopColor="#FFFBF4" />
          <stop offset=".55" stopColor="#F6E8D4" />
          <stop offset="1" stopColor="#D7BD9C" />
        </radialGradient>
        <radialGradient id="sl-rabbit-fur" cx="38%" cy="30%" r="75%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".6" stopColor="#F3EFF8" />
          <stop offset="1" stopColor="#CFC6DE" />
        </radialGradient>
        <radialGradient id="sl-ear" cx="50%" cy="40%" r="70%">
          <stop offset="0" stopColor="#FBD0DA" />
          <stop offset="1" stopColor="#E99BB1" />
        </radialGradient>
        <radialGradient id="sl-iris" cx="45%" cy="35%" r="70%">
          <stop offset="0" stopColor="#5B4AB8" />
          <stop offset=".55" stopColor="#2A2360" />
          <stop offset="1" stopColor="#15112F" />
        </radialGradient>
        <linearGradient id="sl-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE9B0" />
          <stop offset=".6" stopColor="#E9C46F" />
          <stop offset="1" stopColor="#B98A2E" />
        </linearGradient>

        {/* astrologer */}
        <linearGradient id="sl-hat" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4B46A8" />
          <stop offset=".5" stopColor="#2E2A78" />
          <stop offset="1" stopColor="#1C1850" />
        </linearGradient>
        <linearGradient id="sl-brim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#524CB6" />
          <stop offset=".5" stopColor="#3A3594" />
          <stop offset="1" stopColor="#262169" />
        </linearGradient>
        <linearGradient id="sl-cape" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3A358E" />
          <stop offset="1" stopColor="#1E1A58" />
        </linearGradient>
        <linearGradient id="sl-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B9A8EC" />
          <stop offset=".5" stopColor="#9C87DE" />
          <stop offset="1" stopColor="#7D66C8" />
        </linearGradient>
        <radialGradient id="sl-crystal" cx="40%" cy="34%" r="70%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".3" stopColor="#E9E1FF" />
          <stop offset=".72" stopColor="#A996F0" />
          <stop offset="1" stopColor="#6553C0" />
        </radialGradient>

        {/* librarian */}
        <linearGradient id="sl-cardigan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#CDBDF5" />
          <stop offset=".55" stopColor="#AE9AE6" />
          <stop offset="1" stopColor="#8E78D2" />
        </linearGradient>
        <linearGradient id="sl-ribbon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#C9BAF3" />
          <stop offset="1" stopColor="#8A73D6" />
        </linearGradient>
        <linearGradient id="sl-page" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFDF7" />
          <stop offset="1" stopColor="#EDE2CB" />
        </linearGradient>
        <linearGradient id="sl-page-r" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#EADFC6" />
          <stop offset="1" stopColor="#FFFCF4" />
        </linearGradient>
        <linearGradient id="sl-pencil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE08A" />
          <stop offset=".5" stopColor="#F6C54E" />
          <stop offset="1" stopColor="#D99F2B" />
        </linearGradient>

        {/* hanbok */}
        <linearGradient id="sl-navy" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4553A2" />
          <stop offset=".5" stopColor="#2E3A78" />
          <stop offset="1" stopColor="#1F2858" />
        </linearGradient>
        <linearGradient id="sl-durumagi" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5563BA" />
          <stop offset=".45" stopColor="#3B4892" />
          <stop offset=".8" stopColor="#2E3A78" />
          <stop offset="1" stopColor="#28336C" />
        </linearGradient>
        <linearGradient id="sl-jeogori" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE4EB" />
          <stop offset=".6" stopColor="#F8C3D1" />
          <stop offset="1" stopColor="#EAA0B6" />
        </linearGradient>
        <linearGradient id="sl-goreum" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EE6677" />
          <stop offset="1" stopColor="#BF3A50" />
        </linearGradient>
        <radialGradient id="sl-pouch" cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#F47C88" />
          <stop offset=".6" stopColor="#D8435A" />
          <stop offset="1" stopColor="#A82D44" />
        </radialGradient>
        <linearGradient id="sl-scroll" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF9EA" />
          <stop offset=".6" stopColor="#F1E4C6" />
          <stop offset="1" stopColor="#D9C59C" />
        </linearGradient>
        <linearGradient id="sl-bamboo" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#E6CB8E" />
          <stop offset=".5" stopColor="#C9A45E" />
          <stop offset="1" stopColor="#9E7B3C" />
        </linearGradient>
        {/* 색동: red, yellow, green, blue, pink bands across a sleeve drawn from y=0 down (parts/Sleeve.tsx) */}
        <pattern id="sl-saekdong" patternUnits="userSpaceOnUse" width="60" height="35" x="-30" y="0">
          <rect y="0" width="60" height="7" fill="#EC5B5E" />
          <rect y="7" width="60" height="7" fill="#F8CD50" />
          <rect y="14" width="60" height="7" fill="#5FB887" />
          <rect y="21" width="60" height="7" fill="#5B88DE" />
          <rect y="28" width="60" height="7" fill="#F49AC0" />
        </pattern>
        {/* round-tube volume for sleeves: soft light on the left, shade on the right */}
        <linearGradient id="sl-tube" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1A1440" stopOpacity=".16" />
          <stop offset=".32" stopColor="#FFFFFF" stopOpacity=".2" />
          <stop offset=".6" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="1" stopColor="#1A1440" stopOpacity=".3" />
        </linearGradient>

        {/* rim-light clips (parts/Rim.tsx): same outlines as the shapes they light */}
        <clipPath id="sl-clip-cat-head">
          <path d={CAT_HEAD} />
        </clipPath>
        <clipPath id="sl-clip-rabbit-head">
          <path d={RABBIT_HEAD} />
        </clipPath>
        <clipPath id="sl-clip-cape">
          <path d={CAPE_LEFT} />
          <path d={CAPE_RIGHT} />
        </clipPath>
        <clipPath id="sl-clip-durumagi">
          <path d={DURUMAGI} />
        </clipPath>

        {/* soft light */}
        <filter id="sl-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="sl-blush" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
        <filter id="sl-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id="sl-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>
    </svg>
  );
}
