import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import type { Wallet } from "@/components/tarot/UnlockSheet";
import { SITE } from "@/lib/config";
import { MoonIcon, StarIcon } from "./icons";
import s from "./home.module.css";

/**
 * Phones: the wordmark and, once signed in, the balance pill that leads to 내 정보. From 1024px the
 * site header (TabBar) shows the wordmark, so only the pill stays. The page's <h1> is the hero line.
 */
export function HomeTopBar({ wallet }: { wallet: Wallet | null }) {
  const { paid, free } = SITE.currency;
  return (
    <div className={s.topbar}>
      <p className={s.wordmark}>
        <Wordmark />
        <span className="sr-only">{` ${SITE.nameKo}`}</span>
      </p>
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
    </div>
  );
}
