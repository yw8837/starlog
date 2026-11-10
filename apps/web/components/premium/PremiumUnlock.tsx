import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { CrisisContacts } from "@/components/ui/CrisisContacts";
import s from "@/components/tarot/UnlockSheet.module.css";
import { loginHref, type AccountState } from "@/lib/account/client";
import { SITE, won } from "@/lib/config";
import { REFUND_DAYS, SET_PRODUCT_ID } from "@/lib/pay/catalog";
import { checkoutHref } from "@/lib/pay/offer";
import { opensAtText, premiumOffer } from "@/lib/premium/offer";
import { PREMIUM, type PremiumId } from "@/lib/premium/products";
import { refreshPremiumStatus } from "@/lib/premium/status";
import type { ErrorView } from "@/lib/reading/errors";

type PremiumUnlockProps = {
  id: PremiumId;
  /** useAccount(); undefined while it loads. */
  account: AccountState | null | undefined;
  /** usePremiumStatus()[id]; undefined while it loads, null when it could not be read. */
  status: { open: boolean; opensAt: number | null } | null | undefined;
  /** Where login and checkout come back to (this preview). */
  returnTo: string;
  onOpen: (method: "paid" | "owner") => void;
  /** Parts of this reading are written already in this tab: the purchase opens as 이어서 받기. */
  resumable?: boolean;
  /** The last try's error, above the button (the button tries again). */
  error?: ErrorView | null;
  /** After a failed opening: 내 정보 > 결제한 풀이 (not for a purchase that is no longer refundable). */
  refundHref?: string;
  /** Where 카드 다시 뽑기 goes when the error calls for it. */
  redrawHref?: string;
  /** This draw or input was opened already: go to the saved reading instead. */
  openedHref?: string;
  /** A cut-off opening is not settled yet: nothing opens or sells until it is. */
  checking?: boolean;
  /** 다시 확인하기 (while checking, or while another opening holds the purchase). */
  onCheck?: () => void;
  /** Tests: the clock for the opening date. */
  now?: number;
  /** The server sells the 2027 신년운세 + 프리미엄 궁합 set now (usePremiumStatus().set): offered beside paying for either. */
  setOpen?: boolean;
};

/** The set's price against its two readings apart (owner 2026-11-10: the real saving, nothing else). */
const SET_APART = PREMIUM["newyear-2027"].krw + PREMIUM.match.krw;

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

/**
 * The open panel under a premium preview, in the free sheet's design (UnlockSheet): the product, its
 * price and the three scope lines, then one gold primary for what this device may do (lib/premium/offer.ts):
 * open a purchase, log in, pay, or wait. A closed product says when it opens and sells nothing; a
 * purchase already made always opens. The owner pass gets a quiet free open.
 */
