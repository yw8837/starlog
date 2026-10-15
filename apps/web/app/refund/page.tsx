import type { Metadata } from "next";
import Link from "next/link";
import { BusinessFacts, LegalNote, LegalPage, LegalSection } from "@/components/legal/LegalPage";
import s from "@/components/legal/legal.module.css";
import { SITE } from "@/lib/config";
import { LEGAL_EFFECTIVE_DATE, contactChannels, koreanDate } from "@/lib/legal";
import { REFUND_DAYS } from "@/lib/pay/catalog";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "환불 정책",
  description: `${SITE.nameKo} 풀이의 청약철회·환불 기준, 결제 전 무료로 보는 부분, 생성 실패 시 처리, 미성년자 결제 취소, 환불 신청 방법과 처리 기간을 안내해요.`,
  path: "/refund",
});

export default function RefundPage() {
  const contacts = contactChannels();

  return (
    <LegalPage
      title="환불 정책"
      effective={LEGAL_EFFECTIVE_DATE}
      lead={`${SITE.nameKo}의 풀이는 디지털 콘텐츠예요. 결제하기 전에 알아 두면 좋은 청약철회와 환불 기준을 정리했어요.`}
    >
      <LegalNote>
        <p className={s.noteTitle}>오픈 기념 무료 풀이는 결제가 없어 환불 대상이 아니에요.</p>
        <p>
          풀이가 제대로 만들어지지 않으면 오픈 기념 무료도 쓴 것으로 치지 않아요. 아래 기준은 결제한 풀이에 적용해요.
        </p>
      </LegalNote>

      <LegalSection id="withdrawal" title="청약철회 제한 안내">
        <p>
          「전자상거래 등에서의 소비자보호에 관한 법률」 제17조 제2항 제5호에 따라, 디지털 콘텐츠는 제공이 시작되면 청약철회가 제한될 수 있어요.
          {` ${SITE.nameKo}에서는 결제한 풀이를 적기 시작하면 제공이 시작된 것으로 봐요. 풀이는 결제 직후 자동으로 적기 시작해요. 다 나오기 전에 화면을 닫거나 연결이 끊겨도 같은 풀이를 3번까지 다시 열어 끝까지 받을 수 있어요. 네 번째로 끊기면 그 결제는 쓴 것으로 처리돼요.`}
        </p>
        <p>
          그 대신 같은 법 제17조 제6항과 시행령 제21조의2에 따라, 결제하기 전에 풀이의 일부를 무료로 먼저 보여 드려요. 타로는 뽑은 카드와 첫 풀이,
          이어지는 풀이의 소제목과 분량을, 사주는 명식과 첫 장 요약을 보고 나서 열지 정할 수 있어요.
        </p>
        <p>이 내용은 결제하기 전에 결제 화면에서 먼저 알려 드려요.</p>
      </LegalSection>

      <LegalSection id="before-open" title="풀이를 열기 전">
        <p>
          {`결제한 풀이를 열기 전에는 결제일로부터 ${REFUND_DAYS}일 안에 전액 환불받을 수 있어요. ${REFUND_DAYS}일째 되는 날 밤 12시(한국 시간)까지예요(10월 6일에 결제했다면 10월 ${6 + REFUND_DAYS}일까지). 내 정보 > 결제한 풀이에서 ‘환불받기’를 누르면 바로 처리돼요.`}
        </p>
        <p>{`${REFUND_DAYS}일이 지난 뒤에도 풀이는 그대로 열 수 있어요.`}</p>
        <p>카드사가 결제를 취소해 주는 기간이 지났다면, 알려 주신 본인 명의 계좌로 환불해 드려요.</p>
      </LegalSection>

      <LegalSection id="failure" title="생성 실패와 오류">
        <ul className={s.list}>
          <li>풀이가 끝까지 완성되지 않았다면(생성 오류, 자동 품질 검사 탈락, 시간 초과) 결제한 풀이는 쓰이지 않아요. 같은 풀이를 다시 열 때 한 번 더 결제하지 않아요.</li>
          <li>연결이 끊겼는데 풀이는 완성됐다면, 그 풀이는 내 기록과 계정에 남아 있어요. 내 정보에서 결제한 풀이와 기록을 확인할 수 있어요.</li>
          <li>풀이가 나오는 도중에 화면을 닫거나 연결이 끊겼다면, 결제한 풀이는 그대로 남아 내 정보에서 3번까지 다시 열어 끝까지 받을 수 있어요. 이미 제공이 시작된 풀이라 이때는 환불되지 않아요. 네 번째로 끊기면 그 결제는 쓴 것으로 처리되고 다시 열 수 없어요.</li>
          <li>{`생성 실패나 장애, 결제 오류처럼 ${SITE.nameKo} 쪽 문제로 풀이가 완성되지 않았다면 다시 여는 대신 전액 환불받을 수도 있어요. 이때는 결제일로부터 ${REFUND_DAYS}일이 지났어도 환불해 드려요. 아래 문의처로 알려 주세요.`}</li>
          <li>풀이가 결제 전에 안내한 내용과 다르게 제공됐다면, 확인한 뒤 같은 기준으로 처리해요.</li>
        </ul>
      </LegalSection>

      <LegalSection id="minor" title="미성년자 결제 취소">
        <ul className={s.list}>
          <li>만 19세 미만 미성년자가 법정대리인(부모 등)의 동의 없이 결제했다면, 미성년자 본인이나 법정대리인이 결제를 취소할 수 있어요.</li>
          <li>다만 미성년자가 속임수로 성년이거나 동의를 받은 것처럼 믿게 한 경우처럼 법에서 정한 경우에는 취소가 제한될 수 있어요.</li>
          <li>취소를 확인하기 위해 법정대리인임을 확인할 수 있는 서류를 요청할 수 있어요.</li>
          <li>취소는 아래 문의처로 신청해 주세요. 확인한 뒤 결제를 취소하고 결제한 수단으로 환불해 드려요.</li>
        </ul>
      </LegalSection>

      <LegalSection id="how" title="환불 신청 방법과 처리 기간">
        <ul className={s.list}>
          <li>{`열지 않은 결제는 결제일로부터 ${REFUND_DAYS}일 안에 내 정보 > 결제한 풀이의 ‘환불받기’로 바로 환불돼요.`}</li>
          <li>그 밖의 환불은 아래 문의처로 결제일, 결제 금액, 로그인한 계정의 닉네임, 환불 사유를 알려 주세요. 확인한 날부터 3영업일 안에 결제를 취소하고 결제한 수단으로 환불해 드려요.</li>
          <li>카드사나 결제사 사정에 따라 실제로 반영되기까지 며칠 더 걸릴 수 있어요.</li>
        </ul>
      </LegalSection>

      <LegalSection id="contact" title="문의처">
        {contacts.length > 0 ? null : <p>환불 신청과 문의를 받을 연락처는 이 자리에 안내해 드려요.</p>}
        <BusinessFacts />
      </LegalSection>

      <LegalSection id="law" title="그 밖의 사항">
        <p>이 정책에 정하지 않은 내용은 「전자상거래 등에서의 소비자보호에 관한 법률」과 「콘텐츠이용자보호지침」 등 관련 법령과 지침을 따라요.</p>
        <p>
          {"가격은 "}
          <Link href="/pricing">가격 안내</Link>
          {`에서 볼 수 있어요. 이 정책은 ${koreanDate(LEGAL_EFFECTIVE_DATE)}부터 시행해요.`}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
