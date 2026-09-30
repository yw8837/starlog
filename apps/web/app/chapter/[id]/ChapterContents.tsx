import s from "./ChapterView.module.css";

// Anchors set by ChapterView and SajuChapterView around the parts of the chapter.
const PARTS = [
  { href: "#chapter-story", label: "이야기" },
  { href: "#chapter-reading", label: "풀이" },
  { href: "#chapter-follow-up", label: "이어서 물어보기" },
] as const;

/** The chapter reads in one scroll; these jump to its parts. */
export function ChapterContents() {
  return (
    <nav className={s.contents} aria-label="이 장의 차례">
      {PARTS.map((part) => (
        <a key={part.href} href={part.href} className={s.contentsLink}>
          {part.label}
        </a>
      ))}
    </nav>
  );
}
