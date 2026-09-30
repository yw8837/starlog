import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

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
  /** Seeds the tarot question flow (sessionStorage) before the page loads. */
  flow?: boolean;
  /** Extra steps after the page loads (open a state worth seeing). */
  prepare?: (page: Page) => Promise<void>;
};

const SCREENS: Screen[] = [
  { name: "home", path: "/" },
  { name: "home-first", path: "/?visit=first" },
  { name: "tarot-new", path: "/tarot/new" },
  { name: "tarot-new-filled", path: "/tarot/new", flow: true },
  { name: "tarot-situation", path: "/tarot/new/situation", flow: true },
  { name: "tarot-draw", path: "/tarot/draw?instant=1" },
  {
    name: "tarot-draw-picked",
    path: "/tarot/draw?instant=1",
    prepare: async (page) => {
      await settleAnimations(page);
      for (const n of [3, 10, 17]) await pickFanCard(page, n);
      await expect(page.getByText("모두 골랐어요")).toBeVisible();
    },
  },
  { name: "tarot-draw-daily", path: "/tarot/draw?template=daily&instant=1" },
  { name: "tarot-result", path: "/tarot/result", spread: true },
  { name: "tarot-result-returning", path: "/tarot/result?visit=returning", spread: true },
  { name: "login", path: "/login" },
  { name: "chapter-sample", path: "/chapter/sample", spread: true },
  {
    name: "chapter-sample-story",
    path: "/chapter/sample",
    spread: true,
    prepare: async (page) => {
      await page.getByRole("navigation", { name: "이 장의 차례" }).getByRole("link", { name: "이야기" }).click();
      await expect(page.getByText("기록 · 토끼 사서")).toBeVisible();
    },
  },
  { name: "chapter-generating", path: "/chapter/sample?from=unlock" },
  { name: "chapter-prologue", path: "/chapter/prologue" },
  { name: "saju-new", path: "/saju/new" },
  { name: "saju-chart", path: "/saju/chart" },
  { name: "story", path: "/story" },
  { name: "story-empty", path: "/story?empty=1" },
  { name: "me", path: "/me" },
  {
    name: "me-packs",
    path: "/me",
    prepare: async (page) => {
      await page.getByRole("button", { name: "달빛 충전하기" }).click();
      await expect(page.getByRole("dialog", { name: "달빛 충전" })).toBeVisible();
    },
  },
  { name: "invite", path: "/invite/abc123?instant=1" },
  { name: "guide", path: "/guide" },
  { name: "guide-the-hermit", path: "/guide/the-hermit" },
  { name: "guide-five-elements", path: "/guide/five-elements" },
  { name: "not-found", path: "/terms" },
  { name: "dev-characters", path: "/dev/characters" },
];

/** 나와 그 사람 · 연락 · 이번 달, two conditions and a note (what a user would have chosen). */
const FLOW = {
  who: "us",
  topicId: "contact",
  when: "month",
  conditions: { relation: "알아가는 중", "recent-contact": "뜸해짐" },
  note: "요즘은 제가 먼저 안 하면 조용해요",
};

/** Product meta copy that must never appear on a user screen (global constraints). */
const META_COPY = ["무료로 다 보여드려요", "예시예요", "같은 품질"];

/** Waits until every finite CSS animation (e.g. the fan's deal-out) has finished. */
async function settleAnimations(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity),
  );
}

/** Fan cards overlap, so click each one on a point where it is the top-most element. */
async function pickFanCard(page: Page, n: number) {
  const point = await page.evaluate((index) => {
    const el = document.querySelectorAll("[data-fan-index]")[index];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    for (let y = r.top + 6; y < r.bottom; y += 6)
      for (let x = r.left + 2; x < r.right; x += 3)
        if (document.elementFromPoint(x, y)?.closest("[data-fan-index]") === el) return { x, y };
    return null;
  }, n);
  expect(point, `fan card ${n} has a visible spot`).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
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
  if (screen.flow) {
    await page.addInitScript((flow) => window.sessionStorage.setItem("starlog.tarot-flow", flow), JSON.stringify(FLOW));
  }
  await page.goto(screen.path);
  await page.waitForLoadState("networkidle");
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

test("@screens reduced motion stops every animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/", "/tarot/draw?instant=1", "/chapter/sample?from=unlock", "/story", "/dev/characters"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const running = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === "running")
        .map((a) => (a.effect as KeyframeEffect | null)?.target ?? null)
        // Only the app's own elements (the dev overlay lives in a shadow root).
        .filter((target): target is Element => target !== null && target.getRootNode() === document)
        .map((target) => `${target.tagName.toLowerCase()}.${String(target.getAttribute("class") ?? "").split(" ")[0]}`),
    );
    expect(running, `running animations on ${path}`).toEqual([]);
  }
});
