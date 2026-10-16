"use client";

import Link from "next/link";
import { won } from "@/lib/config";
import { REFUND_DAYS } from "@/lib/pay/catalog";
import { PREMIUM, PREMIUM_CHAPTER_TTL_MS, PREMIUM_IDS } from "@/lib/premium/products";
import { usePremiumStatus } from "@/lib/premium/status";
import s from "./legal.module.css";

/**
 * The policies' premium text (plan task 24; owner 2026-10-16: the 궁합 partner is never kept on our servers). Client
 * islands on the premium status, like 별자리 인연's text follows its feature flag: nothing before the status answers,
 * when it fails, or while no premium product is visible here, so STARLOG_PREMIUM off shows today's policies.
 */

function usePremiumShown(): boolean {
  const status = usePremiumStatus();
  return Boolean(status && PREMIUM_IDS.some((id) => status[id].visible));
}

const FOLLOW_UP_DAYS = Math.round(PREMIUM_CHAPTER_TTL_MS / (24 * 60 * 60 * 1000));

/** "2026년 11월 15일" (Korean time). */
const kstDate = (ms: number) => {
  const d = new Date(ms + 9 * 3_600_000);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
};

const productName = (id: (typeof PREMIUM_IDS)[number]) => (PREMIUM[id].entry === PREMIUM[id].name ? PREMIUM[id].name : `${PREMIUM[id].entry}(${PREMIUM[id].name})`);

/** 개인정보처리방침 §1: what the premium readings take, and the 궁합 partner's information (합니다체, as the policy). */
export function PremiumPrivacy() {
  if (!usePremiumShown()) return null;
  return (
    <>
      <div>
        <h3 className={s.sub}>프리미엄 풀이를 볼 때</h3>
        <ul className={s.list}>
          <li>{`${productName("tarot-deep")}: 타로 풀이와 같은 항목(질문, 고른 주제와 상황, 직접 쓰기 칸에 적은 내용, 메모)`}</li>
          <li>{`${PREMIUM["newyear-2027"].name}: 사주 풀이와 같은 출생 정보와 고른 지금 상태`}</li>
          <li>로그인해 결제하고 연 프리미엄 풀이는 다른 풀이처럼 계정에 암호화해 보관합니다. 다만 우리 사이 궁합은 아래와 같이 상대방 정보를 빼고 보관합니다.</li>
        </ul>
      </div>
      <div>
        <h3 className={s.sub}>우리 사이 궁합에 입력한 상대방 정보</h3>
        <ul className={s.list}>
          <li>항목: 상대방의 생년월일, 양력·음력(윤달 여부), 태어난 시(아는 경우), 성별, 부르는 말(적은 경우), 관계</li>
          <li>목적: 이 풀이를 만들고 이어서 물어보기에 답하는 데만 씁니다. 다른 풀이, 공유 이미지, 통계에는 쓰지 않습니다.</li>
          <li>
            운영자의 서버에는 저장하지 않습니다. 풀이를 만드는 동안 이용 중인 브라우저 탭에 두었다가 풀이가 저장되면 지우고, 출생 정보로 계산한 명식은 풀이를 만들 때와
            이어서 물어볼 때 아래 처리 위탁과 국외 이전 항목의 AI 사업자에게 전달됩니다.
          </li>
          <li>{`이어서 물어보기를 위해 상대방의 출생 정보는 운영자만 열 수 있게 암호화한 형태로 이 기기의 풀이 기록 안에 최대 ${FOLLOW_UP_DAYS}일 동안 두고, 그 뒤에는 풀이를 열 때 지웁니다.`}</li>
          <li>계정에 보관하는 궁합 풀이에는 상대방의 출생 정보와 명식을 넣지 않습니다. 풀이 글, 관계, 부르는 말, 고민, 뽑은 카드, 내 출생 정보만 보관하며, 계정에서 받은 궁합 풀이로는 이어서 물어볼 수 없습니다.</li>
          <li>이 기기에서 그 풀이를 지우거나 브라우저의 사이트 데이터를 지우면 함께 지워집니다. 다른 사람의 정보는 그 사람의 동의를 받은 경우에만 입력해 주세요.</li>
        </ul>
      </div>
    </>
  );
}

