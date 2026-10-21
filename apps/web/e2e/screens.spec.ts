import { mkdirSync, writeFileSync } from "node:fs";
import { expect, request as playwrightRequest, test, type Page, type TestInfo } from "@playwright/test";
import { pickCard } from "./cards";
import { fakeBrowserClock, openingOn, ownerPass } from "./opening";

/**
 * Screen sweep (@screens): a full-height screenshot of every route per viewport project
 * (mobile 375×812, desktop 1280×800, narrow 360×780) in test-results/screens/<project>/<route>.png,
 * plus an audit of the UI rules that can be measured. Run it alone with `pnpm e2e:screens`.
 *
 * Hard rules (fail the test): no horizontal overflow, no visible text under 13px except tab
 * labels (12px), at most one gold primary button, one <main> and one <h1>, the footer outside
 * <main>, no product meta copy, spread cards at least 100px wide on result/chapter screens.
 * Softer findings (touch targets, Latin words, controls without a visible focus ring) go to
 * <route>.json next to each screenshot for review.
 */

type Screen = {
  name: string;
  path: string;
  /** Screens whose spread cards must stay at least 100px wide. */
  spread?: boolean;
  /** Before the page loads: seed this device's storage, deal cards, hold or fake API answers. */
  setup?: (page: Page) => Promise<void>;
  /** Extra steps after the page loads (open a state worth seeing). */
  prepare?: (page: Page) => Promise<void>;
  /** A request is held open on purpose (a waiting screen): do not wait for the network to go idle. */
  busy?: boolean;
};

/** 나와 그 사람 · 연락 · 이번 달, two conditions and a note (what a user would have chosen). */
const FLOW = {
  who: "us",
  topicId: "contact",
  when: "month",
  conditions: { relation: "알아가는 중", "recent-contact": "뜸해짐" },
  note: "요즘은 제가 먼저 안 하면 조용해요",
};

/** Typed parts: 나와 그 사람 (엄마) · 전세 계약 · 다음 주 금요일 면접. */
const FLOW_CUSTOM = { who: "us", whoText: "엄마", topicText: "전세 계약", whenText: "다음 주 금요일 면접", conditions: {}, note: "" };

const CONTACT_INPUT = {
  topicId: "contact",
  whoId: "us",
  whenId: "month",
  question: "이번 달 그 사람에게 먼저 연락해도 될까?",
  conditions: [
    { label: "관계", value: "알아가는 중" },
    { label: "최근 연락", value: "뜸해짐" },
  ],
  note: "요즘은 제가 먼저 안 하면 조용해요",
};

/** A saju profile that is not the sample chart (time known). */
const BIRTH = { calendar: "solar", year: 1990, month: 1, day: 1, isLeapMonth: false, timeKnown: true, hour: 9, minute: 30, gender: "female", placeId: "seoul" };

const DAY_MS = 24 * 60 * 60 * 1000;
/** The owner pass of the server under test (scripts/ops/gate3-lite.sh passes the preview's; `pnpm e2e` uses this default). */
const OWNER_CODE = process.env.E2E_OWNER_CODE ?? "owner-code-for-e2e-0000001";

