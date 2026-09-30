import { Button } from "@/components/ui/Button";
import type { ErrorView } from "@/lib/reading/errors";
import s from "./reading.module.css";

type ErrorPanelProps = {
  view: ErrorView;
  /** What each action does on this screen; an action without a handler or link is not offered. */
  onRetry?: () => void;
  redrawHref?: string;
  editHref?: string;
  /** Show the action as the screen's gold primary (when nothing else on screen is). */
  primary?: boolean;
  className?: string;
};

/**
 * A friendly error in place of the reading: what happened, and the one way forward. Never a code.
 * The screen's live region announces the title; this block is plain content.
 */
export function ErrorPanel({ view, onRetry, redrawHref, editHref, primary = true, className }: ErrorPanelProps) {
  const variant = primary ? "primary" : "secondary";
  let action = null;
  if (view.action === "retry" && onRetry) {
    action = (
      <Button block variant={variant} onClick={onRetry}>
        다시 시도
      </Button>
    );
  } else if (view.action === "redraw" && redrawHref) {
    action = (
      <Button block variant={variant} href={redrawHref}>
        카드 다시 뽑기
      </Button>
    );
  } else if (view.action === "edit" && editHref) {
    action = (
      <Button block variant={view.care ? "secondary" : variant} href={editHref}>
        질문 고치기
      </Button>
    );
  }

  return (
    <section className={[s.error, className].filter(Boolean).join(" ")} aria-labelledby="error-title">
      <h2 id="error-title" className={s.errorTitle}>
        {view.title}
      </h2>
      {view.body ? <p className={s.errorBody}>{view.body}</p> : null}
      {view.care ? (
        <a className={s.care} href="tel:109">
          109에 전화하기
        </a>
      ) : null}
      {action ? <div className={s.errorActions}>{action}</div> : null}
      {action ? null : (
        <Button href="/" variant="ghost" size="md" block>
          홈으로
        </Button>
      )}
    </section>
  );
}