/** 이용약관 제7조의3 (합니다체, as the terms). */
export function PremiumTerms() {
  if (!usePremiumShown()) return null;
  const year = PREMIUM["newyear-2027"];
  const window = year.opensAt !== undefined && year.closesAt !== undefined ? `${kstDate(year.opensAt)} 0시부터 ${kstDate(year.closesAt - 1)}까지(한국 시간)` : "운영자가 정한 판매 기간 동안";
  return (
    <section id="premium" className={s.section} aria-labelledby="premium-title">
      <h2 id="premium-title" className={s.sectionTitle}>
        제7조의3 (프리미엄 풀이)
      </h2>
      <ol className={s.list}>
        <li>
          운영자는 다음 프리미엄 풀이를 건별 유료로 제공합니다. 가격과 담기는 내용은{" "}
          <Link href="/pricing#premium" prefetch={false}>
            가격 안내
          </Link>
          와 각 풀이의 안내 화면에 게시합니다.
          <ul className={s.list}>
            {PREMIUM_IDS.map((id) => (
              <li key={id}>{`${productName(id)}: ${won(PREMIUM[id].krw)}, ${PREMIUM[id].scope.slice(0, 2).join(", ")}`}</li>
            ))}
          </ul>
        </li>
        <li>{`프리미엄 풀이 한 번의 결제에는 그 풀이 전체와 이어서 물어보기 ${PREMIUM["tarot-deep"].followUps}번이 담기며, 이어서 물어보기는 풀이를 연 날부터 ${FOLLOW_UP_DAYS}일 동안 할 수 있습니다.`}</li>
        <li>{`${year.name}는 ${window} 판매합니다. 판매 기간 중 언제 열어도 2027년 1월부터 12월까지 열두 달이 모두 담기며, 이미 지난 달도 포함됩니다.`}</li>
        <li>
          프리미엄 풀이는 여러 부분으로 나눠 차례로 적습니다. 풀이가 끝까지 완성되어 저장되지 않으면 결제한 풀이는 쓰이지 않으며, 이용자는 다시 열어 이어서 받을 수
          있고, 운영자 쪽 문제로 완성되지 않은 경우에는 전액 환불을 받을 수 있습니다. 그 밖의 결제와 환불은 제7조와 환불 정책을 따릅니다.
        </li>
        <li>우리 사이 궁합의 상대방 정보는 그 사람의 동의를 받은 경우에만 입력해야 합니다(제8조). 운영자는 상대방 정보를 서버에 저장하지 않으며, 이어서 물어보기는 풀이를 연 기기에서만 할 수 있습니다.</li>
      </ol>
    </section>
  );
}

/** 환불 정책 (해요체, as the refund page). */
export function PremiumRefund() {
  if (!usePremiumShown()) return null;
  return (
    <section id="premium" className={s.section} aria-labelledby="premium-title">
      <h2 id="premium-title" className={s.sectionTitle}>
        프리미엄 풀이
      </h2>
      <ul className={s.list}>
        <li>{`${productName("tarot-deep")}, ${PREMIUM.match.name}, ${PREMIUM["newyear-2027"].name}도 같은 기준이에요. 열기 전의 결제는 결제일로부터 ${REFUND_DAYS}일 안에 전액 환불받을 수 있고, 풀이를 적기 시작하면 청약철회가 제한돼요.`}</li>
        <li>{`결제하기 전에 무료로 먼저 보여 드려요. ${PREMIUM["tarot-deep"].entry}은 카드 10장의 키워드와 '지금의 나' 풀이, ${PREMIUM.match.name}은 두 사람의 명식과 카드 5장, 한눈에 보는 요약, ${PREMIUM["newyear-2027"].name}는 한 해의 제목과 요약이에요.`}</li>
        <li>프리미엄 풀이는 여러 부분으로 나눠 적어요. 중간에 생성이 실패하면 결제한 풀이는 그대로 남아 다시 열어 이어서 받을 수 있어요. 다 받기 전에 화면을 닫거나 연결이 끊긴 경우는 위와 같이 3번까지 다시 열 수 있어요.</li>
      </ul>
    </section>
  );
}