/** Each screen gets its own client address, so the per-IP generation limiter never spans screens. */
async function ownAddress(page: Page) {
  const n = () => Math.floor(Math.random() * 250);
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.5.${n()}.${n()}` });
}

async function setStorage(page: Page, area: "sessionStorage" | "localStorage", key: string, value: unknown) {
  await page.addInitScript(([a, k, v]) => window[a as "localStorage"].setItem(k, v), [area, key, JSON.stringify(value)] as const);
}

// Saved just now: a 30-minute-old flow starts the builder clean (lib/freshStart.ts).
const seedFlow = (page: Page, flow: object) => setStorage(page, "sessionStorage", "starlog.tarot-flow", { savedAt: Date.now(), ...flow });

/** The contact question with three cards the server dealt (a signed draw), as the draw page leaves it. */
async function dealtFlow(page: Page) {
  await ownAddress(page);
  const draw = await (await page.request.post("/api/tarot/draw", { data: { templateId: "relationship-contact", picks: [2, 9, 15] } })).json();
  await seedFlow(page, { ...FLOW, draw: { templateId: "relationship-contact", ...draw } });
  return draw as { drawToken: string; cards: Array<{ position: string; cardId: string; orientation: string }> };
}

/** A full tarot reading from the API, stored as this device keeps it (`age` days old). */
async function tarotChapter(page: Page, id: string, age = 0) {
  // Opened with the owner pass (it works whether or not 오픈 기념 무료 is on), which is then dropped so the
  // screen is a visitor's; the record shows the follow-up box and share button a paid reading has.
  await page.context().clearCookies();
  const draw = await dealtFlow(page);
  await ownerPass(page, test.info());
  const res = await (await page.request.post("/api/tarot/reading", { data: { drawToken: draw.drawToken, input: CONTACT_INPUT, unlock: { method: "owner" } } })).json();
  await page.context().clearCookies();
  return {
    id,
    kind: "tarot",
    createdAt: Date.now() - age * DAY_MS,
    chapterToken: res.chapterToken,
    turns: [],
    followUpsLeft: 3,
    question: CONTACT_INPUT.question,
    conditions: CONTACT_INPUT.conditions,
    note: CONTACT_INPUT.note,
    cards: draw.cards,
    reading: res.reading,
  };
}

/**
 * A full saju reading from the API for BIRTH, stored as this device keeps it. Saju has no free full
 * reading: it is opened with the owner pass, which is then dropped so the screen is a visitor's.
 */
async function sajuChapter(page: Page, id: string, age = 0) {
  await page.context().clearCookies();
  await ownAddress(page);
  const origin = new URL(test.info().project.use.baseURL!).origin;
  expect((await page.request.post("/api/owner", { data: { code: OWNER_CODE }, headers: { origin } })).ok()).toBe(true);
  const teaser = await (await page.request.post("/api/saju/teaser", { data: { birth: BIRTH } })).json();
  const res = await (await page.request.post("/api/saju/reading", { data: { birth: BIRTH, unlock: { method: "owner" } } })).json();
  await page.context().clearCookies();
  return { id, kind: "saju", createdAt: Date.now() - age * DAY_MS, chapterToken: res.chapterToken, turns: [], followUpsLeft: 3, birth: BIRTH, title: teaser.title, summary: teaser.summary, reading: res.reading };
}

const BOND_FRIENDS = [
  { nickname: "민지", birth: { calendar: "solar", year: 1991, month: 5, day: 12 } },
  { nickname: "하늘이", birth: { calendar: "solar", year: 1992, month: 8, day: 3 } },
  { nickname: "도윤", birth: { calendar: "solar", year: 1988, month: 11, day: 20 } },
  { nickname: "서아", birth: { calendar: "solar", year: 1995, month: 2, day: 28 } },
];

/** A 별자리 인연 owner on this device (용우, `sign` chosen) with `stars` friends joined from their own devices; the invite code. */
async function bondsOwner(page: Page, stars: number, sign = "aries"): Promise<string> {
  await ownAddress(page);
  const owner = await page.request.post("/api/bonds/owner", { data: { nickname: "용우", birth: { calendar: "solar", year: 1990, month: 1, day: 1 } } });
  const { code } = (await owner.json()) as { code: string };
  await page.request.post("/api/bonds/choose", { data: { sign } });
  for (const [i, friend] of BOND_FRIENDS.slice(0, stars).entries()) {
    const n = Math.floor(Math.random() * 250);
    const device = await playwrightRequest.newContext({ baseURL: test.info().project.use.baseURL, extraHTTPHeaders: { "x-forwarded-for": `10.6.${n}.${i + 1}` } });
    await device.post("/api/bonds/join", { data: { ...friend, code, pick: i * 3 } });
    await device.dispose();
  }
  return code;
}

/** Holds a request open (the waiting screens). */
const hold = (page: Page, pattern: string) => page.route(pattern, () => new Promise<void>(() => {}));

const fail = (page: Page, pattern: string, status: number, body: object) =>
  page.route(pattern, (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }));

const waitForSheet = (page: Page) => expect(page.getByRole("region", { name: "전체 풀이에 담긴 것" })).toBeVisible({ timeout: 30_000 });

const SCREENS: Screen[] = [
  { name: "home", path: "/" },
  { name: "home-checkin", path: "/", setup: async (page) => setStorage(page, "localStorage", "starlog.chapters", [await tarotChapter(page, "screenaa01", 4)]) },
  { name: "home-bonds", path: "/", setup: async (page) => void (await bondsOwner(page, 2)) },
  { name: "bonds-start", path: "/bonds", setup: ownAddress },
  { name: "bonds-filling", path: "/bonds", setup: async (page) => void (await bondsOwner(page, 2)) },
  { name: "bonds-complete", path: "/bonds", setup: async (page) => void (await bondsOwner(page, 4)) },
  { name: "bonds-ranking", path: "/ranking/aries", setup: async (page) => void (await bondsOwner(page, 4)) },
  { name: "bonds-code", path: "/b", setup: ownAddress },
  {
    name: "bonds-join",
    path: "/b",
    setup: ownAddress,
    prepare: async (page) => {
      const owner = await playwrightRequest.newContext({ baseURL: test.info().project.use.baseURL, extraHTTPHeaders: { "x-forwarded-for": "10.7.0.1" } });
      const { code } = (await (await owner.post("/api/bonds/owner", { data: { nickname: "용우", birth: { calendar: "solar", year: 1990, month: 1, day: 1 } } })).json()) as { code: string };
      await owner.post("/api/bonds/choose", { data: { sign: "leo" } });
      await owner.dispose();
      await page.goto(`/b/${code}`);
      await page.waitForLoadState("networkidle");
    },
  },
  { name: "lucky", path: "/lucky", setup: ownAddress },
  { name: "tarot-new", path: "/tarot/new" },
  // ?keep=1: as if reached from inside the flow (a plain visit starts the builder clean, lib/freshStart.ts).
  { name: "tarot-new-filled", path: "/tarot/new?keep=1", setup: (page) => seedFlow(page, FLOW) },
  { name: "tarot-new-custom", path: "/tarot/new?keep=1", setup: (page) => seedFlow(page, FLOW_CUSTOM) },
  { name: "tarot-situation", path: "/tarot/new/situation?keep=1", setup: (page) => seedFlow(page, FLOW) },
  { name: "tarot-situation-custom", path: "/tarot/new/situation?keep=1", setup: (page) => seedFlow(page, FLOW_CUSTOM) },
  { name: "tarot-draw", path: "/tarot/draw?instant=1", setup: (page) => seedFlow(page, FLOW) },
  {
    name: "tarot-draw-picked",
    path: "/tarot/draw?instant=1",
    setup: (page) => seedFlow(page, FLOW),
    prepare: async (page) => {
      await settleAnimations(page);
      for (let i = 0; i < 3; i++) await pickCard(page);
      await expect(page.getByText("모두 골랐어요")).toBeVisible();
    },
  },
  { name: "tarot-result", path: "/tarot/result", spread: true, setup: async (page) => void (await dealtFlow(page)), prepare: waitForSheet },
  {
    name: "tarot-result-generating",
    path: "/tarot/result",
    spread: true,
    busy: true,
    setup: async (page) => {
      await dealtFlow(page);
      await hold(page, "**/api/tarot/teaser");
    },
  },
  {
    name: "tarot-result-error",
    path: "/tarot/result",
    setup: async (page) => {
      await dealtFlow(page);
      await fail(page, "**/api/tarot/teaser", 502, { code: "QUALITY", message: "…" });
    },
    prepare: async (page) => expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible(),
  },
  // The device's free first reading spent: a state that exists only while 오픈 기념 무료 is on (until 10/31).
  ...(openingOn()
    ? [
        {
          name: "tarot-result-limit",
          path: "/tarot/result",
          setup: async (page: Page) => {
            await dealtFlow(page);
            await fail(page, "**/api/tarot/reading", 429, { code: "BETA_LIMIT", scope: "first", message: "…" });
          },
          prepare: async (page: Page) => {
            await waitForSheet(page);
            await page.getByRole("button", { name: /전체 풀이 보기/ }).click();
            await expect(page.getByText("오픈 기념 무료 풀이를 이미 열었어요").first()).toBeVisible();
          },
        },
      ]
    : []),
  {
    name: "tarot-unlock-generating",
    path: "/tarot/result",
    setup: async (page) => {
      // After 오픈 기념 무료 (10/31) a visitor has nothing free to open: the owner pass opens it instead.
      if (!openingOn()) await ownerPass(page, test.info());
      await dealtFlow(page);
      await hold(page, "**/api/tarot/reading");
    },
    prepare: async (page) => {
      await waitForSheet(page);
      await page.getByRole("button", { name: openingOn() ? /전체 풀이 보기/ : "운영자로 무료 열기" }).click();
      await expect(page.getByText("이 화면을 열어 둔 채로 기다려 주세요.")).toBeVisible();
    },
  },
  { name: "login", path: "/login" },
  { name: "chapter-sample", path: "/chapter/sample", spread: true },
  { name: "chapter-local", path: "/chapter/screenbb02", spread: true, setup: async (page) => setStorage(page, "localStorage", "starlog.chapters", [await tarotChapter(page, "screenbb02")]) },
  { name: "chapter-local-checkin", path: "/chapter/screencc03", spread: true, setup: async (page) => setStorage(page, "localStorage", "starlog.chapters", [await tarotChapter(page, "screencc03", 4)]) },
  { name: "chapter-missing", path: "/chapter/abcdef12" },
  { name: "saju-new", path: "/saju/new" },
  { name: "saju-new-status", path: "/saju/new", prepare: async (page) => page.getByRole("button", { name: /요즘 상황도 알려 주기/ }).click() },
  { name: "saju-chart", path: "/saju/chart" },
  {
    name: "saju-chart-own",
    path: "/saju/chart",
    setup: async (page) => {
      await ownAddress(page);
      await setStorage(page, "localStorage", "starlog.saju-profile", BIRTH);
    },
    prepare: waitForSheet,
  },
  {
    name: "saju-chart-topic",
    path: "/saju/chart",
    setup: async (page) => {
      await ownAddress(page);
      await setStorage(page, "localStorage", "starlog.saju-profile", BIRTH);
    },
    prepare: async (page) => {
      await waitForSheet(page);
      await page.getByRole("group", { name: "다른 운도 볼 수 있어요" }).getByRole("button", { name: "재물운" }).click();
      await expect(page.getByRole("region", { name: "재물운 전체 풀이에 담긴 것" })).toBeVisible({ timeout: 30_000 });
    },
  },
  { name: "saju-reading", path: "/chapter/screendd04", setup: async (page) => setStorage(page, "localStorage", "starlog.chapters", [await sajuChapter(page, "screendd04")]) },
  { name: "today", path: "/today", setup: (page) => ownAddress(page) },
  {
    name: "today-pick",
    path: "/today",
    setup: (page) => ownAddress(page),
    prepare: async (page) => {
      await page.getByRole("button", { name: "바로 펼치기" }).click();
      await expect(page.getByRole("button", { name: /번째 카드 고르기/ })).toHaveCount(3);
    },
  },
  {
    name: "today-opened",
    path: "/today",
    setup: async (page) => {
      await ownAddress(page);
      const reading = await (await page.request.post("/api/tarot/daily", { data: { pick: 1 } })).json();
      await page.addInitScript((r) => {
        const day = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
        window.localStorage.setItem("starlog.daily", JSON.stringify({ day, reading: JSON.parse(r) }));
      }, JSON.stringify(reading));
    },
  },
  { name: "story", path: "/story" },
  {
    name: "story-records",
    path: "/story",
    setup: async (page) => setStorage(page, "localStorage", "starlog.chapters", [await sajuChapter(page, "screenee05", 5), await tarotChapter(page, "screenff06", 1)]),
  },
  { name: "me", path: "/me" },
  {
    name: "me-erase",
    path: "/me",
    prepare: async (page) => {
      await page.getByRole("button", { name: "이 기기에 저장된 기록 모두 지우기" }).click();
      await expect(page.getByRole("dialog", { name: "이 기기의 기록을 모두 지울까요?" })).toBeVisible();
    },
  },
  { name: "invite", path: "/invite/abc123?instant=1" },
  { name: "guide-tarot", path: "/guide/tarot" },
  { name: "guide-saju", path: "/guide/saju" },
  { name: "guide-the-hermit", path: "/guide/the-hermit" },
  { name: "guide-five-elements", path: "/guide/five-elements" },
  { name: "not-found", path: "/terms" },
  { name: "dev-characters", path: "/dev/characters" },
];


/** Product meta copy that must never appear on a user screen (global constraints). */
const META_COPY = ["무료로 다 보여드려요", "예시예요", "같은 품질"];

/** Waits until every finite CSS animation and transition (e.g. the table's spread) has finished. */
async function settleAnimations(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
}

type Audit = {
  overflow: number;
  smallText: string[];
  goldPrimaries: string[];
  mains: number;
  h1s: number;
  headingSkips: string[];
  footerInMain: boolean;
  metaCopy: string[];
  narrowCards: string[];
  smallTargets: string[];
  latinWords: string[];
  unnamedControls: string[];
  /** Keyboard-focusable controls that show no focus indicator (outline or box-shadow) when focused. */
  noFocusRing: string[];
};

/** Measures the page in the browser. Only visible, rendered elements count. */
async function audit(page: Page, metaCopy: string[]): Promise<Audit> {
  return page.evaluate((meta) => {
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      // Visually hidden helpers (clip-path inset 50%) are for screen readers only.
      for (let node: Element | null = el; node; node = node.parentElement) {
        const s = getComputedStyle(node);
        if (s.clipPath === "inset(50%)" || s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
        if (node.tagName === "DIALOG" && !(node as HTMLDialogElement).open) return false;
      }
      return true;
    };
    const describe = (el: Element) => {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      const cls = typeof el.className === "string" ? el.className.split(" ")[0] : "";
      return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} "${text}"`;
    };

    // Text under 13px (tab labels may be 12px).
    const smallText = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const el = node.parentElement;
      if (!el || el.closest("nextjs-portal, script, style, svg")) continue;
      if (!visible(el)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      const isTab = Boolean(el.closest('nav[aria-label="주요 메뉴"]'));
      if (size < (isTab ? 12 : 13)) smallText.add(`${size}px ${describe(el)}`);
    }

    // Gold-filled primaries: buttons or links whose background is the gold token. With a modal
    // dialog open the page behind it is inert, so only the dialog counts.
    const modal = document.querySelector("dialog:modal");
    const goldPrimaries = [...(modal ?? document).querySelectorAll("a, button")]
      .filter((el) => visible(el) && getComputedStyle(el).backgroundColor === "rgb(243, 220, 161)")
      .map(describe);

    const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(visible);
    const headingSkips: string[] = [];
    let last = 0;
    for (const h of headings) {
      const level = Number(h.tagName[1]);
      if (last && level > last + 1) headingSkips.push(`h${last} → ${describe(h)}`);
      last = level;
    }

    // The page footer (contentinfo) is a <footer> outside any article/section/aside/nav.
    const pageFooters = [...document.querySelectorAll("footer")].filter((f) => !f.closest("article, section, aside, nav"));
    const text = document.body.innerText;

    const narrowCards = [...document.querySelectorAll('aside [data-face]')]
      .filter(visible)
      .map((el) => el.getBoundingClientRect().width)
      .filter((w) => w < 100)
      .map((w) => `${w.toFixed(1)}px`);

    // Touch targets under 44×44 (inline links inside running text are listed too, for review).
    // A stretched link (an absolute ::after over its card) is measured by the card it covers.
    const hitBox = (el: Element) => {
      const after = getComputedStyle(el, "::after");
      const card = el instanceof HTMLElement ? el.offsetParent : null;
      return after.content !== "none" && after.position === "absolute" && card ? card.getBoundingClientRect() : el.getBoundingClientRect();
    };
    const smallTargets = [...document.querySelectorAll('a, button, input:not([type="hidden"]), select, textarea, summary, [role="radio"]')]
      .filter(visible)
      .filter((el) => {
        const r = hitBox(el);
        // A native radio/checkbox is covered by its label; measure the label instead.
        if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) {
          const label = el.closest("label");
          if (label) {
            const lr = label.getBoundingClientRect();
            return lr.height < 44;
          }
        }
        return r.width < 44 || r.height < 44;
      })
      .map((el) => {
        const r = hitBox(el);
        return `${Math.round(r.width)}×${Math.round(r.height)} ${describe(el)}`;
      });

    const latinWords = [...new Set(text.match(/[A-Za-z][A-Za-z.@-]{2,}/g) ?? [])];

    const unnamedControls = [...document.querySelectorAll("a, button, input, select, textarea")]
      .filter((el) => {
        const name = el.getAttribute("aria-label") ?? el.getAttribute("aria-labelledby") ?? (el.textContent ?? "").trim();
        if (name) return false;
        if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)
          return !(el.labels && el.labels.length > 0) && !el.getAttribute("title");
        return !el.querySelector("img[alt]:not([alt=''])");
      })
      .map(describe);

    // Focus each keyboard stop (capture() pressed a key first, so :focus-visible applies) and check
    // that an outline or shadow appears on it, a child (the fan's card) or a close ancestor (the
    // story card around its stretched link).
    const near = (el: Element) => {
      const up: Element[] = [];
      for (let node = el.parentElement; node && up.length < 3; node = node.parentElement) up.push(node);
      return up;
    };
    const rings = (el: Element) =>
      [...near(el), el, ...el.querySelectorAll("*")]
        .map((node) => {
          const st = getComputedStyle(node);
          const outline = st.outlineStyle !== "none" && parseFloat(st.outlineWidth) > 0 ? `${st.outlineStyle} ${st.outlineWidth} ${st.outlineColor}` : "";
          return `${outline}|${st.boxShadow}`;
        })
        .join(";");
    const focusScope = modal ?? document;
    const noFocusRing = [...focusScope.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, [tabindex="0"]')]
      .filter((el) => visible(el) && el.tabIndex >= 0)
      .filter((el) => {
        // Start unfocused (a dialog focuses its first control when it opens).
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        const before = rings(el);
        el.focus({ preventScroll: true });
        const ring = document.activeElement === el && el.matches(":focus-visible") && rings(el) !== before;
        el.blur();
        return !ring;
      })
      .map(describe);

    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      smallText: [...smallText],
      goldPrimaries,
      mains: document.querySelectorAll("main").length,
      h1s: document.querySelectorAll("h1").length,
      headingSkips,
      footerInMain: pageFooters.some((f) => f.closest("main")),
      metaCopy: meta.filter((phrase) => text.includes(phrase)),
      narrowCards,
      smallTargets,
      latinWords,
      unnamedControls,
      noFocusRing,
    };
  }, metaCopy);
}

