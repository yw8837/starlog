import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { OG_ALT, OG_TEXT } from "@/lib/og";

export const alt = OG_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Offline subsets (scripts/build-og-fonts.py): without them next/og would fetch Korean glyphs from Google Fonts.
 * Read inside the handler, not at module load: dynamic pages import this module for its metadata on
 * Cloudflare Workers, which has no file system. The image itself is prerendered at build time.
 */
async function loadFonts() {
  const fontDir = join(process.cwd(), "assets", "og");
  const [serif, sans] = await Promise.all([
    readFile(join(fontDir, "NotoSerifKR-Bold.og.ttf")),
    readFile(join(fontDir, "NotoSansKR-Medium.og.ttf")),
  ]);
  return { serif, sans };
}

const INK = "#f1ecff";
const INK_SUB = "#c9c1ea";
const GOLD = "#f3dca1";

/** Text areas the stars keep clear of: wordmark and tagline, host line. */
const CLEAR = [
  { x0: 80, y0: 200, x1: 900, y1: 470 },
  { x0: 80, y0: 520, x1: 420, y1: 590 },
];

/** Fixed star field (same image on every build), kept off the text. */
function stars(count: number) {
  let seed = 7;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, () => ({ x: next() * 1200, y: next() * 630, r: 1 + next() * 2.2, a: 0.25 + next() * 0.6 })).filter(
    (star) => !CLEAR.some((box) => star.x > box.x0 && star.x < box.x1 && star.y > box.y0 && star.y < box.y1),
  );
}

const STARS = stars(90);

export default async function OpengraphImage() {
  const { serif, sans } = await loadFonts();
  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          padding: "0 96px",
          backgroundColor: "#0d0a26",
          backgroundImage: "linear-gradient(180deg, #0d0a26 0%, #16124a 58%, #2e2a78 100%)",
          color: INK,
          fontFamily: "Sans",
        }}
      >
        {STARS.map((star, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: star.x,
              top: star.y,
              width: star.r * 2,
              height: star.r * 2,
              borderRadius: 9999,
              backgroundColor: i % 9 === 0 ? GOLD : "#ffffff",
              opacity: star.a,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            top: 92,
            right: 132,
            width: 112,
            height: 112,
            borderRadius: 9999,
            backgroundColor: GOLD,
            boxShadow: "0 0 90px 30px rgba(243,220,161,0.3)",
          }}
        />

        <div style={{ display: "flex", alignItems: "baseline", fontFamily: "Serif" }}>
          <span style={{ fontSize: 132, fontWeight: 700, letterSpacing: -2 }}>{OG_TEXT.name}</span>
          <span style={{ marginLeft: 28, fontSize: 60, fontWeight: 700, color: INK_SUB }}>{`· ${OG_TEXT.nameKo}`}</span>
        </div>
        <div style={{ marginTop: 20, fontSize: 46, fontWeight: 500, color: INK_SUB }}>{OG_TEXT.tagline}</div>
        <div style={{ position: "absolute", left: 96, bottom: 64, fontSize: 28, fontWeight: 500, color: GOLD, letterSpacing: 1 }}>
          {OG_TEXT.host}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Serif", data: serif, weight: 700, style: "normal" },
        { name: "Sans", data: sans, weight: 500, style: "normal" },
      ],
    },
  );
}
