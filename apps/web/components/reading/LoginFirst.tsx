import { Button } from "@/components/ui/Button";
import s from "./reading.module.css";

type LoginFirstProps = {
  title: string;
  body: string;
  /** loginHref(...) back to this very screen: what was chosen stays on the device and the reading goes on from it */
  href: string;
  action: string;
  /** what a login that came back said (lib/account/loginMessage.ts: 취소, 실패…), shown above the button */
  note?: string | null;
};

/**
 * In place of a free AI reading for a visitor (owner 2026-11-04: 맛보기 and 오늘의 한 장 need a login): what needs it, that
 * nothing chosen is lost, and the way to log in. The question, the cards and the free 명식 stay on screen around it.
 */
export function LoginFirst({ title, body, href, action, note }: LoginFirstProps) {
  return (
    <section className={s.error} aria-labelledby="login-first-title">
      <h2 id="login-first-title" className={s.errorTitle}>
        {title}
      </h2>
      <p className={s.errorBody}>{body}</p>
      {note ? <p className={s.errorBody}>{note}</p> : null}
      <div className={s.errorActions}>
        <Button block href={href} trailing="→">
          {action}
        </Button>
      </div>
    </section>
  );
}
