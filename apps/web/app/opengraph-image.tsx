import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OG_ALT } from "@/lib/og";

export const alt = OG_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";

/**
 * The site's link preview (owner 2026-10-13): the brand picture with the owner's cat and rabbit art
 * and three Starlog cards, rendered from assets/brand/thumbnail.html (starlog-og-1200x630.png, kept
 * as a JPEG here). Read inside the handler, not at module load: dynamic pages import this module for
 * its metadata on Cloudflare Workers, which has no file system. The image is prerendered at build time.
 */
export default async function OpengraphImage() {
  const jpeg = await readFile(join(process.cwd(), "assets", "brand", "starlog-og-1200x630.jpg"));
  return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg" } });
}
