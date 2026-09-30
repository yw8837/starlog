import { Rabbit } from "@/components/characters/Rabbit";
import { Paper } from "./Paper";
import s from "./StoryPage.module.css";

type StoryPageProps = {
  title: string;
  body: string;
};

/** Story (이야기) mode: the whole reading retold as one page, signed by the rabbit librarian. */
export function StoryPage({ title, body }: StoryPageProps) {
  return (
    <Paper as="article" className={s.page} aria-labelledby="story-title">
      <h2 id="story-title" className={s.title}>
        {title}
      </h2>
      <p className={s.body}>{body}</p>
      <footer className={s.signature}>
        <span aria-hidden="true">
          <Rabbit outfit="tarot" size={56} expression="happy" reactOnTap={false} />
        </span>
        <span>기록 · 토끼 사서</span>
      </footer>
    </Paper>
  );
}
