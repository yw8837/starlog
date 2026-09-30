import Link from "next/link";
import type { Wallet } from "@/components/tarot/UnlockSheet";
import { SITE } from "@/lib/config";
import { MoonIcon, StarIcon } from "./icons";
import s from "./home.module.css";

/** Wordmark and, once signed in, the balance pill that leads to 내 정보. */
export function HomeTopBar({ wallet }: { wallet: Wallet | null }) {
  const { paid, free } = SITE.currency;
  return (
    <header className={s.topbar}>
      <h1 className={s.wordmark}>
        {SITE.name}
        <span className={s.srOnly}>{` ${SITE.nameKo}`}</span>
      </h1>
      {wallet ? (
        <Link href="/me" className={s.balance} aria-label={`내 재화: ${paid} ${wallet.moonlight}개, ${free} ${wallet.stardust}개`}>
          <span className={s.balanceItem}>
            <MoonIcon />
            {wallet.moonlight}
          </span>
          <span className={s.balanceDivider} aria-hidden="true" />
          <span className={s.balanceItem}>
            <StarIcon />
            {wallet.stardust}
          </span>
        </Link>
      ) : null}
    </header>
  );
}
