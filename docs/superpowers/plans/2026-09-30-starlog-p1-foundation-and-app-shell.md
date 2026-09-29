# Starlog P1: Foundation, Engines, Characters and App Screens (fixture data) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running Next.js 16 app (`apps/web`) that shows every MVP screen of Starlog with real card art, the two characters and real-quality sample readings from fixture data, backed by tested tarot and saju engines in `packages/core`.

**Architecture:** pnpm workspace with two packages. `packages/core` is pure TypeScript (no framework): card catalog, spread templates, deterministic tarot draw, saju chart wrapper around `lunar-javascript` with our own policies. `apps/web` is a Next.js 16 App Router app using plain CSS (CSS Modules + custom properties, no Tailwind), `next/font`, React 19. In P1 all data comes from JSON fixtures in `content/samples`; later plans (P2 data/auth/ledger/payments, P3 reading generation, P4 launch) replace fixtures with real services behind the same component props.

**Tech Stack:** Node 22+ (machine has 25.9), pnpm 12.6.0 (`nodeLinker: hoisted` because D: is exFAT and cannot hold symlinks), TypeScript 6.0.3 (not 7.x; Next checks only for >=5.1 and the native 7.x port is new), Next.js 16.3.7, React 19.3.0, Vitest 5.0.2, lunar-javascript 1.7.7, sharp 0.35.5, @playwright/test 1.63.0.

**Spec:** `docs/superpowers/specs/2026-09-29-saju-tarot-story-app-design.md` (read sections 2-12 and 15; section 15 overrides older sections). Gold content: `content/samples/tarot-contact.ko.json`, `content/samples/saju-prologue.ko.json`. Research notes arriving in `docs/research/` (tarot-reading-quality.md, saju-engine-eval.md, saju-reading-quality.md, user-review-insights.md) — read them if present when a task touches their topic.

## Global Constraints

- Service name `Starlog` / `스타로그`; production URL `https://taro.yeolmaeapps.kr`. Both come from one config module; never hard-code them in components.
- Business notice (footer): `상호 열매스튜디오 · 대표 최용우 · 사업자등록번호 665-38-01736`. **Never write any street address anywhere in the repo** (user instruction). Address and 통신판매업 number are config fields left empty.
- Currencies: paid `달빛`, free `별조각`. Per-reading direct pay is a third option. Prices are config values; UI shows `2,900원` only as the current config default.
- Characters: tarot mode = cat astrologer (leader, shuffles/reads) + rabbit librarian (staff, records). Saju mode = roles swap (rabbit leader, cat assistant), both in hanbok. Rabbit never wears the astrologer hat.
- Card art: RWS 1909 scans only (`assets/cards/rws1909`, PD-old-70-expired). Never use recolored modern RWS editions.
- Copy rules: Korean, 해요체, no product meta copy on user screens (no "무료로 다 보여드려요", "예시예요", "같은 품질"), no invented facts about the user, never state another person's feelings as fact, no guarantees (재회 확률, 합격, 투자, 질병).
- UI rules: one gold-filled primary button per screen; toggles use a light surface, not gold; touch targets >= 44px; visible text >= 13px (tab labels 12px); contrast >= 4.5:1; all motion respects `prefers-reduced-motion`.
- Unknown birth time is never defaulted to noon for chart facts.
- Plain CSS only (CSS Modules + `app/globals.css` tokens). No Tailwind, no UI kit.
- Git: commit locally after each task. Never push.

## File Structure

```
saju-tarot/
  package.json                 # workspace root scripts
  pnpm-workspace.yaml          # nodeLinker hoisted, allowBuilds
  tsconfig.base.json
  vitest.config.ts             # projects: packages/core, apps/web
  .gitignore  .nvmrc
  scripts/
    fetch-cards.py             # re-downloads RWS 1909 scans (sha1-verified) into assets/cards/rws1909
    build-cards.mjs            # sharp: raw scans -> apps/web/public/cards/{id}.webp (+ -sm.webp)
  assets/cards/rws1909/        # raw jpg (gitignored) + manifest.json (tracked)
  content/samples/*.json       # gold fixtures (exist)
  packages/core/
    package.json  tsconfig.json
    src/index.ts
    src/tarot/cards.ts         # 78-card catalog
    src/tarot/templates.ts     # spread templates + position names
    src/tarot/draw.ts          # seeded shuffle, draw, orientation
    src/saju/policy.ts         # timezone/DST/longitude/day-boundary policy
    src/saju/chart.ts          # computeChart(input, policy) -> SajuChart
    src/saju/labels.ts         # hanja -> hangul, ten gods ko, elements ko
    tests/*.test.ts
  apps/web/
    package.json  next.config.ts  tsconfig.json
    app/layout.tsx  app/globals.css  app/page.tsx (home)
    app/tarot/new/page.tsx            # question builder (who/what/when)
    app/tarot/new/situation/page.tsx  # condition chips + note
    app/tarot/draw/page.tsx           # cat shuffle, fan, pick 3, flip
    app/tarot/result/page.tsx         # free result + locked toc + unlock sheet
    app/chapter/[id]/page.tsx         # opened chapter (paid reading, story/plain toggle)
    app/saju/new/page.tsx             # saju input
    app/saju/chart/page.tsx           # chart confirm + free prologue + unlock
    app/story/page.tsx                # my Starlog timeline
    app/me/page.tsx                   # profile, currencies, saju profile
    app/invite/[token]/page.tsx       # friend (guest) flow
    app/guide/page.tsx                # guide index (fixture articles)
    app/login/page.tsx                # login sheet page (Kakao/Google buttons, fixture)
    components/...                    # see tasks
    lib/config.ts  lib/fixtures.ts
    public/cards/*.webp
    e2e/*.spec.ts                     # Playwright visual smoke
```

---

### Task 1: Workspace scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`, `.nvmrc`, `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`, `packages/core/tests/smoke.test.ts`

**Interfaces:**
- Produces: root scripts `pnpm test`, `pnpm typecheck`, `pnpm dev` (runs web), `pnpm build`; package names `@starlog/core`, `@starlog/web`.

- [ ] **Step 1: Write root config files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
# D: is exFAT: no symlinks/junctions. isolated linker fails, so hoist.
nodeLinker: hoisted
allowBuilds:
  esbuild: true
  sharp: true
  supabase: true
