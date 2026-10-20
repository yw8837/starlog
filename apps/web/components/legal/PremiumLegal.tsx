import Link from "next/link";
import type { ReactNode } from "react";
import { won } from "@/lib/config";
import { PREMIUM_LEGAL_EFFECTIVE_DATE, koreanDate } from "@/lib/legal";
import { REFUND_DAYS } from "@/lib/pay/catalog";
import { PREMIUM, PREMIUM_CHAPTER_TTL_MS, PREMIUM_IDS } from "@/lib/premium/products";
import s from "./legal.module.css";

/**
 * The policies' premium text (plan task 24; owner 2026-10-16: the 궁합 partner is never kept on our servers). Part of
 * the documents themselves, rendered with the page whatever STARLOG_PREMIUM says (review 2026-10-17 M3): the names and
 * prices are public on /pricing already, and a policy must not wait for a client request to say what it says.
 */

const FOLLOW_UP_DAYS = Math.round(PREMIUM_CHAPTER_TTL_MS / (24 * 60 * 60 * 1000));

/**
 * What the AI provider gets of a 궁합's other person, exactly as lib/ai/prompts/match.ts sends it (review 2026-10-17 #1):
 * the label and relation, their day stem, the tilt of their elements, the 일지 relation's name, the names of the relations
 * the coming years and months have with their 일지 (the year ahead, saju only since 2026-10-17), their 대운 change in
 * years, and whether their birth time is known.
 */
export const MATCH_AI_ITEMS =
  "상대방의 부르는 말과 관계, 일간(한 글자), 오행의 기울기, 두 사람의 일지 사이 관계 이름, 앞으로의 해와 달이 상대방의 일지와 맺는 관계 이름, 대운이 바뀌는 시기(몇 년 안인지), 태어난 시를 아는지 여부";

/** "2026년 11월 15일" (Korean time). */
const kstDate = (ms: number) => {
  const d = new Date(ms + 9 * 3_600_000);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
};

/** 개인정보처리방침 §1: what the premium readings take, and the 궁합 partner's information (합니다체, as the policy). */
export function PremiumPrivacy() {
  return (
    <>
      <div>
        <h3 className={s.sub}>프리미엄 풀이를 이용하는 경우</h3>
        <ul className={s.list}>
          <li>{`${PREMIUM["tarot-deep"].name}: 타로 풀이와 같은 항목(질문, 고른 주제와 상황, 직접 쓰기 칸에 적은 내용, 메모)`}</li>
          <li>{`${PREMIUM["newyear-2027"].name}: 사주 풀이와 같은 출생 정보와 고른 지금 상태`}</li>
          <li>{`로그인해 결제하고 연 프리미엄 풀이는 다른 풀이처럼 계정에 암호화해 보관합니다. 다만 ${PREMIUM.match.name}은 아래와 같이 상대방 정보를 빼고 보관합니다.`}</li>
        </ul>
      </div>
      <div>
        <h3 className={s.sub}>{`${PREMIUM.match.name}에 입력한 상대방 정보`}</h3>
        <ul className={s.list}>
          <li>항목: 상대방의 생년월일, 양력·음력(윤달 여부), 태어난 시(아는 경우), 성별, 부르는 말(적은 경우), 관계</li>
          <li>목적: 이 풀이를 만들고 이어서 물어보기에 답하는 데만 씁니다. 다른 풀이와 통계에는 쓰지 않고, 공유 이미지에는 고른 관계만 들어갑니다.</li>
          <li>
            운영자의 서버에는 상대방의 생년월일과 태어난 시를 저장하지 않습니다. 풀이를 만드는 동안 이용 중인 브라우저 탭에 두었다가 풀이가 저장되면 지우고, 결제하지 않고
            떠나거나 24시간이 지나면 지웁니다.
          </li>
          <li>{`풀이를 만들 때와 이어서 물어볼 때 아래 처리 위탁과 국외 이전 항목의 AI 사업자에게는 ${MATCH_AI_ITEMS}만 전달합니다. 상대방의 생년월일, 일간 한 글자를 뺀 기둥 간지, 대운의 간지와 시작 시기는 전달하지 않고 풀이 글에도 쓰지 않습니다.`}</li>
          <li>{`이어서 물어보기를 위해 상대방의 출생 정보는 운영자만 열 수 있게 암호화한 형태로 이 기기에 최대 ${FOLLOW_UP_DAYS}일 동안 두고, ${FOLLOW_UP_DAYS}일이 지난 뒤 앱을 처음 열 때 지웁니다. 로그아웃해도 이 암호화한 정보만은 남겨 두어, 풀이를 연 기기에서는 다시 로그인해도 이어서 물어볼 수 있습니다.`}</li>
          <li>계정에 보관하는 궁합 풀이에는 상대방의 출생 정보와 명식을 넣지 않습니다. 관계, 부르는 말, 고민, 내 출생 정보와 고른 지금 상태, 풀이 글(상대방의 일간·오행 기울기·일지가 맺는 관계에 대한 해석이 들어 있습니다)을 보관하며, 다른 기기에서는 이어서 물어볼 수 없습니다.</li>
          <li>이 기기에서 그 풀이를 지우거나 브라우저의 사이트 데이터를 지우면 함께 지워집니다. 다른 사람의 정보는 그 사람의 동의를 받은 경우에만 입력해 주세요.</li>
        </ul>
      </div>
    </>
  );
}

