import type { ReactNode } from "react";
import s from "./SpeechBubble.module.css";

type SpeechBubbleProps = {
  /** Heading level when the line is also the screen's title. */
  as?: "p" | "h1";
  /** Which way the tail points: down to a character below, or left/right to one beside it. */
  tail?: "down" | "left" | "right";
  className?: string;
  children: ReactNode;
};

/** A character's line on a white bubble. Pops in once; still under reduced motion. */
export function SpeechBubble({ as: Tag = "p", tail = "down", className, children }: SpeechBubbleProps) {
  return <Tag className={[s.bubble, s[tail], className ?? ""].filter(Boolean).join(" ")}>{children}</Tag>;
}