```

`package.json`:
```json
{
  "name": "starlog",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.6.0",
  "engines": { "node": ">=22.13" },
  "scripts": {
    "dev": "pnpm --filter @starlog/web dev",
    "build": "pnpm --filter @starlog/web build",
    "test": "vitest run",
    "typecheck": "tsc -p packages/core/tsconfig.json --noEmit && pnpm --filter @starlog/web typecheck",
    "cards:build": "node scripts/build-cards.mjs",
    "e2e": "pnpm --filter @starlog/web e2e"
  },
  "devDependencies": {
    "@types/node": "24.19.0",
    "typescript": "6.0.3",
    "vitest": "5.0.2"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    projects: [
      { test: { name: "core", include: ["packages/core/tests/**/*.test.ts"], environment: "node" } },
      { test: { name: "web", include: ["apps/web/**/*.test.{ts,tsx}"], exclude: ["apps/web/e2e/**", "**/node_modules/**"], environment: "node" } }
    ]
  }
});
```

`.gitignore`:
```
node_modules/
.next/
out/
coverage/
*.log
.env*
!.env.example
assets/cards/rws1909/*.jpg
apps/web/test-results/
apps/web/playwright-report/
.omc/
```

`.nvmrc`: `22`

- [ ] **Step 2: Core package**

`packages/core/package.json`:
```json
{
  "name": "@starlog/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "lunar-javascript": "1.7.7" }
}
```
`packages/core/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "noEmit": true, "types": ["node"] }, "include": ["src", "tests"] }
```
`packages/core/src/index.ts`: `export const CORE_VERSION = "0.1.0";`

- [ ] **Step 3: Smoke test** — `packages/core/tests/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { CORE_VERSION } from "../src/index";
describe("core", () => { it("exports a version", () => { expect(CORE_VERSION).toBe("0.1.0"); }); });
```

- [ ] **Step 4: Install and run**

Run: `pnpm install` then `pnpm test`
Expected: 1 test passes. (If pnpm reports ignored builds, add the package to `allowBuilds`.)

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "chore: scaffold starlog workspace"
```

---

### Task 2: Card catalog and card images

**Files:**
- Create: `scripts/fetch-cards.py`, `scripts/build-cards.mjs`, `packages/core/src/tarot/cards.ts`, `packages/core/tests/cards.test.ts`
- Output: `apps/web/public/cards/{cardId}.webp` (width 600) and `{cardId}-sm.webp` (width 240), `apps/web/public/cards/back.svg`

**Interfaces:**
- Produces:
```ts
export type Suit = "wands" | "cups" | "swords" | "pentacles";
export type Arcana = "major" | "minor";
export interface CardDef {
  id: string;            // e.g. "major-09-hermit", "wands-01" (same as image file stem)
  arcana: Arcana;
  suit?: Suit;
  number: number;        // major 0-21, minor 1-14 (11 page, 12 knight, 13 queen, 14 king)
  roman?: string;        // major only, e.g. "IX"
  names: { ko: string; ja: string; en: string };
  element: "fire" | "water" | "air" | "earth";
}
export const CARDS: readonly CardDef[];            // 78 entries
export function getCard(id: string): CardDef;      // throws on unknown id
export function cardImage(id: string, size?: "lg" | "sm"): string; // "/cards/<id>.webp" | "/cards/<id>-sm.webp"
```

- [ ] **Step 1: Failing test** — `packages/core/tests/cards.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { CARDS, getCard, cardImage } from "../src/tarot/cards";
import manifest from "../../../assets/cards/rws1909/manifest.json";

describe("card catalog", () => {
  it("has 78 unique cards", () => {
    expect(CARDS).toHaveLength(78);
    expect(new Set(CARDS.map(c => c.id)).size).toBe(78);
  });
  it("matches the downloaded scan manifest one-to-one", () => {
    const files = (manifest as { file: string }[]).map(m => m.file.replace(/\.jpg$/, "")).sort();
    expect(CARDS.map(c => c.id).sort()).toEqual(files);
  });
  it("names the Hermit correctly", () => {
    const h = getCard("major-09-hermit");
    expect(h.names.ko).toBe("은둔자");
    expect(h.roman).toBe("IX");
    expect(cardImage(h.id)).toBe("/cards/major-09-hermit.webp");
  });
  it("uses 에이스/시종/기사/여왕/왕 for minor ranks", () => {
    expect(getCard("wands-01").names.ko).toBe("완드 에이스");
    expect(getCard("cups-11").names.ko).toBe("컵 시종");
    expect(getCard("swords-14").names.ko).toBe("검 왕");
    expect(getCard("pentacles-13").names.ko).toBe("펜타클 여왕");
  });
  it("throws on unknown ids", () => { expect(() => getCard("nope")).toThrow(); });
});
```
Run `pnpm test` → FAIL (module missing).

- [ ] **Step 2: Implement `cards.ts`** with the full major list (Korean names: 바보, 마법사, 여사제, 여황제, 황제, 교황, 연인, 전차, 힘, 은둔자, 운명의 수레바퀴, 정의, 매달린 사람, 죽음, 절제, 악마, 탑, 별, 달, 태양, 심판, 세계; Japanese: 愚者, 魔術師, 女教皇, 女帝, 皇帝, 教皇, 恋人, 戦車, 力, 隠者, 運命の輪, 正義, 吊るされた男, 死神, 節制, 悪魔, 塔, 星, 月, 太陽, 審判, 世界; English per RWS; element: majors take their Golden Dawn element group only for sorting, use "air" for 0/1/6/17 etc. is NOT needed — set majors' `element` by traditional attribution: Fool air, Magician air, High Priestess water, Empress earth, Emperor fire, Hierophant earth, Lovers air, Chariot water, Strength fire, Hermit earth, Wheel fire, Justice air, Hanged Man water, Death water, Temperance fire, Devil earth, Tower fire, Star air, Moon water, Sun fire, Judgement fire, World earth). Major ids must equal the manifest stems: `major-00-fool` … `major-21-world` exactly as in `assets/cards/rws1909/manifest.json` (check file names there, e.g. `major-10-wheel-of-fortune`, `major-12-hanged-man`). Minor: suits wands(불)/cups(물)/swords(공기)/pentacles(흙), Korean suit names 완드/컵/검/펜타클, Japanese ワンド/カップ/ソード/ペンタクル, ranks 1 에이스 (エース, Ace), 2-10 as `N` (e.g. "컵 2", "カップの2", "Two of Cups"), 11 시종 (ペイジ, Page), 12 기사 (ナイト, Knight), 13 여왕 (クイーン, Queen), 14 왕 (キング, King). Generate minors in a loop; ids `${suit}-${two-digit number}`.

- [ ] **Step 3: Run tests** → PASS.

- [ ] **Step 4: Image pipeline** — copy the downloader used on 2026-09-30 into `scripts/fetch-cards.py` (Wikimedia Commons category `Rider-Waite tarot deck (Roses & Lilies)`, UA header with contact, 429 backoff, sha1 check, writes `manifest.json`). Write `scripts/build-cards.mjs`:
```js
import sharp from "sharp";
import { readFile, mkdir } from "node:fs/promises";
const manifest = JSON.parse(await readFile("assets/cards/rws1909/manifest.json", "utf8"));
await mkdir("apps/web/public/cards", { recursive: true });
for (const m of manifest) {
  const id = m.file.replace(/\.jpg$/, "");
  const src = sharp(`assets/cards/rws1909/${m.file}`);
  const { width, height } = await src.metadata();
  // trim the off-white scan border (~2.2%) so card edges are clean, keep aspect
  const dx = Math.round(width * 0.022), dy = Math.round(height * 0.016);
  const base = src.extract({ left: dx, top: dy, width: width - dx * 2, height: height - dy * 2 });
  await base.clone().resize({ width: 600 }).webp({ quality: 82 }).toFile(`apps/web/public/cards/${id}.webp`);
  await base.clone().resize({ width: 240 }).webp({ quality: 78 }).toFile(`apps/web/public/cards/${id}-sm.webp`);
}
console.log("built", manifest.length * 2, "images");
```
Add `sharp` as root devDependency (`0.35.5`). Run `pnpm cards:build` → prints `built 156 images`. Open two outputs (Read the webp) and confirm borders trimmed without cutting the title bar.

- [ ] **Step 5: Card back** — `apps/web/public/cards/back.svg`: 600x1020 navy (#221B5C→#15113A gradient), 12px gold (#E9C46F) inset rounded border, centered crescent + 8-point star, faint star dots. Original art (no RWS back copy).

- [ ] **Step 6: Commit** `feat(core): card catalog and RWS 1909 image pipeline` (commit processed webp + manifest, not raw jpg).

---

### Task 3: Spread templates and deterministic draw

**Files:** Create `packages/core/src/tarot/templates.ts`, `packages/core/src/tarot/draw.ts`, `packages/core/tests/draw.test.ts`; export from `src/index.ts`.

**Interfaces:**
- Consumes: `CARDS`, `CardDef` from Task 2.
- Produces:
```ts
export type Who = "me" | "us" | "work" | "group";
export type TemplateId = "relationship-contact" | "relationship" | "work" | "choice" | "self-flow" | "group" | "daily";
export interface SpreadTemplate { id: TemplateId; positions: string[]; /* Korean position names */ positionsJa: string[] }
export const TEMPLATES: Record<TemplateId, SpreadTemplate>;
export interface TopicDef { id: string; ko: string; ja: string; template: TemplateId; conditions: ConditionDef[] }
export interface ConditionDef { id: string; label: string; options: string[] } // options include "잘 모르겠어요"
export const TOPICS_BY_WHO: Record<Who, TopicDef[]>;
export function composeQuestion(who: Who, topic: TopicDef, when: When, locale?: "ko" | "ja"): string;
export type When = "today" | "week" | "month" | "year";
export type Orientation = "upright" | "reversed";
export interface DrawnCard { cardId: string; position: string; orientation: Orientation; slot: number }
export interface DeckState { seed: string; order: string[]; orientations: Orientation[] } // 78 ids + per-index orientation
export function createDeck(seed: string, reversalRate: number): DeckState;   // pure, deterministic for a seed
export function pickCards(deck: DeckState, template: SpreadTemplate, pickedIndexes: number[]): DrawnCard[]; // indexes into deck.order the user tapped
export const DEFAULT_REVERSAL_RATE = 0.3;
```
Templates (exact position names, from spec 15):
- relationship-contact: 나의 마음 / 두 사람 사이 / 먼저 움직이면
- relationship: 나의 마음 / 상대에게 비친 나 / 두 사람의 흐름
- work: 지금 상황 / 막힌 곳 / 나아갈 방향
- choice: 이쪽을 고르면 / 저쪽을 고르면 / 놓치고 있는 것
- self-flow: 지금의 나 / 필요한 것 / 이 시기의 흐름
- group: 모임의 분위기 / 나의 자리 / 도움이 될 태도
- daily: 오늘의 한 장

Topics by who (Korean label → template):
- me: 연애운→self-flow, 재물운→self-flow, 직업·이직→work, 학업·시험→work, 건강·컨디션→self-flow, 마음·감정→self-flow, 이사·선택→choice, 오늘의 운→daily
- us: 썸·고백→relationship, 연애→relationship, 연락→relationship-contact, 재회→relationship-contact, 갈등·화해→relationship
- work: 직업·이직→work, 재물운→self-flow, 학업·시험→work, 창작·도전→work, 협상·대화→work
- group: 인간관계→group, 갈등·화해→group, 함께 하는 일→group, 모임의 분위기→group

Conditions for `연락` (used by the gold sample): 관계 [알아가는 중, 연인, 친구, 헤어진 사이, 잘 모르겠어요]; 최근 연락 [이어지고 있음, 뜸해짐, 끊긴 지 오래, 잘 모르겠어요]; 원하는 방향 [가볍게 안부, 대화 다시 시작, 오해 풀기, 아직 모르겠어요]. Give every other topic 2-3 condition groups in the same style (always ending with a "잘 모르겠어요"-type option).

`composeQuestion` rules (Korean): when prefix `오늘`/`이번 주`/`이번 달`/`올해`; subject `나의`, `나와 그 사람의`, `나의 일,`, `우리 모임의`; never duplicate words (`오늘의 운` + `오늘` → `오늘의 운세`; `모임의 분위기` with group → `우리 모임의 분위기`); strip `·` by turning `A·B` into `A와 B`/`A나 B` per topic table (store a `phrase` field on TopicDef, e.g. 직업·이직 → `일과 이직`, 재회 → `재회`, 연락 → `연락`). For `연락` + us + month the question is `이번 달, 그 사람에게 먼저 연락해도 될까`. Store explicit question templates per topic id (`questionKo: "{when}, 그 사람에게 먼저 연락해도 될까"`) instead of string surgery.

- [ ] **Step 1: Failing tests** — `packages/core/tests/draw.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createDeck, pickCards, TEMPLATES, TOPICS_BY_WHO, composeQuestion, DEFAULT_REVERSAL_RATE } from "../src";

