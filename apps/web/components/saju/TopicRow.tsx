import { Chip } from "@/components/ui/Chip";
import type { SajuTopic, SajuTopicId } from "@/lib/reading/types";
import { OTHER_TOPICS_LABEL, SAJU_TOPIC_IDS, TOPIC_SWITCH_HELP, topicLabel } from "@/lib/sajuTopics";
import s from "./TopicRow.module.css";

type TopicRowProps = {
  /** The 운 on screen, or "overall" for the 사주팔자 (no button pressed). */
  topic: SajuTopic;
  onPick: (topic: SajuTopicId) => void;
};

/**
 * "다른 운도 볼 수 있어요": the four 운 right under the 사주팔자 teaser (saju-topics owner cut §0). The way
 * back to the 사주팔자 is a button at the top of a 운's reading (owner 2026-10-14: hard to see here).
 */
export function TopicRow({ topic, onPick }: TopicRowProps) {
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
      <p id="topic-row-help" className={s.help}>
        {TOPIC_SWITCH_HELP}
      </p>
    </section>
  );
}
