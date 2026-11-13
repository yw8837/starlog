import type { Metadata } from "next";
import Link from "next/link";
import { Facts, LegalPage, LegalSection } from "@/components/legal/LegalPage";
import s from "@/components/legal/legal.module.css";
import { OPENING_LAST_DATE, SITE, openingFreeOn } from "@/lib/config";
import { BOND_LOGIN_DATE, contactChannels, koreanDate } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";

const { business, name, nameKo } = SITE;
/** 별자리 인연's lines show while the feature is live, as on the privacy page. */
const BONDS = SITE.features.bonds;

export const metadata: Metadata = pageMetadata({
  title: "계정 삭제 안내",
  description: `${nameKo} (${name}) 계정을 삭제(회원 탈퇴)하는 방법과 이메일·전화로 요청하는 곳, 탈퇴하면 지워지는 정보와 남는 정보, 보관 기간을 안내합니다.`,
  path: "/account-deletion",
});

/** Rendered per request, as the policies are: the 오픈 기념 무료 line leaves with the event, with no deploy. */
export const dynamic = "force-dynamic";

/**
 * 계정 삭제 안내 (owner 2026-11-13 "전용 페이지 만들기"): the web link Google Play asks for, open without a login. Every line
 * restates the privacy policy, the terms, the 회원 탈퇴 dialog (app/me/AccountPanel.tsx) or lib/account/deletion.ts; nothing
 * here is a new promise. Linked from the privacy policy's rights section, not the footer (its link row is pinned).
 */
