import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CARDS } from "@starlog/core";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CARD_BACKS } from "./deck";

// The pictures lib/deck.ts points at, as scripts/build-starlog-deck.mjs wrote them.
const CARDS_DIR = fileURLToPath(new URL("../public/cards/", import.meta.url));
const FACES = `${CARDS_DIR}starlog/`;
const BACKS = `${CARDS_DIR}backs/`;

type Entry = { source: string; sha256: string; padding: string };
const manifest = JSON.parse(readFileSync(`${FACES}manifest.json`, "utf8")) as { faces: Record<string, Entry>; backs: Record<string, Entry>; sizes: Record<string, string> };

const IDS = CARDS.map((card) => card.id);
const SIZES = [
  { suffix: "", width: 600, height: 1040 },
  { suffix: "-sm", width: 240, height: 416 },
] as const;

/** The mean of one colour channel (0 red, 1 green, 2 blue) of packed RGB pixels. */
function mean(rgb: Uint8Array, channel: number): number {
  let sum = 0;
  let count = 0;
  for (let i = channel; i < rgb.length; i += 3) {
    sum += rgb[i] ?? 0;
    count++;
  }
  return sum / count;
}

describe("the Starlog deck's files", () => {
  it("are a large and a small face for each of the app's 78 cards, with the manifest, and nothing else", () => {
    expect(IDS).toHaveLength(78);
    const expected = [...IDS.flatMap((id) => SIZES.map(({ suffix }) => `${id}${suffix}.webp`)), "manifest.json"];
    expect(readdirSync(FACES).sort()).toEqual(expected.sort());
  });

  it("are a large and a small picture for each back, and nothing else", () => {
    const expected = CARD_BACKS.flatMap((back) => SIZES.map(({ suffix }) => `${back}${suffix}.webp`));
    expect(readdirSync(BACKS).sort()).toEqual(expected.sort());
  });

  it("fill the card box exactly: 600x1040 large, 240x416 small, faces and backs alike", async () => {
    const bases = [...IDS.map((id) => `${FACES}${id}`), ...CARD_BACKS.map((back) => `${BACKS}${back}`)];
    for (const base of bases) {
      for (const { suffix, width, height } of SIZES) {
        const meta = await sharp(`${base}${suffix}.webp`).metadata();
        expect([meta.format, meta.width, meta.height], `${base}${suffix}.webp`).toEqual(["webp", width, height]);
      }
    }
  });

  it("keep the 156 faces under 9 MB", () => {
    const bytes = IDS.flatMap((id) => SIZES.map(({ suffix }) => statSync(`${FACES}${id}${suffix}.webp`).size)).reduce((sum, size) => sum + size, 0);
    expect(bytes).toBeLessThan(9_000_000);
  });

  it("pad each face's sides with the colour the manifest names, the card's own outer navy", async () => {
    for (const id of IDS) {
      const padding = manifest.faces[id]?.padding ?? "";
      // the 4 px at the very left, clear of the frame and of the corners
      const { data } = await sharp(`${FACES}${id}.webp`).extract({ left: 0, top: 100, width: 4, height: 840 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      for (const [channel, from] of [1, 3, 5].entries()) {
        expect(Math.abs(mean(data, channel) - Number.parseInt(padding.slice(from, from + 2), 16)), `${id} ${padding} channel ${channel}`).toBeLessThan(6);
      }
    }
  });
});

describe("the Starlog deck's manifest", () => {
  it("names each face's and each back's source PNG and its SHA-256, so a re-export can be traced", () => {
    expect(Object.keys(manifest.faces)).toEqual(IDS);
    expect(Object.keys(manifest.backs).sort()).toEqual([...CARD_BACKS].sort());
    for (const [id, entry] of Object.entries(manifest.faces)) {
      expect(entry.source, id).toMatch(/^한글\/[MWCSP]\d\d-.+\.png$/);
      expect(entry.sha256, id).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.padding, id).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const [back, entry] of Object.entries(manifest.backs)) {
      expect(entry.source, back).toMatch(/^뒷면\/0[1-4]-.+\.png$/);
      expect(entry.sha256, back).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.padding, back).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(manifest.sizes).toEqual({ lg: "600x1040", sm: "240x416" });
  });

  it("has the 02 별자리지도 PNG behind the default back", () => {
    expect(manifest.backs.constellation?.source).toBe("뒷면/02-별자리지도.png");
  });
});
