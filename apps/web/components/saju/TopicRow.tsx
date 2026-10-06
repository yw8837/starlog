import { Chip } from "@/components/ui/Chip";
import type { SajuTopic, SajuTopicId } from "@/lib/reading/types";
import { BACK_TO_OVERALL, OTHER_TOPICS_LABEL, SAJU_TOPIC_IDS, TOPIC_SWITCH_HELP, topicLabel } from "@/lib/sajuTopics";
import s from "./TopicRow.module.css";

type TopicRowProps = {
  /** The 운 on screen, or "overall" for the 사주팔자 (no button pressed). */
  topic: SajuTopic;
  onPick: (topic: SajuTopicId) => void;
  /** Back to the 사주팔자; its button shows only while a 운 is on screen. */
  onBack: () => void;
};

/** "다른 운도 볼 수 있어요": the four 운 right under the 사주팔자 teaser (saju-topics owner cut §0). */
export function TopicRow({ topic, onPick, onBack }: TopicRowProps) {
  return (
    <section className={s.row} aria-labelledby="topic-row-title">
      <h2 id="topic-row-title" className={s.title}>
        {OTHER_TOPICS_LABEL}
      </h2>
      <div role="group" aria-labelledby="topic-row-title" aria-describedby="topic-row-help" className={s.chips}>
        {SAJU_TOPIC_IDS.map((id) => (
          <Chip key={id} selected={topic === id} onClick={() => onPick(id)}>
            {topicLabel(id)}
          </Chip>
        ))}
      </div>
      {topic !== "overall" ? (
        <button type="button" className={s.back} onClick={onBack}>
          {BACK_TO_OVERALL}
        </button>
      ) : null}
      <p id="topic-row-help" className={s.help}>
        {TOPIC_SWITCH_HELP}
      </p>
    </section>
  );
}