describe("deck", () => {
  it("is a permutation of 78 cards", () => {
    const d = createDeck("seed-a", DEFAULT_REVERSAL_RATE);
    expect(d.order).toHaveLength(78);
    expect(new Set(d.order).size).toBe(78);
  });
  it("is deterministic per seed and differs across seeds", () => {
    expect(createDeck("s1", 0.3)).toEqual(createDeck("s1", 0.3));
    expect(createDeck("s1", 0.3).order).not.toEqual(createDeck("s2", 0.3).order);
  });
  it("respects reversal rate 0 and roughly 0.3 over many seeds", () => {
    expect(createDeck("x", 0).orientations.every(o => o === "upright")).toBe(true);
    let rev = 0, n = 0;
    for (let i = 0; i < 200; i++) { const d = createDeck(`k${i}`, 0.3); rev += d.orientations.filter(o => o === "reversed").length; n += 78; }
    expect(rev / n).toBeGreaterThan(0.25); expect(rev / n).toBeLessThan(0.35);
  });
});
describe("pickCards", () => {
  it("maps tapped indexes to positions in tap order and forbids duplicates", () => {
    const d = createDeck("p", 0.3);
    const t = TEMPLATES["relationship-contact"];
    const cards = pickCards(d, t, [5, 40, 12]);
    expect(cards.map(c => c.position)).toEqual(["나의 마음", "두 사람 사이", "먼저 움직이면"]);
    expect(cards[0]!.cardId).toBe(d.order[5]);
    expect(() => pickCards(d, t, [5, 5, 1])).toThrow();
    expect(() => pickCards(d, t, [1, 2])).toThrow();
  });
});
describe("questions", () => {
  it("builds the contact question without duplicated words", () => {
    const topic = TOPICS_BY_WHO.us.find(t => t.id === "contact")!;
    expect(composeQuestion("us", topic, "month")).toBe("이번 달, 그 사람에게 먼저 연락해도 될까");
    const daily = TOPICS_BY_WHO.me.find(t => t.id === "daily")!;
    expect(composeQuestion("me", daily, "today")).toBe("오늘 나의 하루는 어떨까");
  });
});
```
- [ ] **Step 2:** implement: seeded PRNG = `sha256(seed)` → xoshiro128** (implement in ~20 lines, no dependency); Fisher-Yates shuffle; orientation per card `rand() < rate`. `pickCards` validates length === positions.length, unique, in range.
- [ ] **Step 3:** `pnpm test` → PASS. Commit `feat(core): spread templates, topics and deterministic draw`.

---

### Task 4: Saju chart wrapper

**Files:** Create `packages/core/src/saju/policy.ts`, `packages/core/src/saju/labels.ts`, `packages/core/src/saju/chart.ts`, `packages/core/tests/saju.test.ts`, `packages/core/src/types/lunar-javascript.d.ts`.

Before starting, read `docs/research/saju-engine-eval.md` if it exists; if it recommends a different engine or different policy defaults, follow it and note the change in the commit message.

**Interfaces:**
```ts
export interface SajuInput {
  calendar: "solar" | "lunar";
  year: number; month: number; day: number;
  isLeapMonth?: boolean;               // lunar only
  time: { hour: number; minute: number } | null;  // null = unknown
  gender: "female" | "male";
  place: { name: string; longitude: number };      // default Seoul 126.98
}
export interface SajuPolicy {
  version: string;                      // "2026-09-30.1"
  timezoneOffsetMinutes: number;        // 540 (KST) unless DST applies
  applyKoreaDst: boolean;               // true: add historical DST table
  longitudeCorrection: boolean;         // default false (see research); when true shift by (longitude-135)*4 minutes
  lateZiRule: "next-day" | "same-day";  // 23:00-24:00 handling; default "next-day" (조자시/야자시 구분 없이 다음 날)
}
export interface Pillar { stem: string; branch: string; ko: string; stemGod: string; branchGod: string; hidden: string[] }
export interface SajuChart {
  policy: SajuPolicy; input: SajuInput; solarDate: string; lunarDate: string;
  pillars: { year: Pillar; month: Pillar; day: Pillar; hour: Pillar | null };
  dayMaster: { stem: string; ko: string; element: "목" | "화" | "토" | "금" | "수" };
  elements: Record<"목" | "화" | "토" | "금" | "수", number>;  // visible stems+branches only
  luck: { forward: boolean; startAge: number; pillars: { ganzhi: string; ko: string; startAge: number }[] };
  notes: string[];                      // e.g. "태어난 시를 몰라 시주를 비웠어요"
}
export const DEFAULT_POLICY: SajuPolicy;
export function computeChart(input: SajuInput, policy?: SajuPolicy): SajuChart;
```
Korea DST table (apply when `applyKoreaDst`, subtract 60 minutes from local time inside these KST ranges): 1948-06-01 00:00 → 1948-09-13 00:00; 1949-04-03 00:00 → 1949-09-11 00:00; 1950-04-01 00:00 → 1950-09-10 00:00; 1951-05-06 00:00 → 1951-09-09 00:00; 1955-05-05 00:00 → 1955-09-09 00:00; 1956-05-20 00:00 → 1956-09-30 00:00; 1957-05-05 00:00 → 1957-09-22 00:00; 1958-05-04 00:00 → 1958-09-21 00:00; 1959-05-03 00:00 → 1959-09-20 00:00; 1960-05-01 00:00 → 1960-09-18 00:00; 1987-05-10 02:00 → 1987-10-11 03:00; 1988-05-08 02:00 → 1988-10-09 03:00. **Mark this table "needs verification" in a code comment and let the saju-engine-eval research override it.** Also 1954-03-21 → 1961-08-09 Korea used UTC+8:30: set offset 510 for that range.

Labels: stems 甲乙丙丁戊己庚辛壬癸 → 갑을병정무기경신임계 and elements 목목화화토토금금수수; branches 子丑寅卯辰巳午未申酉戌亥 → 자축인묘진사오미신유술해, elements 수토목목토화화토금금토수; ten gods from lunar-javascript Chinese → Korean: 比肩 비견, 劫财 겁재, 食神 식신, 伤官 상관, 偏财 편재, 正财 정재, 七杀 편관, 正官 정관, 偏印 편인, 正印 정인, 日主 일간.

- [ ] **Step 1: Failing tests** — `packages/core/tests/saju.test.ts` (values verified on 2026-09-30 with lunar-javascript 1.7.7; cross-check with the research doc's golden list and extend it):
```ts
import { describe, it, expect } from "vitest";
import { computeChart, DEFAULT_POLICY } from "../src";

