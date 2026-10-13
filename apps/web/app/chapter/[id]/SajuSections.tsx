import { BoldText } from "@/components/reading/BoldText";
import { GlanceCard } from "@/components/saju/GlanceCard";
import { Paper } from "@/components/tarot/Paper";
import type { SajuReadingData } from "@/lib/reading/types";
import { isSajuGlance, isSection } from "@/lib/reading/validate";
import { GAEUN_NOTE } from "@/lib/sajuEnrichment";
import { SAJU_GAEUN_HEADING } from "@/lib/sajuPrologue";
import s from "./ChapterView.module.css";

/** "타고난 바탕 · 태어난 계절이 나에게 주는 힘" → a short label and the heading proper. */
function splitHeading(heading: string): { label: string | null; title: string } {
  const at = heading.indexOf(" · ");
  return at < 0 ? { label: null, title: heading } : { label: heading.slice(0, at), title: heading.slice(at + 3) };
}

/**
 * The body of an opened saju reading: 한눈에 보기, then every whole section with the observation last.
 * The saved reading (SajuChapterView) and a shared one (/s/[id]) show the same thing.
 */
export function SajuSections({ reading, glance = true }: {
  reading: Pick<SajuReadingData, "sections" | "observation" | "glance">;
  /** false where the page shows 한눈에 보기 elsewhere (a shared reading's side column) */
  glance?: boolean;
}) {
  // A saved reading may be partial (an older version, edited storage): only whole sections show.
  const sections = isSection(reading.observation) ? [...reading.sections, reading.observation] : reading.sections;
  return (
    <>
      {/* 한눈에 보기 first (owner 2026-10-07); a reading saved before it, or one whose card cannot be read, has none */}
      {glance && isSajuGlance(reading.glance) ? <GlanceCard glance={reading.glance} /> : null}
      {sections.map((section) => {
        const { label, title: heading } = splitHeading(section.heading);
        return (
          <Paper key={section.heading} as="article">
            <h2 className={s.sectionHeading}>
              {label ? <span className={s.sectionLabel}>{label}</span> : null}
              <span>{heading}</span>
            </h2>
            <p className={s.prose}>
              <BoldText text={section.body} />
            </p>
            {/* 기운 채우기 is a suggestion for fun: the code says so under it (saju enrichment 2026-10-08 §2) */}
            {section.heading === SAJU_GAEUN_HEADING ? <p className={s.sectionNote}>{GAEUN_NOTE}</p> : null}
          </Paper>
        );
      })}
    </>
  );
}
