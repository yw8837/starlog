import { GRADE_LETTERS } from "@starlog/core";
import { ImageResponse } from "next/og";
import { describe, expect, it } from "vitest";
import { GRADE_OG, GRADE_STORY, gradeOgImage } from "./gradeImage";

/** The grade pictures really drawn (the route's test mocks ImageResponse): satori refuses what it cannot draw (a fragment inside <svg>). */
const ART = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("the 사주 등급 share pictures", () => {
  it.each(GRADE_LETTERS.flatMap((grade) => [[grade, "og"], [grade, "story"]] as const))("draws %s (%s)", async (grade, kind) => {
    const size = kind === "story" ? GRADE_STORY : GRADE_OG;
    const image = new ImageResponse(gradeOgImage({ eyebrow: "STARLOG 2026", grade, nickname: "STARLOG", line: "STARLOG", art: ART, host: "starlog.yeolmaeapps.kr" }, size), size);
    const bytes = new Uint8Array(await image.arrayBuffer());
    expect([...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");
  });
});
