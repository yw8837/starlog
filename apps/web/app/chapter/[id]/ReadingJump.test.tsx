// @vitest-environment jsdom
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATES } from "@starlog/core";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReadingArticle } from "@/components/tarot/ReadingArticle";
import { SITE } from "@/lib/config";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import { CHAPTERS_KEY } from "@/lib/storage/chapters";
import { asMember } from "@/lib/testing/account";
import { LocalChapter } from "./LocalChapter";

/**
 * 골라 읽기 (spec 2026-11-26 beyond trend §2, §7): fixed ids on an opened tarot reading's card sections and headings, and a
 * jump row under the spread of the opened reading only. Nothing about the stored reading changes.
 */

beforeEach(() => asMember());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/chapter/x" }));

const DAY = 24 * 60 * 60 * 1000;
const seed = (chapters: unknown[]) => localStorage.setItem(CHAPTERS_KEY, JSON.stringify({ v: 1, chapters }));
const section = (heading: string) => ({ heading, body: `${heading} 본문이에요.` });

const TAROT = {
  id: "tarot0001", createdAt: Date.now() - DAY, chapterToken: "x", turns: [], followUpsLeft: 3, kind: "tarot", question: "q", conditions: [], note: "",
  cards: TAROT_SAMPLE.cards.map(({ position, cardId, orientation }) => ({ position, cardId, orientation })), reading: TAROT_SAMPLE.paid,
};
// Saved before 돌아보기 (observation) was written: the same shape, one heading fewer.
const { observation: _none, ...OLDER_READING } = TAROT_SAMPLE.paid as typeof TAROT_SAMPLE.paid & { observation?: unknown };
const OLDER = { ...TAROT, id: "tarot0002", reading: OLDER_READING };

const POS = TEMPLATES["deep-tarot"].positions;
const DEEP_CARDS = POS.map((position, i) => ({ position, cardId: `cups-0${(i % 9) + 1}`, orientation: "upright" }));
const DEEP = {
  id: "deep0001", createdAt: Date.now() - DAY, chapterToken: "t", turns: [], followUpsLeft: 5, kind: "tarot-deep", question: "이번 달 내 재물 흐름은 어떨까?", conditions: [], note: "", cards: DEEP_CARDS,
  reading: {
    verdict: "천천히 가도 괜찮아요", positions: DEEP_CARDS.map((c) => ({ position: c.position, cardId: c.cardId, heading: `${c.position} 카드`, body: "본문이에요." })),
    crossing: section("지금과 가로막는 것"), axes: { heading: "두 갈래", vertical: section("세로"), horizontal: section("가로") },
    staff: section("기둥"), timing: section("시기"), action: section("오늘 해 볼 일"), observation: section("확인해 볼 신호"), followUps: [],
  },
};

const jumpRow = () => screen.queryByRole("navigation", { name: "풀이 바로 가기" });
const jumpLinks = () => within(jumpRow()!).getAllByRole("link");
const targetOf = (link: HTMLElement) => document.getElementById(link.getAttribute("href")!.slice(1));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("the ids on a tarot reading", () => {
  it("numbers the card sections card-1… and every heading part-1… in the order shown, none twice", () => {
    const { container } = render(<ReadingArticle paid={TAROT_SAMPLE.paid} />);
    const ids = [...container.querySelectorAll("[id]")].map((node) => node.id).filter((id) => /^(card|part)-/.test(id));
    expect(ids.filter((id) => id.startsWith("card-"))).toEqual(["card-1", "card-2", "card-3"]);
    const parts = ids.filter((id) => id.startsWith("part-"));
    expect(parts).toEqual(parts.map((_, i) => `part-${i + 1}`));
    expect(parts.length).toBeGreaterThanOrEqual(7);
    expect(new Set(ids).size).toBe(ids.length);
    // Each card id is on the section that reads that card.
    expect(container.querySelector("#card-2")!.textContent).toContain(TAROT_SAMPLE.paid.cards[1]!.heading);
  });
});