async function capture(page: Page, info: TestInfo, screen: Screen) {
  const dir = `test-results/screens/${info.project.name}`;
  mkdirSync(dir, { recursive: true });
  if (screen.setup) await screen.setup(page);
  await page.goto(screen.path);
  if (!screen.busy) await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }); // dev-only overlay badge
  await page.evaluate(() => document.fonts.ready);
  if (screen.prepare) await screen.prepare(page);
  // Measure settled boxes (a dialog opens with a short scale-in, for example).
  await settleAnimations(page);
  // Keyboard modality for the focus-ring check, even after prepare() used the mouse.
  await page.keyboard.press("Shift");
  const result = await audit(page, META_COPY);
  writeFileSync(`${dir}/${screen.name}.json`, `${JSON.stringify(result, null, 2)}\n`);
  // Full page: grow the viewport to the page height so fixed bars (tab bar, floating button) sit
  // at the bottom as on a phone, instead of over the middle of a stitched capture.
  const viewport = page.viewportSize()!;
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, height) });
  // Finite animations jump to their end state so the shot shows the settled screen.
  await page.screenshot({ path: `${dir}/${screen.name}.png`, animations: "disabled" });
  await page.setViewportSize(viewport);
  return result;
}

test.beforeEach(async ({ page }) => fakeBrowserClock(page));

