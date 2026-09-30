# Starlog P3: 별자리 인연 · 행운 번호 · 이미지 공유 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Friends fill the constellation the owner picked; completed constellations go into a 12-sign 도감, rank globally by summed saju 인연 scores, and share as images with the friends' nicknames. Weekly 행운 번호 and share images for the daily card and chapters come with it.

**Architecture:** Pure, deterministic domain logic lives in `packages/core/src/bonds/`: the constellation catalog, the symmetric date-only saju 인연 score and the weekly lucky numbers. The web app keeps state in Cloudflare D1 behind a small repository interface. There is a D1 implementation and an in-memory one for tests. A service layer holds the rules (choose, join, switch, refill, rank), and thin route handlers under `app/api/bonds/*` use signed device cookies for identity. Pages are single-scroll. Share images come from `next/og` route handlers that load Korean glyphs from Google Fonts on demand.

**Tech Stack:** Next.js 16.3.7 on Cloudflare Workers (OpenNext 1.20), Cloudflare D1, WebCrypto (existing `apps/web/lib/security/sign.ts`), `next/og`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-starlog-constellation-bonds-design.md` (read all of it; it is the source of truth for copy and rules). Starts after the P2b work (`.superpowers/sdd/2026-09-30-starlog-p2b/`) is merged, because it reuses its security helpers and daily-card endpoint.

## Global Constraints

- Everything in `.superpowers/sdd/2026-09-30-starlog-p2b/global-constraints.md` holds. This includes: no fs at runtime, 해요체, no meta copy, no address, one gold primary per screen, ≥44px targets, ≥13px text, reduced motion, CSS Modules, and committing only your own paths.
- The 인연 score is **symmetric, deterministic and date-only**: `bondScore(a,b).score === bondScore(b,a).score`. The same people always get the same score. Birth time is never used. It lies in 55–99.
- A friend's birth date is used only inside the join request. It is never written to D1, logs, cookies or URLs. The owner's birth date is not stored either; only the derived basis (day stem, year branch, day branch, element counts) is.
- One constellation is filled at a time, and the owner chooses it. Switching mid-way clears it; there is no limit, only a confirm step. A completed constellation offers exactly `공유하기` and `새로 채우기`. `새로 채우기` has a 1-hour cooldown in beta.
- The ranking is per sign and public by nickname only, with an opt-out. Ties go to the earlier completion. There are two views: this week (KST Monday 00:00) and all time.
- Invite code: 6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, case-insensitive. Link `/b/<code>`. Regenerating revokes the old code. Unknown and revoked codes get the same answer: `코드를 다시 확인해 주세요`.
- Limits:
  - joins: 10 per IP per minute (Workers rate-limit binding; periods are 10 s or 60 s only, so the spec's "30 per IP per day" becomes this ruling) and 20 new stars per owner per KST day (service, D1 count)
  - code lookups: 10 per IP per minute
  - 오늘의 인연 카드: 5 AI generations per owner per day, then the rule-based text
- Share images never contain a question, a note, a birth date or friend scores. The constellation share image does contain the friends' nicknames. The join form tells the friend so before they submit.
- 행운 번호: free, weekly, deterministic per (owner, KST week). Never use the word "로또". Always show `재미로 보는 번호예요. 추첨에서는 모든 번호의 확률이 같아요.`

## File Structure

```
packages/core/src/bonds/constellations.ts   12 signs: id, names, slots, star coordinates, lines, sun-sign dates
packages/core/src/bonds/score.ts            BondBasis from a birth date, bondScore(a, b) with explainable parts
packages/core/src/bonds/lucky.ts            weekly lucky numbers, KST week id, card number mapping
packages/core/src/bonds/index.ts            re-exports
packages/core/src/tarot/draw.ts             (modify) export seededRandom()
apps/web/migrations/0001_bonds.sql          D1 schema
apps/web/lib/db/bondsRepo.ts                BondsRepo interface + row types
apps/web/lib/db/d1BondsRepo.ts              D1 implementation
apps/web/lib/db/memoryBondsRepo.ts          in-memory implementation (tests, dev without D1)
apps/web/lib/db/index.ts                    bondsRepo(): D1 on Workers, memory elsewhere
apps/web/lib/bonds/text.ts                  nickname/message rules, invite code alphabet
apps/web/lib/bonds/service.ts               rules: owner, choose, invite, resolve, join, switch, refill, remove, views, ranking
apps/web/lib/bonds/identity.ts              sl_uid (owner) and sl_fid (friend device) signed cookies
apps/web/lib/bonds/bondCardText.ts          rule-based "요즘 두 사람 사이" line from the card KB
apps/web/app/api/bonds/**/route.ts          HTTP layer
apps/web/components/bonds/art/figures.ts    12 figure outline paths (decorative)
apps/web/components/bonds/ConstellationArt.tsx   SVG: figure + lines + star slots (lit / empty / new)
apps/web/components/bonds/Dogam.tsx         12-cell 도감 grid, each cell links to /ranking/<sign>
apps/web/components/bonds/HomeBondsCard.tsx home slot (replaces 친구 장면)
apps/web/app/bonds/                         owner page (single scroll)
apps/web/app/ranking/[sign]/                ranking page (my card on top)
apps/web/app/b/page.tsx, app/b/[code]/      friend: code entry, join flow
apps/web/app/api/og/bonds/[id]/route.tsx    constellation share image (feed 1080×1350, story 1080×1920)
apps/web/app/api/og/invite/[code]/route.tsx invite OG card 1200×630
apps/web/lib/og/googleFont.ts               glyph-subset font loader for next/og
apps/web/app/lucky/, app/api/lucky/route.ts weekly lucky numbers
apps/web/components/ui/ShareImageButton.tsx share a PNG (files) or download + copy link
```

---

### Task 1: Core — constellation catalog and seeded random

**Files:**
- Create: `packages/core/src/bonds/constellations.ts`, `packages/core/src/bonds/index.ts`
- Modify: `packages/core/src/tarot/draw.ts` (export `seededRandom`), `packages/core/src/index.ts` (add `export * from "./bonds";`)
- Test: `packages/core/src/bonds/constellations.test.ts`

**Interfaces:**
- Produces:
  - `type SignId = "aries" | "taurus" | "gemini" | "cancer" | "leo" | "virgo" | "libra" | "scorpio" | "sagittarius" | "capricorn" | "aquarius" | "pisces"`
  - `interface ConstellationDef { id: SignId; ko: string; en: string; slots: number; stars: readonly (readonly [number, number])[]; lines: readonly (readonly [number, number])[]; from: readonly [number, number] }`. Coordinates are in a 1000×1000 box, and `stars.length === slots`. `from` is the [month, day] when the tropical sun sign starts.
  - `CONSTELLATIONS: readonly ConstellationDef[]` (zodiac order), `getConstellation(id)`, `isSignId(v)`, `sunSign(month, day): SignId`
  - `seededRandom(seed: string): () => number` (xoshiro128**, [0,1))

- [ ] **Step 1: Write the failing test** — `packages/core/src/bonds/constellations.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { seededRandom } from "../tarot/draw";
import { CONSTELLATIONS, getConstellation, isSignId, sunSign } from "./constellations";

describe("constellations", () => {
  it("has the 12 signs in zodiac order with the spec's slot counts (67 in total)", () => {
    expect(CONSTELLATIONS.map((c) => [c.ko, c.slots])).toEqual([
      ["양자리", 4], ["황소자리", 5], ["쌍둥이자리", 6], ["게자리", 5], ["사자자리", 6], ["처녀자리", 6],
      ["천칭자리", 4], ["전갈자리", 7], ["궁수자리", 6], ["염소자리", 5], ["물병자리", 6], ["물고기자리", 7],
    ]);
    expect(CONSTELLATIONS.reduce((n, c) => n + c.slots, 0)).toBe(67);
  });

  it("draws every slot as a star inside the 1000 box, and lines join existing stars", () => {
    for (const c of CONSTELLATIONS) {
      expect(c.stars).toHaveLength(c.slots);
      for (const [x, y] of c.stars) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1000);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1000);
      }
      for (const [a, b] of c.lines) {
        expect(a).toBeLessThan(c.slots);
        expect(b).toBeLessThan(c.slots);
        expect(a).not.toBe(b);
      }
      const touched = new Set(c.lines.flat());
      expect(touched.size).toBe(c.slots); // every star is on the figure
    }
  });

  it("finds a sign by id and rejects unknown ids", () => {
    expect(getConstellation("leo").ko).toBe("사자자리");
    expect(isSignId("aries")).toBe(true);
    expect(isSignId("ophiuchus")).toBe(false);
    expect(() => getConstellation("x" as never)).toThrow();
  });

  it("maps birthdays to tropical sun signs, including the year wrap", () => {
    expect(sunSign(3, 21)).toBe("aries");
    expect(sunSign(4, 19)).toBe("aries");
    expect(sunSign(4, 20)).toBe("taurus");
    expect(sunSign(12, 22)).toBe("capricorn");
    expect(sunSign(1, 1)).toBe("capricorn");
    expect(sunSign(1, 19)).toBe("capricorn");
    expect(sunSign(1, 20)).toBe("aquarius");
    expect(sunSign(3, 20)).toBe("pisces");
  });

  it("seededRandom is deterministic per seed", () => {
    const a = seededRandom("x");
    const b = seededRandom("x");
    const c = seededRandom("y");
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect([c(), c(), c()]).not.toEqual(seqA);
    for (const v of seqA) expect(v >= 0 && v < 1).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run packages/core/src/bonds/constellations.test.ts`
Expected: FAIL (`Cannot find module './constellations'`).

- [ ] **Step 3: Export `seededRandom`** — in `packages/core/src/tarot/draw.ts`, add below `xoshiro128ss`:

```ts
/** Deterministic floats in [0, 1) for a seed (xmur3 → xoshiro128**); same on server and browser. */
export function seededRandom(seed: string): () => number {
  return xoshiro128ss(seed);
}
```

- [ ] **Step 4: Write `constellations.ts`**

```ts
export type SignId =
  | "aries" | "taurus" | "gemini" | "cancer" | "leo" | "virgo"
  | "libra" | "scorpio" | "sagittarius" | "capricorn" | "aquarius" | "pisces";

export interface ConstellationDef {
  id: SignId;
  ko: string;
  en: string;
  /** friends needed to complete it (= stars.length) */
  slots: number;
  /** star positions in a 1000×1000 box, in fill order */
  stars: readonly (readonly [number, number])[];
  /** pairs of star indexes joined by a line */
  lines: readonly (readonly [number, number])[];
  /** first day of the tropical sun sign, [month, day] */
  from: readonly [number, number];
}

type Def = Omit<ConstellationDef, "slots">;

const DEFS: readonly Def[] = [
  { id: "aries", ko: "양자리", en: "Aries", from: [3, 21],
    stars: [[180, 640], [430, 520], [600, 470], [790, 300]], lines: [[0, 1], [1, 2], [2, 3]] },
  { id: "taurus", ko: "황소자리", en: "Taurus", from: [4, 20],
    stars: [[560, 620], [430, 520], [640, 500], [150, 330], [780, 220]], lines: [[0, 1], [0, 2], [1, 3], [2, 4]] },
  { id: "gemini", ko: "쌍둥이자리", en: "Gemini", from: [5, 21],
    stars: [[300, 180], [540, 200], [270, 480], [510, 500], [230, 800], [480, 820]],
    lines: [[0, 1], [0, 2], [2, 4], [1, 3], [3, 5]] },
  { id: "cancer", ko: "게자리", en: "Cancer", from: [6, 22],
    stars: [[470, 430], [520, 570], [560, 180], [260, 790], [770, 770]], lines: [[2, 0], [0, 1], [1, 3], [1, 4]] },
  { id: "leo", ko: "사자자리", en: "Leo", from: [7, 23],
    stars: [[300, 660], [330, 480], [430, 370], [380, 210], [700, 420], [880, 580]],
    lines: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [5, 0]] },
  { id: "virgo", ko: "처녀자리", en: "Virgo", from: [8, 23],
    stars: [[450, 520], [220, 430], [560, 400], [700, 240], [620, 630], [520, 830]],
    lines: [[0, 1], [0, 2], [2, 3], [0, 4], [4, 5]] },
  { id: "libra", ko: "천칭자리", en: "Libra", from: [9, 23],
    stars: [[280, 560], [500, 300], [720, 540], [510, 770]], lines: [[0, 1], [1, 2], [2, 3], [3, 0]] },
  { id: "scorpio", ko: "전갈자리", en: "Scorpio", from: [10, 24],
    stars: [[720, 160], [760, 300], [610, 420], [520, 560], [480, 700], [560, 820], [720, 860]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]] },
  { id: "sagittarius", ko: "궁수자리", en: "Sagittarius", from: [11, 23],
    stars: [[300, 500], [450, 400], [610, 440], [660, 620], [480, 700], [320, 660]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4]] },
  { id: "capricorn", ko: "염소자리", en: "Capricorn", from: [12, 22],
    stars: [[180, 360], [420, 700], [700, 720], [820, 420], [500, 480]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]] },
  { id: "aquarius", ko: "물병자리", en: "Aquarius", from: [1, 20],
    stars: [[200, 300], [380, 400], [520, 330], [650, 460], [560, 640], [730, 800]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
  { id: "pisces", ko: "물고기자리", en: "Pisces", from: [2, 19],
    stars: [[200, 700], [390, 640], [580, 600], [800, 560], [300, 470], [390, 260], [900, 470]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 6], [0, 4], [4, 5]] },
];

