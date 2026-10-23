import type { Metadata } from "next";
import Link from "next/link";
import { BusinessFacts, LegalNote, LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { PremiumChangeNotice, PremiumLegalNotice, PremiumTerms, PremiumUpcoming } from "@/components/legal/PremiumLegal";
import s from "@/components/legal/legal.module.css";
import { OPENING_LAST_DATE, SITE } from "@/lib/config";
import { SYNC_REVISION_DATE, contactChannels, koreanDate, premiumChangeNoticeShown, premiumLegalInForce, syncRevisionInForce, termsEffectiveDate } from "@/lib/legal";
import { REFUND_DAYS } from "@/lib/pay/catalog";
import { pageMetadata } from "@/lib/seo";

const host = new URL(SITE.url).host;
/** 별자리 인연 (with 이번 주 행운 번호) is in the service list and has its own article while it is live. */
const BONDS = SITE.features.bonds;

export const metadata: Metadata = pageMetadata({
  title: "이용약관",
  description: `${SITE.nameKo}(${SITE.name}) 서비스의 이용 조건, 유료 서비스와 결제, 이용자의 의무, 서비스 변경과 면책, 분쟁 해결을 정한 이용약관이에요.`,
  path: "/terms",
});

/**
 * The revision of SYNC_REVISION_DATE (lib/legal.ts): shown as 개정 예정 until then, in the text from then. The AI item has a
 * link, so it is a component; the other lines are plain text.
 */
const AI_ITEM = (
  <>
    {"운영자는 「인공지능 발전과 신뢰 기반 조성 등에 관한 기본법」 제31조에 따라 이 약관과 서비스 화면("}
    <Link href="/how" prefetch={false}>
      풀이 과정 안내
    </Link>
    {" 등)으로 생성형 인공지능을 쓴다는 사실을 미리 알립니다."}
  </>
);
const NO_FOLLOW_UP = "이때는 이어서 물어보기를 제공하지 않습니다.";
const FREE_OPENING =
  "오픈 기념 무료로 연 타로 전체 풀이에는 이어서 물어보기를 제공하지 않습니다. 결과 공유는 다른 풀이와 같이 할 수 있고, 로그인한 상태로 연 풀이는 계정에도 보관됩니다. 오픈 기념 무료는 위 기간이 지나면 자동으로 끝납니다.";

/** Rendered per request: the premium clauses come in force at a KST midnight with no deploy (lib/legal.ts). */
export const dynamic = "force-dynamic";

export default function TermsPage() {
  const hasContact = contactChannels().length > 0;
  const now = Date.now();
  const inForce = premiumLegalInForce(now);
  const revised = syncRevisionInForce(now);
  const effective = termsEffectiveDate(now);

  return (
    <LegalPage title="이용약관" effective={effective}>
      {inForce ? null : <PremiumLegalNotice />}
      {premiumChangeNoticeShown(now) ? <PremiumChangeNotice /> : null}
      {revised ? null : (
        <LegalNote>
          <p className={s.noteTitle}>{`개정 예정 · ${koreanDate(SYNC_REVISION_DATE)}부터 시행`}</p>
          <ul className={s.list}>
            <li>{AI_ITEM}</li>
            <li>{`오픈 기념 무료로 연 타로 전체 풀이: ${NO_FOLLOW_UP}`}</li>
            <li>{FREE_OPENING}</li>
          </ul>
        </LegalNote>
      )}
      <LegalSection id="purpose" title="제1조 (목적)">
        <p>
          {`이 약관은 ${SITE.business.name}(이하 “운영자”)가 제공하는 ${SITE.nameKo}(${SITE.name}) 서비스의 이용 조건과 절차, 운영자와 이용자의 권리·의무와 책임을 정합니다.`}
        </p>
      </LegalSection>

      <LegalSection id="definitions" title="제2조 (정의)">
        <ol className={s.list}>
          <li>{`“${SITE.nameKo}”란 운영자가 ${host}에서 제공하는 타로·사주 풀이 서비스와 그 부가 서비스를 말합니다.`}</li>
          <li>{`“이용자”란 이 약관에 따라 ${SITE.nameKo}를 이용하는 회원과 비회원을 말합니다.`}</li>
          <li>“회원”이란 카카오 계정이나 Google 계정으로 로그인해 서비스를 이용하는 사람을, “비회원”이란 로그인하지 않고 이용하는 사람을 말합니다.</li>
          <li>“풀이”란 이용자가 입력한 질문·상황·출생 정보와 뽑은 카드 또는 계산한 명식을 바탕으로 AI가 생성해 제공하는 타로·사주 해석 콘텐츠를 말합니다.</li>
          <li>“전체 풀이”란 무료로 공개하는 부분을 넘어 소제목 전체와 이어서 물어보기를 담은 풀이를 말하며, 건별로 결제해서 엽니다. 다만 타로 전체 풀이는 제4조의 오픈 기념 무료로도 열 수 있으며, {revised ? NO_FOLLOW_UP : "이때는 이어서 물어보기와 결과 공유를 제공하지 않습니다."}</li>
        </ol>
      </LegalSection>

      <LegalSection id="changes" title="제3조 (약관의 게시와 변경)">
        <ol className={s.list}>
          <li>운영자는 이 약관을 서비스 화면 아래의 링크로 누구나 볼 수 있게 게시합니다.</li>
          <li>운영자는 관련 법령을 위반하지 않는 범위에서 이 약관을 바꿀 수 있습니다.</li>
          <li>약관을 바꿀 때는 바뀌는 내용과 시행일을 시행일 7일 전부터 서비스 안에 공지합니다. 이용자에게 불리하게 바뀌는 경우에는 시행일 30일 전부터 공지합니다.</li>
          <li>바뀐 약관에 동의하지 않는 이용자는 이용을 멈추고 탈퇴할 수 있습니다.</li>
        </ol>
      </LegalSection>

      <LegalSection id="service" title="제4조 (서비스 내용)">
        <ol className={s.list}>
          <li>
            운영자는 다음 서비스를 제공합니다.
            <ul className={s.list}>
              <li>AI가 생성하는 타로·사주 풀이와 후속 질문(이어서 물어보기)</li>
              <li>지금의 한 장, 오늘의 한 장처럼 카드 한 장으로 보는 짧은 풀이</li>
              <li>이용 중인 기기에 풀이를 보관해 다시 보는 기능(내 기록)</li>
              {BONDS ? <li>별자리 인연: 친구 초대, 친구가 고른 카드와 사주로 본 인연 점수, 별자리 도감과 랭킹, 공유 이미지, 이번 주 행운 번호</li> : null}
              <li>타로·사주 가이드 글</li>
            </ul>
          </li>
          <li>풀이는 오락과 자기 성찰을 위한 참고 콘텐츠입니다. 의료·법률·투자·진로 등 전문적인 판단을 대신하지 않으며, 중요한 결정은 해당 분야의 전문가와 상의하시기 바랍니다.</li>
          <li>풀이는 AI가 생성하므로 부정확하거나 이용자의 실제 상황과 맞지 않는 내용이 들어 있을 수 있습니다.</li>
          <li>
            {`운영자는 오픈 기념 무료로 ${OPENING_LAST_DATE} 23시 59분(한국 시간)까지 기기(브라우저)마다 한 번 타로 전체 풀이를 무료로 제공합니다. 사주 전체 풀이는 무료로 제공하지 않습니다. 무료로 이용할 수 있는 범위는 서비스 화면과 `}
            <Link href="/pricing" prefetch={false}>
              가격 안내
            </Link>
            {"에 표시합니다."}
          </li>
          <li>
            {revised
              ? FREE_OPENING
              : "오픈 기념 무료로 연 타로 전체 풀이는 그 기기에서 보고 보관하는 데에만 쓸 수 있으며, 이어서 물어보기와 결과 공유는 제공하지 않습니다. 오픈 기념 무료는 위 기간이 지나면 자동으로 끝납니다."}
          </li>
        </ol>
      </LegalSection>

      <LegalSection id="ai" title="제4조의2 (AI가 만든 콘텐츠의 표시)">
        <ol className={s.list}>
          <li>타로·사주 풀이, 후속 질문의 답, 오늘의 한 장은 생성형 인공지능이 만든 결과물입니다. 사주 명식은 운영자의 계산 프로그램이 먼저 계산하고, AI는 그 결과를 바탕으로 풀이를 씁니다.</li>
          <li>
            {revised
              ? AI_ITEM
              : "운영자는 「인공지능 발전과 신뢰 기반 조성 등에 관한 기본법」 제31조에 따라 이 약관과 서비스 화면으로 생성형 인공지능을 쓴다는 사실을 미리 알리고, 풀이 화면마다 AI가 만든 풀이라는 사실을 표시합니다."}
          </li>
          <li>지금의 한 장은 운영자가 카드마다 미리 준비한 문장 가운데 하나를 보여 주며, 요청할 때마다 새로 생성하지 않습니다.</li>
          {BONDS ? (
            <li>별자리 인연의 인연 점수, 인연 카드의 한 줄, 이번 주 행운 번호는 운영자가 정한 규칙으로 계산합니다. 오늘의 인연 카드의 한두 줄은 AI가 만들 수 있습니다.</li>
          ) : null}
          <li>운영자는 AI가 만든 풀이를 보여 주기 전에 자동 검사로 카드 그림이나 명식에 없는 내용, 질문과 다른 주제, 결과를 보장하는 표현 등을 걸러 냅니다. 다만 검사가 모든 오류를 막지는 못합니다.</li>
        </ol>
      </LegalSection>

      <LegalSection id="age" title="제5조 (이용 연령)">
        <p>
          {`${SITE.nameKo}는 만 14세 이상만 이용할 수 있습니다. 운영자는 만 14세 미만이 이용하고 있다는 사실을 알게 되면 이용을 제한할 수 있습니다.`}
        </p>
        <p>
          만 19세 미만인 미성년자가 법정대리인의 동의 없이 유료 서비스를 결제한 경우, 미성년자 본인이나 법정대리인은 그 계약을 취소할 수 있습니다(민법 제5조).
          다만 미성년자가 속임수로 자신을 성년자로 믿게 하거나 법정대리인의 동의가 있는 것으로 믿게 한 경우(민법 제17조), 법정대리인이 처분을 허락한
          재산의 범위에서 결제한 경우(민법 제6조)에는 취소할 수 없습니다. 운영자는 결제 화면에서 이 내용을 알립니다.
        </p>
      </LegalSection>

      <LegalSection id="members" title="제6조 (회원과 비회원 이용)">
        <ol className={s.list}>
          <li>비회원도 질문 만들기, 카드 뽑기, 무료로 공개하는 풀이 등 일부 서비스를 이용할 수 있습니다. 비회원의 기록은 이용 중인 기기의 브라우저에만 저장되며, 기기를 바꾸거나 브라우저 데이터를 지우면 사라질 수 있습니다.</li>
          <li>회원 가입은 카카오 계정이나 Google 계정으로 로그인해서 합니다.</li>
          <li>회원은 언제든지 내 정보에서 탈퇴할 수 있습니다. 탈퇴하면 열지 않은 결제 풀이는 전액 환불하고, 계정에 보관한 풀이는 지웁니다. 다만 풀이를 받던 중에 이용자가 화면을 닫거나 연결이 끊겨 제7조에 따라 환불 대상이 아닌 결제 풀이는 환불하지 않으며, 탈퇴와 함께 더 이상 열 수 없습니다. 결제 기록은 관련 법령이 정한 기간 동안 보관합니다.</li>
          <li>회원은 자신의 계정을 직접 관리해야 하며, 다른 사람이 자신의 계정을 쓰게 해서는 안 됩니다.</li>
        </ol>
      </LegalSection>

      <LegalSection id="paid" title="제7조 (유료 서비스와 결제)">
        <ol className={s.list}>
          <li>
            {"전체 풀이의 가격은 "}
            <Link href="/pricing" prefetch={false}>
              가격 안내
            </Link>
            {"에 게시합니다. 이용자는 전체 풀이를 건별로 결제하며, 결제 금액은 운영자가 상품별로 정한 금액입니다."}
          </li>
          <li>결제는 토스페이먼츠를 통해 카드와 간편결제로 할 수 있습니다. 결제하려면 회원으로 로그인해야 합니다.</li>
          <li>운영자는 결제 전에 가격, 포함 내용, 청약철회가 제한되는 경우를 알리고 이용자의 확인을 받습니다.</li>
          <li>
            {`결제한 풀이는 풀이를 적기 시작한 때 제공이 시작된 것으로 보며, 풀이는 결제 직후 자동으로 적기 시작합니다. 다 나오기 전에 이용자가 화면을 닫거나 연결이 끊긴 풀이는 3번까지 다시 열어 받을 수 있고, 환불 대상이 아닙니다. 네 번째로 끊긴 때에는 그 결제 풀이를 쓴 것으로 봅니다. 운영자 쪽 문제로 완성되지 않은 풀이는 쓰이지 않습니다. 열기 전의 결제 풀이는 결제일로부터 ${REFUND_DAYS}일 안에 전액 환불받을 수 있으며, 그 밖의 청약철회와 환불은 `}
            <Link href="/refund" prefetch={false}>
              환불 정책
            </Link>
            {"을 따릅니다."}
          </li>
          <li>{`오픈 기념 무료로 연 풀이에는 제4조에서 정한 대로 이어서 물어보기${revised ? "를" : "와 결과 공유를"} 제공하지 않습니다.`}</li>
          <li>가격 안내에 준비 중으로 표시한 풀이는 판매를 시작하기 전에 가격과 제공 내용을 알리며, 그 전에는 결제를 받지 않습니다.</li>
          <li>풀이가 완성되어 저장되지 않으면 결제한 풀이를 쓰지 않습니다.</li>
          <li>영수증은 내 정보의 결제 내역에서 확인할 수 있습니다.</li>
        </ol>
      </LegalSection>

      {/* The signup gift was removed (owner 2026-10-14 evening); the article number stays so the rest keep theirs. */}
      <LegalSection id="gift" title="제7조의2 (삭제)">
        <p>이 조는 삭제되었습니다.</p>
      </LegalSection>

      {/* 제7조의3 (프리미엄 풀이): 개정 예정 until it comes in force (lib/legal.ts), then part of the text. */}
      {inForce ? (
        <PremiumTerms />
      ) : (
        <PremiumUpcoming>
          <PremiumTerms />
        </PremiumUpcoming>
      )}

      <LegalSection id="duties" title="제8조 (이용자의 의무)">
        <p>이용자는 다음 행위를 해서는 안 됩니다.</p>
        <ul className={s.list}>
          <li>다른 사람의 개인정보(이름, 생년월일, 연락처 등)를 그 사람의 동의 없이 입력하는 행위</li>
          <li>다른 사람의 계정을 쓰거나 다른 사람인 것처럼 속이는 행위</li>
          <li>자동화된 수단으로 풀이를 대량으로 요청·수집하거나, 보안을 우회하는 등 서비스 운영을 방해하는 행위</li>
          <li>풀이를 운영자의 동의 없이 판매하는 등 영리 목적으로 쓰는 행위</li>
          <li>법령이나 공공질서에 어긋나는 내용, 다른 사람의 권리를 침해하는 내용을 입력하거나 퍼뜨리는 행위</li>
        </ul>
      </LegalSection>

      {BONDS ? (
        <LegalSection id="bonds" title="제8조의2 (별자리 인연)">
          <ol className={s.list}>
            <li>별자리 인연은 이용자(별자리 주인)가 고른 별자리를 초대코드나 링크로 들어온 친구가 별이 되어 채우는 기능입니다. 친구는 로그인 없이 참여할 수 있고, 한 기기로 같은 별자리 한 회차에 한 번 참여할 수 있습니다.</li>
            <li>닉네임은 2~10자로 정하며, 실명 대신 별명을 권합니다. 욕설, 다른 사람이나 운영자인 것처럼 보이는 이름, 링크나 광고는 쓸 수 없습니다. 닉네임은 별자리 랭킹과 공유 이미지에 보일 수 있습니다.</li>
            <li>친구가 남기는 한 줄(40자 이내)에는 욕설, 비방, 성적인 표현, 다른 사람의 개인정보, 광고나 링크를 쓸 수 없습니다.</li>
            <li>별자리 주인은 자기 별자리의 별을 언제든 지울 수 있습니다. 운영자는 이 조나 제8조를 어긴 닉네임과 한 줄을 알리지 않고 가리거나 지울 수 있습니다.</li>
            <li>인연 점수는 두 사람의 생년월일로 본 사주 궁합을 정해진 규칙으로 계산한 재미 콘텐츠입니다. 관계의 좋고 나쁨을 판단하거나 앞일을 보장하지 않습니다.</li>
            <li>이번 주 행운 번호는 재미로 보는 번호이며, 추첨에서는 모든 번호의 확률이 같습니다. 당첨이나 확률을 높여 주지 않습니다.</li>
            <li>별자리 랭킹은 같은 별자리를 완성한 이용자끼리 인연 점수 합계로 매깁니다. 랭킹에 이름을 올리지 않도록 설정할 수 있고, 운영자는 부정한 방법으로 만든 기록을 랭킹에서 뺄 수 있습니다.</li>
          </ol>
        </LegalSection>
      ) : null}

      <LegalSection id="reviews" title="제8조의3 (풀이 후기와 공유)">
        <ol className={s.list}>
          <li>풀이 후기는 계정에 저장된 풀이를 연 회원만, 풀이 하나에 하나씩 남길 수 있습니다. 운영자는 후기를 쓴 대가로 혜택을 주지 않습니다.</li>
          <li>후기는 누구나 볼 수 있고, 별점, 한 줄 후기, 상품과 주제, 닉네임의 일부만 공개됩니다. 후기의 권리는 작성자에게 있으며, 운영자는 서비스 안에서 후기를 보여 주는 데 씁니다.</li>
          <li>후기에는 욕설과 비하, 다른 사람의 개인정보, 연락처나 광고·홍보, 풀이와 관계없는 내용을 쓸 수 없습니다. 운영자는 이를 어긴 후기만 사유를 남기고 숨기며, 평가가 좋지 않다는 이유로 숨기거나 순서를 바꾸지 않습니다.</li>
          <li>회원은 자기 후기를 언제든 고치거나 지울 수 있고, 탈퇴하면 후기도 함께 지워집니다.</li>
          <li>공유 링크는 이용자가 직접 만들 때만 생기며, 링크를 아는 사람에게 뽑은 카드와 풀이 본문을 보여 줍니다. 질문과 직접 쓴 말, 생년월일은 보이지 않습니다. 이용자는 언제든 공유를 그만둘 수 있습니다.</li>
        </ol>
      </LegalSection>

      <LegalSection id="suspension" title="제9조 (서비스의 변경과 중단)">
        <ol className={s.list}>
          <li>운영자는 운영상·기술상 필요에 따라 서비스의 전부나 일부를 바꿀 수 있으며, 중요한 변경은 미리 공지합니다.</li>
          <li>설비 점검·교체, 장애, 천재지변 등으로 서비스를 일시 중단할 수 있습니다. 미리 알릴 수 없었던 경우에는 중단 뒤에 알립니다.</li>
          <li>유료 서비스를 종료할 때는 30일 전에 공지하고, 열지 않은 결제 풀이는 전액 환불합니다.</li>
        </ol>
      </LegalSection>

      <LegalSection id="disclaimer" title="제10조 (면책)">
        <ol className={s.list}>
          <li>풀이는 참고용 콘텐츠이며, 운영자는 이용자가 풀이를 근거로 내린 결정과 그 결과에 책임지지 않습니다.</li>
          <li>천재지변, 이용자의 귀책사유, 이용자가 브라우저 데이터를 지워 기기에 저장된 기록이 사라진 경우처럼 운영자에게 책임이 없는 사유로 생긴 손해에 대해서는 책임지지 않습니다.</li>
          <li>다만 운영자의 고의나 중대한 과실로 이용자에게 손해가 생긴 경우에는 관련 법령에 따라 책임집니다.</li>
        </ol>
      </LegalSection>

      <LegalSection id="disputes" title="제11조 (분쟁 해결)">
        <ol className={s.list}>
          <li>운영자는 이용자의 의견과 불만을 아래 사업자 정보의 문의처로 받아 성실하게 처리합니다.</li>
          <li>분쟁이 생기면 운영자와 이용자는 성실히 협의합니다. 협의로 해결되지 않으면 이용자는 한국소비자원이나 콘텐츠분쟁조정위원회 등에 조정을 신청할 수 있습니다.</li>
          <li>이 약관은 대한민국 법령에 따라 해석하며, 소송이 필요한 경우 관련 법령에 따른 관할 법원에서 다룹니다.</li>
        </ol>
      </LegalSection>

      <LegalSection id="business" title="제12조 (사업자 정보)">
        {hasContact ? null : <p>문의 연락처는 이 자리에 안내합니다.</p>}
        <BusinessFacts />
      </LegalSection>

      <LegalSection id="addendum" title="부칙">
        <p>{`이 약관은 ${koreanDate(effective)}부터 시행합니다.`}</p>
      </LegalSection>
    </LegalPage>
  );
}
