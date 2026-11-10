import type { Metadata } from "next";
import Link from "next/link";
import { BusinessFacts, LegalPage, LegalSection } from "@/components/legal/LegalPage";
import s from "@/components/legal/legal.module.css";
import { SITE } from "@/lib/config";
import { GUIDE_ABOUT_PATH } from "@/lib/guideMeta";
import { appHref, linkHref } from "@/lib/hosts";
import { contactChannels } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";
import { servedOrigin } from "@/lib/servedOrigin";

const TITLE = "문의";
const DESCRIPTION = `${SITE.business.name}가 운영하는 타로·사주 가이드와 ${SITE.nameKo} 앱의 문의처예요. 운영자 정보와 이메일, 전화, 무엇을 적어 보내면 좋은지 적었어요.`;

/** The canonical names the host that served the page (both hosts serve it: lib/hosts.ts GUIDE_HOST_PAGES). */
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({ title: TITLE, description: DESCRIPTION, path: "/contact", origin: await servedOrigin() });
}

/**
 * 문의, on the root domain and the app host alike (AdSense audit 2026-11-06: the root domain's /contact ended at the app's
 * 404). Who runs both sites (SITE.business), how to reach them (contactChannels: only filled channels), and what to put in a
 * message for each kind of question. Nothing about reply times: none has been promised.
 */
export default function ContactPage() {
  const channels = contactChannels();
  return (
    <LegalPage title={TITLE} lead={`가이드 글과 ${SITE.nameKo} 앱에 대한 문의는 아래로 보내 주세요. 두 곳 모두 ${SITE.business.name}가 운영해요.`} host="either">
      <LegalSection id="channels" title="연락처">
        {channels.length ? (
          <ul className={s.list}>
            {channels.map(([label, value]) => (
              <li key={label}>
                {`${label} `}
                <a href={label === "이메일" ? `mailto:${value}` : `tel:${value.replaceAll("-", "")}`}>{value}</a>
              </li>
            ))}
          </ul>
        ) : (
          <p>연락처를 준비하고 있어요.</p>
        )}
      </LegalSection>

      <LegalSection id="what" title="이렇게 적어 주시면 확인이 빨라요">
        <ul className={s.list}>
          <li>가이드 글의 틀린 내용이나 오래된 정보: 글 주소와 어느 문장이 왜 틀렸는지 적어 주세요. 확인해서 고치면 그 글의 마지막 수정 날짜를 바꿔요.</li>
          <li>
            {"개인정보 열람·정정·삭제 요청: "}
            <Link href={linkHref("/privacy", "either")}>개인정보처리방침</Link>
            {"의 권리 행사 방법을 따라 주세요."}
          </li>
          <li>
            {"앱의 결제와 환불: 결제한 날짜와 풀이 종류를 적어 주세요. 환불 기준은 "}
            <Link href={appHref("/refund")} prefetch={false}>
              환불 정책
            </Link>
            {"에 있어요."}
          </li>
        </ul>
        <p>
          {"가이드를 누가 어떻게 쓰고 확인하는지는 "}
          <Link href={linkHref(GUIDE_ABOUT_PATH, "either")}>가이드 소개와 편집 원칙</Link>
          {"에 적어 두었어요."}
        </p>
      </LegalSection>

      <LegalSection id="operator" title="운영자 정보">
        <BusinessFacts />
      </LegalSection>
    </LegalPage>
  );
}