export const CONSTELLATIONS: readonly ConstellationDef[] = DEFS.map((d) => Object.freeze({ ...d, slots: d.stars.length }));

const BY_ID = new Map(CONSTELLATIONS.map((c) => [c.id, c]));

export function isSignId(value: unknown): value is SignId {
  return typeof value === "string" && BY_ID.has(value as SignId);
}

export function getConstellation(id: SignId): ConstellationDef {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`Unknown sign: ${id}`);
  return c;
}

/** Tropical sun sign for a birthday (month 1-12, day 1-31): the sign with the latest start on or before the date. */
export function sunSign(month: number, day: number): SignId {
  const md = month * 100 + day;
  if (md >= 1222 || md < 120) return "capricorn"; // wraps the new year
  const start = (c: ConstellationDef) => c.from[0] * 100 + c.from[1];
  let best: ConstellationDef | null = null;
  for (const c of CONSTELLATIONS) {
    if (c.id === "capricorn") continue;
    if (start(c) <= md && (best === null || start(c) > start(best))) best = c;
  }
  return best!.id;
}
```

And `packages/core/src/bonds/index.ts`:

```ts
export * from "./constellations";
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run packages/core/src/bonds/constellations.test.ts`
Expected: PASS (5 tests). If `sunSign` fails an edge case, fix the loop and keep the test as written — the test is the contract.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/bonds packages/core/src/tarot/draw.ts packages/core/src/index.ts
git commit -m "feat(core): constellation catalog, sun sign, seededRandom export" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Core — symmetric date-only 인연 score

**Files:**
- Create: `packages/core/src/bonds/score.ts`
- Modify: `packages/core/src/bonds/index.ts` (add `export * from "./score";`)
- Test: `packages/core/src/bonds/score.test.ts`

**Interfaces:**
- Consumes: `computeChart`, `SajuInput`, `SajuElement`, `STEMS`, `BRANCHES`, `stemElement` from `packages/core/src/saju/*`
- Produces:
  - `interface BondBirth { calendar: "solar" | "lunar"; year: number; month: number; day: number; isLeapMonth?: boolean }`
  - `interface BondBasis { dayStem: string; yearBranch: string; dayBranch: string; elements: Record<SajuElement, number>; uncertain: boolean }`
  - `bondBasis(birth: BondBirth): BondBasis` (throws `SajuError` on invalid dates)
  - `type BondPartId = "stem-combine" | "stem-generate" | "stem-same" | "year-six" | "year-three" | "year-same" | "year-clash" | "year-wonjin" | "day-six" | "day-three" | "day-clash" | "fill-mine" | "fill-theirs" | "uncertain"`
  - `interface BondPart { id: BondPartId; points: number; text: string }`
  - `interface BondScore { score: number; parts: BondPart[] }`
  - `bondScore(me: BondBasis, friend: BondBasis): BondScore`. The texts are written from `me`'s side; the score is symmetric.
  - `BOND_BASE = 62`, `BOND_MIN = 55`, `BOND_MAX = 99`

- [ ] **Step 1: Write the failing test** — `packages/core/src/bonds/score.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { SajuElement } from "../saju/labels";
import { BOND_MAX, BOND_MIN, bondBasis, bondScore, type BondBasis } from "./score";

const el = (목: number, 화: number, 토: number, 금: number, 수: number): Record<SajuElement, number> => ({ 목, 화, 토, 금, 수 });
const basis = (dayStem: string, yearBranch: string, dayBranch: string, elements: Record<SajuElement, number>): BondBasis =>
  ({ dayStem, yearBranch, dayBranch, elements, uncertain: false });

describe("bondBasis", () => {
  it("reads the sample chart from the date only (1990-01-01 → 己巳 丙子 丙寅)", () => {
    expect(bondBasis({ calendar: "solar", year: 1990, month: 1, day: 1 })).toEqual({
      dayStem: "丙", yearBranch: "巳", dayBranch: "寅", elements: el(1, 3, 1, 0, 1), uncertain: false,
    });
  });
});

describe("bondScore", () => {
  const best = [basis("甲", "子", "寅", el(2, 1, 1, 0, 2)), basis("己", "丑", "亥", el(1, 1, 2, 2, 0))] as const;
  const worst = [basis("甲", "子", "子", el(3, 1, 1, 1, 0)), basis("庚", "午", "午", el(3, 1, 1, 1, 0))] as const;

  it("adds 천간합, 띠 육합, 일지 육합 and both 오행 fills (98)", () => {
    const r = bondScore(best[0], best[1]);
    expect(r.parts.map((p) => [p.id, p.points])).toEqual([
      ["stem-combine", 12], ["year-six", 8], ["day-six", 6], ["fill-mine", 5], ["fill-theirs", 5],
    ]);
    expect(r.score).toBe(98);
  });

  it("clamps to the floor (62 - 5 - 4 = 53 → 55)", () => {
    const r = bondScore(worst[0], worst[1]);
    expect(r.parts.map((p) => [p.id, p.points])).toEqual([["year-clash", -5], ["day-clash", -4]]);
    expect(r.score).toBe(BOND_MIN);
  });

  it("scores 상생 and same element, 삼합, 같은 띠 and 원진", () => {
    const neutral = el(1, 1, 2, 1, 1);
    // day branches 丑·卯 have no relation, so only the stem and year items show
    expect(bondScore(basis("甲", "子", "丑", neutral), basis("丙", "辰", "卯", neutral)).parts.map((p) => p.id))
      .toEqual(["stem-generate", "year-three"]);
    expect(bondScore(basis("甲", "子", "丑", neutral), basis("乙", "子", "卯", neutral)).parts.map((p) => p.id))
      .toEqual(["stem-same", "year-same"]);
    expect(bondScore(basis("甲", "子", "寅", neutral), basis("庚", "未", "午", neutral)).parts.map((p) => [p.id, p.points]))
      .toEqual([["year-wonjin", -3], ["day-three", 5]]);
  });

  it("is symmetric and deterministic for many pairs", () => {
    const stems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
    const branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
    for (let i = 0; i < 60; i++) {
      const a = basis(stems[i % 10]!, branches[i % 12]!, branches[(i * 5) % 12]!, el(i % 3, 2, 1, (i + 1) % 3, 1));
      const b = basis(stems[(i * 7) % 10]!, branches[(i * 3) % 12]!, branches[(i * 11) % 12]!, el(1, i % 4, 2, 0, (i + 2) % 3));
      const ab = bondScore(a, b).score;
      expect(bondScore(b, a).score).toBe(ab);
      expect(bondScore(a, b).score).toBe(ab);
      expect(ab).toBeGreaterThanOrEqual(BOND_MIN);
      expect(ab).toBeLessThanOrEqual(BOND_MAX);
    }
  });

  it("explains every part in plain Korean from the owner's side", () => {
    for (const p of bondScore(best[0], best[1]).parts) expect(p.text).toMatch(/[가-힣]/);
    expect(bondScore(best[0], best[1]).parts.find((p) => p.id === "fill-mine")!.text).toContain("금");
  });

  it("adds a zero-point note when either date sits on a pillar boundary", () => {
    const r = bondScore({ ...best[0], uncertain: true }, best[1]);
    expect(r.parts.at(-1)).toMatchObject({ id: "uncertain", points: 0 });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run packages/core/src/bonds/score.test.ts`
Expected: FAIL (`Cannot find module './score'`).

- [ ] **Step 3: Write `score.ts`**

```ts
import { computeChart, type SajuInput } from "../saju/chart";
import { BRANCHES, STEMS, stemElement, type SajuElement } from "../saju/labels";

export interface BondBirth { calendar: "solar" | "lunar"; year: number; month: number; day: number; isLeapMonth?: boolean }

/** What the score needs from one person. Stored for the owner instead of the birth date. */
export interface BondBasis {
  dayStem: string;
  yearBranch: string;
  dayBranch: string;
  /** visible stems + branches of the three date pillars (6 characters) */
  elements: Record<SajuElement, number>;
  /** a year or month pillar changes during the birth day (입춘·절입일) */
  uncertain: boolean;
}

export type BondPartId =
  | "stem-combine" | "stem-generate" | "stem-same"
  | "year-six" | "year-three" | "year-same" | "year-clash" | "year-wonjin"
  | "day-six" | "day-three" | "day-clash"
  | "fill-mine" | "fill-theirs" | "uncertain";

