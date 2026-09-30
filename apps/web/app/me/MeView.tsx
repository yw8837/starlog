"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronIcon, MoonIcon, StarIcon } from "@/components/home/icons";
import type { Wallet } from "@/components/tarot/UnlockSheet";
import { Button } from "@/components/ui/Button";
import { DotLine } from "@/components/ui/DotLine";
import { Modal } from "@/components/ui/Modal";
import { SITE, type MoonPack } from "@/lib/config";
import { clearFlow } from "@/lib/flowState";
import { clearSajuProfile, useSajuProfile } from "@/lib/sajuFlow";
import { profileSummary } from "@/lib/sajuForm";
import { useRemainingToday } from "@/lib/storage/betaUsage";
import { clearChapters, useChapters } from "@/lib/storage/chapters";
import { clearDaily } from "@/lib/storage/daily";
import { MoonPackSheet } from "./MoonPackSheet";
import s from "./MeView.module.css";

type MeViewProps = {
  /** Balances, only once payments exist (SITE.features.payments); null in the beta. */
  wallet: Wallet | null;
};

type Sheet = "packs" | "erase" | null;

function Soon({ children }: { children: string }) {
  return (
    <li>
      <span className={`${s.item} ${s.itemSoon}`}>
        <span>{children}</span>
        <span className={s.soon}>준비 중</span>
      </span>
    </li>
  );
}

/**
 * 내 정보: the beta's free count, the saju profile kept on this device (with 고치기), the menu, and
 * erasing everything this device keeps. Balances and 달빛 packs stay hidden until payments exist.
 */
export function MeView({ wallet }: MeViewProps) {
  const [balance, setBalance] = useState(wallet);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [notice, setNotice] = useState("");
  const { profile } = useSajuProfile();
  const chapters = useChapters();
  const remaining = useRemainingToday();
  const { paid, free } = SITE.currency;

  // Mock payment until the payments task: add the pack and say so.
  const buy = (pack: MoonPack) => {
    const units = pack.units + pack.bonus;
    setBalance((prev) => (prev ? { ...prev, moonlight: prev.moonlight + units } : prev));
    setSheet(null);
    setNotice(`${paid} ${units}개를 충전했어요`);
  };

  const erase = () => {
    clearChapters();
    clearSajuProfile();
    clearDaily();
    clearFlow();
    setSheet(null);
    setNotice("이 기기에 저장된 기록을 모두 지웠어요");
  };

  return (
    <div className={s.layout}>
      <div className={s.col}>
        <header className={s.profile}>
          <div className={s.profileText}>
            <h1 className={s.nickname}>내 정보</h1>
            <p className={s.provider}>로그인 없이, 기록은 이 기기에 보관돼요</p>
          </div>
        </header>

        {balance ? (
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
            <Button block onClick={() => setSheet("packs")}>
              {`${paid} 충전하기`}
            </Button>
          </section>
        ) : (
          <section className={s.beta} aria-labelledby="beta-title">
            <h2 id="beta-title" className={s.betaTitle}>
              {`베타 기간에는 모든 풀이가 무료예요 · 하루 ${SITE.beta.fullPerDay}번`}
            </h2>
            <p className={s.betaText}>
              {remaining === undefined ? " " : remaining > 0 ? `오늘 ${remaining}번 더 열 수 있어요` : "오늘은 모두 열었어요 · 내일 0시에 다시 열려요"}
            </p>
          </section>
        )}
        <p className={s.notice} role="status">
          {notice}
        </p>
      </div>

      <div className={s.col}>
        <section className={s.sajuInfo} aria-labelledby="saju-info-title">
          <div className={s.sajuText}>
            <h2 id="saju-info-title" className={s.sajuLabel}>
              내 사주 정보
            </h2>
            <p className={s.sajuValue}>
              {profile === undefined ? " " : profile ? <DotLine parts={profileSummary(profile).split(" · ")} /> : <span className={s.sajuEmpty}>아직 입력하지 않았어요</span>}
            </p>
          </div>
          <Link href="/saju/new" className={s.edit}>
            {profile ? "고치기" : "입력하기"}
          </Link>
        </section>

        <nav aria-label="계정 메뉴">
          <ul className={s.list}>
            <li>
              <Link href="/story" className={s.item}>
                <span>{chapters && chapters.length > 0 ? `내 기록 · ${chapters.length}개` : "내 기록"}</span>
                <ChevronIcon />
              </Link>
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

        <button type="button" className={s.erase} onClick={() => setSheet("erase")}>
          이 기기에 저장된 기록 모두 지우기
        </button>
      </div>

      {balance ? (
        <Modal open={sheet === "packs"} onClose={() => setSheet(null)} labelledBy="packs-title">
          <MoonPackSheet titleId="packs-title" moonlight={balance.moonlight} onBuy={buy} />
        </Modal>
      ) : null}
      <Modal open={sheet === "erase"} onClose={() => setSheet(null)} labelledBy="erase-title">
        <div className={s.confirm}>
          <h2 id="erase-title" className={s.confirmTitle}>
            이 기기의 기록을 모두 지울까요?
          </h2>
          <p className={s.confirmText}>
            {`열어 둔 풀이${chapters && chapters.length > 0 ? ` ${chapters.length}개` : ""}, 사주 정보, 오늘의 쿠키가 지워져요. 지운 기록은 되돌릴 수 없어요.`}
          </p>
          <div className={s.confirmActions}>
            <button type="button" className={s.confirmErase} onClick={erase}>
              모두 지우기
            </button>
            <Button variant="secondary" block onClick={() => setSheet(null)}>
              취소
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
