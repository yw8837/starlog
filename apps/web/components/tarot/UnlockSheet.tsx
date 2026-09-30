import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { SITE, won } from "@/lib/config";
import s from "./UnlockSheet.module.css";

export interface Wallet {
  moonlight: number;
  stardust: number;
}

type UnlockSheetProps = {
  /** First visit: log in (gift) or pay. Returning: 별조각 / 달빛 / pay. */
  visit: "first" | "returning";
  wallet: Wallet;
  /** Where a first-time visitor goes to sign in. */
  loginHref: string;
  /** Where a signed-in visitor goes once the reading is opened. */
  openHref: string;
  priceKrw?: number;
  title?: string;
};

function TwoLine({ main, sub }: { main: string; sub: string }) {
  return (
    <span className={s.twoLine}>
      <span>{main}</span>
      <span className={s.subLine}>{sub}</span>
    </span>
  );
}

/** Bottom sheet that opens the full reading. Lists what is included before any payment. */
export function UnlockSheet({ visit, wallet, loginHref, openHref, priceKrw = SITE.price.tarotStandardKrw, title = "전체 풀이 보기" }: UnlockSheetProps) {
  const { paid, free } = SITE.currency;
  const units = SITE.price.unitsPerReading;
  const payLabel = `바로 결제하고 보기 · ${won(priceKrw)}`;

  let actions: ReactNode;
  if (visit === "first") {
    actions = (
      <>
        <div className={s.primaryGroup}>
          <Button href={loginHref} block>
            로그인하고 무료로 보기
          </Button>
          <p className={s.caption}>{`가입 선물 ${free} ${SITE.price.signupGiftFree}개로 열려요`}</p>
        </div>
        <Button href={loginHref} variant="secondary" block>
          {payLabel}
        </Button>
      </>
    );
  } else {
    const stardustEnough = wallet.stardust >= units;
    const moonShort = Math.max(0, units - wallet.moonlight);
    const moonLabel = `${paid}으로 보기 · ${units}`;
    actions = (
      <>
        <p className={s.balance}>{`내 ${free} ${wallet.stardust} · ${paid} ${wallet.moonlight}`}</p>
        {stardustEnough ? (
          <Button href={openHref} block>
            {`${free}으로 보기 · ${units}`}
          </Button>
        ) : null}
        <Button href={openHref} variant={stardustEnough ? "secondary" : "primary"} block>
          {moonShort > 0 ? <TwoLine main={moonLabel} sub={`${moonShort}개 부족해요 · 충전하고 바로 열기`} /> : moonLabel}
        </Button>
        <Button href={openHref} variant="ghost" size="md" block>
          {payLabel}
        </Button>
      </>
    );
  }

  return (
    <section className={s.sheet} aria-labelledby="unlock-title">
      <span className={s.handle} aria-hidden="true" />
      <h2 id="unlock-title" className={s.title}>
        {title}
      </h2>
      <p className={s.includes}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
        {`후속 질문 ${SITE.reading.followUps}번 · 내 ${SITE.nameKo}에 보관`}
      </p>
      <div className={s.actions}>{actions}</div>
    </section>
  );
}
