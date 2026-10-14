import s from "./ChapterView.module.css";

// Anchors set by ChapterView and SajuChapterView around the parts of the reading.
const PARTS = [
  { href: "#chapter-reading", label: "풀이" },
  { href: "#chapter-follow-up", label: "이어서 물어보기" },
] as const;

/** The reading is one scroll; these jump to its parts (`followUp` false: a reading that takes none, 오픈 기념 무료). */
export function ChapterContents({ followUp = true }: { followUp?: boolean }) {
  return (
    <nav className={s.contents} aria-label="이 기록의 차례">
      {PARTS.filter((part) => followUp || part.href !== "#chapter-follow-up").map((part) => (
        <a key={part.href} href={part.href} className={s.contentsLink}>
          {part.label}
        </a>
      ))}
    </nav>
  );
}