export interface BondPart { id: BondPartId; points: number; text: string }
export interface BondScore { score: number; parts: BondPart[] }

export const BOND_BASE = 62;
export const BOND_MIN = 55;
export const BOND_MAX = 99;

const ELEMENT_ORDER: readonly SajuElement[] = ["목", "화", "토", "금", "수"];
/** 목→화→토→금→수→목 */
const GENERATES: Record<SajuElement, SajuElement> = { 목: "화", 화: "토", 토: "금", 금: "수", 수: "목" };
/** 원진: 子未 丑午 寅酉 卯申 辰亥 巳戌 (branch indexes) */
const WONJIN = new Set(["0-7", "1-6", "2-9", "3-8", "4-11", "5-10"]);

/** Date-only basis: the chart is computed with time unknown, so birth time never changes the score. */
export function bondBasis(birth: BondBirth): BondBasis {
  const input: SajuInput = {
    calendar: birth.calendar, year: birth.year, month: birth.month, day: birth.day,
    isLeapMonth: birth.isLeapMonth, time: null, gender: "female",
    place: { name: "서울", longitude: 126.978 },
  };
  const chart = computeChart(input);
  return {
    dayStem: chart.pillars.day.stem,
    yearBranch: chart.pillars.year.branch,
    dayBranch: chart.pillars.day.branch,
    elements: { ...chart.elements },
    uncertain: chart.ambiguous.length > 0,
  };
}

const stemIdx = (s: string) => STEMS.indexOf(s as (typeof STEMS)[number]);
const branchIdx = (b: string) => BRANCHES.indexOf(b as (typeof BRANCHES)[number]);

function stemPart(a: string, b: string): BondPart | null {
  const i = stemIdx(a);
  const j = stemIdx(b);
  if (Math.abs(i - j) === 5) return { id: "stem-combine", points: 12, text: "두 분의 일간이 서로 합을 이루는 사이예요" };
  const ea = stemElement(a);
  const eb = stemElement(b);
  if (GENERATES[ea] === eb || GENERATES[eb] === ea) return { id: "stem-generate", points: 10, text: "두 분의 일간이 서로 살려 주는 사이예요" };
  if (ea === eb) return { id: "stem-same", points: 6, text: "두 분의 일간이 같은 결이에요" };
  return null;
}

type BranchKind = "six" | "three" | "same" | "clash" | "wonjin";

function branchKinds(a: string, b: string): BranchKind[] {
  const i = branchIdx(a);
  const j = branchIdx(b);
  const kinds: BranchKind[] = [];
  if (i === j) kinds.push("same");
  else {
    if ((i + j) % 12 === 1) kinds.push("six");
    if (i % 4 === j % 4) kinds.push("three");
    if (Math.abs(i - j) === 6) kinds.push("clash");
    const lo = Math.min(i, j);
    const hi = Math.max(i, j);
    if (WONJIN.has(`${lo}-${hi}`)) kinds.push("wonjin");
  }
  return kinds;
}

const YEAR: Record<BranchKind, Omit<BondPart, "id"> & { id: BondPartId }> = {
  six: { id: "year-six", points: 8, text: "띠가 짝을 이루는 사이예요" },
  three: { id: "year-three", points: 7, text: "띠가 같은 무리로 모이는 사이예요" },
  same: { id: "year-same", points: 4, text: "같은 띠라 통하는 게 많아요" },
  clash: { id: "year-clash", points: -5, text: "띠가 마주 보는 사이라, 부딪히면서 서로를 깨워요" },
  wonjin: { id: "year-wonjin", points: -3, text: "띠끼리 서운함이 쌓이기 쉬운 짝이라, 말로 풀어 주면 좋아요" },
};
const DAY: Partial<Record<BranchKind, BondPart>> = {
  six: { id: "day-six", points: 6, text: "일지가 짝을 이뤄 곁에 있으면 편한 사이예요" },
  three: { id: "day-three", points: 5, text: "일지가 같은 무리라 함께할 때 힘이 모여요" },
  clash: { id: "day-clash", points: -4, text: "일지가 마주 보는 사이라, 거리를 조절하면 더 좋아요" },
};

/** The single largest applicable item (spec §4). */
function best<T extends { points: number }>(items: T[]): T | null {
  return items.reduce<T | null>((top, x) => (top === null || x.points > top.points ? x : top), null);
}

function weakest(e: Record<SajuElement, number>): SajuElement[] {
  const min = Math.min(...ELEMENT_ORDER.map((k) => e[k]));
  return ELEMENT_ORDER.filter((k) => e[k] === min);
}

export function bondScore(me: BondBasis, friend: BondBasis): BondScore {
  const parts: BondPart[] = [];
  const stem = stemPart(me.dayStem, friend.dayStem);
  if (stem) parts.push(stem);
  const year = best(branchKinds(me.yearBranch, friend.yearBranch).map((k) => YEAR[k]));
  if (year) parts.push({ ...year });
  const day = best(branchKinds(me.dayBranch, friend.dayBranch).flatMap((k) => (DAY[k] ? [DAY[k]!] : [])));
  if (day) parts.push({ ...day });
  const mine = weakest(me.elements).find((k) => friend.elements[k] >= 2);
  if (mine) parts.push({ id: "fill-mine", points: 5, text: `내게 부족한 ${mine} 기운을 친구가 채워 줘요` });
  const theirs = weakest(friend.elements).find((k) => me.elements[k] >= 2);
  if (theirs) parts.push({ id: "fill-theirs", points: 5, text: `친구에게 부족한 ${theirs} 기운을 내가 채워 줘요` });
  if (me.uncertain || friend.uncertain) parts.push({ id: "uncertain", points: 0, text: "절기가 바뀌는 날에 태어나 기준에 따라 달라질 수 있어요" });
  const raw = BOND_BASE + parts.reduce((n, p) => n + p.points, 0);
  return { score: Math.min(BOND_MAX, Math.max(BOND_MIN, raw)), parts };
}
```

Add to `packages/core/src/bonds/index.ts`: `export * from "./score";`

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/core/src/bonds/score.test.ts`
Expected: PASS (7 tests). Symmetry holds because every rule is symmetric in (me, friend): the two fill checks are mirror images and weigh 5 each.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/bonds
git commit -m "feat(core): symmetric date-only 인연 score with explained parts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Core — weekly lucky numbers

**Files:**
- Create: `packages/core/src/bonds/lucky.ts`
- Modify: `packages/core/src/bonds/index.ts` (add `export * from "./lucky";`)
- Test: `packages/core/src/bonds/lucky.test.ts`

**Interfaces:**
- Consumes: `seededRandom` (Task 1), `BondBasis` (Task 2), `CARDS`, `CardDef` from `tarot/cards`, `computeChart`, `stemElement`
- Produces:
  - `kstWeekId(now: number): string`: the KST Monday as `YYYY-MM-DD`
  - `elementNumbers(e: SajuElement): number[]`: the 1–45 numbers for that element under 하도수
  - `cardNumber(card: CardDef): number`: a value in 1–45
  - `weeklyCard(seedKey: string, weekId: string): CardDef`
  - `weekElement(weekId: string): SajuElement`: the Monday's day-stem element
  - `interface LuckyNumber { n: number; reason: string }`
  - `weeklyLucky(args: { basis: BondBasis; seedKey: string; weekId: string }): { numbers: LuckyNumber[]; card: CardDef }`: 6 numbers, ascending, unique
  - `LUCKY_NOTICE = "재미로 보는 번호예요. 추첨에서는 모든 번호의 확률이 같아요."`

- [ ] **Step 1: Write the failing test** — `packages/core/src/bonds/lucky.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { getCard } from "../tarot/cards";
import type { BondBasis } from "./score";
import { LUCKY_NOTICE, cardNumber, elementNumbers, kstWeekId, weekElement, weeklyLucky } from "./lucky";

const basis: BondBasis = { dayStem: "丙", yearBranch: "巳", dayBranch: "寅", elements: { 목: 1, 화: 3, 토: 1, 금: 0, 수: 1 }, uncertain: false };

describe("lucky numbers", () => {
  it("maps elements to 하도수 endings within 1-45", () => {
    expect(elementNumbers("수")).toEqual([1, 6, 11, 16, 21, 26, 31, 36, 41]);
    expect(elementNumbers("토")).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45]);
  });

  it("maps cards to 1-45 (the Fool is 22)", () => {
    expect(cardNumber(getCard("major-00-fool"))).toBe(22);
    expect(cardNumber(getCard("major-17-star"))).toBe(17);
    expect(cardNumber(getCard("wands-01"))).toBe(1);
    expect(cardNumber(getCard("pentacles-14"))).toBe(11); // (3*14 + 14 - 1) % 45 + 1
  });

  it("uses the KST Monday as the week id", () => {
    // 2026-10-04 is a Sunday; 23:30 KST that day is still the week of 2026-09-28
    expect(kstWeekId(Date.UTC(2026, 9, 4, 14, 30))).toBe("2026-09-28");
    // 2026-10-05 00:10 KST is Monday → new week
    expect(kstWeekId(Date.UTC(2026, 9, 4, 15, 10))).toBe("2026-10-05");
  });

  it("gives 6 unique ascending numbers with a reason each, the same for the same person and week", () => {
    const a = weeklyLucky({ basis, seedKey: "owner-1", weekId: "2026-09-28" });
    const b = weeklyLucky({ basis, seedKey: "owner-1", weekId: "2026-09-28" });
    expect(a).toEqual(b);
    const ns = a.numbers.map((x) => x.n);
    expect(new Set(ns).size).toBe(6);
    expect([...ns].sort((x, y) => x - y)).toEqual(ns);
    for (const x of a.numbers) {
      expect(x.n).toBeGreaterThanOrEqual(1);
      expect(x.n).toBeLessThanOrEqual(45);
      expect(x.reason).toMatch(/[가-힣]/);
    }
    // two picks come from the weakest element (금 → endings 4, 9)
    expect(a.numbers.filter((x) => x.reason.includes("부족한 금")).every((x) => [4, 9].includes(x.n % 10))).toBe(true);
    expect(weeklyLucky({ basis, seedKey: "owner-1", weekId: "2026-10-05" })).not.toEqual(a);
    expect(weekElement("2026-09-28")).toMatch(/^[목화토금수]$/);
    expect(LUCKY_NOTICE).toContain("확률이 같아요");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run packages/core/src/bonds/lucky.test.ts`
Expected: FAIL (`Cannot find module './lucky'`).

- [ ] **Step 3: Write `lucky.ts`**

