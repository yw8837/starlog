import type { Metadata } from "next";
import Link from "next/link";
import { BusinessFacts, LegalNote, LegalPage, LegalSection } from "@/components/legal/LegalPage";
import s from "@/components/legal/legal.module.css";
import { SITE, won } from "@/lib/config";
import { LEGAL_EFFECTIVE_DATE, contactChannels, koreanDate } from "@/lib/legal";
import { moonRefundKrw } from "@/lib/pricing";
import { pageMetadata } from "@/lib/seo";

const { paid, free } = SITE.currency;

export const metadata: Metadata = pageMetadata({
  title: "환불 정책",
  description: `${SITE.nameKo} 풀이와 ${paid} 충전의 청약철회·환불 기준, 결제 전 무료로 보는 부분, 생성 오류 시 복구, 미성년자 결제 취소, 환불 신청 방법과 처리 기간을 안내해요.`,
  path: "/refund",
});

/** Worked example from the first pack that carries a bonus: one reading spent, then refunded. */
function refundExample() {
  const pack = SITE.moonPacks.find((p) => p.bonus > 0) ?? SITE.moonPacks[0];
  const used = SITE.price.unitsPerReading;
  const bonusUsed = Math.min(used, pack.bonus);
  const paidUsed = used - bonusUsed;
  const paidLeft = pack.units - paidUsed;
  const spent =
    bonusUsed > 0
      ? `보너스 ${bonusUsed}개${paidUsed > 0 ? `와 구매한 ${paid} ${paidUsed}개` : ""}`
      : `구매한 ${paid} ${paidUsed}개`;
  const bought = pack.bonus > 0 ? `${paid} ${pack.units}개(보너스 ${pack.bonus}개 별도)` : `${paid} ${pack.units}개`;
  return `예를 들어 ${bought}를 ${won(pack.krw)}에 충전하고 풀이 한 번(${used}개)을 열었다면, ${spent}를 쓴 것으로 봐요. 남은 구매 ${paid} ${paidLeft}개만큼 ${won(pack.krw)} × ${paidLeft} ÷ ${pack.units} = ${won(moonRefundKrw(pack, used))}을 환불해 드려요.`;
}

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
          풀이가 제대로 만들어지지 않으면 그날 무료로 열 수 있는 횟수도 차감하지 않아요. 아래 기준은 유료 풀이와{" "}
          {`${paid} 충전에 적용해요.`}
        </p>
      </LegalNote>

      <LegalSection id="withdrawal" title="청약철회 제한 안내">
        <p>
          「전자상거래 등에서의 소비자보호에 관한 법률」 제17조 제2항 제5호에 따라, 디지털 콘텐츠는 제공이 시작되면 청약철회가 제한될 수 있어요.
          {` ${SITE.nameKo}에서는 결제한 풀이를 열어 생성이 시작된 때를 제공이 시작된 때로 봐요.`}
        </p>
        <p>
          그 대신 같은 법 제17조 제6항과 시행령 제21조의2에 따라, 결제하기 전에 풀이의 일부를 무료로 먼저 보여 드려요. 타로는 뽑은 카드와 첫 풀이,
          이어지는 풀이의 소제목과 분량을, 사주는 명식과 첫 장 요약을 보고 나서 열지 정할 수 있어요.
        </p>
        <p>{`충전한 ${paid} 가운데 아직 쓰지 않은 부분은 제공이 시작되지 않은 것으로 보고, 아래 기준대로 환불해 드려요.`}</p>
        <p>이 내용은 결제하기 전에 결제 화면에서 먼저 알려 드려요.</p>
      </LegalSection>

      <LegalSection id="before-open" title="풀이를 열기 전">
        <p>결제했지만 아직 풀이를 열지 않았다면 결제를 취소할 수 있어요. 결제한 금액을 전액 환불해 드려요.</p>
      </LegalSection>

      <LegalSection id="failure" title="생성 실패와 오류">
        <ul className={s.list}>
          <li>{`풀이가 만들어지지 않았거나 오류로 끝까지 제공되지 않았다면, 쓰려던 ${paid}·${free}을 자동으로 되돌려 드려요. 같은 풀이를 다시 열 때 한 번 더 차감하지 않아요.`}</li>
          <li>자동 품질 검사를 통과하지 못해 풀이를 보여 드리지 못한 경우도 생성 실패로 보고 같은 기준으로 처리해요.</li>
          <li>바로 결제로 연 풀이라면 결제한 금액을 전액 환불해 드려요. 원하시면 환불 대신 같은 풀이를 다시 열 수 있게 해 드려요.</li>
          <li>풀이가 결제 전에 안내한 내용과 다르게 제공됐다면, 확인한 뒤 같은 기준으로 처리해요.</li>
        </ul>
      </LegalSection>

      <LegalSection id="moonlight" title={`${paid} (유료 재화)`}>
        <ul className={s.list}>
          <li>{`결제일로부터 7일 이내이고 충전한 ${paid}을 하나도 쓰지 않았다면, 결제 전체를 취소해 전액 환불해 드려요.`}</li>
          <li>{`일부를 썼거나 결제일로부터 7일이 지났다면, 남은 ${paid}만큼 환불해 드려요.`}</li>
          <li>{`환불 금액은 남은 구매 ${paid} 수 × (결제 금액 ÷ 구매한 ${paid} 수)이고, 원 미만은 반올림해요. 보너스 ${paid}은 환불 대상이 아니며, 쓸 때는 보너스 ${paid}이 먼저 쓰인 것으로 계산해요. 환불하면 그 충전으로 받은 보너스 ${paid}도 함께 사라져요.`}</li>
          <li>{`${paid}을 환불할 때 결제 수수료나 별도의 환불 수수료는 빼지 않아요.`}</li>
        </ul>
        <p className={s.muted}>{refundExample()}</p>
      </LegalSection>

      <LegalSection id="stardust" title={`${free} (무료 재화)`}>
        <p>{`${free}은 가입 선물처럼 무료로 드린 재화라 환불 대상이 아니에요. 현금으로 바꾸거나 다른 사람에게 넘길 수 없어요.`}</p>
      </LegalSection>

      <LegalSection id="minor" title="미성년자 결제 취소">
        <ul className={s.list}>
          <li>만 19세 미만 미성년자가 법정대리인(부모 등)의 동의 없이 결제했다면, 미성년자 본인이나 법정대리인이 결제를 취소할 수 있어요.</li>
          <li>다만 미성년자가 속임수로 성년이거나 동의를 받은 것처럼 믿게 한 경우처럼 법에서 정한 경우에는 취소가 제한될 수 있어요.</li>
          <li>취소를 확인하기 위해 법정대리인임을 확인할 수 있는 서류를 요청할 수 있어요.</li>
        </ul>
      </LegalSection>

      <LegalSection id="how" title="환불 신청 방법과 처리 기간">
        <ul className={s.list}>
          <li>아래 문의처로 결제일, 결제 금액, 로그인한 계정, 환불 사유를 알려 주세요.</li>
          <li>신청을 확인한 날부터 영업일 기준 3~7일 이내에 결제한 수단으로 환불해 드려요.</li>
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
          {`가격과 ${paid} 충전 상품은 `}
          <Link href="/pricing">가격 안내</Link>
          {`에서 볼 수 있어요. 이 정책은 ${koreanDate(LEGAL_EFFECTIVE_DATE)}부터 시행해요.`}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