for (const screen of SCREENS) {
  test(`@screens ${screen.name}`, async ({ page }, info) => {
    const a = await capture(page, info, screen);
    expect.soft(a.overflow, "horizontal overflow (px)").toBeLessThanOrEqual(0);
    expect.soft(a.smallText, "visible text under 13px").toEqual([]);
    expect.soft(a.goldPrimaries.length, `gold primaries: ${a.goldPrimaries.join(", ")}`).toBeLessThanOrEqual(1);
    expect.soft(a.mains, "<main> count").toBe(1);
    expect.soft(a.h1s, "<h1> count").toBe(1);
    expect.soft(a.headingSkips, "skipped heading levels").toEqual([]);
    expect.soft(a.footerInMain, "footer inside <main>").toBe(false);
    expect.soft(a.metaCopy, "product meta copy").toEqual([]);
    expect.soft(a.unnamedControls, "controls without an accessible name").toEqual([]);
    if (screen.spread) expect.soft(a.narrowCards, "spread cards under 100px").toEqual([]);
  });
}

test("@screens reduced motion stops every animation that moves", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/", "/today", "/tarot/draw?instant=1", "/chapter/sample", "/story", "/dev/characters"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const running = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === "running")
        // Allowed: short opacity-only fades (nothing travels), e.g. the fan fading in or the deck's
        // gentle shuffle pulse.
        .filter((a) => {
          const frames = (a.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
          const props = frames.flatMap((f) => Object.keys(f)).filter((k) => !["offset", "computedOffset", "easing", "composite"].includes(k));
          const finite = a.effect?.getComputedTiming().iterations !== Infinity;
          return !(finite && props.length > 0 && props.every((prop) => prop === "opacity"));
        })
        .map((a) => (a.effect as KeyframeEffect | null)?.target ?? null)
        // Only the app's own elements (the dev overlay lives in a shadow root).
        .filter((target): target is Element => target !== null && target.getRootNode() === document)
        .map((target) => `${target.tagName.toLowerCase()}.${String(target.getAttribute("class") ?? "").split(" ")[0]}`),
    );
    expect(running, `running animations on ${path}`).toEqual([]);
  }
});