```ts
import { computeChart } from "../saju/chart";
import { stemElement, type SajuElement } from "../saju/labels";
import { CARDS, type CardDef } from "../tarot/cards";
import { seededRandom } from "../tarot/draw";
import type { BondBasis } from "./score";

export const LUCKY_NOTICE = "재미로 보는 번호예요. 추첨에서는 모든 번호의 확률이 같아요.";

/** 하도수: 水 1·6, 火 2·7, 木 3·8, 金 4·9, 土 5·10 → last digits. */
const DIGITS: Record<SajuElement, readonly [number, number]> = { 수: [1, 6], 화: [2, 7], 목: [3, 8], 금: [4, 9], 토: [5, 0] };
const ORDER: readonly SajuElement[] = ["목", "화", "토", "금", "수"];
const SUITS = ["wands", "cups", "swords", "pentacles"] as const;
/** 을/를 by the element's final consonant (목·금 end in a consonant). */
const OBJ: Record<SajuElement, string> = { 목: "을", 화: "를", 토: "를", 금: "을", 수: "를" };

export interface LuckyNumber { n: number; reason: string }

export function elementNumbers(e: SajuElement): number[] {
  const [a, b] = DIGITS[e];
  const out: number[] = [];
  for (let n = 1; n <= 45; n++) if (n % 10 === a || n % 10 === b) out.push(n);
  return out;
}

export function cardNumber(card: CardDef): number {
  if (card.arcana === "major") return card.number === 0 ? 22 : card.number;
  const suit = SUITS.indexOf(card.suit!);
  return ((suit * 14 + card.number - 1) % 45) + 1;
}

const DAY_MS = 86_400_000;
const KST_MS = 9 * 3_600_000;

export function kstWeekId(now: number): string {
  const kst = new Date(now + KST_MS);
  const dow = (kst.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - dow * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

export function weeklyCard(seedKey: string, weekId: string): CardDef {
  const rand = seededRandom(`card:${seedKey}:${weekId}`);
  return CARDS[Math.floor(rand() * CARDS.length)]!;
}

export function weekElement(weekId: string): SajuElement {
  const [y, m, d] = weekId.split("-").map(Number) as [number, number, number];
  const chart = computeChart({ calendar: "solar", year: y, month: m, day: d, time: null, gender: "female", place: { name: "서울", longitude: 126.978 } });
  return stemElement(chart.pillars.day.stem);
}

export function weeklyLucky({ basis, seedKey, weekId }: { basis: BondBasis; seedKey: string; weekId: string }): { numbers: LuckyNumber[]; card: CardDef } {
  const rand = seededRandom(`lucky:${seedKey}:${weekId}`);
  const taken = new Set<number>();
  const numbers: LuckyNumber[] = [];
  const pickFrom = (pool: number[], reason: (n: number) => string) => {
    const free = pool.filter((n) => !taken.has(n));
    const from = free.length > 0 ? free : Array.from({ length: 45 }, (_, i) => i + 1).filter((n) => !taken.has(n));
    const n = from[Math.floor(rand() * from.length)]!;
    taken.add(n);
    numbers.push({ n, reason: reason(n) });
  };

  const min = Math.min(...ORDER.map((e) => basis.elements[e]));
  const weak = ORDER.find((e) => basis.elements[e] === min)!;
  const day = stemElement(basis.dayStem);
  const card = weeklyCard(seedKey, weekId);
  const week = weekElement(weekId);

  pickFrom(elementNumbers(weak), (n) => `${n} · 부족한 ${weak}${OBJ[weak]} 채우는 숫자`);
  pickFrom(elementNumbers(weak), (n) => `${n} · 부족한 ${weak}${OBJ[weak]} 채우는 숫자`);
  pickFrom(elementNumbers(day), (n) => `${n} · 나의 일간 ${day}의 숫자`);
  const cn = cardNumber(card);
  pickFrom(taken.has(cn) ? [] : [cn], (n) => `${n} · 이번 주 카드 ${card.names.ko}${n === cn ? "" : " 곁의 숫자"}`);
  pickFrom(elementNumbers(week), (n) => `${n} · 이번 주 기운 ${week}의 숫자`);
  pickFrom(elementNumbers(week), (n) => `${n} · 이번 주 기운 ${week}의 숫자`);

  numbers.sort((a, b) => a.n - b.n);
  return { numbers, card };
}
```

Add to `packages/core/src/bonds/index.ts`: `export * from "./lucky";`

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/core/src/bonds`
Expected: PASS (all bonds tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/bonds
git commit -m "feat(core): weekly lucky numbers (하도수, weekly card, KST week)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: D1 schema and repository (D1 + memory)

**Files:**
- Create: `apps/web/migrations/0001_bonds.sql`, `apps/web/lib/db/bondsRepo.ts`, `apps/web/lib/db/d1BondsRepo.ts`, `apps/web/lib/db/memoryBondsRepo.ts`, `apps/web/lib/db/index.ts`
- Modify: `apps/web/wrangler.jsonc` (add `d1_databases`), `apps/web/next.config.ts` (call `initOpenNextCloudflareForDev()` so `next dev` gets a local D1)
- Test: `apps/web/lib/db/memoryBondsRepo.test.ts` (the contract suite; the D1 implementation passes the same suite in Task 13 against `wrangler d1 --local`)

**Controller pre-step:** create the database with the Cloudflare MCP tool `d1_database_create` (name `starlog`) and pass the returned `database_id` to the implementer.

**Interfaces:**
- Consumes: `BondBasis`, `BondPart`, `SignId` from `@starlog/core`
- Produces (`bondsRepo.ts`):

```ts
import type { BondBasis, BondPart, Orientation, SignId } from "@starlog/core";

export interface OwnerRow { id: string; nickname: string; rankingPublic: boolean; basis: BondBasis; lastRefillAt: number | null; createdAt: number }
export interface InviteRow { code: string; ownerId: string; createdAt: number; revokedAt: number | null }
export type ConstellationStatus = "filling" | "complete";
export interface ConstellationRow { id: string; ownerId: string; sign: SignId; status: ConstellationStatus; total: number; startedAt: number; completedAt: number | null }
export interface StarRow {
  id: string; constellationId: string; slot: number; nickname: string; message: string | null;
  cardId: string; orientation: Orientation; score: number; parts: BondPart[]; friendKey: string; createdAt: number;
}
export interface RankingEntry { constellationId: string; nickname: string; total: number; completedAt: number }

export interface BondsRepo {
  getOwner(id: string): Promise<OwnerRow | null>;
  upsertOwner(row: OwnerRow): Promise<void>;
  activeInvite(ownerId: string): Promise<InviteRow | null>;
  inviteByCode(code: string): Promise<InviteRow | null>;
  insertInvite(row: InviteRow): Promise<void>;
  revokeInvites(ownerId: string, at: number): Promise<void>;
  getConstellation(id: string): Promise<ConstellationRow | null>;
  fillingOf(ownerId: string): Promise<ConstellationRow | null>;
  completedOf(ownerId: string): Promise<ConstellationRow[]>;
  insertConstellation(row: ConstellationRow): Promise<void>;
  updateConstellation(id: string, patch: Partial<Pick<ConstellationRow, "status" | "total" | "completedAt">>): Promise<void>;
  deleteConstellation(id: string): Promise<void>; // deletes its stars too
  starsOf(constellationId: string): Promise<StarRow[]>; // slot order
  insertStar(row: StarRow): Promise<void>; // rejects duplicate (constellationId, slot) or (constellationId, friendKey)
  deleteStar(id: string): Promise<void>;
  starsSince(ownerId: string, since: number): Promise<number>;
  ranking(sign: SignId, since: number | null, limit: number): Promise<RankingEntry[]>; // public owners, complete, total desc, completedAt asc
  rankOf(constellationId: string, since: number | null): Promise<number | null>; // 1-based among public entries; null if not ranked
}
```

- [ ] **Step 1: Write the migration** — `apps/web/migrations/0001_bonds.sql`

```sql
CREATE TABLE owners (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  ranking_public INTEGER NOT NULL DEFAULT 1,
  basis_json TEXT NOT NULL,
  last_refill_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX invites_owner ON invites(owner_id, revoked_at);
CREATE TABLE constellations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  sign TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('filling', 'complete')),
  total INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX constellations_owner ON constellations(owner_id, status);
CREATE INDEX constellations_rank ON constellations(sign, status, total DESC, completed_at ASC);
CREATE TABLE stars (
  id TEXT PRIMARY KEY,
  constellation_id TEXT NOT NULL REFERENCES constellations(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  nickname TEXT NOT NULL,
  message TEXT,
  card_id TEXT NOT NULL,
  orientation TEXT NOT NULL,
  score INTEGER NOT NULL,
  parts_json TEXT NOT NULL,
  friend_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (constellation_id, slot),
  UNIQUE (constellation_id, friend_key)
);
CREATE INDEX stars_created ON stars(created_at);
```

- [ ] **Step 2: Write the contract test** — `apps/web/lib/db/memoryBondsRepo.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { BondsRepo, ConstellationRow, OwnerRow, StarRow } from "./bondsRepo";
import { createMemoryBondsRepo } from "./memoryBondsRepo";

const basis = { dayStem: "丙", yearBranch: "巳", dayBranch: "寅", elements: { 목: 1, 화: 3, 토: 1, 금: 0, 수: 1 }, uncertain: false };
const owner = (id: string, nickname: string, rankingPublic = true): OwnerRow => ({ id, nickname, rankingPublic, basis, lastRefillAt: null, createdAt: 1 });
const con = (id: string, ownerId: string, total: number, completedAt: number | null): ConstellationRow =>
  ({ id, ownerId, sign: "aries", status: completedAt ? "complete" : "filling", total, startedAt: 1, completedAt });
const star = (id: string, constellationId: string, slot: number, friendKey: string): StarRow =>
  ({ id, constellationId, slot, nickname: `별${slot}`, message: null, cardId: "wands-01", orientation: "upright", score: 80, parts: [], friendKey, createdAt: 10 + slot });

export function bondsRepoContract(make: () => Promise<BondsRepo> | BondsRepo) {
  it("stores owners, invites and revokes old codes", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("o1", "용우"));
    expect((await repo.getOwner("o1"))?.nickname).toBe("용우");
    await repo.insertInvite({ code: "K7M4QX", ownerId: "o1", createdAt: 1, revokedAt: null });
    expect((await repo.activeInvite("o1"))?.code).toBe("K7M4QX");
    await repo.revokeInvites("o1", 5);
    expect(await repo.activeInvite("o1")).toBeNull();
    expect((await repo.inviteByCode("K7M4QX"))?.revokedAt).toBe(5);
  });

  it("keeps stars unique per slot and per friend, and deletes them with the constellation", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("o1", "용우"));
    await repo.insertConstellation(con("c1", "o1", 0, null));
    await repo.insertStar(star("s0", "c1", 0, "f0"));
    await expect(repo.insertStar(star("s1", "c1", 0, "f1"))).rejects.toThrow();
    await expect(repo.insertStar(star("s2", "c1", 1, "f0"))).rejects.toThrow();
    expect((await repo.fillingOf("o1"))?.id).toBe("c1");
    expect(await repo.starsSince("o1", 0)).toBe(1);
    await repo.deleteConstellation("c1");
    expect(await repo.starsOf("c1")).toEqual([]);
  });

  it("ranks complete, public constellations by total then earlier completion", async () => {
    const repo = await make();
    await repo.upsertOwner(owner("a", "가"));
    await repo.upsertOwner(owner("b", "나"));
    await repo.upsertOwner(owner("c", "다", false));
    await repo.insertConstellation(con("ca", "a", 350, 200));
    await repo.insertConstellation(con("cb", "b", 350, 100));
    await repo.insertConstellation(con("cc", "c", 390, 150));
    expect((await repo.ranking("aries", null, 50)).map((e) => e.nickname)).toEqual(["나", "가"]);
    expect(await repo.rankOf("ca", null)).toBe(2);
    expect(await repo.rankOf("cc", null)).toBeNull();
    expect((await repo.ranking("aries", 150, 50)).map((e) => e.nickname)).toEqual(["가"]);
  });
}

