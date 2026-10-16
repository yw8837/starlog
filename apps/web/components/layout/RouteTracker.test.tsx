// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetRoutes, lastRoute } from "@/lib/lastRoute";
import { SAJU_TEASERS_KEY, saveTeaser } from "@/lib/reading/teaserCache";
import { DEFAULT_SAJU_FORM } from "@/lib/sajuForm";
import { CHAPTERS_KEY } from "@/lib/storage/chapters";
import { MATCH_SEALS_KEY } from "@/lib/storage/matchSeals";
import { MATCH_FLOW_KEY } from "@/lib/premium/matchFlow";
import { RouteTracker } from "./RouteTracker";

const nav = vi.hoisted(() => ({ path: "/saju/chart" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));

const DAY = 86_400_000;
const teaser = { title: "t", summary: "s", lockedToc: [] };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  forgetRoutes();
  nav.path = "/saju/chart";
});

describe("RouteTracker", () => {
  it("notes the route on screen", () => {
    render(<RouteTracker />);
    expect(lastRoute()).toBe("/saju/chart");
  });

  it("drops the saju teasers past their time whenever the app opens (their keys hold birth data), and keeps the others", () => {
    saveTeaser("saju", "a-key-kept", teaser);
    saveTeaser("saju", "a-key-past-its-time", teaser, Date.now() - 40 * DAY);
    expect(localStorage.getItem(SAJU_TEASERS_KEY)).toContain("a-key-past-its-time");
    render(<RouteTracker />);
    expect(localStorage.getItem(SAJU_TEASERS_KEY)).not.toContain("a-key-past-its-time");
    expect(localStorage.getItem(SAJU_TEASERS_KEY)).toContain("a-key-kept");
  });

  it("writes nothing to the device when no teaser is kept or none is past its time", () => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    render(<RouteTracker />);
    cleanup();
    saveTeaser("saju", "a-key-kept", teaser);
    write.mockClear();
    render(<RouteTracker />);
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem(SAJU_TEASERS_KEY)).toContain("a-key-kept");
  });

  it("takes the sealed partner out of every 궁합 past its 30 days when the app opens, opened or not (review 2026-10-17 M2)", () => {
    const section = (heading: string) => ({ heading, body: `${heading} 본문이에요.` });
    const positions = ["나의 마음", "그 사람 쪽 흐름", "두 사람 사이", "엇갈리는 지점", "함께 가꿀 방향"];
    const cards = positions.map((position, i) => ({ position, cardId: `wands-0${i + 1}`, orientation: "upright" }));
    const reading = {
      verdict: "속도를 맞춰 가요", saju: { dayMasters: section("일간"), elements: section("오행"), pillars: section("일지"), luck: section("10년") },
      cards: cards.map((c) => ({ position: c.position, cardId: c.cardId, heading: c.position, body: "본문이에요." })),
      connection: section("연결"), bridge: section("사주와 카드"), action: section("해 볼 일"), observation: section("신호"), followUps: [],
    };
    const match = (id: string, ageDays: number, extra: Record<string, unknown> = {}) => ({
      id, createdAt: Date.now() - ageDays * DAY, chapterToken: `sealed.${id}`, turns: [], followUpsLeft: 5,
      kind: "match", relation: "friend", relationLabel: "친구", me: { birth: DEFAULT_SAJU_FORM }, cards, reading, ...extra,
    });
    localStorage.setItem(CHAPTERS_KEY, JSON.stringify({ v: 1, chapters: [match("old0000001", 31), match("new0000001", 3), match("legacy0001", 3, { partner: { birth: { ...DEFAULT_SAJU_FORM, year: 1987 } } })] }));
    localStorage.setItem(MATCH_SEALS_KEY, JSON.stringify({ gone0000000000000001: { sealed: "SEAL-PAST", exp: Date.now() - DAY }, kept0000000000000001: { sealed: "SEAL-KEPT", exp: Date.now() + DAY } }));
    render(<RouteTracker />);
    const kept = JSON.parse(localStorage.getItem(CHAPTERS_KEY)!).chapters as Array<Record<string, unknown>>;
    expect(kept.map((c) => [c.id, c.chapterToken])).toEqual([["old0000001", ""], ["new0000001", "sealed.new0000001"], ["legacy0001", ""]]);
    // An older version's record kept the birth as text, its token too (L1): both go.
    expect(localStorage.getItem(CHAPTERS_KEY)).not.toContain("1987");
    expect(localStorage.getItem(MATCH_SEALS_KEY)).not.toContain("SEAL-PAST");
    expect(localStorage.getItem(MATCH_SEALS_KEY)).toContain("SEAL-KEPT");
  });

  describe("an unfinished 궁합 flow (review 2026-10-17 M4)", () => {
    const keep = (savedAt: number) => {
      sessionStorage.setItem(MATCH_FLOW_KEY, JSON.stringify({ me: DEFAULT_SAJU_FORM, partner: { ...DEFAULT_SAJU_FORM, year: 1987 }, relation: "friend", ack: true, savedAt }));
      sessionStorage.setItem("starlog.teaser.premium", JSON.stringify({ key: "match|{\"partner\":1987}", value: {} }));
      sessionStorage.setItem("starlog.premium-resume.match", JSON.stringify({ input: "{\"partner\":1987}", resume: "r1", done: 1 }));
    };
    const left = () => [MATCH_FLOW_KEY, "starlog.teaser.premium", "starlog.premium-resume.match"].map((key) => sessionStorage.getItem(key) !== null);

    it("stays while the user is in it, at checkout, at login or reading the policies", () => {
      keep(Date.now());
      for (const path of ["/premium/match/preview", "/pay/checkout", "/login", "/privacy"]) {
        nav.path = path;
        render(<RouteTracker />);
        cleanup();
      }
      expect(left()).toEqual([true, true, true]);
    });

    it("forgets the partner's birth once the user leaves it unpaid: the flow and its preview", () => {
      keep(Date.now());
      sessionStorage.removeItem("starlog.premium-resume.match");
      nav.path = "/saju/chart";
      render(<RouteTracker />);
      expect(left()).toEqual([false, false, false]);
    });

    it("keeps a paid flow whose reading is part written (its resume token) when the user leaves; only its 24 hours end it (review 2026-10-17 #7)", () => {
      keep(Date.now());
      nav.path = "/saju/chart";
      sessionStorage.removeItem("starlog.teaser.premium");
      render(<RouteTracker />);
      expect([MATCH_FLOW_KEY, "starlog.premium-resume.match"].map((key) => sessionStorage.getItem(key) !== null)).toEqual([true, true]);
      cleanup();
      sessionStorage.setItem(MATCH_FLOW_KEY, JSON.stringify({ ...JSON.parse(sessionStorage.getItem(MATCH_FLOW_KEY)!), savedAt: Date.now() - 25 * 3_600_000 }));
      render(<RouteTracker />);
      expect([MATCH_FLOW_KEY, "starlog.premium-resume.match"].map((key) => sessionStorage.getItem(key) !== null)).toEqual([false, false]);
    });

    it("forgets a flow kept past 24 hours, even on its own pages", () => {
      keep(Date.now() - 25 * 3_600_000);
      nav.path = "/premium/match/preview";
      render(<RouteTracker />);
      expect(left()).toEqual([false, false, false]);
    });

    it("leaves another product's preview alone", () => {
      sessionStorage.setItem("starlog.teaser.premium", JSON.stringify({ key: "tarot-deep|{}", value: {} }));
      render(<RouteTracker />);
      expect(sessionStorage.getItem("starlog.teaser.premium")).not.toBeNull();
    });
  });
});
