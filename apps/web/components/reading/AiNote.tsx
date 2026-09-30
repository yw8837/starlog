import s from "./reading.module.css";

export const AI_NOTE = "AI가 만든 풀이예요 · 재미와 자기 성찰을 위한 참고용이에요";

/** The small honesty line on every reading screen (result, reading, 오늘의 한 장, saju). */
export function AiNote({ className }: { className?: string }) {
  return <p className={[s.aiNote, className].filter(Boolean).join(" ")}>{AI_NOTE}</p>;
}
