import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Facts, LegalNote, LegalPage, LegalSection } from "@/components/legal/LegalPage";
import s from "@/components/legal/legal.module.css";
import { SITE } from "@/lib/config";
import { LEGAL_EFFECTIVE_DATE, contactChannels, koreanDate } from "@/lib/legal";

const { business, nameKo } = SITE;

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: `${nameKo}가 처리하는 개인정보 항목과 목적, 보유 기간, 처리 위탁과 국외 이전, 이용자의 권리와 행사 방법을 안내합니다.`,
  alternates: { canonical: "/privacy" },
};

const BIRTH = "생년월일, 양력·음력(윤달 여부), 태어난 시, 성별, 출생 지역";

type Processor = { name: string; rows: ReadonlyArray<readonly [string, ReactNode]> };

const PROCESSORS: readonly Processor[] = [
  {
    name: "Anthropic, PBC",
    rows: [
      ["국가", "미국"],
      ["맡기는 일", "AI 풀이 생성"],
      ["이전 항목", `질문, 선택한 상황, 메모, 출생 정보(${BIRTH})`],
      ["이전 시점과 방법", "풀이를 요청할 때 암호화된 네트워크로 전송"],
      ["보유·이용 기간", "해당 사업자의 정책에 따름"],
      ["개인정보 문의", <a href="https://www.anthropic.com/legal/privacy">anthropic.com/legal/privacy</a>],
    ],
  },
  {
    name: "Vercel Inc.",
    rows: [
      ["국가", "미국"],
      ["맡기는 일", "서비스 호스팅과 전송"],
      ["이전 항목", "서비스를 이용하며 주고받는 정보, 접속 기록(IP 주소, 브라우저 정보, 접속 일시)"],
      ["이전 시점과 방법", "서비스에 접속할 때마다 암호화된 네트워크(HTTPS)로 전송"],
      ["보유·이용 기간", "해당 사업자의 정책에 따름"],
      ["개인정보 문의", <a href="https://vercel.com/legal/privacy-policy">vercel.com/legal/privacy-policy</a>],
    ],
  },
  {
    name: "토스페이먼츠 주식회사 (결제 도입 시)",
    rows: [
      ["국가", "대한민국"],
      ["맡기는 일", "결제와 환불 처리"],
      ["처리 항목", "결제와 환불에 필요한 결제 정보"],
      ["보유·이용 기간", "관련 법령과 해당 사업자의 정책에 따름"],
    ],
  },
];