const base = { calendar: "solar" as const, gender: "female" as const, place: { name: "서울", longitude: 126.98 } };

describe("computeChart", () => {
  it("1990-01-01 12:00 → 己巳 丙子 丙寅, day master 병화", () => {
    const c = computeChart({ ...base, year: 1990, month: 1, day: 1, time: { hour: 12, minute: 0 } });
    expect([c.pillars.year.stem + c.pillars.year.branch, c.pillars.month.stem + c.pillars.month.branch, c.pillars.day.stem + c.pillars.day.branch]).toEqual(["己巳", "丙子", "丙寅"]);
    expect(c.dayMaster.ko).toBe("병화");
    expect(c.pillars.month.branchGod).toBe("정관");
    expect(c.pillars.year.stemGod).toBe("상관");
  });
  it("unknown time leaves the hour pillar empty and counts 6 visible characters", () => {
    const c = computeChart({ ...base, year: 1990, month: 1, day: 1, time: null });
    expect(c.pillars.hour).toBeNull();
    expect(Object.values(c.elements).reduce((a, b) => a + b, 0)).toBe(6);
    expect(c.elements).toEqual({ 목: 1, 화: 3, 토: 1, 금: 0, 수: 1 });
    expect(c.notes.join(" ")).toContain("시주");
  });
  it("unknown time does not silently use noon: day pillar still from the date, hour null", () => {
    const c = computeChart({ ...base, year: 1996, month: 3, day: 21, time: null });
    expect(c.pillars.hour).toBeNull();
  });
  it("female born in a yin year runs luck forward", () => {
    const c = computeChart({ ...base, year: 1990, month: 1, day: 1, time: { hour: 12, minute: 0 } });
    expect(c.luck.forward).toBe(true);
    expect(c.luck.pillars.slice(0, 4).map(p => p.ganzhi)).toEqual(["丁丑", "戊寅", "己卯", "庚辰"]);
  });
  it("lunar input converts (1989-12-05 lunar = 1990-01-01 solar)", () => {
    const c = computeChart({ ...base, calendar: "lunar", year: 1989, month: 12, day: 5, time: null });
    expect(c.solarDate).toBe("1990-01-01");
  });
  it("exposes the policy version used", () => { expect(computeChart({ ...base, year: 2000, month: 1, day: 1, time: null }).policy.version).toBe(DEFAULT_POLICY.version); });
});
```
- [ ] **Step 2:** implement with `lunar-javascript` (`Solar.fromYmdHms`, `Lunar.fromYmdHms` with negative month for leap, `getEightChar()`, `getYun(gender==="male"?1:0)`; set `EightChar.setSect` to match `lateZiRule`). For `time === null` compute with a fixed 12:00 **only to read year/month/day pillars**, then set `hour: null` and exclude hour from `elements`; add note "태어난 시를 몰라 시주를 비웠어요. 시주가 다루는 해석은 하지 않아요." Apply DST/offset/longitude by adjusting the wall-clock time before calling the library, and add a note describing any adjustment. Declare a minimal `lunar-javascript.d.ts` for the used API.
- [ ] **Step 3:** `pnpm test` PASS; `pnpm typecheck` PASS. Commit `feat(core): saju chart wrapper with policies`.

---

### Task 5: Web app shell, tokens, typography, night sky

**Files:** Create `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/app/layout.tsx`, `apps/web/app/globals.css`, `apps/web/app/page.tsx` (temporary), `apps/web/lib/config.ts`, `apps/web/components/sky/NightSky.tsx`, `apps/web/components/sky/NightSky.module.css`, `apps/web/components/layout/TabBar.tsx`, `apps/web/components/layout/TabBar.module.css`, `apps/web/components/layout/Footer.tsx`, `apps/web/components/ui/Button.tsx`, `apps/web/components/ui/Button.module.css`, `apps/web/components/ui/Chip.tsx`, `apps/web/components/ui/Segmented.tsx`, `apps/web/components/ui/ui.module.css`.

**Interfaces:**
- `lib/config.ts`:
```ts
export const SITE = {
  name: "Starlog", nameKo: "스타로그", url: "https://taro.yeolmaeapps.kr",
  business: { name: "열매스튜디오", ceo: "최용우", regNo: "665-38-01736", mailOrderNo: "", address: "", email: "", phone: "" },
  currency: { paid: "달빛", free: "별조각" },
  price: { tarotStandardKrw: 2900, sajuStandardKrw: 2900, unitsPerReading: 10, signupGiftFree: 10 }
} as const;
```
Footer renders business fields that are non-empty only (address stays empty).
- `<NightSky density?: number; constellation?: boolean; glow?: "top" | "center" />` — absolutely positioned full-bleed layer: deep gradient (#0D0A26 → #160E3A), radial auroras (violet top, pink left, teal bottom-right), ~40 star dots from a seeded generator (stable SSR/CSR: seed by prop), 1 in 3 stars twinkle via CSS keyframes, optional dashed constellation polyline with twinkling gold nodes, subtle moon glow top-right. `pointer-events:none`, `aria-hidden`. Disable animation under `prefers-reduced-motion`.
- `<Button variant="primary"|"secondary"|"ghost" size="lg"|"md" href? onClick? trailing?>`; primary = gold (#F3DCA1) fill, text #2A1B4D; secondary = 1px rgba(255,255,255,.3) border; ghost = text only. Min height 52 (lg) / 44 (md), radius = height/2, press animation `scale(.97)` 120ms, focus ring 2px #F3DCA1.
- `<Chip selected onClick>` (44px pill; selected = light surface rgba(243,220,161,.22) + gold border + gold text, NOT gold fill), `<Segmented options value onChange>` (light surface for active).
- `<TabBar active="home"|"story"|"guide"|"me">` fixed bottom 76px, 4 items with outline SVG icons + 12px labels: 홈 / 내 이야기 / 가이드 / 내 정보.
- Typography via `next/font/google`: `Gowun_Batang` (400,700; `--font-display`) for titles and reading prose; `Noto_Sans_KR` (400,500,700; `--font-body`) for UI. Scale tokens: `--fs-title:26px --fs-h1:22px --fs-h2:17px --fs-body:15px --fs-sub:13px --fs-tab:12px`, reading prose 17px/1.8 on paper cards.
- Layout: mobile-first column max-width 480px centered; at >=1024px pages may switch to multi-column (each page task defines it). `globals.css` defines color tokens: `--ink:#F1ECFF --ink-sub:#C9C1EA --gold:#F3DCA1 --gold-deep:#E9C46F --navy:#2E2A78 --paper:#F7EFE0 --paper-ink:#2B2140 --glass:rgba(255,255,255,.08) --glass-line:rgba(255,255,255,.14)`.