describe("memory BondsRepo", () => bondsRepoContract(() => createMemoryBondsRepo()));
```

- [ ] **Step 3: Run it and see it fail**

Run: `npx vitest run apps/web/lib/db/memoryBondsRepo.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement** `bondsRepo.ts` (the interface above, verbatim), then `memoryBondsRepo.ts`:
  - Implement `createMemoryBondsRepo(): BondsRepo` with `Map`s for owners, invites, constellations and stars.
  - `insertStar` throws `new Error("UNIQUE")` on a duplicate slot or friendKey within the same constellation.
  - `ranking` and `rankOf` filter to `status === "complete"`, public owners, and `completedAt >= since` when `since` is set. They sort by `total desc`, then `completedAt asc`.

  Then `d1BondsRepo.ts` with `createD1BondsRepo(db: D1Database): BondsRepo`:
  - Use prepared statements that mirror the same semantics. `parts_json`/`basis_json` are `JSON.stringify`/`JSON.parse`, and `ranking_public` is `0|1`.
  - `deleteConstellation` runs `DELETE FROM stars WHERE constellation_id=?` and `DELETE FROM constellations WHERE id=?` in one `db.batch`.
  - `rankOf` returns null when the owner is private or the row is not complete. Otherwise it returns `SELECT COUNT(*)+1 ... WHERE sign=? AND status='complete' AND public AND (total > ? OR (total = ? AND completed_at < ?)) [AND completed_at >= since]`.

  Then `index.ts`:

```ts
import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { BondsRepo } from "./bondsRepo";
import { createD1BondsRepo } from "./d1BondsRepo";
import { createMemoryBondsRepo } from "./memoryBondsRepo";

declare global {
  interface CloudflareEnv { DB?: D1Database }
}

let memory: BondsRepo | null = null;

/** D1 on Workers (and `next dev` via initOpenNextCloudflareForDev); an in-memory store elsewhere. */
export function bondsRepo(): BondsRepo {
  try {
    const db = getCloudflareContext().env.DB;
    if (db) return createD1BondsRepo(db);
  } catch {
    // not on Workers
  }
  if (process.env.NODE_ENV === "production") throw new Error("DB binding missing");
  memory ??= createMemoryBondsRepo();
  return memory;
}
```

  Add to `apps/web/wrangler.jsonc`:

```jsonc
"d1_databases": [
  { "binding": "DB", "database_name": "starlog", "database_id": "<id from the controller>", "migrations_dir": "migrations" }
]
```

  In `apps/web/next.config.ts`, add at the bottom:

```ts
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
```

  If `D1Database` is not a known type, run `npx wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts` in `apps/web` and commit `cloudflare-env.d.ts`.

- [ ] **Step 5: Run the tests** — `npx vitest run apps/web/lib/db` → PASS (3 tests). `pnpm typecheck` → no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/migrations apps/web/lib/db apps/web/wrangler.jsonc apps/web/next.config.ts apps/web/cloudflare-env.d.ts
git commit -m "feat(db): D1 schema and bonds repository (D1 + memory)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Bonds service — the rules

**Files:**
- Create: `apps/web/lib/bonds/text.ts`, `apps/web/lib/bonds/service.ts`, `apps/web/lib/bonds/bondCardText.ts`
- Test: `apps/web/lib/bonds/service.test.ts`, `apps/web/lib/bonds/text.test.ts`