export default function AccountDeletionPage() {
  const contacts = contactChannels();
  const now = Date.now();

  return (
    <LegalPage
      title="계정 삭제 안내"
      lead={
        <>
          {`${business.name}(이하 “운영자”)가 운영하는 ${nameKo} (${name})의 계정을 삭제(회원 탈퇴)하는 방법과 탈퇴하면 지워지는 정보, 남는 정보와 보관 기간을 알려 드립니다. `}
          <Link href="/privacy">개인정보처리방침</Link>
          {"과 "}
          <Link href="/terms">이용약관</Link>
          {"의 내용을 한곳에 모았습니다."}
        </>
      }
    >
      <LegalSection id="in-app" title="1. 내 정보에서 탈퇴하기">
        <p>회원은 언제든지 내 정보에서 탈퇴할 수 있습니다.</p>
        <ol className={s.list}>
          <li>
            {"로그인한 상태에서 "}
            <Link href="/me">내 정보</Link>
            {" > 회원 탈퇴를 누릅니다."}
          </li>
          <li>‘탈퇴할까요?’ 확인창에서 지워지는 것과 남는 것을 확인합니다.</li>
          <li>로그인한 계정으로 한 번 더 확인하고 탈퇴합니다.</li>
        </ol>
        <p>
          탈퇴하면 열지 않은 결제 풀이는 전액 환불합니다. 다만 풀이를 받던 중에 이용자가 화면을 닫거나 연결이 끊겨 이용약관 제7조에 따라 환불 대상이 아닌 결제
          풀이는 환불하지 않으며, 탈퇴와 함께 더 이상 열 수 없습니다.
        </p>
      </LegalSection>

      <LegalSection id="request" title="2. 이메일·전화로 삭제 요청하기">
        <p>이용자는 언제든지 자신의 개인정보에 대해 열람, 정정, 삭제, 처리정지를 요구할 수 있습니다.</p>
        <p>운영자가 보관하는 정보에 대한 요구는 아래 개인정보 보호책임자에게 해 주시면 지체 없이 조치합니다. 법정대리인이나 위임을 받은 사람을 통해서도 요구할 수 있습니다.</p>
        {BONDS ? <p>별자리 인연에서 별자리 전체나 친구로 남긴 별의 삭제도 아래 개인정보 보호책임자에게 요청해 주세요.</p> : null}
        <h3 className={s.sub}>개인정보 보호책임자</h3>
        <Facts
          rows={[
            ["성명", business.ceo],
            ["직위", "대표"],
            ...contacts.map(([label, value]) => [label, <a href={label === "이메일" ? `mailto:${value}` : `tel:${value.replaceAll("-", "")}`}>{value}</a>] as const),
          ]}
        />
        {contacts.length > 0 ? null : <p className={s.muted}>연락처는 이 자리에 안내합니다.</p>}
      </LegalSection>

      <LegalSection id="deleted" title="3. 탈퇴하면 지워지는 정보">
        <ul className={s.list}>
          <li>회원 정보(계정 식별값을 되돌릴 수 없게 바꾼 값과 닉네임)는 지체 없이 파기하고, 로그인 세션도 지웁니다.</li>
          <li>계정에 보관한 풀이(로그인한 상태로 연 풀이와 계정으로 옮긴 풀이)는 지체 없이 파기합니다.</li>
          <li>그 계정의 풀이 후기와 도움돼요·신고 기록은 지체 없이 파기합니다.</li>
          <li>로그인한 상태로 공유한 풀이의 공유 사본은 바로 지웁니다.</li>
          {BONDS ? <li>계정에 연결된 별자리 주인 정보는 그 주인의 별자리, 별, 초대코드와 함께 바로 삭제하고, 그 계정으로 로그인해 친구로 참여한 별도 함께 지웁니다.</li> : null}
        </ul>
      </LegalSection>

      <LegalSection id="kept" title="4. 탈퇴해도 남는 정보와 보관 기간">
        <ul className={s.list}>
          <li>
            「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 계약 또는 청약철회 등에 관한 기록과 대금결제 및 재화 등의 공급에 관한 기록은 5년, 소비자의 불만 또는
            분쟁처리에 관한 기록은 3년 동안 보관합니다. 탈퇴한 회원의 이 기록은 회원 식별 정보(계정 식별값을 바꾼 값, 닉네임)를 지운 채 보관하고, 기간이 끝나면 파기합니다.
          </li>
          <li>풀이 신고(안드로이드 앱) 기록은 계정과 메모를 지운 채 1년 동안 보관합니다.</li>
          <li>이미 지급한 가입 선물의 지급 기록(계정 식별값을 되돌릴 수 없게 바꾼 값과 지급 시각)은 탈퇴 뒤 1년 동안 보관한 뒤 파기합니다.</li>
          {openingFreeOn(now) ? (
            <li>{`오픈 기념 무료를 받은 기록(계정 식별값을 되돌릴 수 없게 바꾼 값과 받은 시각)은 같은 계정이 탈퇴 뒤 다시 받지 않도록 탈퇴해도 오픈 기념 무료가 끝날 때까지 보관하고, ${OPENING_LAST_DATE}이 지나면 지체 없이 파기합니다.`}</li>
          ) : null}
          {BONDS ? (
            <li>{`계정에 연결하지 않고 기기에서 만든 별자리와 ${koreanDate(BOND_LOGIN_DATE)} 전에 로그인 없이 참여한 별은 계정에 연결되어 있지 않아 탈퇴로 지워지지 않습니다. 삭제는 위 2항의 개인정보 보호책임자에게 요청해 주세요.`}</li>
          ) : null}
          <li>
            회원·결제 기록과 계정에 보관한 풀이를 담는 데이터베이스는 장애에 대비해 지난 30일 안의 상태로 되돌릴 수 있는 복구 기록을 자동으로 남깁니다. 그래서 탈퇴해
            파기한 정보도 이 복구 기록에는 최대 30일 동안 남아 있다가 사라집니다.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="device" title="5. 이 기기에 저장된 기록">
        <ul className={s.list}>
          <li>이 기기의 기록은 탈퇴와 따로, 내 정보의 ‘이 기기에 저장된 기록 모두 지우기’로 지울 수 있습니다.</li>
          <li>기기에 저장되는 기록(내 기록, 사주 입력 정보, 사주 맛보기, 오늘의 한 장, 하루 이용 표시)은 브라우저의 사이트 데이터를 지워도 바로 삭제되며, 내 정보에서 로그인 없이도 지울 수 있습니다.</li>
        </ul>
      </LegalSection>
    </LegalPage>
  );
}
