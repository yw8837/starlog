import { Segmented } from "@/components/ui/Segmented";

export type ReadingMode = "story" | "plain";

const OPTIONS: ReadonlyArray<{ value: ReadingMode; label: string }> = [
  { value: "story", label: "이야기" },
  { value: "plain", label: "풀이" },
];

/** [이야기 | 풀이] switch for an opened chapter. Active side is a light surface, never gold. */
export function StoryToggle({ value, onChange }: { value: ReadingMode; onChange: (mode: ReadingMode) => void }) {
  return <Segmented label="읽는 방식" options={OPTIONS} value={value} onChange={onChange} />;
}
