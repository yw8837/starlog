import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { CrisisContacts } from "@/components/ui/CrisisContacts";
import { SITE, won } from "@/lib/config";
import { approxCharsText } from "@/lib/pricing";
import { openingFreeText } from "@/lib/helpGuide";
import { kstMonthDay } from "@/lib/kst";
import { REFUND_DAYS } from "@/lib/pay/catalog";
import type { UnlockOffer } from "@/lib/pay/offer";
import type { UnlockMethod } from "@/lib/pay/unlockMethod";
import type { ErrorView } from "@/lib/reading/errors";
import s from "./UnlockSheet.module.css";

type UnlockSheetProps = {
  kind: "tarot" | "saju";
  /** 주제별 사주: the 운's screen label in the title and the price line ("재물운 전체 풀이 · 4,900원"). */
  topicLabel?: string;
  /** 주제별 사주: what one payment opens, under the price ("결제 한 번에 고른 풀이 하나를 열어요"). */
  scopeLine?: string;
  /** What this device may do now (lib/pay/offer.ts). Default: 오픈 기념 무료, the device's one free tarot reading. */
  offer?: UnlockOffer;
  /** Free first readings left on this device (오픈 기념 무료, the opening only); undefined until read. */
  remaining?: number;
  onUnlock: (method: UnlockMethod) => void;
  /** The login page with the way back (offer "login", and the paused-sales link). */
  loginHref?: string;
  /** The checkout for this reading (offers "pay" and "gift"). */
  payHref?: string;
  /** The owner pass: a quiet "운영자로 무료 열기" beside the paid offers. */
  owner?: boolean;
  /**
   * After a failed paid reading: where 환불받기 goes (내 정보 > 결제한 풀이, /me#purchases). Not shown for a
   * purchase the account says is no longer refundable (open-paid `refundable: false`).
   */
  refundHref?: string;
  /** The last try's error, shown above the button (the button tries again). */
  error?: ErrorView | null;
  /** Where "카드 다시 뽑기" / "질문 고치기" go when the error calls for it. */
  redrawHref?: string;
  editHref?: string;
  /** This draw was opened already: go to the saved reading instead of opening it again. */
  openedHref?: string;
  /**
   * A cut-off paid or gift opening is not settled yet (the error says so): nothing to buy or open
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
 * gold button that opens it. Without an offer (or with "opening") it is 오픈 기념 무료, the device's
 * one free tarot reading, read and kept on this device only (no follow-ups or share; once used, it
 * says so for good); "closed" (saju while sales are closed here, tarot once 오픈 기념 무료 ended) opens
 * nothing and promises nothing free; the other offers log in, open a purchase, use a signup gift
 * held from before it was removed (tarot only) or pay, or say a reading of this kind is being
 * opened. While a cut-off opening is checked, nothing opens.
 */
export function UnlockSheet({
  kind,
  topicLabel,
  scopeLine,
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
  const chars = approxCharsText(SITE.reading.approxChars[kind]);
  const opening = offer.mode === "opening";
  const usedUp = opening && remaining === 0;
  const closed = offer.mode === "closed";
  // Two lines so the name never wraps mid-phrase on a phone; read as "전체 풀이 보기 · 오픈 기념 무료".
  const label =
    remaining === undefined || usedUp ? (
      "전체 풀이 보기"
    ) : (
      <span className={s.twoLine}>
        <span>전체 풀이 보기</span>
        <span className={s.subLine}>
          <span className="sr-only"> · </span>
          오픈 기념 무료
        </span>
      </span>
    );
  const redraw = error?.action === "redraw" && redrawHref;
  const priced = offer.mode === "login" || offer.mode === "pay" || offer.mode === "gift";
  // 오픈 기념 무료 while sales are open (owner 2026-10-14): it is the gold choice, the offer's own follow.
  const welcome = priced && offer.first === true;
  const lead = welcome ? "secondary" : "primary";

  const busy = offer.mode === "in-progress";
  const checkAgain = onCheck ? (
    <Button variant="secondary" block onClick={onCheck}>
      다시 확인하기
    </Button>
  ) : null;

  let offerPrimary: ReactNode = null;
  let offerSecondary: ReactNode = null;
  let caption = openingFreeText();
  switch (offer.mode) {
    case "in-progress":
      offerPrimary = checkAgain;
      caption = "다 열리면 기록에 나타나요";
      break;
    case "login":
      offerPrimary = (
        <Button href={loginHref ?? "/login"} variant={lead} block>
          로그인하고 전체 풀이 보기
        </Button>
      );
      if (!welcome) caption = "로그인하면 바로 결제하고 열 수 있어요";
      break;
    case "open-paid":
      offerPrimary = (
        <Button block onClick={() => onUnlock("paid")}>
          결제한 풀이 열기
        </Button>
      );
      // F1: given back after its reading was cut off while written, it opens again but is never refunded.
      caption =
        offer.refundable === false
          ? "풀이를 받던 중에 끊긴 결제라 환불은 할 수 없어요. 다시 열어 끝까지 받을 수 있어요"
          : `결제한 풀이는 열기 전이면 결제일로부터 ${REFUND_DAYS}일 안에 환불할 수 있어요`;
      break;
    case "gift":
      offerPrimary = (
        <Button variant={lead} block onClick={() => onUnlock("free")}>
          가입 선물로 무료로 보기
        </Button>
      );
      offerSecondary = (
        <Button href={payHref ?? "/pricing"} variant="secondary" block>
          {`${won(offer.priceKrw)} 결제하고 보기`}
        </Button>
      );
      caption = offer.until ? `가입 선물은 ${kstMonthDay(Date.parse(offer.until))}까지 쓸 수 있어요` : "가입 선물로 한 번 무료로 볼 수 있어요";
      break;
    case "pay":
      offerPrimary = (
        <Button href={payHref ?? "/pricing"} variant={lead} block>
          {`${won(offer.priceKrw)} 결제하고 보기`}
        </Button>
      );
      if (!welcome) caption = "결제하면 바로 열려요";
      break;
    case "closed":
      caption = "지금은 결제를 받지 않고 있어요";
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
  } else if (usedUp || closed) {
    // Nothing to open here: the free first reading is used (as far as this device knows), or saju
    // while sales are closed. The free cards are offered to go on with (QA-04).
    primary = (
      <>
        <Button block disabled>
          전체 풀이 보기
        </Button>
        <div className={s.links}>
          <Link href="/now">지금의 한 장 · 무제한 무료</Link>
          <Link href="/today">오늘의 한 장</Link>
        </div>
      </>
    );
  } else if (!opening && !welcome) {
    primary = offerPrimary;
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
        {topicLabel ? `${topicLabel} 전체 풀이에 담긴 것` : "전체 풀이에 담긴 것"}
      </h2>
      {priced ? <p className={s.price}>{`${topicLabel ? `${topicLabel} ` : ""}전체 풀이 · ${won(offer.priceKrw)}`}</p> : null}
      {scopeLine && (priced || offer.mode === "open-paid") ? <p className={s.scope}>{scopeLine}</p> : null}
      <ul className={s.includes}>
        <li>
          <CheckIcon />
          {`풀이 전체 · 약 ${chars}자`}
        </li>
        {/* 오픈 기념 무료 alone is offered: it takes no follow-ups. */}
        {opening ? null : (
          <li>
            <CheckIcon />
            {`이어서 물어보기 ${SITE.reading.followUps}번`}
          </li>
        )}
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
        <p className={s.limit}>이 기기에서는 오픈 기념 무료 풀이를 이미 열었어요</p>
      ) : closed && !openedHref ? (
        <p className={s.limit}>전체 풀이는 결제하고 열 수 있어요</p>
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
        {openedHref || checking ? null : welcome && !redraw && !error?.care ? (
          <>
            {offerPrimary}
            {offerSecondary}
          </>
        ) : (
          offerSecondary
        )}
        {owner && (!opening || usedUp) && !busy && !openedHref && !checking ? (
          <Button variant="ghost" block onClick={() => onUnlock("owner")}>
            운영자로 무료 열기
          </Button>
        ) : null}
        {error && refundHref && !openedHref && !(offer.mode === "open-paid" && offer.refundable === false) ? (
          <div className={s.links}>
            <Link href={refundHref}>환불받기</Link>
          </div>
        ) : null}
        {(offer.mode === "opening" || offer.mode === "closed") && offer.login && loginHref ? (
          <div className={s.links}>
            <Link href={loginHref}>결제한 풀이가 있다면 로그인</Link>
          </div>
        ) : null}
        {checking ? null : <p className={s.caption}>{caption}</p>}
      </div>
    </section>
  );
}
