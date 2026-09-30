import { Rabbit } from "@/components/characters/Rabbit";
import { Paper } from "./Paper";
import s from "./StoryPage.module.css";

type StoryPageProps = {
  title: string;
  body: string;
  /** Tarot pages are signed by the rabbit librarian; saju pages by the rabbit in hanbok. */
  mode?: "tarot" | "saju";
};

const SIGNATURE = { tarot: "기록 · 토끼 사서", saju: "기록 · 토끼 선생님" } as const;

/** Story (이야기) mode: the whole reading retold as one page, signed by the rabbit. */
export function StoryPage({ title, body, mode = "tarot" }: StoryPageProps) {
  return (
    <Paper as="article" className={s.page} aria-labelledby="story-title">
      <h2 id="story-title" className={s.title}>
        {title}
      </h2>
      <p className={s.body}>{body}</p>
      <footer className={s.signature}>
        <span aria-hidden="true">
          <Rabbit outfit={mode === "tarot" ? "tarot" : "hanbok"} size={56} expression="happy" reactOnTap={false} />
        </span>
        <span>{SIGNATURE[mode]}</span>
      </footer>
    </Paper>
  );
}
