"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { logout, refreshAccount, type AccountState, type AccountUser } from "@/lib/account/client";
import { OPENING_LAST_DAY, openingFreeOn } from "@/lib/config";
import { DEEP_TAROT_HREF } from "@/lib/freshStart";
import { REFUND_DAYS, productById } from "@/lib/pay/catalog";
import { premiumPath } from "@/lib/premium/products";
import { postJson, type ApiError } from "@/lib/reading/api";
import { describeApiError } from "@/lib/reading/errors";
import { deleteAccountReadings, forgetAccountOnDevice } from "@/lib/storage/sync";
import { OrderHistory } from "./OrderHistory";
import s from "./account.module.css";

const lastDay = (iso: string) => {
  const kst = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
};
/**
 * Where an unopened purchase is opened: its reading's first step. A premium one opens whatever the premium
 * switch says (plan-reconciled §4.4): 켈틱 크로스 10장 in the question builder (no 다리 화면), the 궁합 and
 * 신년운세 in their forms.
 */
const OPEN_HREF: Readonly<Record<string, string>> = {
  saju: "/saju/new",
  "tarot-deep": DEEP_TAROT_HREF,
  match: `${premiumPath("match")}/new`,
  "newyear-2027": `${premiumPath("newyear-2027")}/new`,
};
const openHref = (productId: string) => OPEN_HREF[productId] ?? "/tarot/new";
/** Instead of 환불받기 once a purchase's refund window is over (the server's REFUND_WINDOW_CLOSED says the same). */
const WINDOW_CLOSED = `환불 가능 기간(결제일로부터 ${REFUND_DAYS}일)이 지났어요. 문제가 있으면 문의해 주세요.`;
/** Instead of 환불받기 for a purchase given back after its reading was cut off while written (SEC-02). */
const LEFT_WHILE_WRITTEN = "풀이를 받던 중에 끊겨서 환불은 할 수 없어요. 열기로 다시 받을 수 있어요.";

/** A failed 환불받기 in refund words (the payment lines would say "결제를 확인하고 있어요"). */
function refundNotice(error: ApiError): string {
  switch (error.code) {
    case "PAY_PENDING":
      return "환불을 처리하고 있어요. 결제 내역에서 확인할 수 있어요.";
    case "PAY_FAILED":
      // Toss refused the cancel; the purchase is back as it was.
      return error.message?.startsWith("환불하지 못했어요") ? error.message : `환불하지 못했어요. ${error.message ?? "문의해 주세요."}`;
    case "NOT_REFUNDABLE":
      return error.message ?? "환불할 수 없는 결제예요. 이미 연 풀이이거나 환불을 처리하고 있어요.";
    case "REFUND_WINDOW_CLOSED":
      return error.message ?? WINDOW_CLOSED;
    case "NETWORK":
    case "UPSTREAM":
      return "환불됐는지 아직 확인하지 못했어요. 결제 내역에서 확인해 주세요.";
    default:
      return "지금은 환불할 수 없어요. 잠시 뒤에 다시 시도해 주세요.";
  }
}

type AccountPanelProps = {
  account: AccountState & { user: AccountUser };
  /** tests: replaces the browser navigation */
  navigate?: (url: string) => void;
  /** 내 정보 passes its own status line (one live region per screen); alone, the panel shows its own. */
  onNotice?: (text: string) => void;
};

/**
 * 내 정보 for a logged-in user (spec section 9):
 * - nickname, the signup gift (unused with its last day, or used; nothing once it expired), unopened
 *   purchases (열기, 환불받기), 결제 내역 with receipts;
 * - deleting the account's copies of readings;
 * - 로그아웃, and 회원 탈퇴 (through the Kakao re-check, or Google's for a Google account; the review
 *   account has neither and skips it).
 */