- [ ] **Step 1:** create the Next app files by hand (not create-next-app, so it lands in the workspace cleanly). `apps/web/package.json`:
```json
{
  "name": "@starlog/web", "private": true, "type": "module",
  "scripts": { "dev": "next dev --port 3100", "build": "next build", "start": "next start --port 3100", "typecheck": "tsc --noEmit", "e2e": "playwright test" },
  "dependencies": { "@starlog/core": "workspace:*", "next": "16.3.7", "react": "19.3.0", "react-dom": "19.3.0" },
  "devDependencies": { "@types/react": "19.3.0", "@types/react-dom": "19.3.0", "@playwright/test": "1.63.0" }
}
```
(Check the exact latest `@types/react` / `@types/react-dom` 19.x versions with `npm view` and pin them.) `next.config.ts`: `transpilePackages: ["@starlog/core"]`, `images: { unoptimized: true }` (webp already sized), `reactStrictMode: true`.
- [ ] **Step 2:** implement tokens, fonts, NightSky, Button, Chip, Segmented, TabBar, Footer. Temporary `app/page.tsx` shows NightSky + one primary Button.
- [ ] **Step 3:** Run `pnpm install && pnpm dev`; open `http://localhost:3100` in the built-in browser pane (`.claude/launch.json` entry name `starlog-web`, port 3100). Take a mobile (375x812) screenshot; confirm twinkling stars, fonts loaded, button gold with dark text. Run `pnpm typecheck` → PASS.
- [ ] **Step 4:** Commit `feat(web): app shell, design tokens, night sky, base UI`.

