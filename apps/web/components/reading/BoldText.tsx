import { Fragment } from "react";
import { boldSegments, stripBold } from "@/lib/reading/bold";

export { boldSegments };

/**
 * A reading's text with its `**구**` in <strong> (docs/research/reading-voice-2026-10.md §2.2), read with the validators'
 * pattern. Every part is a React text child, so markup in the text stays text; marks that do not pair up fall back to
 * plain text without the `**` (a single asterisk is text and stays).
 */
export function BoldText({ text }: { text: string }) {
  const segments = boldSegments(text);
  if (!segments) return <>{stripBold(text)}</>;
  return <>{segments.map((segment, i) => (segment.bold ? <strong key={i}>{segment.text}</strong> : <Fragment key={i}>{segment.text}</Fragment>))}</>;
}
