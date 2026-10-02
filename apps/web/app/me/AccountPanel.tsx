"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { logout, refreshAccount, type AccountState, type AccountUser } from "@/lib/account/client";
import { SITE } from "@/lib/config";
import { productById } from "@/lib/pay/catalog";
import { postJson } from "@/lib/reading/api";
import { describeApiError } from "@/lib/reading/errors";
import { deleteAccountReadings } from "@/lib/storage/sync";
import { OrderHistory } from "./OrderHistory";
import s from "./account.module.css";

const lastDay = (iso: string) => {
  const kst = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
};
const openHref = (productId: string) => (productId === "saju" ? "/saju/new" : "/tarot/new");

type AccountPanelProps = {
  account: AccountState & { user: AccountUser };
  /** tests: replaces the browser navigation */
  navigate?: (url: string) => void;
  /** 내 정보 passes its own status line (one live region per screen); alone, the panel shows its own. */
  onNotice?: (text: string) => void;
};

/**
 * 내 정보 for a logged-in user (spec section 9):
 * - nickname, 별조각 with their last day, unopened purchases (열기, 환불받기), 결제 내역 with receipts;
 * - deleting the account's copies of readings;
 * - 로그아웃, and 회원 탈퇴 (always through the Kakao re-check).
 */
export function AccountPanel({ account, navigate = (url) => window.location.assign(url), onNotice }: AccountPanelProps) {
  const { user } = account;
  const { free } = SITE.currency;
  const [ownNotice, setOwnNotice] = useState("");
  const setNotice = onNotice ?? setOwnNotice;
  const [sheet, setSheet] = useState<"refund" | "delete" | null>(null);
  const [refundId, setRefundId] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const refund = async () => {
    if (!refundId) return;
    const res = await postJson("/api/pay/refund", { orderId: refundId });
    setSheet(null);
    setNotice(res.ok ? "환불했어요. 카드사에 따라 며칠 걸릴 수 있어요." : describeApiError(res.error).title);
    await refreshAccount();
    setHistoryKey((key) => key + 1);
  };

  const startDelete = async () => {
    const res = await postJson<{ url: string }>("/api/account/delete-intent", {});
    if (res.ok) navigate(res.data.url);
    else {
      setSheet(null);
      setNotice(describeApiError(res.error).title);
    }
  };

  return (
    <section className={s.account} aria-labelledby="account-title">
      <h2 id="account-title" className={s.name}>
        {user.nickname}
      </h2>
      <p className={s.muted}>카카오로 로그인했어요</p>

      <p className={s.balance}>
        <span className={s.balanceLabel}>{free}</span>
        <span>{`${user.stardust}개`}</span>
        {user.stardust > 0 && user.stardustExpiresAt ? <span className={s.muted}>{` · ${lastDay(user.stardustExpiresAt)}까지`}</span> : null}
      </p>

      {user.unused.length > 0 ? (
        <ul className={s.unused} aria-label="결제한 풀이">
          {user.unused.map((item) => (
            <li key={item.orderId} className={s.unusedItem}>
              <span>{`${productById(item.productId)?.name ?? "풀이"} · 열지 않음`}</span>
              <Button href={openHref(item.productId)} variant="secondary" size="md">
                열기
              </Button>
              <button
                type="button"
                className={s.link}
                onClick={() => {
                  setRefundId(item.orderId);
                  setSheet("refund");
                }}
              >
                환불받기
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <OrderHistory key={historyKey} />

      {onNotice ? null : (
        <p className={s.notice} role="status">
          {ownNotice}
        </p>
      )}

      <div className={s.actions}>
        <button
          type="button"
          className={s.link}
          onClick={() => void deleteAccountReadings().then((ok) => setNotice(ok ? "계정에 보관한 풀이를 지웠어요. 이 기기의 기록은 그대로예요." : "지우지 못했어요. 다시 시도해 주세요."))}
        >
          계정에 보관한 풀이 모두 지우기
        </button>
        <button type="button" className={s.link} onClick={() => void logout().then(() => setNotice("로그아웃했어요"))}>
          로그아웃
        </button>
        <button type="button" className={s.link} onClick={() => setSheet("delete")}>
          회원 탈퇴
        </button>
      </div>

      <Modal open={sheet === "refund"} onClose={() => setSheet(null)} labelledBy="refund-title">
        <div className={s.confirm}>
          <h2 id="refund-title" className={s.sectionTitle}>
            이 결제를 환불할까요?
          </h2>
          <p>열지 않은 풀이라 결제한 금액 전액을 돌려 드려요.</p>
          <Button block onClick={() => void refund()}>
            전액 환불받기
          </Button>
          <Button variant="secondary" block onClick={() => setSheet(null)}>
            취소
          </Button>
        </div>
      </Modal>

      <Modal open={sheet === "delete"} onClose={() => setSheet(null)} labelledBy="delete-title">
        <div className={s.confirm}>
          <h2 id="delete-title" className={s.sectionTitle}>
            탈퇴할까요?
          </h2>
          <ul className={s.list}>
            {user.unused.length > 0 ? <li>{`열지 않은 결제 ${user.unused.length}건은 전액 환불돼요`}</li> : null}
            <li>{`남은 ${free}은 사라져요`}</li>
            <li>계정에 보관한 풀이가 지워져요</li>
            <li>결제 기록은 법에 따라 5년 동안 보관돼요</li>
            <li>이 기기의 기록은 아래 ‘이 기기에 저장된 기록 모두 지우기’로 따로 지울 수 있어요</li>
          </ul>
          <button type="button" className={s.danger} onClick={() => void startDelete()}>
            카카오로 확인하고 탈퇴하기
          </button>
          <Button variant="secondary" block onClick={() => setSheet(null)}>
            취소
          </Button>
        </div>
      </Modal>
    </section>
  );
}