/** 이용약관 제7조의3 (합니다체, as the terms). */
export function PremiumTerms() {
  const year = PREMIUM["newyear-2027"];
  // on sale now (owner 2026-10-20): an opening date shows only if one is set again
  const until = year.closesAt !== undefined ? `${kstDate(year.closesAt - 1)}까지(한국 시간)` : "";
  const window = year.opensAt !== undefined && year.closesAt !== undefined ? `${kstDate(year.opensAt)} 0시부터 ${until}` : until || "운영자가 정한 판매 기간 동안";
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
              <li key={id}>{`${PREMIUM[id].name}: ${won(PREMIUM[id].krw)}, ${PREMIUM[id].scope.slice(0, 2).join(", ")}`}</li>
            ))}
          </ul>
        </li>
        <li>{`프리미엄 풀이 한 번의 결제에는 그 풀이 전체와 이어서 물어보기 ${PREMIUM["tarot-deep"].followUps}번이 담기며, 이어서 물어보기는 풀이를 연 날부터 ${FOLLOW_UP_DAYS}일 동안 할 수 있습니다.`}</li>
        <li>{`${year.name}는 ${window} 판매합니다. 판매 기간 중 언제 열어도 2027년 1월부터 12월까지 열두 달이 모두 담기며, 이미 지난 달도 포함됩니다.`}</li>
        <li>
          프리미엄 풀이는 여러 부분으로 나눠 차례로 적으며, 다른 결제 풀이처럼 적기 시작한 때 제공이 시작된 것으로 봅니다. 다 나오기 전에 이용자가 화면을 닫거나 연결이
          끊긴 풀이는 3번까지 다시 열어 이어서 받을 수 있고, 환불 대상이 아닙니다. 네 번째로 끊긴 때에는 그 결제 풀이를 쓴 것으로 봅니다. 운영자 쪽 문제로 완성되지 않은
          풀이는 쓰이지 않습니다. 그 밖의 결제와 환불은 제7조와 환불 정책을 따릅니다.
        </li>
        <li>{`${PREMIUM.match.name}의 상대방 정보는 그 사람의 동의를 받은 경우에만 입력해야 합니다(제8조). 운영자는 상대방의 생년월일과 태어난 시를 서버에 저장하지 않으며(계정에는 관계, 부르는 말, 고민과 풀이 글을 보관합니다), 이어서 물어보기는 풀이를 연 기기에서만 할 수 있습니다.`}</li>
      </ol>
    </section>
  );
}

