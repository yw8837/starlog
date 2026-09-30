import s from "./DemoNotice.module.css";

export const DEMO_NOTICE = "지금은 예시 풀이를 보여드려요. AI 풀이는 곧 열려요.";

/** One calm line above sample readings while AI generation is not open yet. */
export function DemoNotice() {
  return (
    <p className={s.notice} role="note">
      {DEMO_NOTICE}
    </p>
  );
}
