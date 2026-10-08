/**
 * `**구**`, the one mark a reading may carry (docs/research/reading-voice-2026-10.md §2.2), read the same way by the
 * validators (lib/ai/style.ts) and the screen (components/reading/BoldText.tsx). No prompt text or model name here: the
 * screen imports it.
 */
export const BOLD = /\*\*([^*\n]+?)\*\*/g;

export const stripBold = (text: string) => text.replaceAll("**", "");

/**
 * The text as plain and bold segments, or null when the marks do not pair up: a `**` left over once the pairs are
 * read ("**a*b**", "***x***"), or a pair that holds nothing. A single asterisk ("A*B") is text.
 */
export function boldSegments(text: string): Array<{ text: string; bold: boolean }> | null {
  if (text.replace(BOLD, "").includes("**")) return null;
  const segments: Array<{ text: string; bold: boolean }> = [];
  let at = 0;
  for (const match of text.matchAll(BOLD)) {
    if (!match[1]!.trim()) return null;
    if (match.index > at) segments.push({ text: text.slice(at, match.index), bold: false });
    segments.push({ text: match[1]!, bold: true });
    at = match.index + match[0].length;
  }
  if (at < text.length) segments.push({ text: text.slice(at), bold: false });
  return segments;
}