---

### Task 6: Characters (cat and rabbit, two costume sets)

**Files:** Create `apps/web/components/characters/Cat.tsx`, `Rabbit.tsx`, `characters.module.css`, `useTapReaction.ts`, `defs.tsx` (shared SVG gradients/filters rendered once in layout), `apps/web/app/dev/characters/page.tsx` (character sheet page, not linked from nav).

**Interfaces:**
```ts
type Expression = "idle" | "happy" | "focus" | "surprise" | "wink";
interface CharacterProps {
  outfit: "tarot" | "hanbok";    // Cat tarot = astrologer hat + star cape; Cat hanbok = 색동 저고리 + 복주머니 (assistant)
                                 // Rabbit tarot = librarian (glasses, bookmark ribbon on bent ear, pencil behind ear, lavender cardigan, open book + quill, NO hat)
                                 // Rabbit hanbok = leader: 남색 두루마기 over 저고리, 붓 + 두루마리(명식), 귀는 자연스럽게 (no hat)
  expression?: Expression;       // default "idle"
  size?: number;                 // px, default 160
  action?: "none" | "shuffle" | "write" | "glow";  // cat shuffle cards / rabbit write / crystal glow
  reactOnTap?: boolean;          // default true
  label?: string;                // aria-label
}
export function Cat(p: CharacterProps): JSX.Element;
export function Rabbit(p: CharacterProps): JSX.Element;
export function useTapReaction(): { ref: RefObject<HTMLButtonElement>; active: boolean; trigger(): void };
```
Visual spec (2.5D): start from the v3 SVGs shown to the user on 2026-09-30 (radial-gradient fur `#FFFBF4→#F6E8D4→#D7BD9C` for the cat, `#FFFFFF→#F3EFF8→#CFC6DE` for the rabbit, iris gradient `#5B4AB8→#2A2360→#15112F`, two eye highlights, blurred blush, soft floor shadow, gold gradient `#FFE9B0→#E9C46F→#B98A2E` on hat band, buttons, glasses). Cat keeps forehead stripes, tiny star in each eye, star-tipped tail that sways. Idle animation: float 3.8s, blink every ~4.4s, tail sway 2.6s, rabbit ear twitch 5s. Tap: hat/body squish + hop, happy eyes (^ ^), 3-star burst, speech bubble (cat tarot "냥, 섞어볼까", rabbit tarot "톡, 적어둘게요", rabbit hanbok "어디 한번 볼까요", cat hanbok "냥, 여기 있어요"), 1.4s. `action="shuffle"`: two card halves above the cat's paws cut and riffle every 1.6s. `action="glow"`: crystal ball pulse. `action="write"`: quill wiggle + page flip. All animations in CSS keyframes, `transform-box: fill-box`, disabled by `prefers-reduced-motion` (tap still swaps expression without motion). Characters are wrapped in a `<button>` only when `reactOnTap`; otherwise `<div role="img">`.

