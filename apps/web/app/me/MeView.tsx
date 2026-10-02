"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronIcon } from "@/components/home/icons";
import { Button } from "@/components/ui/Button";
import { DotLine } from "@/components/ui/DotLine";
import { Modal } from "@/components/ui/Modal";
import { loginHref, useAccount } from "@/lib/account/client";
import { SITE } from "@/lib/config";
import { clearFlow } from "@/lib/flowState";
import { times } from "@/lib/helpGuide";
import { clearTeasers } from "@/lib/reading/teaserCache";
import { clearSajuProfile, useSajuProfile } from "@/lib/sajuFlow";
import { profileSummary } from "@/lib/sajuForm";
import { useRemainingToday } from "@/lib/storage/betaUsage";
import { clearChapters, useChapters } from "@/lib/storage/chapters";
import { clearDaily } from "@/lib/storage/daily";
import { forgetAccountOnDevice, useAccountSync } from "@/lib/storage/sync";
import { AccountPanel } from "./AccountPanel";
import { InviteCodeRow } from "./InviteCodeRow";
import s from "./MeView.module.css";
import a from "./account.module.css";

type MeViewProps = {
  /** The line for ?account=, ?delete= or ?login= (meStatus.ts); null when there is none. */
  status: string | null;
  /** ?account=deleted: the account is gone, so its readings leave this device too. */
  accountDeleted?: boolean;
};

type Sheet = "erase" | null;

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
 * 내 정보: the account when logged in (AccountPanel), a Kakao login while sales are open on this
 * device, otherwise the 오픈 기념 free count; the saju profile kept on this device (with 고치기), the
 * menu, and erasing everything this device keeps. A logged-in tab pulls the account's readings.
 */
export function MeView({ status, accountDeleted = false }: MeViewProps) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [notice, setNotice] = useState(status ?? "");
  const { profile } = useSajuProfile();
  const chapters = useChapters();
  const remaining = useRemainingToday();
  const account = useAccount();
  useAccountSync(account);

  useEffect(() => {
    if (!accountDeleted) return;
    if (forgetAccountOnDevice() > 0) setNotice((line) => `${line ? `${line} ` : ""}이 기기에 받아 둔 계정 풀이도 지웠어요.`);
  }, [accountDeleted]);

  const erase = () => {
    clearChapters();
    clearSajuProfile();
    clearDaily();
    clearFlow();
    clearTeasers();
    setSheet(null);
    setNotice("이 기기에 저장된 기록을 모두 지웠어요");
  };

  return (
    <div className={s.layout}>
      <div className={s.col}>
        <header className={s.profile}>
          <div className={s.profileText}>
            <h1 className={s.nickname}>내 정보</h1>
            {account?.user ? null : <p className={s.provider}>로그인 없이, 기록은 이 기기에 보관돼요</p>}
          </div>
        </header>

        {account?.user ? (
          <AccountPanel account={{ ...account, user: account.user }} onNotice={setNotice} />
        ) : account?.payments ? (
          <section className={s.beta} aria-labelledby="login-title">
            <h2 id="login-title" className={s.betaTitle}>
              로그인하면 결제한 풀이를 다른 기기에서도 볼 수 있어요
            </h2>
            <Button href={loginHref("/me")} block>
              카카오로 로그인
            </Button>
          </section>
        ) : (
          <>
            <section className={s.beta} aria-labelledby="beta-title">
              <h2 id="beta-title" className={s.betaTitle}>
                {`오픈 기념으로 하루 ${times(SITE.beta.fullPerDay)} 전체 풀이를 무료로 열어 드려요`}
              </h2>
              <p className={s.betaText}>
                {remaining === undefined
                  ? " "
                  : remaining > 0
                    ? `오늘 ${remaining}번 더 열 수 있어요 · 한국 시간 0시에 다시 채워져요`
                    : "오늘은 모두 열었어요 · 한국 시간 0시에 다시 채워져요"}
              </p>
            </section>
            {account?.login ? (
              <p className={s.provider}>
                <Link href={loginHref("/me")} className={a.link}>
                  결제한 풀이가 있다면 로그인
                </Link>
              </p>
            ) : null}
          </>
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
            <InviteCodeRow />
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

      <Modal open={sheet === "erase"} onClose={() => setSheet(null)} labelledBy="erase-title">
        <div className={s.confirm}>
          <h2 id="erase-title" className={s.confirmTitle}>
            이 기기의 기록을 모두 지울까요?
          </h2>
          <p className={s.confirmText}>
            {`열어 둔 풀이${chapters && chapters.length > 0 ? ` ${chapters.length}개` : ""}, 사주 정보, 오늘의 한 장이 지워져요. 지운 기록은 되돌릴 수 없어요.${account?.user ? " 계정에 보관한 풀이는 그대로예요." : ""}`}
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