**Interfaces:**
- Consumes: `BondsRepo` and its row types (Task 4), `bondBasis`, `bondScore`, `getConstellation`, `isSignId`, `seededRandom`, `createDeck`, `CARDS` from `@starlog/core`, `randomId` from `apps/web/lib/security/sign.ts`, `getKbCard` from `apps/web/lib/kb/index.ts` (P2b; use its actual export name for a card's compact KB entry)
- Produces:
  - `text.ts`:
    - `INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"`, `newInviteCode(): string`, `normalizeCode(raw: string): string | null` (6 alphabet chars after upper-casing and trimming, else null)
    - `checkNickname(raw): { ok: true; value: string } | { ok: false; reason: "LENGTH" | "BLOCKED" }` (2–10 chars after trim, no control chars, small Korean/English profanity list)
    - `checkMessage(raw): same` (0–40 chars, null when empty)
  - `service.ts`: `class BondsError extends Error { code: BondsErrorCode }` with `type BondsErrorCode = "NO_OWNER" | "BAD_INPUT" | "SIGN_COMPLETED" | "FILLING_EXISTS" | "NO_FILLING" | "BAD_CODE" | "CHOOSING" | "SELF_JOIN" | "ALREADY_JOINED" | "DAILY_STAR_LIMIT" | "COOLDOWN" | "NOT_FOUND"`, plus these functions (all take `repo: BondsRepo, now: number` first):
    - `saveOwner(repo, now, ownerId, { nickname, birth: BondBirth, rankingPublic? }): Promise<OwnerRow>`: computes the basis; the birth date is not kept
    - `chooseSign(repo, now, ownerId, sign)`: fails with `FILLING_EXISTS` or `SIGN_COMPLETED`
    - `switchSign(repo, now, ownerId, sign)`: deletes the current filling and starts `sign` at 0
    - `refill(repo, now, ownerId, sign)`: `sign` must be complete, else it fails with `NOT_FOUND`. Fails with `COOLDOWN` inside 1 hour of `lastRefillAt`. Deletes that complete constellation and any filling one, starts `sign` at 0, and sets `lastRefillAt`
    - `inviteOf(repo, now, ownerId)` (create if missing), `regenerateInvite(repo, now, ownerId)`
    - `resolveInvite(repo, code): Promise<{ ownerNickname: string; sign: SignId | null; filled: number; slots: number }>`: fails with `BAD_CODE` for unknown or revoked codes
    - `joinStar(repo, now, { code, friendKey, joinerOwnerId?, nickname, birth, pick, message })`:
      - `pick` is an index in 0..20 of the friend's fan; the server makes a fresh deck with `createDeck(randomId(), 0.3)` and takes `order[fanIndexes(78,21)[pick]]`.
      - Errors: `SELF_JOIN` when `joinerOwnerId === owner.id`, `CHOOSING` when there is no filling, `ALREADY_JOINED`, and `DAILY_STAR_LIMIT` at 20 stars per owner per KST day.
      - It computes `bondScore(owner.basis, bondBasis(birth))` and inserts the star into the next free slot.
      - On the last slot it sets the status to `complete`, the total to the sum and `completedAt: now`.
      - It returns `{ star, score, parts, completed, sign, ownerNickname, bondLine }`, where `bondLine` comes from `bondCardText`.
    - `removeStar(repo, now, ownerId, starId)`: a complete constellation goes back to `filling`, the total is recomputed and `completedAt` becomes null
    - `ownerView(repo, now, ownerId)` → `{ owner, invite, filling: { row, stars } | null, completed: ConstellationRow[], top5: StarRow[] (by score desc across filling + completed), ranks: Record<SignId, { week: number | null; all: number | null }> }`
    - `rankingView(repo, now, sign, ownerId | null)` → `{ week: RankingEntry[]; all: RankingEntry[]; mine: { row: ConstellationRow; stars: StarRow[]; weekRank: number | null; allRank: number | null } | null; filling: boolean }` (limit 50, the week starts at the KST Monday)
    - `todayBondCard(repo, now, ownerId, starId)` → `{ cardId, orientation, day }`, deterministic from `seededRandom(\`bond:${ownerId}:${starId}:${kstDay(now)}\`)`
  - `bondCardText.ts`: `bondCardLine(cardId, orientation): string`. One 해요체 sentence built from the card's KB keyword + core for the relationship topic, e.g. `요즘 두 사람 사이엔 {keyword}의 기운이 흘러요`. No AI.

- [ ] **Step 1: Write the failing tests** — `apps/web/lib/bonds/service.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { bondBasis, bondScore } from "@starlog/core";
import { createMemoryBondsRepo } from "@/lib/db/memoryBondsRepo";
import { BondsError, chooseSign, inviteOf, joinStar, ownerView, rankingView, refill, regenerateInvite, removeStar, resolveInvite, saveOwner, switchSign } from "./service";

const HOUR = 3_600_000;
const me = { calendar: "solar" as const, year: 1990, month: 1, day: 1 };
const friends = [
  { calendar: "solar" as const, year: 1991, month: 5, day: 12 },
  { calendar: "solar" as const, year: 1992, month: 8, day: 3 },
  { calendar: "solar" as const, year: 1988, month: 11, day: 20 },
  { calendar: "solar" as const, year: 1995, month: 2, day: 28 },
];

async function setup() {
  const repo = createMemoryBondsRepo();
  const t0 = Date.UTC(2026, 9, 1, 3);
  await saveOwner(repo, t0, "o1", { nickname: "용우", birth: me });
  const { code } = await inviteOf(repo, t0, "o1");
  return { repo, t0, code };
}
const join = (repo: ReturnType<typeof createMemoryBondsRepo>, now: number, code: string, i: number) =>
  joinStar(repo, now, { code, friendKey: `f${i}`, nickname: `친구${i}`, birth: friends[i]!, pick: i, message: null });

describe("bonds service", () => {
  it("does not store the owner's birth date", async () => {
    const { repo } = await setup();
    expect(JSON.stringify(await repo.getOwner("o1"))).not.toContain("1990");
  });

  it("needs a chosen sign before friends can join", async () => {
    const { repo, t0, code } = await setup();
    await expect(join(repo, t0, code, 0)).rejects.toMatchObject({ code: "CHOOSING" });
  });

  it("fills the chosen sign in order, scores each friend, and completes on the last slot", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await join(repo, t0 + i, code, i));
    expect(results.map((r) => r.star.slot)).toEqual([0, 1, 2, 3]);
    expect(results.map((r) => r.completed)).toEqual([false, false, false, true]);
    const expected = friends.map((f) => bondScore(bondBasis(me), bondBasis(f)).score);
    expect(results.map((r) => r.score)).toEqual(expected);
    const view = await ownerView(repo, t0 + 10, "o1");
    expect(view.filling).toBeNull();
    expect(view.completed[0]).toMatchObject({ sign: "aries", status: "complete", total: expected.reduce((a, b) => a + b, 0) });
    await expect(chooseSign(repo, t0, "o1", "aries")).rejects.toMatchObject({ code: "SIGN_COMPLETED" });
  });

  it("gives the same friend the same score every time and never stores their birth date", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "leo");
    const a = await join(repo, t0, code, 0);
    await switchSign(repo, t0 + 1, "o1", "virgo");
    const b = await join(repo, t0 + 2, code, 0);
    expect(b.score).toBe(a.score);
    expect(JSON.stringify(await repo.starsOf(b.star.constellationId))).not.toContain("1991");
  });

  it("switching mid-way clears the stars and starts the new sign at zero", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "leo");
    await join(repo, t0, code, 0);
    await switchSign(repo, t0 + 1, "o1", "virgo");
    const view = await ownerView(repo, t0 + 2, "o1");
    expect(view.filling?.row.sign).toBe("virgo");
    expect(view.filling?.stars).toEqual([]);
  });

  it("새로 채우기 restarts a completed sign, clears any filling one, and has a 1-hour cooldown", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    for (let i = 0; i < 4; i++) await join(repo, t0, code, i);
    await chooseSign(repo, t0, "o1", "libra");
    await join(repo, t0, code, 0);
    await refill(repo, t0 + 1, "o1", "aries");
    let view = await ownerView(repo, t0 + 2, "o1");
    expect(view.completed).toEqual([]);
    expect(view.filling?.row.sign).toBe("aries");
    expect(view.filling?.stars).toEqual([]);
    // complete aries again with new friends, then try again inside the hour
    for (let i = 0; i < 4; i++) {
      await joinStar(repo, t0 + 3, { code, friendKey: `g${i}`, nickname: `새친구${i}`, birth: friends[i]!, pick: i, message: null });
    }
    await expect(refill(repo, t0 + HOUR / 2, "o1", "aries")).rejects.toMatchObject({ code: "COOLDOWN" });
    await refill(repo, t0 + HOUR + 2, "o1", "aries");
    view = await ownerView(repo, t0 + HOUR + 3, "o1");
    expect(view.filling?.row.sign).toBe("aries");
  });

  it("새로 채우기 only works on a completed sign", async () => {
    const { repo, t0 } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    await expect(refill(repo, t0 + 1, "o1", "aries")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects self-joins, repeat joins and revoked codes", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    await expect(joinStar(repo, t0, { code, friendKey: "x", joinerOwnerId: "o1", nickname: "나야", birth: me, pick: 0, message: null }))
      .rejects.toMatchObject({ code: "SELF_JOIN" });
    await join(repo, t0, code, 0);
    await expect(join(repo, t0, code, 0)).rejects.toMatchObject({ code: "ALREADY_JOINED" });
    const { code: next } = await regenerateInvite(repo, t0, "o1");
    await expect(resolveInvite(repo, code)).rejects.toMatchObject({ code: "BAD_CODE" });
    expect(await resolveInvite(repo, next.toLowerCase())).toMatchObject({ ownerNickname: "용우", sign: "aries", filled: 1, slots: 4 });
  });

  it("removing a star from a completed sign makes it incomplete again", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    const joined = [];
    for (let i = 0; i < 4; i++) joined.push(await join(repo, t0, code, i));
    await removeStar(repo, t0 + 1, "o1", joined[1]!.star.id);
    const view = await ownerView(repo, t0 + 2, "o1");
    expect(view.completed).toEqual([]);
    expect(view.filling?.stars.map((s) => s.slot)).toEqual([0, 2, 3]);
  });

  it("shows this week's and all-time ranking with my card", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "aries");
    for (let i = 0; i < 4; i++) await join(repo, t0, code, i);
    const view = await rankingView(repo, t0 + 1, "aries", "o1");
    expect(view.week[0]?.nickname).toBe("용우");
    expect(view.mine?.allRank).toBe(1);
    expect(view.mine?.stars).toHaveLength(4);
  });

  it("caps new stars per owner per KST day", async () => {
    const { repo, t0, code } = await setup();
    await chooseSign(repo, t0, "o1", "pisces");
    const repoAny = repo as unknown as { starsSince: (o: string, s: number) => Promise<number> };
    repoAny.starsSince = async () => 20;
    await expect(join(repo, t0, code, 0)).rejects.toMatchObject({ code: "DAILY_STAR_LIMIT" });
    await expect(join(repo, t0, code, 0)).rejects.toBeInstanceOf(BondsError);
  });
});
```

`apps/web/lib/bonds/text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { INVITE_ALPHABET, checkMessage, checkNickname, newInviteCode, normalizeCode } from "./text";

describe("bonds text rules", () => {
  it("makes 6-char codes without look-alike characters and normalizes input", () => {
    for (let i = 0; i < 200; i++) expect(newInviteCode()).toMatch(new RegExp(`^[${INVITE_ALPHABET}]{6}$`));
    expect(INVITE_ALPHABET).not.toMatch(/[01OIL]/);
    expect(normalizeCode(" k7m4qx ")).toBe("K7M4QX");
    expect(normalizeCode("K7M4Q")).toBeNull();
    expect(normalizeCode("K7M4Q0")).toBeNull();
  });

  it("accepts 2-10 char nicknames and optional 40-char messages", () => {
    expect(checkNickname(" 용우 ")).toEqual({ ok: true, value: "용우" });
    expect(checkNickname("가")).toEqual({ ok: false, reason: "LENGTH" });
    expect(checkNickname("가".repeat(11))).toEqual({ ok: false, reason: "LENGTH" });
    expect(checkMessage("")).toEqual({ ok: true, value: null });
    expect(checkMessage("가".repeat(41))).toEqual({ ok: false, reason: "LENGTH" });
  });
});
```

- [ ] **Step 2: Run them and see them fail** — `npx vitest run apps/web/lib/bonds` → FAIL (modules missing).

- [ ] **Step 3: Implement `text.ts`, `bondCardText.ts`, `service.ts`** to the interfaces above:
  - Keep the functions small: one exported function per rule and small private helpers.
  - `kstDay` comes from `apps/web/lib/security/quota.ts` (P2b), and `kstWeekId` from `@starlog/core`.
  - The KST day start in ms is `Date.parse(kstDay(now) + "T00:00:00+09:00")`.
  - Use `randomId()` from `sign.ts` for new ids.

- [ ] **Step 4: Run the tests** — `npx vitest run apps/web/lib/bonds` → PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/bonds
git commit -m "feat(bonds): service rules — choose, join, switch, 새로 채우기, invites, ranking" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Identity cookies and the bonds API

**Files:**
- Create: `apps/web/lib/bonds/identity.ts`, and these routes under `apps/web/app/api/bonds/`:
  - `me/route.ts` (GET)
  - `owner/route.ts` (POST)
  - `choose/route.ts` (POST)
  - `switch/route.ts` (POST)
  - `refill/route.ts` (POST)
  - `invite/route.ts` (POST = regenerate)
  - `resolve/route.ts` (GET `?code=`)
  - `join/route.ts` (POST)
  - `star/remove/route.ts` (POST)
  - `ranking/[sign]/route.ts` (GET)
  - `settings/route.ts` (POST `{rankingPublic}`)
  - `today-card/route.ts` (POST `{starId}`)
- Modify: `apps/web/lib/security/quota.ts` (add limiter names `BOND_JOIN_LIMITER` 10/60 s and `BOND_CODE_LIMITER` 10/60 s to `LimiterName`, `LIMITS_PER_MINUTE` and the `CloudflareEnv` declaration), `apps/web/wrangler.jsonc` (`ratelimits` entries `namespace_id` 1004 and 1005 for both)
- Test: `apps/web/app/api/bonds/bonds-api.test.ts`

**Interfaces:**
- Consumes: service functions (Task 5), `signToken`, `verifyToken`, `randomId`, `sha256`, `signingSecret` from `lib/security/sign.ts`, and `rateLimit` from `lib/security/quota.ts`
- Produces:
  - `identity.ts`:
    - `OWNER_ID_COOKIE = "sl_uid"`, `FRIEND_ID_COOKIE = "sl_fid"`
    - `readOwnerId(req): Promise<string | null>`
    - `ensureOwnerId(req): Promise<{ id: string; setCookie: string | null }>`
    - `friendKey(req): Promise<{ key: string; setCookie: string | null }>` (key = sha256 of the device id)
  - JSON responses:
    - success: `{ ok: true, ...data }`
    - failure: `{ ok: false, code }` with HTTP 400 (`BAD_INPUT`, `BAD_CODE`), 403 (`SELF_JOIN`), 404 (`NOT_FOUND`, `NO_OWNER`), 409 (`FILLING_EXISTS`, `SIGN_COMPLETED`, `CHOOSING`, `ALREADY_JOINED`, `NO_FILLING`), 429 (`COOLDOWN`, `DAILY_STAR_LIMIT`, `RATE_LIMIT`) or 503 (`NOT_CONFIGURED` when the signing secret is missing in production)
  - The `join` body is `{ code, nickname, birth: { calendar, year, month, day, isLeapMonth? }, pick: 0-20, message? }` (zod). The response is `{ ok, score, parts, completed, sign, ownerNickname, card: { cardId, orientation }, bondLine }`.

- [ ] **Step 1: Write the failing test** — `apps/web/app/api/bonds/bonds-api.test.ts`. It calls the exported handlers with `new Request(...)` objects, carries cookies between calls with a small cookie jar helper, and asserts:
  - owner create → choose aries → resolve code → 4 joins from 4 different friend cookies → the last response has `completed: true`
  - `GET me` shows `completed[0].sign === "aries"`
  - `GET ranking/aries` shows the owner first
  - a join from the owner's own cookie → 403 `SELF_JOIN`
  - an 11th code lookup within a minute from the same IP → 429 `RATE_LIMIT` (the in-memory limiter)
  - the request body of a join is not echoed in any response field except `nickname`

```ts
// apps/web/app/api/bonds/bonds-api.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { resetMemoryLimiter } from "@/lib/security/quota";
import { POST as ownerPost } from "./owner/route";
import { POST as choosePost } from "./choose/route";
import { GET as resolveGet } from "./resolve/route";
import { POST as joinPost } from "./join/route";
import { GET as meGet } from "./me/route";
import { GET as rankingGet } from "./ranking/[sign]/route";

type Jar = Map<string, string>;
const cookieHeader = (jar: Jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
function absorb(jar: Jar, res: Response) {
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const [k, v] = pair!.split("=");
    jar.set(k!, v!);
  }
}
const req = (url: string, jar: Jar, body?: unknown, ip = "1.1.1.1") =>
  new Request(`http://localhost${url}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie: cookieHeader(jar), "content-type": "application/json", "cf-connecting-ip": ip },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("bonds API", () => {
  beforeEach(() => resetMemoryLimiter());

  it("runs the owner → friends → complete → ranking loop", async () => {
    const owner: Jar = new Map();
    let res = await ownerPost(req("/api/bonds/owner", owner, { nickname: "용우", birth: { calendar: "solar", year: 1990, month: 1, day: 1 } }));
    absorb(owner, res);
    expect(res.status).toBe(200);
    const { code } = (await res.json()) as { code: string };
    res = await choosePost(req("/api/bonds/choose", owner, { sign: "aries" }));
    expect(res.status).toBe(200);
    const births = [[1991, 5, 12], [1992, 8, 3], [1988, 11, 20], [1995, 2, 28]] as const;
    let last: { completed: boolean } | null = null;
    for (const [i, [year, month, day]] of births.entries()) {
      const friend: Jar = new Map();
      res = await joinPost(req("/api/bonds/join", friend, { code, nickname: `친구${i}`, birth: { calendar: "solar", year, month, day }, pick: i }, `2.2.2.${i}`));
      expect(res.status).toBe(200);
      last = (await res.json()) as { completed: boolean };
    }
    expect(last?.completed).toBe(true);
    const me = (await (await meGet(req("/api/bonds/me", owner))).json()) as { completed: { sign: string }[] };
    expect(me.completed[0]?.sign).toBe("aries");
    const ranking = (await (await rankingGet(req("/api/bonds/ranking/aries", owner), { params: Promise.resolve({ sign: "aries" }) })).json()) as { week: { nickname: string }[] };
    expect(ranking.week[0]?.nickname).toBe("용우");
  });

  it("refuses self-joins and throttles code lookups", async () => {
    const owner: Jar = new Map();
    const res = await ownerPost(req("/api/bonds/owner", owner, { nickname: "용우", birth: { calendar: "solar", year: 1990, month: 1, day: 1 } }));
    absorb(owner, res);
    const { code } = (await res.json()) as { code: string };
    await choosePost(req("/api/bonds/choose", owner, { sign: "leo" }));
    const self = await joinPost(req("/api/bonds/join", owner, { code, nickname: "나야", birth: { calendar: "solar", year: 1990, month: 1, day: 1 }, pick: 0 }));
    expect(self.status).toBe(403);
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await resolveGet(req(`/api/bonds/resolve?code=${code}`, new Map(), undefined, "9.9.9.9"))).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
```

- [ ] **Step 2: Run it and see it fail** — `npx vitest run apps/web/app/api/bonds` → FAIL.

- [ ] **Step 3: Implement `identity.ts` and the routes.**
  - Each route: parse with zod → identity → `bondsRepo()` → service call → map `BondsError.code` to a status → JSON. Cookies are httpOnly, `SameSite=Lax`, `Secure` in production, 365 days.
  - `owner` returns `{ ok, code }` (the invite code) so the page can show it right away.
  - `today-card` returns `{ card, day, line }`. `line` comes from the P2b daily provider at low effort (5 per owner per day), with `bondCardLine` as the fallback.
  - Never log bodies.

- [ ] **Step 4: Run the tests** — `npx vitest run apps/web/app/api/bonds apps/web/lib/bonds` → PASS. `pnpm typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/bonds/identity.ts apps/web/app/api/bonds apps/web/lib/security/quota.ts apps/web/wrangler.jsonc
git commit -m "feat(bonds): device identity cookies and bonds API" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Constellation art (12 figures) and the 도감

**Files:**
- Create: `apps/web/components/bonds/art/figures.ts`, `apps/web/components/bonds/ConstellationArt.tsx` (+ `.module.css`), `apps/web/components/bonds/Dogam.tsx` (+ `.module.css`)
- Modify: `apps/web/app/dev/characters/page.tsx`: add a "별자리" section rendering all 12 in three states (empty, 2 lit, complete) for visual review
- Test: `apps/web/components/bonds/ConstellationArt.test.tsx`, `apps/web/components/bonds/Dogam.test.tsx`

**Interfaces:**
- Consumes: `CONSTELLATIONS`, `getConstellation`, `SignId` from `@starlog/core`
- Produces:
  - `FIGURES: Record<SignId, string>`: one SVG path `d` per sign in the same 1000 box, a thin decorative outline of the figure (ram, bull, twins, crab, lion, maiden, scales, scorpion, archer, sea-goat, water bearer, two fish), in the style of the owner's reference image (fine glowing line art over the star lines)
  - `<ConstellationArt sign lit={number} newSlots={number[]} labels?={string[]} size={number} title?={string} />`:
    - renders the figure path (faint), the lines (only between lit stars at full strength, the others dotted), and the stars (lit = gold `var(--gold)`, empty = hollow ring; new = a sparkle animation under `prefers-reduced-motion: no-preference`)
    - `labels[i]` draws a readable nickname pill next to star `i`; used on the owner page and in share images
    - it has `role="img"` and `aria-label` like `양자리, 별 4개 중 2개`
  - `<Dogam completed={SignId[]} filling={{ sign: SignId; filled: number } | null} />`: 12 cells in zodiac order. Each cell is a `<Link href={\`/ranking/${sign}\`}>` with the sign name and its state (완성 / 2/4 / 흐린 실루엣) and is ≥44px tall.

- [ ] **Step 1: Write the failing tests**

```tsx
// apps/web/components/bonds/ConstellationArt.test.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConstellationArt } from "./ConstellationArt";
import { FIGURES } from "./art/figures";
import { CONSTELLATIONS } from "@starlog/core";

describe("ConstellationArt", () => {
  it("has a figure path for every sign", () => {
    for (const c of CONSTELLATIONS) expect(FIGURES[c.id]).toMatch(/^M/);
  });
  it("names the sign and its progress, and draws one circle per slot", () => {
    const { container } = render(<ConstellationArt sign="aries" lit={2} newSlots={[1]} size={240} />);
    expect(screen.getByRole("img", { name: "양자리, 별 4개 중 2개" })).toBeTruthy();
    expect(container.querySelectorAll("[data-star]")).toHaveLength(4);
    expect(container.querySelectorAll('[data-star="lit"]')).toHaveLength(2);
    expect(container.querySelectorAll("[data-new]")).toHaveLength(1);
  });
  it("draws nickname labels when given", () => {
    render(<ConstellationArt sign="libra" lit={4} newSlots={[]} labels={["민지", "하늘", "도윤", "서아"]} size={400} />);
    for (const n of ["민지", "하늘", "도윤", "서아"]) expect(screen.getByText(n)).toBeTruthy();
  });
});
```

```tsx
// apps/web/components/bonds/Dogam.test.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dogam } from "./Dogam";

describe("Dogam", () => {
  it("links all 12 cells to their ranking pages and shows states", () => {
    render(<Dogam completed={["aries"]} filling={{ sign: "leo", filled: 2 }} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(12);
    expect(links[0]?.getAttribute("href")).toBe("/ranking/aries");
    expect(screen.getByRole("link", { name: /양자리.*완성/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /사자자리.*2\/6/ })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run and see them fail** — `npx vitest run apps/web/components/bonds` → FAIL.

- [ ] **Step 3: Implement.**
  - Draw the 12 figure paths by hand. Keep each under ~1.5 KB, as smooth cubic curves around the star coordinates from Task 1.
  - Styling: strokes at `rgba(241,236,255,0.35)` 1.5px, star lines at `var(--gold)` 2px when both ends are lit, dotted `rgba(243,220,161,0.35)` otherwise.
  - Label pills: `var(--ink)` text on `rgba(13,10,38,0.78)`, 13px minimum at the rendered size, and an automatic offset (above-right; flip left or down when it would overflow the box or overlap an earlier pill's bounding box).

- [ ] **Step 4: Run the tests** → PASS. Then the controller opens `/dev/characters` and reviews all 12 × 3 states. Iterate until the figures read as their animals or objects.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/bonds apps/web/app/dev/characters/page.tsx
git commit -m "feat(bonds): 12 constellation figures, star states, nickname labels, 도감" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Owner page, home card and ranking page

**Files:**
- Create: `apps/web/app/bonds/page.tsx`, `apps/web/app/bonds/BondsView.tsx` (+ css), `apps/web/app/ranking/[sign]/page.tsx`, `apps/web/app/ranking/[sign]/RankingView.tsx` (+ css), `apps/web/components/bonds/HomeBondsCard.tsx` (+ css)
- Modify: `apps/web/app/page.tsx` (replace the fixture `FriendScenesRow` with `HomeBondsCard`), `apps/web/lib/seo.ts` (add `/bonds`, `/ranking` and `/b` to `ROBOTS_DISALLOW`)
- Test: `apps/web/e2e/bonds.spec.ts` (runs against `next dev` with the memory repo)

**Interfaces:**
- Consumes: the `/api/bonds/*` routes (Task 6), `ConstellationArt` and `Dogam` (Task 7), `ShareImageButton` (Task 10; until then render the share button as the existing `ShareButton` sharing the invite link)
- Produces: the owner experience per spec §3 (owner), §5, §6, §7 and the home slot.

- [ ] **Step 1: Write the e2e spec** `apps/web/e2e/bonds.spec.ts`:
  - `/bonds` with no owner → nickname + birth date form (reuse the saju form's date fields) → submit.
  - The sign picker shows 12 figures. The one for 1990-01-01 (염소자리) carries `내 별자리`. Pick 양자리.
  - The page shows the invite code (6 chars), `초대하기`, and `양자리 0/4`.
  - Via `request` (APIRequestContext), 4 friends join through `/api/bonds/join` with distinct `sl_fid` cookies. After a reload the page shows the completion state, the 도감 cell 양자리 as 완성, and TOP 5 with 4 rows.
  - Click the 도감 cell → `/ranking/aries`. My card is on top with `공유하기` and `새로 채우기`, and this week's list starts with the owner's nickname.
  - `새로 채우기` → confirm dialog text contains `처음부터` → confirm → back to `/bonds` showing `양자리 0/4`.
  - The home card shows the badge `양자리 0/4 · 0점`.
  - Mid-way switch: pick 사자자리 with 1 star → `별자리 바꾸기` → the dialog mentions `별 1개` → confirm → `물고기자리 0/7`.

- [ ] **Step 2: Implement the pages**
  - Single scroll, in this order: current constellation (art with labels, progress, star list rows with nickname · 인연 카드 · 한 줄 · `인연 87점 · 사주` + parts, a `오늘의 인연 카드` button per star), then the invite block (code, `초대하기` = share link, `코드 새로 만들기` behind a confirm), then the 도감, then TOP 5.
  - Home card: when filling, show the mini art + badge `양자리 2/4 · 174점` + `초대하기`. Before the start, show `별자리 인연 시작하기` + `초대코드로 참여` input (→ `/b/<code>`).
  - Ranking page: my card first (the complete / filling / not-chosen variants per spec §6), then `이번 주 랭킹` and `명예의 전당` lists (rank, nickname, total). My row is highlighted. The private owner sees `랭킹에 이름을 올리지 않았어요` with a toggle.
  - One gold primary per screen:
    - owner page: `초대하기`
    - ranking page: `공유하기` when complete, `이 별자리 채우기` when not chosen, `초대하기` when filling
    - home: its existing primary stays; the bonds card uses a secondary style

- [ ] **Step 3: Run** `pnpm --filter @starlog/web e2e --grep bonds` → PASS, and take screenshots at 375, 360 and 1280 into `test-results/screens/bonds-*`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/bonds apps/web/app/ranking apps/web/components/bonds/HomeBondsCard.tsx apps/web/components/bonds/HomeBondsCard.module.css apps/web/app/page.tsx apps/web/lib/seo.ts apps/web/e2e/bonds.spec.ts
git commit -m "feat(bonds): owner page, home card, ranking page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Friend flow (code entry and join)

**Files:**
- Create: `apps/web/app/b/page.tsx` (code entry), `apps/web/app/b/[code]/page.tsx`, `apps/web/app/b/[code]/JoinFlow.tsx` (+ css)
- Test: extend `apps/web/e2e/bonds.spec.ts`

**Interfaces:**
- Consumes: `GET /api/bonds/resolve`, `POST /api/bonds/join`, the P2b `/api/tarot/daily`, `ShuffleStage` / `CardFan` (Task B of P2b), the saju date form fields
- Produces: the friend experience per spec §3 (친구).

- [ ] **Step 1: Extend the e2e spec:**
  - `/b` → type the owner's code in lower case → lands on `/b/<CODE>` with the heading `용우님의 양자리에 별이 되어 주세요` and progress `1/4`.
  - The notice `용우님이 별자리를 공유하면 이 닉네임이 이미지에 보여요` is visible under the nickname input.
  - Fill the nickname and birth date → the cat shuffle → pick a card → optional message → submit.
  - The result shows `인연 NN점`, at least one reason line, the card + `요즘 두 사람 사이` line, and a `오늘의 한 장 받기` button (calls daily). The last button is `나도 내 별자리 만들기` → `/bonds`.
  - A revoked code → `코드를 다시 확인해 주세요`.
  - The owner choosing (no filling) → `용우님이 다음 별자리를 고르는 중이에요. 조금 뒤에 다시 와 주세요`.

- [ ] **Step 2: Implement.** The birth date never goes into the URL or storage, only into the POST body. After the join, clear the form state.

- [ ] **Step 3: Run the e2e** → PASS. Screenshots at 375, 360 and 1280.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/b apps/web/e2e/bonds.spec.ts
git commit -m "feat(bonds): friend code entry and join flow" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Share images

**Files:**
- Create:
  - `apps/web/lib/og/googleFont.ts`
  - `apps/web/app/api/og/bonds/[id]/route.tsx`
  - `apps/web/app/api/og/invite/[code]/route.tsx`
  - `apps/web/app/api/og/daily/route.tsx`: today's card for this device, from the `sl_daily` cookie
  - `apps/web/app/api/og/chapter/route.tsx`: POST `{ title, cards: [{cardId, orientation}] }` → PNG, no question text
  - `apps/web/components/ui/ShareImageButton.tsx`
- Modify: `apps/web/app/b/[code]/page.tsx` (`generateMetadata` → `openGraph.images = /api/og/invite/<code>`), the owner/ranking pages (use `ShareImageButton`)
- Test: `apps/web/lib/og/googleFont.test.ts`, `apps/web/components/ui/ShareImageButton.test.tsx`

**Interfaces:**
- `loadGoogleFont(family: "Gowun Batang" | "Noto Sans KR", weight: 400 | 500 | 700, text: string): Promise<ArrayBuffer>`:
  - fetches `https://fonts.googleapis.com/css2?family=<family>:wght@<weight>&text=<encodeURIComponent(unique chars)>`
  - reads the first `src: url(...)` and fetches it
  - caches by (family, weight, text) in the Workers Cache API (`caches.default`) for 7 days
  - throws on non-200
- `GET /api/og/bonds/[id]?size=feed|story`:
  - only when the constellation is complete (404 otherwise); public, because the image contains nicknames the friends agreed to show
  - `ImageResponse` 1080×1350 (feed) or 1080×1920 (story), with `Cache-Control: public, max-age=3600`
  - content: the `ConstellationArt` geometry drawn with absolute-positioned divs/SVG (satori subset), nickname pills at each star, sign name `양자리 · Aries`, `인연 412점`, the owner's nickname, the completion date, and `starlog.yeolmaeapps.kr`
- `ShareImageButton({ imageUrl, fileName, shareText, shareUrl })`:
  - fetches the PNG → `navigator.canShare({ files })` → `navigator.share({ files, text, url })`
  - else downloads the file via `<a download>`, copies `shareUrl`, and shows the toast `이미지를 저장하고 링크를 복사했어요`

- [ ] **Step 0 (spike, keep only if it works):**
  - Add a throwaway `app/api/og/ping/route.tsx` that returns an `ImageResponse` with Korean text via `loadGoogleFont`.
  - Run `pnpm cf:build && pnpm --filter @starlog/web cf:preview`, then `curl -o ping.png localhost:8787/api/og/ping`. Expect a PNG with the Korean text.
  - If `next/og` fails on Workers, stop and report BLOCKED with the error. The controller decides: prebuilt PNG art plus client-side canvas composition as the fallback.
  - Delete the ping route before committing.
- [ ] **Step 1: Write the failing tests:**
  - `googleFont.test.ts`: mock `fetch` and assert that the CSS URL carries the de-duplicated `text` param and that the font binary is returned.
  - `ShareImageButton.test.tsx`: when `navigator.canShare` returns true, `share` gets `files`; when it is absent, an anchor with `download` is clicked and the clipboard gets `shareUrl`.
- [ ] **Step 2: Run and see them fail**, then implement, then run → PASS.
- [ ] **Step 3: Verify on the Workers preview:**
  - `curl` each image route and open the PNGs.
  - The nicknames are readable, no score or birth data appear, and the Korean glyphs render.
- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/og apps/web/app/api/og apps/web/components/ui/ShareImageButton.tsx apps/web/components/ui/ShareImageButton.test.tsx apps/web/app/b apps/web/app/bonds apps/web/app/ranking
git commit -m "feat(share): constellation, invite, daily and chapter share images" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 행운 번호 page

**Files:**
- Create: `apps/web/app/api/lucky/route.ts`, `apps/web/app/lucky/page.tsx`, `apps/web/app/lucky/LuckyView.tsx` (+ css), `apps/web/app/api/og/lucky/route.tsx`
- Modify: home (add a small `이번 주 행운 번호` row under 오늘의 한 장), `apps/web/lib/seo.ts` (`/lucky` indexable: add to the sitemap)
- Test: `apps/web/app/api/lucky/lucky-api.test.ts`, extend e2e

**Interfaces:**
- `POST /api/lucky { birth }`, or `GET` with the owner cookie (uses the stored basis) → `{ weekId, numbers: [{n, reason}], card: {cardId, name}, notice }`
  - The seed key is the owner id when the owner cookie exists, else sha256 of the device cookie.
  - The birth date is used in-request only.
- The page shows the 6 balls (gold rings, 44px), the reason list, the notice (always visible, ≥13px), and a share image button.

- [ ] **Step 1: Test:**
  - the same device/owner + the same week → an identical response
  - the next KST Monday → a different one
  - the response never contains the input birth date
  - `notice === LUCKY_NOTICE`
- [ ] **Step 2: Implement, run the tests** → PASS.
- [ ] **Step 3: e2e:** `/lucky` → enter a birth date → 6 numbers + the notice visible → reload shows the same numbers.
- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/lucky apps/web/app/lucky apps/web/app/api/og/lucky apps/web/app/page.tsx apps/web/lib/seo.ts apps/web/e2e
git commit -m "feat(lucky): weekly 행운 번호 page and share image" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Privacy policy and terms updates

**Files:**
- Modify: `apps/web/app/privacy/page.tsx`, `apps/web/app/terms/page.tsx`, `apps/web/components/legal/LegalPages.test.tsx`

- [ ] **Step 1: Test first:** the privacy page mentions each of the following, and still contains no address:
  - `별자리 인연`
  - `닉네임`
  - `한 줄`
  - `인연 점수`
  - `생년월일은 점수를 계산하는 데만 쓰고 저장하지 않습니다`
  - `랭킹`
  - `공유 이미지`
  - `Cloudflare D1`: under Cloudflare, Inc. as the processor, with "저장" added to its role
  - the retention rule `새로 채우거나 바꾸면 이전 별은 삭제`
  - the 14+ age rule
- [ ] **Step 2: Implement.** Add a section `별자리 인연` to privacy (items, purpose, public scope, retention, opt-out). Add to terms: nickname rules, prohibited content in 한 줄, and the owner's right to remove stars.
- [ ] **Step 3: Run** `npx vitest run apps/web/components/legal` → PASS.
- [ ] **Step 4: Commit**

```bash
git add apps/web/app/privacy/page.tsx apps/web/app/terms/page.tsx apps/web/components/legal/LegalPages.test.tsx
git commit -m "docs(legal): disclose 별자리 인연 data, public ranking and share images" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: D1 contract on local D1, migration, deploy and QA

**Files:**
- Create: `apps/web/lib/db/d1BondsRepo.int.test.ts`: runs `bondsRepoContract` (exported from `memoryBondsRepo.test.ts`, moved to `apps/web/lib/db/contract.ts`) against a Miniflare D1 via `wrangler`'s `getPlatformProxy()`, with the migration applied first. It is skipped when `CI_NO_WORKERD=1`.
- Modify: `docs/runbook-deploy.md` (D1 migrations section)

- [ ] **Step 1:** Move the contract into `apps/web/lib/db/contract.ts`, import it in both test files, and run `npx vitest run apps/web/lib/db` → PASS for memory and D1.
- [ ] **Step 2 (controller):**
  - `npx wrangler d1 migrations apply starlog --remote` (from `apps/web`)
  - `pnpm cf:build`
  - `pnpm --filter @starlog/web cf:deploy`
- [ ] **Step 3 (controller, production smoke on the workers.dev URL and the custom domain once live):**
  - create an owner in a fresh browser profile
  - choose 양자리
  - join 4 times from 4 other profiles (Playwright contexts)
  - complete → 도감 → ranking → the share image PNG opens with nicknames
  - `새로 채우기` → cooldown message on a second try within the hour
  - `/lucky` numbers are stable across reloads
  - D1 rows contain no birth dates: `npx wrangler d1 execute starlog --remote --command "SELECT * FROM stars LIMIT 5"` and inspect
- [ ] **Step 4:** Commit the runbook and the tests.

```bash
git add apps/web/lib/db docs/runbook-deploy.md
git commit -m "test(db): D1 contract on local D1; runbook for migrations" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