export function PremiumUnlock({ id, account, status, returnTo, onOpen, resumable = false, error, refundHref, redrawHref, openedHref, checking = false, onCheck, now, setOpen = false }: PremiumUnlockProps) {
  const spec = PREMIUM[id];
  const offer = premiumOffer(account, id, status, now);
  const checkAgain = onCheck ? (
    <Button variant="secondary" block onClick={onCheck}>
      다시 확인하기
    </Button>
  ) : null;

  let primary: ReactNode = null;
  /** the set, a quiet second choice beside paying for 신년 or 궁합 */
  let set: ReactNode = null;
  let note: string | null = null;
  let caption: string | null = null;
  switch (offer.mode) {
    case "in-progress":
      primary = checkAgain;
      note = "열고 있는 풀이가 있어요";
      caption = "다 열리면 기록에 나타나요";
      break;
    case "open-paid":
      primary = (
        <Button block onClick={() => onOpen("paid")}>
          {resumable ? "이어서 받기" : "결제한 풀이 열기"}
        </Button>
      );
      caption = offer.set
        ? offer.refundable === false
          ? "세트의 다른 풀이를 열어서 환불은 할 수 없어요"
          : `세트는 두 풀이를 모두 열기 전에만 결제일로부터 ${REFUND_DAYS}일 안에 환불할 수 있어요. 이 풀이를 열면 세트 전체가 환불되지 않아요`
        : offer.refundable === false
          ? "풀이를 받던 중에 끊긴 결제라 환불은 할 수 없어요. 다시 열어 끝까지 받을 수 있어요"
          : `결제한 풀이는 열기 전이면 결제일로부터 ${REFUND_DAYS}일 안에 환불할 수 있어요`;
      break;
    case "login":
      primary = (
        <Button href={loginHref(returnTo)} block>
          로그인하고 결제하기
        </Button>
      );
      caption = "로그인하면 바로 결제하고 열 수 있어요";
      break;
    case "pay":
      primary = (
        <Button href={checkoutHref(id, returnTo)} block>
          {`${won(offer.priceKrw)} 결제하고 보기`}
        </Button>
      );
      caption = "결제하면 바로 풀이를 적기 시작해요";
      if (setOpen && (id === "newyear-2027" || id === "match")) {
        set = (
          <>
            <Button href={checkoutHref(SET_PRODUCT_ID, returnTo)} variant="secondary" block>
              {`세트로 ${won(SITE.price.set.krw)} 결제하기`}
            </Button>
            <p className={s.caption}>{`${SITE.price.set.name} 세트 · 따로 사면 ${won(SET_APART)}, ${won(SET_APART - SITE.price.set.krw)} 아껴요`}</p>
          </>
        );
      }
      break;
    case "soon":
      note = opensAtText(offer.opensAt);
      break;
    case "closed":
      note = "준비 중이에요";
      break;
    case "unknown":
      note = "지금 열 수 있는지 확인하지 못했어요";
      primary = (
        <Button variant="secondary" block onClick={() => void refreshPremiumStatus()}>
          다시 확인하기
        </Button>
      );
      break;
    case "loading":
      break;
  }

  if (openedHref) {
    primary = (
      <Button href={openedHref} block trailing="→">
        열어 둔 풀이 보기
      </Button>
    );
  } else if (checking) {
    primary = checkAgain;
  } else if (error?.action === "redraw" && redrawHref) {
    primary = (
      <Button href={redrawHref} block>
        카드 다시 뽑기
      </Button>
    );
  } else if (error?.care) {
    // Crisis words: no reading to open, only the calm copy and the helplines.
    primary = null;
  }

  const ownerOpen = Boolean(account?.owner) && !openedHref && !checking && offer.mode !== "in-progress" && offer.mode !== "open-paid" && !error?.care;
  const refundable = !(offer.mode === "open-paid" && offer.refundable === false);
  return (
    <section className={s.sheet} aria-labelledby={`premium-unlock-${id}`}>
      <span className={s.handle} aria-hidden="true" />
      <h2 id={`premium-unlock-${id}`} className={s.title}>
        {`${spec.name}에 담긴 것`}
      </h2>
      <p className={s.price}>{won(spec.krw)}</p>
      <ul className={s.includes}>
        {spec.scope.map((line) => (
          <li key={line}>
            <CheckIcon />
            {line}
          </li>
        ))}
      </ul>

      {error && !openedHref ? (
        <div className={s.error}>
          {/* Focused after a failed opening, so the reason is the first thing read. */}
          <p id="unlock-error" className={s.errorTitle} tabIndex={-1}>
            {error.title}
          </p>
          {error.body ? <p className={s.errorBody}>{error.body}</p> : null}
          {error.care ? <CrisisContacts lead={false} compact urgent={error.urgent === true} className={s.care} /> : null}
        </div>
      ) : note && !openedHref ? (
        <p className={s.limit}>{note}</p>
      ) : null}

      <div className={s.actions}>
        {primary}
        {set && !openedHref && !checking && !error ? set : null}
        {ownerOpen ? (
          <Button variant="ghost" block onClick={() => onOpen("owner")}>
            운영자로 무료 열기
          </Button>
        ) : null}
        <div className={s.links}>
          {error && refundHref && refundable && !openedHref ? <Link href={refundHref}>환불받기</Link> : null}
          <Link href="/refund">결제와 환불 안내</Link>
        </div>
        {caption && !checking && !openedHref ? <p className={s.caption}>{caption}</p> : null}
      </div>
    </section>
  );
}