describe("the jump row of an opened 3-card reading", () => {
  it("lists the real position names, then 앞으로 and 할 일, as links in a list under the spread, each to its part", () => {
    seed([TAROT]);
    render(<LocalChapter id="tarot0001" />);
    const row = jumpRow()!;
    expect(row.querySelector("ul")).not.toBeNull();
    const links = jumpLinks();
    expect(links.map((a) => a.textContent)).toEqual([...TEMPLATES[TAROT_SAMPLE.template].positions, "앞으로", "할 일"]);
    expect(links.slice(0, 3).map((a) => a.getAttribute("href"))).toEqual(["#card-1", "#card-2", "#card-3"]);
    for (const link of links) expect(targetOf(link), link.textContent!).not.toBeNull();
    expect(targetOf(links[3]!)!.textContent).toContain(TAROT_SAMPLE.paid.timing.heading);
    expect(targetOf(links[4]!)!.textContent).toContain(TAROT_SAMPLE.paid.action.heading);
    // Under the spread, above the reading.
    const spread = screen.getByRole("complementary", { name: "뽑은 카드" });
    expect(spread.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.compareDocumentPosition(document.getElementById("card-1")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("moves focus to the part it jumps to (a screen reader reads on from there)", () => {
    seed([TAROT]);
    render(<LocalChapter id="tarot0001" />);
    const link = jumpLinks()[1]!;
    fireEvent.click(link);
    expect(document.activeElement).toBe(document.getElementById("card-2"));
  });

  it("works on a reading saved before 돌아보기 was written: the same names, every link reaching its part", () => {
    seed([OLDER]);
    render(<LocalChapter id="tarot0002" />);
    const links = jumpLinks();
    expect(links.map((a) => a.textContent)).toEqual([...TEMPLATES[TAROT_SAMPLE.template].positions, "앞으로", "할 일"]);
    for (const link of links) expect(targetOf(link), link.textContent!).not.toBeNull();
    expect(targetOf(links[4]!)!.textContent).toContain(TAROT_SAMPLE.paid.action.heading);
  });

  it("is not there while jump is off (§6)", () => {
    const beyond = SITE.features.beyond as { jump: boolean };
    beyond.jump = false;
    try {
      seed([TAROT]);
      render(<LocalChapter id="tarot0001" />);
      expect(jumpRow()).toBeNull();
      expect(document.getElementById("card-1")).not.toBeNull();
    } finally {
      beyond.jump = true;
    }
  });
});

describe("where the jump row shows", () => {
  it("only on the opened readings' screens: no teaser, lock, sample or shared page draws it", () => {
    // The web app's folder (tests run from the repo root; jsdom gives import.meta.url no file: scheme).
    const root = existsSync(join(process.cwd(), "apps/web/app")) ? join(process.cwd(), "apps/web") : process.cwd();
    const users = ["app", "components"]
      .flatMap((dir) => readdirSync(join(root, dir), { recursive: true, encoding: "utf8" }).map((file) => `${dir}/${file.replaceAll("\\", "/")}`))
      .filter((file) => /\.tsx$/.test(file) && !/\.test\.tsx$/.test(file))
      .filter((file) => /from "@\/components\/tarot\/ReadingJump"/.test(readFileSync(join(root, file), "utf8")));
    expect(users.sort()).toEqual(["app/chapter/[id]/ChapterView.tsx", "app/chapter/[id]/PremiumChapterView.tsx"]);
    // Reads every component file, as lib/guide.client.test.ts does: slow on this disk under load.
  }, 60_000);
});

describe("the jump row of an opened 켈틱 크로스 10장 reading", () => {
  it("lists the ten positions by number and name, then 교차, 시기, 할 일, each reaching its part", () => {
    seed([DEEP]);
    render(<LocalChapter id="deep0001" />);
    const links = jumpLinks();
    expect(links.map((a) => a.textContent)).toEqual([...POS.map((position, i) => `${i + 1} ${position}`), "교차", "시기", "할 일"]);
    for (const link of links) expect(targetOf(link), link.textContent!).not.toBeNull();
    expect(targetOf(links[10]!)!.textContent).toContain("지금과 가로막는 것");
    expect(targetOf(links[11]!)!.textContent).toContain("시기");
    expect(targetOf(links[12]!)!.textContent).toContain("오늘 해 볼 일");
    expect(targetOf(links[4]!)!.textContent).toContain(`5번 · ${POS[4]}`);
  });
});