export default function PrivacyPage() {
  const contacts = contactChannels();

  return (
    <LegalPage
      title="개인정보처리방침"
      effective={LEGAL_EFFECTIVE_DATE}
      lead={`${business.name}(이하 “운영자”)는 ${nameKo} 이용자의 개인정보를 「개인정보 보호법」 등 관련 법령에 따라 처리하고 보호합니다. 어떤 정보를 왜 처리하고, 얼마나 보관하며, 누구에게 맡기는지 알려 드립니다.`}
    >
      <LegalNote>
        <p className={s.noteTitle}>지금은 베타 기간입니다.</p>
        <p>예시 풀이를 보여 드리는 단계라, 입력하신 정보는 이용 중인 브라우저에만 저장되고 운영자의 서버나 AI 사업자로 보내지 않습니다. AI 풀이를 열면 아래 내용대로 처리합니다.</p>
      </LegalNote>

      <LegalSection id="items" title="1. 처리하는 개인정보 항목">
        <h3 className={s.sub}>타로 풀이를 볼 때</h3>
        <ul className={s.list}>
          <li>질문, 선택한 상황, 메모(직접 적은 경우)</li>
        </ul>
        <h3 className={s.sub}>사주 풀이를 볼 때</h3>
        <ul className={s.list}>
          <li>{BIRTH}</li>
          <li>태어난 시는 모르면 입력하지 않아도 되고, 성별은 대운의 방향을 계산하는 데만 씁니다.</li>
        </ul>
        <h3 className={s.sub}>서비스를 이용하는 동안 자동으로 생기는 정보</h3>
        <ul className={s.list}>
          <li>이용 중인 기기의 브라우저 저장소에 보관되는 입력 내용과 풀이 기록</li>
          <li>쿠키(아래 5항)</li>
          <li>호스팅 서버에 남는 접속 기록(IP 주소, 브라우저 종류, 접속 일시)</li>
        </ul>
        <p>로그인, 결제, 친구 초대 연결처럼 운영자의 서버에 정보를 저장해야 하는 기능을 열 때는, 새로 처리하는 항목을 도입 전에 이 방침에 추가해 알립니다.</p>
      </LegalSection>

      <LegalSection id="purposes" title="2. 처리 목적">
        <ul className={s.list}>
          <li>입력하신 질문·상황·출생 정보를 바탕으로 타로·사주 풀이를 생성해 보여 드리기</li>
          <li>이용 중인 기기에 풀이 기록을 보관해 다시 볼 수 있게 하기</li>
          <li>오류 확인과 부정 이용 방지 등 서비스를 안정적으로 운영하기</li>
          <li>문의에 답하기</li>
          <li>(결제 도입 시) 결제와 환불 처리, 거래 기록 보관</li>
        </ul>
      </LegalSection>

      <LegalSection id="retention" title="3. 보유 기간과 파기">
        <ul className={s.list}>
          <li>풀이 입력(질문, 상황, 메모, 출생 정보)은 운영자의 서버에 저장하지 않습니다. 풀이를 생성하는 동안에만 쓰고, 생성이 끝나면 바로 파기합니다.</li>
          <li>기기에 저장되는 기록은 이용 중인 브라우저의 저장소에 보관되며, 이용자가 브라우저의 사이트 데이터를 지우면 바로 삭제됩니다. 지금은 탭이나 창을 닫으면 지워지는 세션 저장소를 씁니다.</li>
          <li>접속 기록은 호스팅 사업자의 정책에 따라 일정 기간 보관된 뒤 삭제됩니다.</li>
          <li>결제를 도입하면 「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 계약 또는 청약철회 등에 관한 기록과 대금결제 및 재화 등의 공급에 관한 기록은 5년, 소비자의 불만 또는 분쟁처리에 관한 기록은 3년 동안 보관할 예정입니다.</li>
          <li>보유 기간이 끝나거나 처리 목적을 이룬 정보는 지체 없이 파기하며, 전자 파일은 복구할 수 없는 방법으로 지웁니다.</li>
        </ul>
      </LegalSection>

      <LegalSection id="processors" title="4. 처리 위탁과 국외 이전">
        <p>운영자는 서비스를 제공하기 위해 아래 사업자에게 개인정보 처리를 맡기며, 이 중 일부는 국외로 이전됩니다.</p>
        <div className={s.cards}>
          {PROCESSORS.map((processor) => (
            <section key={processor.name} className={s.card} aria-label={processor.name}>
              <h3 className={s.cardTitle}>{processor.name}</h3>
              <Facts rows={processor.rows} stack />
            </section>
          ))}
        </div>
        <ul className={s.list}>
          <li>이 이전은 이용자가 요청한 서비스를 제공하는 데 필요한 처리 위탁과 보관이며, 「개인정보 보호법」에 따라 이 방침으로 알려 드립니다.</li>
          <li>지금(베타)은 AI 풀이를 열기 전이라 Anthropic으로 정보를 보내지 않습니다.</li>
          <li>AI 사업자로의 국외 이전을 원하지 않으면 AI 풀이를 요청하지 않으시면 됩니다. 이 경우 AI 풀이를 받을 수 없습니다. 호스팅은 서비스 제공에 꼭 필요해, 거부하시면 서비스를 이용할 수 없습니다.</li>
        </ul>
      </LegalSection>

      <LegalSection id="cookies" title="5. 쿠키와 브라우저 저장소">
        <ul className={s.list}>
          <li>운영자는 로그인 유지처럼 서비스 제공에 필요한 범위에서만 쿠키를 쓰며, 광고나 행동 추적을 위한 쿠키는 쓰지 않습니다.</li>
          <li>입력하신 내용과 풀이 기록은 쿠키가 아닌 브라우저 저장소에 보관합니다.</li>
          <li>브라우저 설정에서 쿠키 저장을 거부하거나 저장된 쿠키와 사이트 데이터를 지울 수 있습니다. 거부하시면 로그인 유지 등 일부 기능을 쓰기 어려울 수 있습니다.</li>
        </ul>
      </LegalSection>

      <LegalSection id="rights" title="6. 이용자의 권리와 행사 방법">
        <ul className={s.list}>
          <li>이용자는 언제든지 자신의 개인정보에 대해 열람, 정정, 삭제, 처리정지를 요구할 수 있습니다.</li>
          <li>기기에 저장된 기록은 브라우저의 사이트 데이터 삭제로 직접 지울 수 있습니다.</li>
          <li>운영자가 보관하는 정보에 대한 요구는 아래 개인정보 보호책임자에게 해 주시면 지체 없이 조치합니다. 법정대리인이나 위임을 받은 사람을 통해서도 요구할 수 있습니다.</li>
        </ul>
      </LegalSection>

      <LegalSection id="children" title="7. 만 14세 미만 아동">
        <p>
          {`${nameKo}는 만 14세 이상만 이용할 수 있으며, 만 14세 미만 아동의 개인정보를 받지 않습니다. 만 14세 미만 아동의 정보가 처리된 사실을 알게 되면 바로 파기합니다.`}
        </p>
      </LegalSection>

      <LegalSection id="security" title="8. 안전성 확보 조치">
        <ul className={s.list}>
          <li>모든 통신을 HTTPS로 암호화합니다.</li>
          <li>풀이 입력을 서버에 저장하지 않는 등 꼭 필요한 정보만 처리합니다.</li>
          <li>AI 사업자 API 키 같은 비밀 정보는 코드와 분리해 서버에만 두고, 접근 권한을 운영자로 한정합니다.</li>
          <li>보안 헤더로 다른 사이트에 이 서비스를 몰래 끼워 넣는 공격 등을 막습니다.</li>
        </ul>
      </LegalSection>

      <LegalSection id="officer" title="9. 개인정보 보호책임자">
        <Facts
          rows={[
            ["성명", business.ceo],
            ["직위", "대표"],
            ...contacts,
          ]}
        />
        {contacts.length > 0 ? null : <p className={s.muted}>연락처는 결제가 열리기 전에 이 자리에 안내합니다.</p>}
      </LegalSection>

      <LegalSection id="remedies" title="10. 권익침해 구제 방법">
        <p>개인정보 침해로 도움이 필요하면 아래 기관에 분쟁 해결이나 상담을 신청할 수 있습니다.</p>
        <ul className={s.list}>
          <li>개인정보분쟁조정위원회: 1833-6972 (www.kopico.go.kr)</li>
          <li>개인정보침해신고센터: 국번 없이 118 (privacy.kisa.or.kr)</li>
          <li>대검찰청: 국번 없이 1301 (www.spo.go.kr)</li>
          <li>경찰청: 국번 없이 182 (ecrm.police.go.kr)</li>
        </ul>
      </LegalSection>

      <LegalSection id="changes" title="11. 방침의 변경">
        <p>{`이 방침을 바꿀 때는 시행 7일 전부터 서비스 안에 공지합니다. 이 방침은 ${koreanDate(LEGAL_EFFECTIVE_DATE)}부터 시행합니다.`}</p>
      </LegalSection>
    </LegalPage>
  );
}