export function AccountPanel({ account, navigate = (url) => window.location.assign(url), onNotice }: AccountPanelProps) {
  const { user } = account;
  const refundableCount = user.unused.filter((item) => item.refundable !== false).length;
  const forfeitedCount = user.unused.length - refundableCount;
  const [ownNotice, setOwnNotice] = useState("");
  const setNotice = onNotice ?? setOwnNotice;
  const [sheet, setSheet] = useState<"refund" | "delete" | "readings" | null>(null);
  const [refundId, setRefundId] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  // One refund at a time: a second tap would answer NOT_REFUNDABLE over "환불했어요".
  const refunding = useRef(false);
  const [refundBusy, setRefundBusy] = useState(false);

  // /me#purchases (환불받기 on a result page): the panel appears only once the account is read,
  // after the browser looked for the anchor, so bring it into view now.
  useEffect(() => {
    if (window.location.hash === "#purchases") document.getElementById("purchases")?.scrollIntoView({ block: "start" });
  }, []);

  const refund = async () => {
    if (!refundId || refunding.current) return;
    refunding.current = true;
    setRefundBusy(true);
    try {
      const res = await postJson("/api/pay/refund", { orderId: refundId });
      setSheet(null);
      setNotice(res.ok ? "환불했어요. 카드사에 따라 며칠 걸릴 수 있어요." : refundNotice(res.error));
      await refreshAccount();
      setHistoryKey((key) => key + 1);
    } finally {
      refunding.current = false;
      setRefundBusy(false);
    }
  };

  const eraseReadings = async () => {
    const ok = await deleteAccountReadings();
    setSheet(null);
    setNotice(ok ? "계정에 보관한 풀이를 지웠어요. 이 기기의 기록은 그대로예요." : "지우지 못했어요. 다시 시도해 주세요.");
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
      <p className={s.muted}>{user.review ? "심사용 계정으로 로그인했어요" : user.google ? "Google로 로그인했어요" : "카카오로 로그인했어요"}</p>

      {user.gift ? (
        <p id="gift" className={s.gift}>
          <span className={s.giftLabel}>가입 선물</span>
          <span>{user.gift.status === "used" ? "사용했어요" : "타로 전체 풀이 무료"}</span>
          {user.gift.status === "unused" && user.gift.until ? <span className={s.muted}>{` · ${lastDay(user.gift.until)}까지`}</span> : null}
        </p>
      ) : null}

      {/* #purchases: where 환불받기 on a result page and the refund policy send the buyer. */}
      <section id="purchases" className={s.orders} aria-labelledby="purchases-title">
        <h3 id="purchases-title" className={s.sectionTitle}>
          결제한 풀이
        </h3>
        {user.unused.length > 0 ? (
          <ul className={s.unused}>
            {user.unused.map((item) => {
              // Past its window, or given back after its reading was cut off, the purchase can still be
              // opened; 환불받기 gives way to a plain line.
              const left = item.refundable === false;
              const refundable = !left && (!item.refundUntil || Date.now() <= Date.parse(item.refundUntil));
              return (
                <li key={item.orderId} className={s.unusedItem}>
                  <span>{`${productById(item.productId)?.name ?? "풀이"} · 열지 않음`}</span>
                  <Button href={openHref(item.productId)} variant="secondary" size="md">
                    열기
                  </Button>
                  {refundable ? (
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
                  ) : null}
                  {left ? <p className={s.refundLine}>{LEFT_WHILE_WRITTEN}</p> : null}
                  {item.refundUntil ? <p className={s.refundLine}>{refundable ? `${lastDay(item.refundUntil)}까지 환불할 수 있어요` : WINDOW_CLOSED}</p> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={s.muted}>열지 않은 결제가 없어요</p>
        )}
      </section>

      <OrderHistory key={historyKey} />

      {onNotice ? null : (
        <p className={s.notice} role="status">
          {ownNotice}
        </p>
      )}

      <div className={s.actions}>
        <button type="button" className={s.link} onClick={() => setSheet("readings")}>
          계정에 보관한 풀이 모두 지우기
        </button>
        <button
          type="button"
          className={s.link}
          onClick={() =>
            void logout().then((ok) => {
              if (!ok) return setNotice("로그아웃하지 못했어요. 다시 시도해 주세요.");
              // On a shared phone the next person must not find the account's readings here.
              setNotice(forgetAccountOnDevice() > 0 ? "로그아웃했어요. 이 기기에 받아 둔 계정 풀이는 지웠어요." : "로그아웃했어요");
            })
          }
        >
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
          <Button block disabled={refundBusy} onClick={() => void refund()}>
            {refundBusy ? "환불하고 있어요" : "전액 환불받기"}
          </Button>
          <Button variant="secondary" block onClick={() => setSheet(null)}>
            취소
          </Button>
        </div>
      </Modal>

      <Modal open={sheet === "readings"} onClose={() => setSheet(null)} labelledBy="readings-title">
        <div className={s.confirm}>
          <h2 id="readings-title" className={s.sectionTitle}>
            계정에 보관한 풀이를 모두 지울까요?
          </h2>
          <ul className={s.list}>
            <li>계정에 보관한 풀이와 이어서 물어본 내용이 지워져서, 다른 기기에서는 볼 수 없어요</li>
            <li>이 기기에 저장된 기록은 그대로예요</li>
            <li>지운 풀이는 되돌릴 수 없어요</li>
          </ul>
          <button type="button" className={s.danger} onClick={() => void eraseReadings()}>
            모두 지우기
          </button>
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
            {refundableCount > 0 ? <li>{`열지 않은 결제 ${refundableCount}건은 전액 환불돼요`}</li> : null}
            {forfeitedCount > 0 ? <li>{`환불할 수 없는 결제 ${forfeitedCount}건은 사라져요`}</li> : null}
            {user.gift?.status === "unused" ? <li>쓰지 않은 가입 선물은 사라져요</li> : null}
            <li>계정에 보관한 풀이가 지워져요</li>
            <li>결제 기록은 법에 따라 5년 동안 보관돼요</li>
            {/* owner 2026-10-28: the claim stays until the event's purge (lib/account/openingClaim.ts sealOpeningClaim) */}
            {user.openingUsed && openingFreeOn() ? <li>{`오픈 기념 무료를 받은 기록은 ${OPENING_LAST_DAY}까지 남아서, 다시 가입해도 또 받을 수는 없어요`}</li> : null}
            <li>이 기기의 기록은 아래 ‘이 기기에 저장된 기록 모두 지우기’로 따로 지울 수 있어요</li>
          </ul>
          <button type="button" className={s.danger} onClick={() => void startDelete()}>
            {user.review ? "탈퇴하기" : user.google ? "Google로 확인하고 탈퇴하기" : "카카오로 확인하고 탈퇴하기"}
          </button>
          <Button variant="secondary" block onClick={() => setSheet(null)}>
            취소
          </Button>
        </div>
      </Modal>
    </section>
  );
}