- [ ] **Step 1:** implement Cat and Rabbit with both outfits and all expressions; SVG `<defs>` shared via `defs.tsx` mounted once in `layout.tsx` (ids prefixed `sl-`).
- [ ] **Step 2:** character sheet page `/dev/characters`: grid of both characters × 2 outfits × 5 expressions × actions, on NightSky.
- [ ] **Step 3:** screenshot `/dev/characters` at 375 and 1280 widths; check: no clipped ears/hat, blush not muddy, glasses readable, hanbok colors (저고리 색동 sleeves: red/yellow/green/blue/pink stripes; 두루마기 navy #2E3A78 with white 동정 collar) look intentional. Fix until clean.
- [ ] **Step 4:** unit test `useTapReaction` toggles `active` true then false after 1400ms (vitest fake timers, `@testing-library/react` + jsdom for this file only via `// @vitest-environment jsdom`; add devDeps `@testing-library/react` 16.3.3 and `jsdom` 30.1.1).
- [ ] **Step 5:** commit `feat(web): cat and rabbit characters with outfits and tap reactions`.

---

### Task 7: Fixtures and tarot flow screens

**Files:** Create `apps/web/lib/fixtures.ts`, `apps/web/components/tarot/*` (`TarotCard.tsx` with flip, `CardFan.tsx`, `ShuffleStage.tsx`, `SpreadRow.tsx`, `LockedToc.tsx`, `UnlockSheet.tsx`, `ReadingArticle.tsx`, `StoryToggle.tsx`, `FollowUp.tsx`, `Feedback.tsx`, `Stepper.tsx`), pages `app/page.tsx` (home), `app/tarot/new/page.tsx`, `app/tarot/new/situation/page.tsx`, `app/tarot/draw/page.tsx`, `app/tarot/result/page.tsx`, `app/login/page.tsx`, `app/chapter/[id]/page.tsx`.

**Interfaces:**
- `lib/fixtures.ts` loads `content/samples/tarot-contact.ko.json` and `saju-prologue.ko.json` (import JSON directly; add `"@content/*": ["../../content/*"]` path alias in `apps/web/tsconfig.json` and `turbopack.resolveAlias` if needed) and exports typed `TAROT_SAMPLE`, `SAJU_SAMPLE`, `STORY_FIXTURE` (prologue + chapter 1 + one pending friend scene with the friend's card `major-19-sun`, nickname `지인 A` shown only as the nickname the friend typed).
- `<TarotCard cardId orientation faceUp size="lg"|"md"|"sm" onFlip? label>`: 3D flip with CSS (`perspective:1000px`, `transform-style:preserve-3d`, `rotateY(180deg)`, 600ms ease-out); reversed cards render face rotated 180deg with a small "역방향" tag; back = `/cards/back.svg`; tap on a face-down card flips it; gold edge glow on reveal.
- `<CardFan count=78 visible=21 onPick(index) picked:number[] max>`: arc fan of 21 face-down cards (swipe/scroll horizontally to see all 78 in 3 pages, or show 21 of the shuffled deck — use the deck order from `createDeck`), picked cards lift 30px with glow; touch-friendly (min 44px hit width by overlapping hit areas).
- `<ShuffleStage onDone>`: cat (`action="shuffle"`) for ~1.8s with caption `카드를 섞고 있어요`, then fan appears; skippable via "바로 펼치기" ghost button; reduced-motion → skip straight to fan.
- Draw page flow: shuffle → fan → pick 3 in order (slot labels above: position names from the template) → when 3 picked, CTA `결과 보기` → reveal animation flips the 3 cards one by one (400ms apart) → navigate to result.
- Result page (free): question title (display font), `선택한 상황` chips (only conditions the user chose + note excerpt), 3 face-up cards (md) each with position + name + keyword, first card full paragraph on a paper card, `이어지는 풀이` LockedToc (lock icon + exact paid headings from fixture), UnlockSheet at the bottom:
  - first visit (no session fixture flag): primary `로그인하고 무료로 보기` (subtext `가입 선물 별조각 10개로 열려요`), secondary `바로 결제하고 보기 · 2,900원`.
  - returning (`?visit=returning`): primary `별조각으로 보기 · 10` (when balance >= 10), secondary `달빛으로 보기 · 10`, ghost `바로 결제하고 보기 · 2,900원`; if balance short show `6개 부족해요 · 충전하고 바로 열기`.
  - Sheet lists includes `후속 질문 3번 · 내 스타로그에 보관`.
- Login page: rabbit (tarot) says `이 풀이를 스타로그에 적어둘게요`; buttons `카카오로 계속하기` (#FEE500, text #191600) and `Google로 계속하기`; consent line `계속하면 이용약관과 개인정보처리방침에 동의하게 돼요` with links; `만 14세 이상이에요` checkbox required before buttons enable (buttons stay enabled; show inline error if unchecked). Continue → `/chapter/sample?from=unlock`.
- Generating state (before chapter renders, 2.5s fixture delay, skippable in tests via `?instant=1`): cat with `action="glow"` + rotating captions `카드를 다시 읽는 중이에요`, `세 장의 연결을 살피는 중이에요`, `이야기로 옮겨 적는 중이에요` (rabbit writing appears on the last one).
- Chapter page: header (chapter number/title from `story.title`), 3 cards row (sm, tappable to enlarge in a modal), `StoryToggle` [이야기 | 풀이] (light surface active), verdict callout, sections from `paid` in order (cards, connection, timing, scenarios as 4 cards, messages with copy buttons, avoid list, alternatives, action), story mode shows `story.body` as a single paper page with a rabbit signature `기록 · 토끼 사서`. Follow-up box (`이어서 물어보기 · 3번 남았어요`, 2 suggestion chips, input + 보내기; fixture answer appears after 1s, counter becomes 2). Feedback `이 풀이, 얼마나 와닿았나요?` 5-step emoji-free scale (별 1-5 icons). Share card CTA `친구에게 한 장 받아보기` (opens a share preview modal with the card image, question, and invite link placeholder `https://taro.yeolmaeapps.kr/invite/abc123`).
- Desktop (>=1024px) for result and chapter: left column sticky spread (lg cards), right column reading max-width 640px.

- [ ] Step 1: fixtures module + unit test that fixture paid headings equal free `lockedToc` minus "한 줄 결론" mapping (test: every `lockedToc` item except the first appears as a heading in `paid`).
- [ ] Step 2: components; Step 3: pages; Step 4: manual check in browser pane at 375 and 1280 (flip, fan, shuffle, sheet states, toggle, follow-up); Step 5: Playwright smoke `e2e/tarot-flow.spec.ts`: home → 타로 보기 → choose 나와 그 사람/연락/이번 달 → situation chips → draw (instant) pick 3 → result shows 3 card images and 10 locked headings → login → chapter shows verdict text; screenshot each step to `test-results/`. Step 6: commit `feat(web): tarot flow screens on fixtures`.

---

### Task 8: Saju, story, me, invite, guide screens

**Files:** pages `app/saju/new/page.tsx`, `app/saju/chart/page.tsx`, `app/story/page.tsx`, `app/me/page.tsx`, `app/invite/[token]/page.tsx`, `app/guide/page.tsx`, `app/guide/[slug]/page.tsx`; components `components/saju/ChartTable.tsx`, `ElementBar.tsx`, `SajuForm.tsx`, `components/story/Timeline.tsx`, `FriendScene.tsx`, `components/home/*`.

**Behavior:**
- Home: NightSky + top bar (Starlog wordmark in display font, balance pill → /me). Hero: cat (tarot, idle, tap reacts) beside the story card `나의 스타로그 · 2장 / 다음 장을 열어볼까요` (whole card links to /story). Two big entries: `타로 보기` (primary gold, subtitle `카드 3장으로 지금을 봐요`) and `사주 보기` (secondary, rabbit hanbok mini icon, `타고난 결로 나를 봐요`). `오늘의 한 장` row (cat mini; links `/tarot/draw?template=daily`). Friend scenes row only when there are pending scenes. Guide chips. First-visit variant (`?visit=first`): no story card; instead a welcome block with both characters: `처음 오셨네요. 고양이가 카드를, 토끼가 기록을 맡아요.` and a single primary `첫 타로 보기`.
- Saju input: rabbit hanbok leader greets `태어난 날을 알려주세요`; fields: 양력/음력 segmented (+ 윤달 checkbox when 음력), date (three numeric selects year/month/day, Korean labels), 태어난 시 segmented [알아요 | 몰라요] (when 알아요: hour/minute selects; helper `시간을 모르면 시주 없이 풀어요`), 성별 [여성 | 남성] with helper `10년 흐름(대운)의 방향을 정하는 데만 써요`, 태어난 곳 select (서울 default; list of 17 시도 with longitudes). Live confirmation line `→ 1990년 1월 1일 (양력)`. Separate consent checkbox `출생 정보를 풀이에 쓰는 데 동의해요` (required). CTA `명식 보기`.
- Saju chart page: calls `computeChart` from `@starlog/core` with the form values (query params or local state; fixture default = sample) and renders ChartTable (4 columns 시/일/월/년 right-to-left traditional order with hanja large + hangul small + ten god label; hour column shows `모름` placeholder), ElementBar (5 elements counts with colors 목 #7FC8A9 화 #F08A7E 토 #E3C07A 금 #D9D9E3 수 #7FA7E8), `적용한 기준` disclosure (policy notes). Then free prologue (title + summary from fixture) and LockedToc + UnlockSheet (same component as tarot). "열린 프롤로그" is the chapter page with id `prologue`.
- Story: title `나의 스타로그`, toggle [이야기 | 풀이], Timeline (prologue saju card, chapter 1 tarot card with 3 mini card images, pending FriendScene with preview of the friend's card image + one-line message + `이야기에 넣기` / `숨기기`), empty state variant (`?empty=1`): rabbit writing + `아직 첫 장이 비어 있어요` + primary `첫 타로 보기`. Floating `새 장 열기` primary.
- Me: avatar (initial), nickname, provider; currencies card (달빛 4 / 별조각 12) with primary `달빛 충전하기` (opens fixture pack sheet: 30 달빛 9,900원 / 60+보너스 6 19,800원 etc. from config), 내 사주 정보 row (1990년 1월 1일 · 양력 · 시간 모름 · 고치기), list: 재화 내역, 친구 초대하기 (→ share preview), 알림 설정, 이용약관, 개인정보처리방침, 문의하기; footer business notice.
- Invite (guest) `/invite/[token]`: no tab bar; header `로그인 없이 보는 중`; cat tarot greets `하늘님이 이야기에 한 장 부탁했어요`; primary `카드 한 장 뽑기` (shuffle → 7-card mini fan → pick 1 → flip); after pick: friend's own short result (fixture: 태양 · `오늘은 숨기지 않아도 되는 날이에요…` 2-3 sentences), optional one-line message input `하늘님에게 한마디 남기기 (선택)`, primary `하늘님 이야기에 남기기`, then ghost/secondary `나도 내 스타로그 시작하기`. Explain: `남긴 카드는 하늘님이 확인한 뒤 이야기에 들어가요.`
- Guide: list of 6 fixture articles (titles: 타로 카드 읽는 법, 정방향과 역방향은 뭐가 달라요?, 출생시간을 모를 때 사주는?, 오행이 뭐예요?, 은둔자 카드 이야기, 별 카드 이야기) with short bodies (3-5 paragraphs each, written in 해요체, factual, no fortune guarantees); article page layout for SEO (h1, reading width 640px).

- [ ] Steps: implement, check in browser at 375/1280, Playwright smoke `e2e/saju-story.spec.ts` (saju form → chart shows 丙寅 and 병화; story shows 3 timeline items; invite pick 1 shows result), commit `feat(web): saju, story, me, invite, guide screens on fixtures`.

---

### Task 9: Visual QA pass

- [ ] Run `design:accessibility-review` style checks manually: contrast of `--ink-sub` on glass surfaces, focus order, labels.
- [ ] Capture full-page screenshots of every route at 375x812 and 1280x800 into `apps/web/test-results/screens/`; review each for: one gold primary per screen, no text <13px except tabs, no meta copy, no English leftovers, consistent nicknames (`별지기` is the signed-in user nickname; the inviter in invite fixtures is `하늘`), cards never smaller than 100px wide on result/chapter.
- [ ] Fix issues; commit `fix(web): visual QA pass`.

---

## Later plans (not part of P1)

- **P2 Data, auth, wallet:** Supabase schema + RLS, Kakao/Google/dev-email auth, session restore tokens, wallet ledger functions (grant/reserve/commit/release/refund, idempotency), chapters/stories persistence, invites/guest scenes, Toss Payments test mode (direct pay + 달빛 packs), wallet history.
- **P3 Reading generation:** 78-card knowledge base, saju rule knowledge, outline→prose pipeline with Anthropic (fixture provider when no key), automatic checks, follow-ups, story mode rendering, eval harness with the rubric from `docs/research/`.
- **P4 Launch readiness:** legal pages (약관, 개인정보, 환불), business footer config, SEO (metadata, sitemap, OG images from share cards), guide CMS-lite, ja locale strings, analytics events, error pages, Vercel config for `taro.yeolmaeapps.kr`, production checklist.
