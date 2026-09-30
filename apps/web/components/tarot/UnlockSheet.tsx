import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import type { ErrorView } from "@/lib/reading/errors";
import s from "./UnlockSheet.module.css";

/** 달빛/별조각 balances (payments are off in the beta; the home and 내 정보 keep the type). */
export interface Wallet {
  moonlight: number;
  stardust: number;
}

type UnlockSheetProps = {
  kind: "tarot" | "saju";
  /** Full readings left today on this device; undefined until read. */
  remaining: number | undefined;
  onUnlock: () => void;
  /** The last try's error, shown above the button (the button tries again). */
  error?: ErrorView | null;
  /** Where "카드 다시 뽑기" / "질문 고치기" go when the error calls for it. */
  redrawHref?: string;
  editHref?: string;
  /** This draw was opened already: go to the saved reading instead of opening it again. */
  openedHref?: string;
};

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

/**
 * Beta unlock: what the full reading holds (length, follow-ups, kept on this device) before the
 * one gold button that opens it. Free during the beta, within the day's count.
 */
export function UnlockSheet({ kind, remaining, onUnlock, error, redrawHref, editHref, openedHref }: UnlockSheetProps) {
  const chars = new Intl.NumberFormat("ko-KR").format(SITE.reading.approxChars[kind]);
  const usedUp = remaining === 0;
  // Two lines so the count never wraps mid-phrase on a phone; read as "전체 풀이 보기 · 오늘 N번 남았어요".
  const label =
    remaining === undefined || usedUp ? (
      "전체 풀이 보기"
    ) : (
      <span className={s.twoLine}>
        <span>전체 풀이 보기</span>
        <span className={s.subLine}>
          <span className="sr-only"> · </span>
          {`오늘 ${remaining}번 남았어요`}
        </span>
      </span>
    );
  const redraw = error?.action === "redraw" && redrawHref;

  let primary;
  if (openedHref) {
    primary = (
      <Button href={openedHref} block trailing="→">
        열어 둔 풀이 보기
      </Button>
    );
  } else if (redraw) {
    primary = (
      <Button href={redrawHref} block>
        카드 다시 뽑기
      </Button>
    );
  } else if (error?.care) {
    // Crisis words: no reading to open, only the way back to the question (below).
    primary = null;
  } else if (usedUp) {
    // As far as this device knows, the day is used up: nothing to press until tomorrow.
    primary = (
      <Button block disabled>
        전체 풀이 보기
      </Button>
    );
  } else {
    primary = (
      <Button block onClick={onUnlock}>
        {label}
      </Button>
    );
  }

  return (
    <section className={s.sheet} aria-labelledby="unlock-title">
      <span className={s.handle} aria-hidden="true" />
      <h2 id="unlock-title" className={s.title}>
        전체 풀이에 담긴 것
      </h2>
      <ul className={s.includes}>
        <li>
          <CheckIcon />
          {`풀이 전체 · 약 ${chars}자`}
        </li>
        <li>
          <CheckIcon />
          {`이어서 물어보기 ${SITE.reading.followUps}번`}
        </li>
        <li>
          <CheckIcon />
          이 기기에 계속 보관
        </li>
      </ul>

      {error && !openedHref ? (
        <div className={s.error}>
          {/* Focused after a failed unlock, so the reason is the first thing read. */}
          <p id="unlock-error" className={s.errorTitle} tabIndex={-1}>
            {error.title}
          </p>
          {error.body ? <p className={s.errorBody}>{error.body}</p> : null}
          {error.care ? (
            <a className={s.care} href="tel:109">
              109에 전화하기
            </a>
          ) : null}
        </div>
      ) : usedUp && !openedHref ? (
        <p className={s.limit}>오늘 열 수 있는 풀이를 모두 열었어요 · 내일 0시에 다시 열려요</p>
      ) : null}

      <div className={s.actions}>
        {primary}
        {error?.action === "edit" && editHref && !openedHref ? (
          <Button href={editHref} variant="secondary" block>
            질문 고치기
          </Button>
        ) : null}
        <p className={s.caption}>베타 기간에는 무료예요</p>
      </div>
    </section>
  );
}
