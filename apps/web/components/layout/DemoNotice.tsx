import s from "./DemoNotice.module.css";

export const DEMO_NOTICE = "예시로 보여드리는 풀이예요.";

/** One calm line above the fixture demo screens (the sample reading, the invite preview). */
export function DemoNotice() {
  return (
    <p className={s.notice} role="note">
      {DEMO_NOTICE}
    </p>
  );
}
