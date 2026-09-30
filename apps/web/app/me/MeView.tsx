"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronIcon, MoonIcon, StarIcon } from "@/components/home/icons";
import { SharePreview } from "@/components/tarot/SharePreview";
import type { Wallet } from "@/components/tarot/UnlockSheet";
import { Button } from "@/components/ui/Button";
import { DotLine } from "@/components/ui/DotLine";
import { Modal } from "@/components/ui/Modal";
import { SITE, type MoonPack } from "@/lib/config";
import type { TarotSampleCard } from "@/lib/fixtures";
import { useSajuProfile } from "@/lib/sajuFlow";
import { DEFAULT_SAJU_FORM, profileSummary } from "@/lib/sajuForm";
import { MoonPackSheet } from "./MoonPackSheet";
import s from "./MeView.module.css";

type MeViewProps = {
  nickname: string;
  provider: string;
  wallet: Wallet;
  share: { card: TarotSampleCard | undefined; question: string; chapter: string; inviteUrl: string };
};

type Sheet = "packs" | "share" | null;

function Soon({ children }: { children: string }) {
  return (
    <li>
      <span className={`${s.item} ${s.itemSoon}`} aria-disabled="true">
        <span>{children}</span>
        <span className={s.soon}>준비 중</span>
      </span>
    </li>
  );
}

/** 내 정보: profile, balances with the 달빛 top-up, the saved saju profile, and the rest of the account menu. */
export function MeView({ nickname, provider, wallet, share }: MeViewProps) {
  const [balance, setBalance] = useState(wallet);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [notice, setNotice] = useState("");
  const { profile } = useSajuProfile();
  const { paid, free } = SITE.currency;

  // P1 mock payment (the MVP itself runs on mock orders): add the pack and say so.
  const buy = (pack: MoonPack) => {
    const units = pack.units + pack.bonus;
    setBalance((prev) => ({ ...prev, moonlight: prev.moonlight + units }));
    setSheet(null);
    setNotice(`${paid} ${units}개를 충전했어요`);
  };

  return (
    <div className={s.layout}>
      <div className={s.col}>
        <header className={s.profile}>
          <span className={s.avatar} aria-hidden="true">
            {nickname.charAt(0)}
          </span>
          <div className={s.profileText}>
            <h1 className={s.nickname}>{nickname}</h1>
            <p className={s.provider}>{`${provider} 계정으로 로그인했어요`}</p>
          </div>
        </header>

        <section className={s.wallet} aria-labelledby="wallet-title">
          <h2 id="wallet-title" className={s.sectionTitle}>
            내 재화
          </h2>
          <dl className={s.balances}>
            <div className={s.balanceBox}>
              <dt className={s.balanceLabel}>
                <MoonIcon size={20} />
                {paid}
              </dt>
              <dd className={s.balanceValue}>{balance.moonlight}</dd>
            </div>
            <div className={s.balanceBox}>
              <dt className={s.balanceLabel}>
                <StarIcon size={20} />
                {free}
              </dt>
              <dd className={s.balanceValue}>{balance.stardust}</dd>
            </div>
          </dl>
          <p className={s.walletNote}>{`${free}은 가입 선물 같은 무료 재화예요. 한 장은 ${SITE.price.unitsPerReading}개로 열려요.`}</p>
          <Button block onClick={() => setSheet("packs")}>
            {`${paid} 충전하기`}
          </Button>
          <p className={s.notice} role="status">
            {notice}
          </p>
        </section>
      </div>

      <div className={s.col}>
        <section className={s.sajuInfo} aria-labelledby="saju-info-title">
          <div className={s.sajuText}>
            <h2 id="saju-info-title" className={s.sajuLabel}>
              내 사주 정보
            </h2>
            <p className={s.sajuValue}>{profile === undefined ? " " : <DotLine parts={profileSummary(profile ?? DEFAULT_SAJU_FORM).split(" · ")} />}</p>
          </div>
          <Link href="/saju/new" className={s.edit}>
            고치기
          </Link>
        </section>

        <nav aria-label="계정 메뉴">
          <ul className={s.list}>
            <Soon>재화 내역</Soon>
            <li>
              <button type="button" className={s.item} onClick={() => setSheet("share")}>
                <span>친구 초대하기</span>
                <ChevronIcon />
              </button>
            </li>
            <Soon>알림 설정</Soon>
            <li>
              <Link href="/terms" className={s.item}>
                <span>이용약관</span>
                <ChevronIcon />
              </Link>
            </li>
            <li>
              <Link href="/privacy" className={s.item}>
                <span>개인정보처리방침</span>
                <ChevronIcon />
              </Link>
            </li>
            <Soon>문의하기</Soon>
          </ul>
        </nav>
      </div>

      <Modal open={sheet === "packs"} onClose={() => setSheet(null)} labelledBy="packs-title">
        <MoonPackSheet titleId="packs-title" moonlight={balance.moonlight} onBuy={buy} />
      </Modal>
      <Modal open={sheet === "share"} onClose={() => setSheet(null)} labelledBy="share-title">
        <SharePreview titleId="share-title" card={share.card} question={share.question} chapter={share.chapter} inviteUrl={share.inviteUrl} />
      </Modal>
    </div>
  );
}
