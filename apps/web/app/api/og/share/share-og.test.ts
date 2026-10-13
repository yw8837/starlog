import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setTestDb } from "@/lib/db";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import type { ChapterContext } from "@/lib/security/chapterToken";
import { buildSharePayload } from "@/lib/share/payload";
import { saveShare } from "@/lib/share/store";
import { useTestDb } from "@/lib/testing/p4";
import { GET as ogGet } from "./[id]/route";

/** /api/og/share/<id>: next/og and the font download are replaced, so the test reads the element tree the route draws. */
const { drawn } = vi.hoisted(() => ({ drawn: [] as ReactElement[] }));
vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor(element: ReactElement) {
      super("png", { headers: { "content-type": "image/png" } });
      drawn.push(element);
    }
  },
}));
vi.mock("@/lib/og/googleFont", () => ({ ogFonts: async () => [] }));

type Props = { children?: ReactNode; src?: string; cardId?: string };
/** Every text and image source in an element tree, as the renderer would draw them. */
function drawnParts(element: ReactElement): { text: string; images: string[]; plates: string[] } {
  const text: string[] = [];
  const images: string[] = [];
  const plates: string[] = [];
  const walk = (node: ReactNode): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === "string" || typeof node === "number") return void text.push(String(node));
    if (isValidElement(node)) {
      const props = (node as ReactElement<Props>).props;
      if (node.type === "img" && props.src) images.push(props.src);
      else if (props.cardId) plates.push(props.cardId);
      walk(props.children);
    }
  };
  walk(element);
  return { text: text.join(" "), images, plates };
}

const tarotCtx: ChapterContext = {
  kind: "tarot",
  templateId: "relationship-contact",
  input: { topicId: "love", whoId: "us", question: "그 사람에게 먼저 연락해도 될까요?", conditions: [], note: "비밀 메모예요" },
  cards: [
    ["major-09-hermit", "upright"],
    ["major-17-star", "reversed"],
    ["cups-03", "upright"],
  ],
};
const sajuCtx = {
  kind: "saju",
  birth: { calendar: "solar", year: 1990, month: 1, day: 1, isLeapMonth: false, timeKnown: false, hour: null, minute: null, gender: "female", placeId: "seoul" },
  topic: "love",
} as ChapterContext;
const sajuReading = {
  glance: { goesWell: "사람을 모으는 일", watchOut: "서두르는 말", remedy: "아침에 햇볕 쬐기", thisYear: "올해는 마음을 표현할수록 길이 열려요.", thisYearAction: "새 모임에 나가 보기" },
  sections: [{ heading: "타고난 바탕 · 태어난 계절", body: "한겨울에 태어난 해의 기운이에요." }],
  observation: { heading: "돌아보기", body: "이번 주에 먼저 연락한 사람을 떠올려 봐요." },
};

/** The faces the route fetches: a few JPEG bytes for every /cards/og/ URL, or a refusal. */
function stubFaces(ok: boolean): string[] {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    asked.push(String(url));
    return ok ? new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { "content-type": "image/jpeg" } }) : new Response("nope", { status: 404 });
  });
  return asked;
}

afterEach(() => {
  setTestDb(null);
  drawn.length = 0;
  vi.unstubAllGlobals();
});

describe("/api/og/share/[id]", () => {
  it("draws the card faces as JPEG in the design the reading was shared with, inlined", async () => {
    const db = useTestDb();
    const asked = stubFaces(true);
    const id = await saveShare(db, "chapter-4", buildSharePayload(tarotCtx, TAROT_SAMPLE.paid, "rws1909"), Date.now());
    const res = await ogGet(new Request(`https://starlog.yeolmaeapps.kr/api/og/share/${id}`), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect(asked).toEqual([
      "https://starlog.yeolmaeapps.kr/cards/og/rws1909/major-09-hermit.jpg",
      "https://starlog.yeolmaeapps.kr/cards/og/rws1909/major-17-star.jpg",
      "https://starlog.yeolmaeapps.kr/cards/og/rws1909/cups-03.jpg",
    ]);
    const { text, images } = drawnParts(drawn[0] as ReactElement);
    expect(text).toContain("친구가 공유한 타로 풀이");
    expect(text).toContain("은둔자 · 별(역) · 컵 3");
    expect(images).toEqual(Array(3).fill("data:image/jpeg;base64,/9j/2Q=="));
  });

  it("draws a face it cannot read as the card's name plate", async () => {
    const db = useTestDb();
    stubFaces(false);
    const id = await saveShare(db, "chapter-6", buildSharePayload(tarotCtx, TAROT_SAMPLE.paid, "starlog"), Date.now());
    const res = await ogGet(new Request(`https://starlog.yeolmaeapps.kr/api/og/share/${id}`), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    const { images, plates } = drawnParts(drawn[0] as ReactElement);
    expect(images).toEqual([]);
    expect(plates).toEqual(["major-09-hermit", "major-17-star", "cups-03"]);
  });

  it("draws a saju share's short conclusion, and 404s for an unknown share", async () => {
    const db = useTestDb();
    const id = await saveShare(db, "chapter-5", buildSharePayload(sajuCtx, sajuReading), Date.now());
    await ogGet(new Request(`https://starlog.yeolmaeapps.kr/api/og/share/${id}`), { params: Promise.resolve({ id }) });
    expect(drawnParts(drawn[0] as ReactElement).text).toContain("올해는 마음을 표현할수록 길이 열려요.");
    const missing = await ogGet(new Request("https://starlog.yeolmaeapps.kr/api/og/share/zzzzzzzzzzzz"), { params: Promise.resolve({ id: "zzzzzzzzzzzz" }) });
    expect(missing.status).toBe(404);
  });
});
