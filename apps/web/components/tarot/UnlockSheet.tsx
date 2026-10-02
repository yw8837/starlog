import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { CrisisContacts } from "@/components/ui/CrisisContacts";
import { SITE, won } from "@/lib/config";
import { times } from "@/lib/helpGuide";
import type { UnlockOffer } from "@/lib/pay/offer";
import type { UnlockMethod } from "@/lib/pay/unlockMethod";
import type { ErrorView } from "@/lib/reading/errors";
import s from "./UnlockSheet.module.css";

/** 달빛/별조각 balances (payments are off in the beta; the home and 내 정보 keep the type). */
export interface Wallet {
  moonlight: number;
  stardust: number;
}

type UnlockSheetProps = {
  kind: "tarot" | "saju";
  /** What this device may do now (lib/pay/offer.ts). Default: the 오픈 기념 daily free reading. */
  offer?: UnlockOffer;
  /** Full readings left today on this device (오픈 기념 only); undefined until read. */
  remaining: number | undefined;
  onUnlock: (method: UnlockMethod) => void;
  /** The login page with the way back (offer "login", and the paused-sales link). */
  loginHref?: string;
  /** The checkout for this reading (offers "pay" and "stardust"). */
  payHref?: string;
  /** The owner pass: a quiet "운영자로 무료 열기" beside the paid offers. */
  owner?: boolean;
  /** After a failed paid reading: where 환불받기 goes (내 정보 결제 내역). */
  refundHref?: string;
  /** The last try's error, shown above the button (the button tries again). */
  error?: ErrorView | null;
  /** Where "카드 다시 뽑기" / "질문 고치기" go when the error calls for it. */
  redrawHref?: string;
  editHref?: string;
  /** This draw was opened already: go to the saved reading instead of opening it again. */
  openedHref?: string;
  /**
   * A cut-off paid or 별조각 opening is not settled yet (the error says so): nothing to buy or open
   * until it is, so a stale button can never charge twice.
   */
  checking?: boolean;
  /** "다시 확인하기": while `checking` once the checks ran out, or with the in-progress offer. */
  onCheck?: () => void;
};

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

/**
 * The unlock: what the full reading holds (length, follow-ups, kept on this device) before the one
 * gold button that opens it. Without an offer (or with "opening") it is the 오픈 기념 free count
 * (when used up, when it refills); the other offers log in, open a purchase, spend 별조각 or pay,
 * or say a reading of this kind is being opened. While a cut-off opening is checked, nothing opens.
 */
export function UnlockSheet({
  kind,
  offer = { mode: "opening", login: false },
  remaining,
  onUnlock,
  loginHref,
  payHref,
  owner = false,
  refundHref,
  error,
  redrawHref,
  editHref,
  openedHref,
  checking = false,
  onCheck,
}: UnlockSheetProps) {
  const chars = new Intl.NumberFormat("ko-KR").format(SITE.reading.approxChars[kind]);
  const opening = offer.mode === "opening";
  const usedUp = opening && remaining === 0;
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
  const { free } = SITE.currency;
  const priced = offer.mode === "login" || offer.mode === "pay" || offer.mode === "stardust";

  const busy = offer.mode === "in-progress";
  const checkAgain = onCheck ? (
    <Button variant="secondary" block onClick={onCheck}>
      다시 확인하기
    </Button>
  ) : null;

  let offerPrimary: ReactNode = null;
  let offerSecondary: ReactNode = null;
  let caption = `오픈 기념으로 하루 ${times(SITE.beta.fullPerDay)} 무료예요`;
  switch (offer.mode) {
    case "in-progress":
      offerPrimary = checkAgain;
      caption = "다 열리면 기록에 나타나요";
      break;
    case "login":
      offerPrimary = (
        <Button href={loginHref ?? "/login"} block>
          로그인하고 전체 풀이 보기
        </Button>
      );
      caption = `처음 가입하면 ${free} ${offer.giftUnits}개를 드려요 · 전체 풀이 한 번을 무료로 열 수 있어요`;
      break;
    case "open-paid":
      offerPrimary = (
        <Button block onClick={() => onUnlock("paid")}>
          결제한 풀이 열기
        </Button>
      );
      caption = "결제한 풀이는 열기 전까지 언제든 환불할 수 있어요";
      break;
    case "stardust":
      offerPrimary = (
        <Button block onClick={() => onUnlock("free")}>
          {`${free} ${offer.units}개로 보기`}
        </Button>
      );
      offerSecondary = (
        <Button href={payHref ?? "/pricing"} variant="secondary" block>
          {`${won(offer.priceKrw)} 결제하고 보기`}
        </Button>
      );
      caption = `${free} ${offer.balance}개 있어요`;
      break;
    case "pay":
      offerPrimary = (
        <Button href={payHref ?? "/pricing"} block>
          {`${won(offer.priceKrw)} 결제하고 보기`}
        </Button>
      );
      caption = "결제하면 바로 열려요";
      break;
    case "opening":
      break;
  }

  let primary;
  if (openedHref) {
    primary = (
      <Button href={openedHref} block trailing="→">
        열어 둔 풀이 보기
      </Button>
    );
  } else if (checking) {
    primary = checkAgain;
  } else if (redraw) {
    primary = (
      <Button href={redrawHref} block>
        카드 다시 뽑기
      </Button>
    );
  } else if (error?.care) {
    // Crisis words: no reading to open, only the way back to the question (below).
    primary = null;
  } else if (!opening) {
    primary = offerPrimary;
  } else if (usedUp) {
    // As far as this device knows, the day is used up: nothing to press until tomorrow.
    primary = (
      <Button block disabled>
        전체 풀이 보기
      </Button>
    );
  } else {
    primary = (
      <Button block onClick={() => onUnlock("opening")}>
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
      {priced ? <p className={s.price}>{`전체 풀이 · ${won(offer.priceKrw)}`}</p> : null}
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
          {error.care ? <CrisisContacts lead={false} className={s.care} /> : null}
        </div>
      ) : usedUp && !openedHref ? (
        <p className={s.limit}>오늘 무료로 열 수 있는 풀이를 모두 열었어요 · 한국 시간 0시에 다시 채워져요</p>
      ) : busy && !openedHref ? (
        <p className={s.limit}>열고 있는 풀이가 있어요</p>
      ) : null}

      <div className={s.actions}>
        {primary}
        {error?.action === "edit" && editHref && !openedHref && !checking ? (
          <Button href={editHref} variant="secondary" block>
            질문 고치기
          </Button>
        ) : null}
        {openedHref || checking ? null : offerSecondary}
        {owner && !opening && !busy && !openedHref && !checking ? (
          <Button variant="ghost" block onClick={() => onUnlock("owner")}>
            운영자로 무료 열기
          </Button>
        ) : null}
        {error && refundHref && !openedHref ? (
          <div className={s.links}>
            <Link href={refundHref}>환불받기</Link>
          </div>
        ) : null}
        {offer.mode === "opening" && offer.login && loginHref ? (
          <div className={s.links}>
            <Link href={loginHref}>결제한 풀이가 있다면 로그인</Link>
          </div>
        ) : null}
        {checking ? null : <p className={s.caption}>{caption}</p>}
      </div>
    </section>
  );
}