/** 환불 정책 (해요체, as the refund page). */
export function PremiumRefund() {
  return (
    <section id="premium" className={s.section} aria-labelledby="premium-title">
      <h2 id="premium-title" className={s.sectionTitle}>
        프리미엄 풀이
      </h2>
      <ul className={s.list}>
        <li>{`${PREMIUM["tarot-deep"].name}, ${PREMIUM.match.name}, ${PREMIUM["newyear-2027"].name}도 같은 기준이에요. 열기 전의 결제는 결제일로부터 ${REFUND_DAYS}일 안에 전액 환불받을 수 있고, 풀이를 적기 시작하면 청약철회가 제한돼요.`}</li>
        <li>{`결제하기 전에 무료로 먼저 보여 드려요. ${PREMIUM["tarot-deep"].name}은 카드 10장의 키워드와 '지금의 나' 풀이, ${PREMIUM.match.name}은 두 사람의 명식과 한눈에 보는 요약, ${PREMIUM["newyear-2027"].name}는 한 해의 제목과 요약이에요.`}</li>
        <li>프리미엄 풀이는 여러 부분으로 나눠 적어요. 중간에 생성이 실패하면 결제한 풀이는 그대로 남아 다시 열어 이어서 받을 수 있어요. 다 받기 전에 화면을 닫거나 연결이 끊긴 경우는 위와 같이 3번까지 다시 열 수 있어요.</li>
      </ul>
    </section>
  );
}

const IN_FORCE_ON = koreanDate(PREMIUM_LEGAL_EFFECTIVE_DATE);
const NAMES = PREMIUM_IDS.map((id) => PREMIUM[id].name).join(", ");

/** The 국외 이전 table's line for the 궁합 (privacy, Anthropic's items) once the premium clauses are in force. */
export const MATCH_AI_ROW = `${PREMIUM.match.name}: ${MATCH_AI_ITEMS}`;

/** On top of a policy until the premium clauses come in force (owner 2026-10-17: announced 7 days ahead). `haeyo`: the refund page's voice. */
export function PremiumLegalNotice({ haeyo = false }: { haeyo?: boolean }) {
  return (
    <aside className={s.note} aria-labelledby="premium-notice-title">
      <h2 id="premium-notice-title" className={s.noteTitle}>{`${IN_FORCE_ON}부터 바뀌는 내용`}</h2>
      <p>
        {haeyo
          ? `${IN_FORCE_ON}부터 프리미엄 풀이(${NAMES})에 관한 내용이 더해져요. 바뀌는 내용은 `
          : `${IN_FORCE_ON}부터 프리미엄 풀이(${NAMES})에 관한 내용이 더해집니다. 바뀌는 내용은 `}
        <a href="#premium-upcoming">개정 예정</a>
        {haeyo ? "에서 미리 볼 수 있어요." : "에서 미리 볼 수 있습니다."}
      </p>
    </aside>
  );
}

/**
 * On top of a policy for 7 days from the day the premium clauses came in force (review 2026-10-20 A1; lib/legal.ts
 * premiumChangeNoticeShown): what was added that day, in short. `haeyo`: the refund page's voice.
 */
export function PremiumChangeNotice({ haeyo = false }: { haeyo?: boolean }) {
  const end = (plain: string, polite: string) => (haeyo ? polite : plain);
  return (
    <aside className={s.note} aria-labelledby="premium-change-title">
      <h2 id="premium-change-title" className={s.noteTitle}>{`${IN_FORCE_ON} 바뀐 내용`}</h2>
      <ul className={s.list}>
        <li>{`프리미엄 풀이 세 가지(${NAMES})를 건별 유료로 더${end("했습니다", "했어요")}.`}</li>
        <li>{`한 번 결제에 풀이 전체와 이어서 물어보기 ${PREMIUM["tarot-deep"].followUps}번이 담기고, 이어서 물어보기는 풀이를 연 날부터 ${FOLLOW_UP_DAYS}일 동안 할 수 있${end("습니다", "어요")}.`}</li>
        <li>{`${PREMIUM.match.name}은 두 사람의 사주로만 ${end("봅니다", "봐요")}.`}</li>
        <li>{`${PREMIUM.match.name}의 상대방 생년월일과 태어난 시는 운영자의 서버에 저장하지 않고, AI 사업자에게는 ${MATCH_AI_ITEMS}만 전달${end("합니다", "해요")}.`}</li>
      </ul>
    </aside>
  );
}

/** The premium clauses as they will read, until they come in force. */
export function PremiumUpcoming({ children }: { children: ReactNode }) {
  return (
    <div id="premium-upcoming" role="group" className={s.note} aria-labelledby="premium-upcoming-title">
      <p id="premium-upcoming-title" className={s.noteTitle}>{`개정 예정 · ${IN_FORCE_ON}부터 시행`}</p>
      {children}
    </div>
  );
}
