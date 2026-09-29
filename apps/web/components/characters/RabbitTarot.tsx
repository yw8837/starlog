import { OnFoldedEar, RabbitEars, RabbitFeet, RabbitHead, RabbitPaw } from "./RabbitParts";
import type { Expression } from "./types";
import s from "./characters.module.css";

/** Yellow pencil tucked behind the upright ear; drawn before the ear so the ear covers it. */
function Pencil() {
  return (
    <g transform="translate(84 124) rotate(-22.7)">
      <rect x="0" y="-3.6" width="7" height="7.2" rx="2.4" fill="#F59AB4" />
      <rect x="6" y="-3.8" width="5" height="7.6" fill="#CFCBDC" />
      <rect x="11" y="-3.6" width="45" height="7.2" fill="url(#sl-pencil)" />
      <path d="M11 -1.2H56" stroke="#FFF1BF" strokeWidth="1" opacity=".8" />
      <path d="M56 -3.6L66 0L56 3.6Z" fill="#F2D3A6" />
      <path d="M63 -1.1L67 0L63 1.1Z" fill="#4A3F6B" />
    </g>
  );
}

function Glasses() {
  return (
    <g>
      {[124, 176].map((x) => (
        <g key={x}>
          <circle cx={x} cy="167" r="18.5" fill="#fff" opacity=".1" />
          <circle cx={x} cy="167" r="18.5" fill="none" stroke="url(#sl-gold)" strokeWidth="3.4" />
          <path d={`M${x - 11} 158A14 14 0 0 1 ${x - 3} 152.5`} stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity=".85" />
          <path d={`M${x - 12.5} 163.5L${x - 9.5} 160.5`} stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
        </g>
      ))}
      <path d="M142.5 164Q150 158 157.5 164" stroke="url(#sl-gold)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M105.5 163L90 158M194.5 163L210 158" stroke="#D2AE5C" strokeWidth="2.6" strokeLinecap="round" />
    </g>
  );
}

/** Lavender bookmark ribbon tied at the base of the folded ear. */
function Bow() {
  return (
    <g fill="url(#sl-ribbon)">
      <path d="M182 118C172 106 162 111 166 120C168 126 177 125 182 120Z" />
      <path d="M186 118C196 106 206 111 202 120C200 126 191 125 186 120Z" />
      <path d="M181.5 121L175 135L180 133.5L182.5 138L186 122Z" />
      <path d="M186.5 121L191 134L194.5 131L198 133L189 120Z" />
      <circle cx="184" cy="119.5" r="4.4" fill="#8A73D6" />
      <path d="M168 116C170 112 175 112 178 115" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity=".6" />
    </g>
  );
}

/**
 * Cardigan arm bent at the elbow: the upper arm hangs by the body, the forearm tapers in to
 * a ribbed cuff at the book. Drawn for the viewer's left; `mirror` flips it to the right.
 */
function CardiganArm({ mirror }: { mirror?: boolean }) {
  return (
    <g transform={mirror ? "translate(3 0) matrix(-1 0 0 1 300 0)" : undefined}>
      <path
        d="M114 225C104 228 97 238 96 250C95 260 98 267 106 268C111 268.5 116 267 119 265.5L117.5 253.5C114 255 111 254.5 110.5 251C110 245 114 238 122 233Q120 226 114 225Z"
        fill="url(#sl-cardigan)"
      />
      <path d="M100 242C98 250 99 259 104 264" stroke="#D9CCFA" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".7" />
      <path d="M110.5 250.5C108.5 253 105.5 254.5 102.5 254.5" stroke="#8C76D0" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity=".8" />
      <path d="M116 253.8L118.6 266" stroke="#9A85DC" strokeWidth="4.2" />
    </g>
  );
}

const RIGHT_PAGE = "M150 259Q172 250 192 256V283Q172 278 150 287Z";

function OpenBook() {
  return (
    <g>
      <path d="M104 258Q127 250 150 261Q173 250 196 258V287Q173 281 150 291Q127 281 104 287Z" fill="#6E58B8" />
      <path d="M108 256Q128 250 150 259V287Q128 278 108 283Z" fill="url(#sl-page)" />
      <path d={RIGHT_PAGE} fill="url(#sl-page-r)" />
      <path d="M150 259V287" stroke="#D5C6A6" strokeWidth="1.2" />
      <path
        d="M114 263Q128 259 144 265M114 269Q128 265 144 271M114 275Q126 272 136 276M156 265Q172 259 186 262M156 271Q172 265 186 268"
        stroke="#CDBF9F"
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

function Quill() {
  return (
    <g className={s.quill}>
      <path d="M176.5 270L208 210" stroke="#6E58B8" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M190 252C186 238 194 218 212 204C216 226 206 244 190 252Z" fill="#FFFDF7" />
      <path d="M191 250C196 236 202 222 210 208" stroke="#C9BCEB" strokeWidth="1.2" fill="none" />
      <path d="M176 271.5L174.5 275L178 272.5Z" fill="#2E2650" />
    </g>
  );
}

/** Tarot staff: librarian rabbit. Round gold glasses, ribbon and pencil, lavender cardigan, book and quill. */
export function RabbitTarot({ expression, writing }: { expression: Expression; writing: boolean }) {
  return (
    <g className={s.squish}>
      <path d="M98 288C94 248 114 218 150 218C186 218 206 248 202 288Z" fill="url(#sl-cardigan)" />
      <path d="M150 232V288" stroke="#8C76D0" strokeWidth="1.5" />
      <circle cx="150" cy="243" r="3.2" fill="url(#sl-gold)" />
      <circle cx="150" cy="253" r="3.2" fill="url(#sl-gold)" />
      <path d="M150 222C140 220 126 223 121 232C126 243 142 243 150 232Z" fill="#FFFDF8" />
      <path d="M150 222C160 220 174 223 179 232C174 243 158 243 150 232Z" fill="#F4F0FA" />
      <RabbitFeet />
      <Pencil />
      <RabbitEars />
      <RabbitHead expression={expression} />
      <OnFoldedEar>
        <Bow />
      </OnFoldedEar>
      <Glasses />
      <CardiganArm />
      <CardiganArm mirror />
      <OpenBook />
      {writing && (
        <g className={s.pageFlip}>
          <path d={RIGHT_PAGE} fill="url(#sl-page)" stroke="#CDBB95" strokeWidth="1" />
          <path d="M156 266Q172 260 186 263M156 272Q172 266 186 269" stroke="#CDBF9F" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        </g>
      )}
      <RabbitPaw x={125} y={259} />
      <g transform="translate(-5 0)">
        <Quill />
      </g>
      <RabbitPaw x={177} y={259} />
    </g>
  );
}
