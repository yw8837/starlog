import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AnalyticsSetting } from "@/components/legal/AnalyticsSetting";
import { Facts, LegalNote, LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { MATCH_AI_ROW, PremiumChangeNotice, PremiumLegalNotice, PremiumPrivacy, PremiumUpcoming } from "@/components/legal/PremiumLegal";
import s from "@/components/legal/legal.module.css";
import { adsConfig } from "@/lib/ads";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";
import { OPENING_LAST_DATE, SITE, openingFreeOn } from "@/lib/config";
import {
  GA_REVISION_DATE,
  OPENING_ACCOUNT_DATE,
  PRIVACY_REVISION_DATE,
  SYNC_REVISION_DATE,
  contactChannels,
  gaRevisionInForce,
  koreanDate,
  premiumChangeNoticeShown,
  premiumLegalInForce,
  privacyEffectiveDate,
  privacyRevisionInForce,
  syncRevisionInForce,
} from "@/lib/legal";
import { sajuPrivacyItem, sajuPrivacySent } from "@/lib/sajuTopicCopy";
import { pageMetadata } from "@/lib/seo";

const { business, nameKo } = SITE;
/** 별자리 인연 (and 이번 주 행운 번호) are disclosed while the feature is live. */
const BONDS = SITE.features.bonds;
/** 주제별 사주: the chosen 운 is named from the `on` build (saju-topics spec §5.4). */
const TOPICS = SITE.features.sajuTopics;
/** Section numbers: 별자리 인연 is section 4 while it is live, and the later sections move down one. */
const num = (base: number) => (BONDS && base >= 4 ? base + 1 : base);

export const metadata: Metadata = pageMetadata({
  title: "개인정보처리방침",
  description: `${nameKo}가 처리하는 개인정보 항목과 목적, 보유 기간, AI 풀이를 위한 국외 이전, 쿠키와 브라우저 저장소, 이용자의 권리와 행사 방법을 안내합니다.`,
  path: "/privacy",
});

/** Rendered per request: the premium clauses come in force at a KST midnight with no deploy (lib/legal.ts). */
export const dynamic = "force-dynamic";

const BIRTH = "생년월일, 양력·음력(윤달 여부), 태어난 시(아는 경우), 성별, 출생 지역";

type Rows = ReadonlyArray<readonly [string, ReactNode]>;
/** `id`: an anchor for the card, where the text links to it. */
type Processor = { name: string; rows: Rows; id?: string };

/**
 * 방문 통계 (Google Analytics), the revision of GA_REVISION_DATE (lib/legal.ts): 개정 예정 until then, in the text from
 * then. The items are what the loader sends (lib/analytics.ts gaPage: page views only, addresses and titles redacted)
 * and what gtag.js adds of the device; the periods are the property's settings.
 */
const GA_COOKIE = `_ga_${GA_MEASUREMENT_ID.replace(/^G-/, "")}`;
const GA_ITEMS = [
  "Google 애널리틱스 쿠키에 담긴 무작위 식별값",
  "방문한 페이지의 주소(공유·초대·기록 번호와 결제 정보는 지우고, 홍보 링크의 utm 꼬리표만 남긴 주소)와 페이지 제목",
  "이전 페이지의 주소(스타로그의 페이지는 같은 방식으로 지운 주소, 다른 사이트는 그 사이트의 도메인만)",
  "기기·브라우저·화면 정보(기기 종류, 운영체제, 브라우저, 화면 크기, 언어)",
  "IP 주소(위치 추정 등에 쓰이고, Google 설명으로는 Google 애널리틱스에 저장되지 않음)",
  "대략적 위치(접속한 IP 주소로 Google이 추정하는 국가·도시 수준)",
  "방문 시각",
  "페이지에 머문 시간",
];

/**
 * 국외 이전 disclosures (개인정보 보호법 제28조의8): recipient, country, items, when and how, purpose, retention, contact.
 * `premium`: the premium clauses are in force (lib/legal.ts), so Anthropic's items name the 궁합's too. `ga`: the GA
 * revision is in force, so Google LLC is listed, on the visitor's consent (제1항 제1호) rather than as needed for the service.
 */
const processors = (premium: boolean, ga: boolean, synced: boolean): readonly Processor[] => [
  {
    name: "Anthropic, PBC",
    rows: [
      ["국가", "미국"],
      ["맡기는 일", `AI 풀이 생성(타로·사주 풀이, 후속 질문의 답, 오늘의 한 장${BONDS ? ", 별자리 인연의 오늘의 인연 카드 한두 줄" : ""})`],
      [
        "이전 항목",
        `타로: 질문, 고른 주제와 상황, 직접 쓰기 칸에 적은 내용, 메모 · 사주: 출생 정보로 계산한 명식과 계산 기준(태어난 해, 양력·음력 구분, 보정한 시각, 대운 시기), ${sajuPrivacySent(TOPICS)} · 공통: 후속 질문과 앞선 풀이, 이 기기에 남은 지난 풀이 요약(최대 3개)${BONDS ? " · 오늘의 인연 카드: 뽑힌 카드의 이름과 방향만(닉네임, 한 줄, 인연 점수, 생년월일은 보내지 않습니다)" : ""}${premium ? ` · ${MATCH_AI_ROW}` : ""}`,
      ],
      ["이전 시기와 방법", "풀이를 요청할 때마다 암호화된 연결(TLS)로 API에 전송"],
      [
        "보유·이용 기간",
        "Anthropic은 API로 받은 입력과 출력을 30일 안에 자동으로 삭제합니다. 이용 정책 위반을 확인해야 하는 경우 등에는 더 오래(최대 2년) 보관할 수 있고, 기본적으로 모델 학습에 쓰지 않습니다.",
      ],
      ["개인정보 문의", <a href="https://www.anthropic.com/legal/privacy">anthropic.com/legal/privacy</a>],
    ],
  },
  {
    name: "Cloudflare, Inc.",
    rows: [
      ["국가", "미국"],
      [
        "맡기는 일",
        `서비스 호스팅과 전송, 하루 이용 횟수와 오늘의 한 장의 임시 저장, 접속 기록 보관, 회원·결제 기록과 ${synced ? SYNC_KEPT : KEPT}의 저장(D1)${BONDS ? ", 별자리 인연 정보의 저장(Cloudflare D1 데이터베이스)" : ""}`,
      ],
      [
        "이전 항목",
        `서비스를 이용하며 주고받는 정보, 쿠키, 접속 기록(IP 주소, 브라우저 정보, 접속 일시, 요청한 페이지), 아래 3항의 임시 기록, 회원 정보(카카오 회원번호나 Google 계정 식별값을 바꾼 값, 닉네임)와 결제 기록, ${synced ? SYNC_KEPT : KEPT}(암호화)${BONDS ? ", 별자리 인연의 닉네임·한 줄·고른 카드·인연 점수와 궁합 기준값(아래 4항)" : ""}`,
      ],
      ["이전 시기와 방법", "서비스에 접속할 때마다 암호화된 연결(HTTPS)로 전송"],
      [
        "보유·이용 기간",
        `접속 기록은 최대 7일, 임시 기록은 아래 3항의 기간 동안 보관한 뒤 자동 삭제. 회원·결제 기록과 계정에 보관한 풀이는 아래 3항의 기간 동안 보관${BONDS ? ". 별자리 인연 정보는 아래 3항과 4항의 기간 동안 보관" : ""}`,
      ],
      ["개인정보 문의", <a href="https://www.cloudflare.com/privacypolicy/">cloudflare.com/privacypolicy</a>],
    ],
  },
  {
    name: "토스페이먼츠 주식회사",
    rows: [
      ["국가", "대한민국"],
      ["맡기는 일", "결제 처리(카드·간편결제 승인과 취소)"],
      ["처리 항목", "결제와 환불에 필요한 결제 정보"],
      ["보유·이용 기간", "관련 법령과 해당 사업자의 정책에 따름"],
    ],
  },
  ...(ga
    ? [
        {
          name: "Google LLC",
          id: "google-transfer",
          rows: [
            ["국가", "미국"],
            ["이전 목적", "이용 통계 분석(방문 통계를 허용한 경우에만)"],
            ["이전 항목", GA_ITEMS.join(" · ")],
            ["이전 시기와 방법", "방문 통계를 허용한 뒤 페이지를 열고 머무는 동안 암호화된 연결(HTTPS)로 전송"],
            [
              "보유·이용 기간",
              "이벤트 데이터 2개월, 사용자 데이터 14개월(그 사이 새 방문이 있으면 그때부터 다시 계산) 동안 보관한 뒤 자동으로 지웁니다. 합계 보고서는 이 기간과 관계없이 남을 수 있습니다. 방문 통계 쿠키는 마지막 방문부터 최대 2년 동안 남습니다.",
            ],
            ["이전 근거", "정보주체의 동의(「개인정보 보호법」 제28조의8 제1항 제1호)"],
            [
              "거부 방법과 거부 시 불이익",
              `처음 방문할 때 나오는 안내나 이 방침 ${num(5)}항의 방문 통계 설정에서 거부하거나 동의를 철회할 수 있으며, 거부해도 서비스 이용에 제한이 없습니다.`,
            ],
            ["개인정보 문의", <a href="https://policies.google.com/privacy">policies.google.com/privacy</a>],
          ] as Rows,
        },
      ]
    : []),
];

/** Cookies the server sets: all HttpOnly, SameSite=Lax, Secure in production, signed so they cannot be forged. */
const COOKIES: Rows = [
  ["sl_q", "오늘 연 첫 풀이와 후속 질문의 횟수를 세어 하루 무료 횟수를 지키는 데 씁니다. 2일 뒤 만료됩니다."],
  ["sl_first", `이 기기에서 오픈 기념 무료(${OPENING_LAST_DATE}까지, 로그인한 계정마다 타로 전체 풀이 1회)를 받았는지 기록해, 같은 기기에서는 계정을 바꿔도 한 번만 드리는 데 씁니다. 1년 뒤 만료됩니다.`],
  ["sl_daily", "오늘의 한 장에 쓰는 무작위 기기 식별값과 날짜, 그날의 카드를 담습니다. 2일 뒤 만료됩니다."],
  ["sl_owner", "운영자 본인 확인용으로, 운영자의 기기에만 만들어집니다. 1년 뒤 만료됩니다."],
  ["sl_sid", "로그인 세션을 알아보는 값입니다. 30일 뒤 만료되고, 로그아웃하면 바로 끝납니다."],
  ["sl_oauth", "카카오·Google 로그인이 이 브라우저에서 시작됐는지 확인하는 값입니다. 10분 뒤 만료됩니다."],
  ...(BONDS
    ? ([
        ["sl_uid", "별자리 인연에서 계정에 연결하지 않고 이 기기에서 만든 별자리 주인을 알아보는 무작위 식별값입니다. 1년 뒤 만료됩니다."],
        ["sl_fid", "친구로 참여한 기기를 알아보는 무작위 식별값으로, 같은 별자리 한 회차에 한 번만 참여하게 합니다. 저장소에는 이 값의 해시만 남습니다. 1년 뒤 만료됩니다."],
      ] as const)
    : []),
];

/**
 * Account sync, the revision of SYNC_REVISION_DATE (lib/legal.ts): until then the account keeps the readings opened while
 * logged in with a payment (KEPT); from then every reading opened while logged in and every reading its user moved in from
 * a device (SYNC_KEPT, lib/readings/store.ts origin), shown as 개정 예정 until then (SYNC_UPCOMING).
 */
const KEPT = "로그인해 결제하고 연 풀이";
const SYNC_KEPT = "계정에 보관한 풀이";
const SYNC_UPCOMING = [
  "로그인한 상태로 연 풀이는 무엇으로 열었든(오픈 기념 무료 포함) 질문·상황·메모나 출생 정보, 풀이 결과, 이어서 물어본 내용과 함께 암호화해 계정에 보관하고, 같은 계정으로 로그인한 다른 기기의 내 기록에서도 보여 드립니다.",
  "이 기기에만 보관된 풀이는 이용자가 내 기록이나 내 정보에서 옮길 풀이를 골라 옮기기를 누른 경우에만, 고른 풀이를 같은 방식으로 계정에 보관합니다. 운영자의 서버가 만든 풀이인지 확인할 수 있는 것만 옮기고, 고르지 않았거나 확인할 수 없는 기록은 이 기기에만 남습니다.",
  "계정에 보관한 풀이는 지금처럼 내 정보에서 지우거나 탈퇴하면 지체 없이 파기합니다.",
];

/** The revision of PRIVACY_REVISION_DATE (lib/legal.ts): shown as 개정 예정 until then, in the text from then. */
const SHARE_EXPIRY = "풀이의 공유 사본과 링크는 공유한 날부터 180일이 지나면 자동으로 지웁니다.";
const FOLLOW_UP_COUNT_KEPT = "풀이 하나에 남은 후속 질문 수는 무작위 풀이 번호로 일반 풀이는 8일, 프리미엄 풀이는 31일 동안 보관한 뒤 자동으로 지웁니다.";

export default function PrivacyPage() {
  const contacts = contactChannels();
  const ads = adsConfig();
  const now = Date.now();
  const inForce = premiumLegalInForce(now);
  const revised = privacyRevisionInForce(now);
  const ga = gaRevisionInForce(now);
  const synced = syncRevisionInForce(now);
  const effective = privacyEffectiveDate(now);

  return (
    <LegalPage
      title="개인정보처리방침"
      effective={effective}
      host="either"
      lead={`${business.name}(이하 “운영자”)는 ${nameKo} 이용자의 개인정보를 「개인정보 보호법」 등 관련 법령에 따라 처리하고 보호합니다. 어떤 정보를 왜 처리하고, 얼마나 보관하며, 누구에게 맡기는지 알려 드립니다.`}
    >
      {inForce ? null : <PremiumLegalNotice />}
      {premiumChangeNoticeShown(now) ? <PremiumChangeNotice /> : null}
      {/* 오픈 기념 무료 per account (owner 2026-10-27): in force from this deploy, said on top while it runs (lib/legal.ts). */}
      {openingFreeOn(now) ? (
        <aside className={s.note} aria-labelledby="opening-privacy-title">
          <h2 id="opening-privacy-title" className={s.noteTitle}>{`${koreanDate(OPENING_ACCOUNT_DATE)} 바뀐 내용`}</h2>
          <p>오픈 기념 무료를 계정마다 한 번 드리기 위해 받은 여부와 시각을 보관해요. 탈퇴하면 함께 지워요.</p>
        </aside>
      ) : null}
      {revised ? null : (
        <LegalNote>
          <p className={s.noteTitle}>{`개정 예정 · ${koreanDate(PRIVACY_REVISION_DATE)}부터 시행`}</p>
          <ul className={s.list}>
            <li>{SHARE_EXPIRY}</li>
            <li>{FOLLOW_UP_COUNT_KEPT}</li>
          </ul>
        </LegalNote>
      )}
      {/* The footer's 방문 통계 설정 lands here (#analytics) until the setting exists. */}
      {ga ? null : (
        <div id="analytics" className={s.analytics}>
          <LegalNote>
            <p className={s.noteTitle}>{`개정 예정 · ${koreanDate(GA_REVISION_DATE)}부터 시행`}</p>
            <ul className={s.list}>
              <li>
                방문 통계: 허용한 분에 한해 Google 애널리틱스로 방문한 페이지(공유·초대·기록 번호는 가림)와 이전 페이지, 기기·브라우저·화면 정보, IP
                주소(위치 추정 등에 쓰임), 대략적 위치, 방문 시각, 페이지에 머문 시간을 모아 이용 통계를 분석하고, 이를 위해 Google LLC(미국)로 국외
                이전합니다.
              </li>
              <li>보유 기간: 이벤트 데이터 2개월, 사용자 데이터 14개월(새 방문이 있으면 그때부터 다시 계산), 방문 통계 쿠키는 마지막 방문부터 최대 2년.</li>
              <li>{`처음 방문할 때 허용할지 여쭤보고, 거부해도 서비스 이용에 제한이 없으며, ${koreanDate(GA_REVISION_DATE)}부터 이 방침의 방문 통계 설정에서 언제든 바꿀 수 있습니다.`}</li>
            </ul>
          </LegalNote>
        </div>
      )}
      {synced ? null : (
        <LegalNote>
          <p className={s.noteTitle}>{`개정 예정 · ${koreanDate(SYNC_REVISION_DATE)}부터 시행`}</p>
          <ul className={s.list}>
            {SYNC_UPCOMING.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </LegalNote>
      )}
      <LegalNote>
        <p className={s.noteTitle}>한눈에 보기</p>
        <p>
          {`로그인하지 않으면 이름이나 연락처를 받지 않고, 풀이에 쓰는 질문과 출생 정보는 풀이를 만드는 동안에만 운영자의 서버를 거쳐 AI 사업자에게 전달될 뿐 서버에 남기지 않습니다. ${
            synced ? "카카오나 Google로 로그인한 상태로 연 풀이와, 이 기기에만 보관된 풀이 가운데 직접 골라 계정으로 옮긴 풀이는" : `카카오나 Google로 ${KEPT}는`
          } 질문·출생 정보와 함께 암호화해 운영자의 저장소(Cloudflare D1)에 보관하고, 내 정보에서 지우거나 탈퇴하면 파기합니다. 회원 정보로는 카카오 회원번호나 Google 계정 식별값을 되돌릴 수 없게 바꾼 값과 닉네임만 둡니다.`}
        </p>
        {BONDS ? (
          <p>
            별자리 인연을 쓰면 친구와 나누는 정보(닉네임, 한 줄, 고른 카드, 인연 점수)만 운영자의 저장소(Cloudflare D1)에 저장합니다. 생년월일은 점수를
            계산하는 데만 쓰고 저장하지 않습니다.
          </p>
        ) : null}
      </LegalNote>

      <LegalSection id="items" title="1. 처리하는 개인정보 항목">
        <h3 className={s.sub}>타로 풀이를 볼 때</h3>
        <ul className={s.list}>
          <li>질문, 고른 주제와 상황, 직접 쓰기 칸에 적은 내용(누구·무엇·언제), 메모(적은 경우)</li>
        </ul>
        <h3 className={s.sub}>사주 풀이를 볼 때</h3>
        <ul className={s.list}>
          <li>{BIRTH}</li>
          <li>{sajuPrivacyItem(TOPICS)}</li>
          <li>태어난 시는 모르면 입력하지 않아도 되고, 성별은 대운의 방향을 계산하는 데만 씁니다.</li>
        </ul>
        <h3 className={s.sub}>후속 질문과 지난 풀이</h3>
        <ul className={s.list}>
          <li>후속 질문(이어서 물어보기)에 적은 내용</li>
          <li>이 기기에 남은 지난 풀이의 요약 최대 3개(날짜, 질문, 한 줄 결론, 확인해 볼 신호, 돌아보기 답). 새 풀이가 앞선 풀이와 어긋나지 않게 참고합니다.</li>
        </ul>
        <h3 className={s.sub}>회원(카카오·Google 로그인)</h3>
        <ul className={s.list}>
          <li>카카오 회원번호: 되돌릴 수 없는 값(HMAC)으로 바꿔서만 저장하며, 카카오의 접근 토큰은 저장하지 않습니다</li>
          <li>Google 계정 식별값(Google로 로그인한 경우): 되돌릴 수 없는 값(HMAC)으로 바꿔서만 저장하며, Google의 토큰은 저장하지 않습니다. Google에서는 이 식별값만 받고 이름, 이메일, 프로필 사진은 받지 않습니다</li>
          <li>닉네임(카카오 동의 항목. Google로 로그인한 경우 ‘별손님’), 만 14세 이상 확인 시각, 로그인 세션</li>
          <li>{`오픈 기념 무료를 받았는지와 받은 시각(${OPENING_LAST_DATE}까지 진행하는 오픈 기념 무료를 계정마다 한 번만 드리기 위해)`}</li>
          <li>결제 기록: 주문번호, 상품, 금액, 결제수단 종류, 승인·취소 시각과 영수증 링크. 카드번호 등 결제 정보는 토스페이먼츠가 처리하며 운영자는 받지 않습니다</li>
          {synced ? (
            <li>
              로그인한 상태로 연 풀이(오픈 기념 무료 포함)와 이 기기에만 보관된 풀이 가운데 골라 계정으로 옮긴 풀이: 질문, 상황, 메모 또는 출생 정보와 풀이 결과, 이어서 물어본 내용.
              암호화해서 저장합니다. 계정으로 옮기기는 이용자가 옮길 풀이를 골라 옮기기를 누른 경우에만 하고, 운영자의 서버가 만든 풀이인지 확인할 수 있는 것만 옮깁니다
            </li>
          ) : (
            <li>로그인해 결제하고 연 풀이: 질문, 상황, 메모 또는 출생 정보와 풀이 결과, 이어서 물어본 내용. 암호화해서 저장합니다</li>
          )}
          <li>수집 출처: 카카오(카카오 로그인 시 회원번호와 닉네임), Google(Google 로그인 시 계정 식별값)</li>
        </ul>
        <h3 className={s.sub}>풀이 후기를 남길 때</h3>
        <ul className={s.list}>
          <li>별점, 한 줄 후기(쓴 경우), 닉네임의 첫 글자와 끝 글자만 남긴 표시, 후기를 단 풀이의 상품과 주제, 도움돼요와 신고 기록</li>
        </ul>
        <h3 className={s.sub}>풀이를 공유할 때</h3>
        <ul className={s.list}>
          <li>공유 링크를 만들면 풀이의 공개용 사본(뽑은 카드와 풀이 본문)을 저장합니다. 질문, 직접 쓴 말과 메모, 고른 상황, 생년월일과 태어난 시각, 명식, 이어서 물어본 내용은 넣지 않고, 풀이 본문에 옮겨진 직접 쓴 말과 고른 상황, 생년월일·태어난 시각·나이는 가리며, 연락처나 링크가 들어간 문장은 빼고 저장합니다. 로그인한 상태로 만든 공유에는 계정을 함께 기록합니다.</li>
          <li>무료로 본 첫 풀이(타로와 사주의 맛보기)를 공유하면 뽑은 카드와 화면에 무료로 보인 부분만 위와 같이 가려 저장하고, 결제해야 보이는 부분은 넣지 않습니다. 프리미엄 풀이를 공유하면 상품 이름과 공유 이미지에 들어가는 것(카드, 관계, 한 해의 제목)만 저장하고 풀이 본문은 넣지 않습니다.</li>
          <li>지금의 한 장을 공유하면 뽑은 카드와 방향, 카드가 건넨 문장과 그 이유만 저장합니다. 적은 고민은 보내지 않으며, 같은 카드의 같은 문장은 누가 공유해도 같은 링크라 계정도 기록하지 않습니다.</li>
        </ul>
        {/* 프리미엄 풀이와 궁합의 상대방 정보: 개정 예정 until it comes in force (lib/legal.ts), then part of the text. */}
        {inForce ? (
          <PremiumPrivacy />
        ) : (
          <PremiumUpcoming>
            <PremiumPrivacy />
            <p>{`국외 이전(Anthropic, PBC)의 이전 항목에 더해지는 것 · ${MATCH_AI_ROW}`}</p>
          </PremiumUpcoming>
        )}
        <h3 className={s.sub}>서비스를 이용하는 동안 자동으로 생기는 정보</h3>
        <ul className={s.list}>
          <li>이용 중인 기기의 브라우저 저장소에 보관되는 입력 내용과 풀이 기록</li>
          <li>{`쿠키(아래 ${num(5)}항)와, 오늘의 한 장에 쓰는 무작위 기기 식별값`}</li>
          <li>하루 이용 횟수를 세기 위해 접속한 네트워크의 IP 주소를 비밀 키로 변환한 값(IP 주소 원문은 저장하지 않습니다)</li>
          <li>호스팅 서버에 남는 접속 기록(IP 주소, 브라우저 정보, 접속 일시, 요청한 페이지)</li>
        </ul>
        {ga ? (
          <>
            <h3 className={s.sub}>방문 통계(허용한 경우에만)</h3>
            <ul className={s.list}>
              {GA_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
              <li>{`방문 통계를 허용한 뒤 페이지를 열고 머무는 동안 Google 애널리틱스가 수집합니다(아래 ${num(5)}항).`}</li>
            </ul>
          </>
        ) : null}
        {BONDS ? (
          <>
            <h3 className={s.sub}>별자리 인연을 쓸 때</h3>
            <ul className={s.list}>
              <li>별자리 주인: 닉네임, 랭킹에 이름을 올릴지 여부, 생년월일로 계산한 궁합 기준값(일간, 띠, 일지, 오행 개수), 채우는 별자리와 완성한 별자리, 초대코드</li>
              <li>별이 된 친구: 닉네임, 한 줄(남긴 경우), 고른 카드, 인연 점수와 점수 근거, 같은 기기의 중복 참여를 막는 기기 식별값의 해시, 같은 사람이 같은 닉네임으로 한 별자리에 두 번 들어오지 않게 하는 궁합 기준값의 해시(별자리마다 다른 값)</li>
              <li>주인이 지운 별: 그 별자리에 같은 기기로 다시 들어오지 않게 하는 기기 식별값의 해시</li>
              <li>주인과 친구 모두 생년월일은 점수를 계산하는 데만 쓰고 저장하지 않습니다. 태어난 시간은 받지 않습니다.</li>
              <li>별자리 주인 정보는 로그인한 계정에 연결해 보관합니다. 새 별자리는 만들 때 로그인한 계정에 연결하고, 계정 없이 이 기기에서 만들었던 별자리는 이용자가 연결하기를 누른 경우에만 계정에 연결합니다.</li>
            </ul>
            <h3 className={s.sub}>이번 주 행운 번호를 볼 때</h3>
            <ul className={s.list}>
              <li>생년월일(번호를 고르는 데만 쓰고 저장하지 않습니다)</li>
            </ul>
          </>
        ) : null}
      </LegalSection>

      <LegalSection id="purposes" title="2. 처리 목적">
        <ul className={s.list}>
          <li>입력하신 질문·상황·출생 정보를 바탕으로 타로·사주 풀이를 생성해 보여 드리기</li>
          <li>이용 중인 기기에 풀이 기록을 보관해 다시 볼 수 있게 하기</li>
          {BONDS ? <li>별자리 인연: 친구 초대와 참여, 인연 점수 계산, 별자리 도감과 랭킹, 공유 이미지 만들기, 이번 주 행운 번호 고르기</li> : null}
          <li>하루 무료 이용 횟수를 지키고, 자동화된 대량 요청 같은 부정 이용을 막기</li>
          <li>오류 확인 등 서비스를 안정적으로 운영하기</li>
          {ga ? <li>이용 통계 분석: 어떤 화면을 많이 보고 어디서 들어오는지 알아보고 서비스를 고치기(방문 통계를 허용한 경우에만)</li> : null}
          <li>문의에 답하기</li>
          <li>회원 관리(로그인, 탈퇴), 결제와 환불 처리, 거래 기록 보관</li>
          <li>오픈 기념 무료를 계정마다 한 번만 드리기</li>
          <li>이미 지급한 가입 선물의 지급 기록 관리(가입 선물은 더 이상 드리지 않습니다)</li>
          <li>{synced ? "로그인한 상태로 연 풀이와 계정으로 옮긴 풀이를 다른 기기에서 보여 주기" : `${KEPT}를 다른 기기에서 보여 주기`}</li>
          <li>풀이 후기를 보여 주고, 운영 원칙(욕설·개인정보·광고·관계없는 글 금지)에 맞게 관리하기</li>
          <li>이용자가 만든 공유 링크로 풀이를 다른 사람에게 보여 주기</li>
        </ul>
      </LegalSection>

      <LegalSection id="retention" title="3. 보유 기간과 파기">
        <ul className={s.list}>
          <li>
            {`로그인하지 않고 연 풀이의 입력(질문, 상황, 메모, 출생 정보, 후속 질문, 지난 풀이 요약)은 운영자의 서버에 저장하지 않습니다. 풀이를 생성하는 동안에만 쓰고, 생성이 끝나면 바로 파기합니다.${
              synced ? " 다만 로그인한 뒤 이용자가 그 풀이를 골라 계정으로 옮기면 다음 항목과 같이 보관합니다." : ""
            }`}
          </li>
          <li>{`${synced ? "로그인한 상태로 연 풀이와 계정으로 옮긴 풀이" : KEPT}는 계정에 암호화해 보관하고, 이용자가 내 정보에서 지우거나 탈퇴하면 지체 없이 파기합니다.`}</li>
          <li>오늘의 한 장은 무작위 기기 식별값과 날짜로 묶어 호스팅 사업자의 저장소에 36시간 보관한 뒤 자동으로 지웁니다. 같은 날 다시 열 때 같은 쪽지를 보여 드리기 위해서이며, 입력하신 정보는 들어 있지 않습니다.</li>
          <li>
            {revised
              ? `하루 이용 횟수(IP 주소를 변환한 값별 횟수)는 36시간 동안 보관한 뒤 자동으로 지웁니다. ${FOLLOW_UP_COUNT_KEPT}`
              : "하루 이용 횟수(IP 주소를 변환한 값별 횟수)는 36시간, 풀이 하나에 남은 후속 질문 수는 무작위 풀이 번호로 8일 동안 보관한 뒤 자동으로 지웁니다."}
          </li>
          <li>기기에 저장되는 기록(내 기록, 사주 입력 정보, 사주 맛보기, 오늘의 한 장, 하루 이용 표시)은 브라우저의 로컬 저장소에 남습니다. 사주 맛보기는 이 기기의 로컬 저장소에 저장되고, 30일이 지난 것은 다음에 스타로그를 열 때 지워집니다. 내 정보에서 기록이나 사주 정보를 지우거나 브라우저의 사이트 데이터를 지우면 바로 삭제됩니다. 진행 중인 질문과 타로 첫 풀이는 탭을 닫으면 지워지는 세션 저장소에 둡니다.</li>
          {BONDS ? (
            <li>
              별자리 인연 정보는 Cloudflare D1에 저장합니다. 별자리를 새로 채우거나 바꾸면 이전 별은 삭제하고, 주인이 별을 지우면 그 별도 바로 삭제합니다. 지운 별의
              기기 식별값 해시는 그 별자리가 지워질 때 함께 삭제합니다.
              나머지는 별자리 주인이 삭제를 요청할 때까지 보관하며, 요청하시면 그 주인의 별자리와 별을 전부 지체 없이 삭제합니다. 계정에 연결된 별자리 주인 정보는
              회원 탈퇴 때 그 주인의 별자리, 별, 초대코드와 함께 바로 삭제하고, 계정에 별자리가 둘일 때 하나를 남기기로 고르면 남기지 않은 쪽도 바로 삭제합니다. 오늘의 인연 카드의 한두
              줄은 같은 날 다시 보여 드리기 위해 36시간 보관한 뒤 자동으로 지웁니다.
            </li>
          ) : null}
          <li>풀이 후기는 작성자가 지우거나 탈퇴할 때까지 보관하고, 탈퇴하면 그 계정의 후기와 도움돼요·신고 기록을 지체 없이 파기합니다. 후기는 누구나 볼 수 있으며, 공개되는 것은 별점, 한 줄 후기, 상품과 주제, 가린 닉네임입니다.</li>
          <li>
            {`풀이의 공유 사본은 그 풀이에서 공유 그만하기를 누르거나, 공유한 기기에서 그 풀이를 지우거나, 로그인한 상태로 공유했다면 회원 탈퇴할 때까지 보관하고, 그때 바로 지웁니다. ${revised ? "그 전이라도 공유한 날부터 180일이 지나면 링크와 함께 자동으로 지웁니다. " : ""}링크를 아는 사람은 누구나 볼 수 있지만 검색에는 나오지 않게 합니다.`}
          </li>
          <li>호스팅 서버의 접속 기록은 최대 7일 동안 보관된 뒤 자동으로 삭제됩니다.</li>
          {ga ? (
            <li>
              Google 애널리틱스의 방문 통계 중 이벤트 데이터는 2개월, 사용자 데이터는 14개월(그 사이 새 방문이 있으면 그때부터 다시 계산) 동안 보관한 뒤
              Google이 자동으로 지웁니다. 이 기간은 방문자별·방문별 기록에 적용되고, 페이지별 방문 수 같은 합계 보고서는 이 기간과 관계없이 남을 수
              있습니다. 방문 통계 쿠키는 브라우저에 마지막 방문부터 최대 2년 동안 남습니다. 거부하면 그때 지웁니다.
            </li>
          ) : null}
          <li>회원 정보는 탈퇴할 때까지 보관하고, 탈퇴하면 지체 없이 파기합니다. 로그인 세션은 30일 뒤 끝나고, 끝난 세션 기록은 지웁니다.</li>
          <li>「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 계약 또는 청약철회 등에 관한 기록과 대금결제 및 재화 등의 공급에 관한 기록은 5년, 소비자의 불만 또는 분쟁처리에 관한 기록은 3년 동안 보관합니다. 탈퇴한 회원의 이 기록은 회원 식별 정보(카카오 회원번호나 Google 계정 식별값을 바꾼 값, 닉네임)를 지운 채 보관하고, 기간이 끝나면 파기합니다.</li>
          <li>가입 선물은 더 이상 드리지 않습니다. 이미 지급한 가입 선물의 지급 기록(카카오 회원번호나 Google 계정 식별값을 되돌릴 수 없게 바꾼 값과 지급 시각)은 탈퇴 뒤 1년 동안 보관한 뒤 파기합니다.</li>
          <li>보유 기간이 끝나거나 처리 목적을 이룬 정보는 지체 없이 파기하며, 전자 파일은 복구할 수 없는 방법으로 지웁니다.</li>
          <li>
            회원·결제 기록과 계정에 보관한 풀이를 담는 데이터베이스(Cloudflare D1)는 장애에 대비해 지난 30일 안의 상태로 되돌릴 수 있는 복구
            기록(Time Travel)을 자동으로 남깁니다. 그래서 내 정보에서 지우거나 탈퇴해 파기한 정보도 이 복구 기록에는 최대 30일 동안 남아 있다가 사라집니다.
          </li>
        </ul>
      </LegalSection>

      {BONDS ? (
        <LegalSection id="bonds" title="4. 별자리 인연의 공개 범위">
          <ul className={s.list}>
            <li>별자리 랭킹에는 별자리를 완성한 주인의 닉네임, 별자리, 인연 점수 합계, 완성 날짜만 공개합니다. 친구의 닉네임과 점수는 랭킹에 나오지 않습니다.</li>
            <li>랭킹 공개는 기본으로 켜져 있고, 별자리 인연 화면의 설정에서 언제든 끌 수 있습니다. 끄면 랭킹에서 빠지고 비공개라는 표시도 남지 않습니다.</li>
            <li>완성한 별자리의 공유 이미지에는 별이 된 친구들의 닉네임, 별자리, 인연 점수 합계, 주인의 닉네임, 완성 날짜가 들어갑니다.</li>
            <li>주인은 채우는 중인 별자리도 공유 링크로 공유할 수 있습니다. 참여 화면에서 점수가 보인다고 알린 뒤 들어온 친구의 닉네임과 인연 점수, 그리고 점수의 합계와 평균은 주인이 만든 공유 링크와 그 미리보기에 보입니다. 다만 그 안내 전에 들어온 친구가 있거나 있었던 별자리는, 그 친구의 별을 지우거나 별자리를 완성한 뒤에도, 공유 링크와 미리보기에 친구별 점수와 합계·평균을 넣지 않고 닉네임과 채운 별 수만 보여 줍니다. 이런 별자리에 참여하는 친구에게는 점수가 보이지 않는다고 알립니다. 친구의 한 줄과 생년월일은 넣지 않습니다.</li>
            <li>공유 링크의 페이지는 열 때마다 지금의 별자리를 보여 주므로 지운 별은 페이지에서 사라집니다. 하지만 이미 보낸 카카오톡 메시지나 링크 미리보기에 담긴 닉네임과 점수는 회수할 수 없습니다. 미리보기 이미지는 최대 1시간 동안 예전 내용으로 보일 수 있고, 카카오톡처럼 미리보기를 따로 저장하는 앱에서는 그보다 오래 남을 수 있습니다.</li>
            <li>친구가 남긴 한 줄은 그 별자리의 주인에게만 보이고, 각 별의 점수는 위의 기준에 맞는 별자리에서만 주인의 공유에 보입니다. 친구가 자기 결과를 직접 공유하면, 그 링크에는 친구의 닉네임과 인연 카드, 인연 점수, 별자리 주인의 닉네임이 보이고, 점수 근거는 넣지 않습니다.</li>
            <li>별자리 주인은 자기 별자리의 별을 직접 지울 수 있습니다. 친구로 참여한 분은 아래 개인정보 보호책임자에게 요청해 자신의 별을 지울 수 있습니다.</li>
          </ul>
        </LegalSection>
      ) : null}

      <LegalSection id="processors" title={`${num(4)}. 처리 위탁과 국외 이전`}>
        <p>{`운영자는 서비스를 제공하${ga ? "고, 허용한 분의 방문 통계를 분석하" : ""}기 위해 아래 사업자에게 개인정보 처리를 맡기며, 이 중 일부는 「개인정보 보호법」 제28조의8에 따라 국외로 이전됩니다.`}</p>
        <div className={s.cards}>
          {processors(inForce, ga, synced).map((processor) => (
            <section key={processor.name} id={processor.id} className={s.card} aria-label={processor.name}>
              <h3 className={s.cardTitle}>{processor.name}</h3>
              <Facts rows={processor.rows} stack />
            </section>
          ))}
        </div>
        <ul className={s.list}>
          <li>
            {ga
              ? "Anthropic과 Cloudflare로의 이전은 이용자가 요청한 풀이를 만들고 서비스를 제공하는 데 필요한 처리 위탁과 보관이며, 「개인정보 보호법」에 따라 이 방침으로 알려 드립니다. Google LLC로의 이전은 방문 통계를 허용한 분의 동의에 따른 것으로, 허용한 경우에만 이뤄집니다."
              : "이 이전은 이용자가 요청한 풀이를 만들고 서비스를 제공하는 데 필요한 처리 위탁과 보관이며, 「개인정보 보호법」에 따라 이 방침으로 알려 드립니다."}
          </li>
          <li>무료 풀이를 요청하면 자동화된 접근을 막기 위해 Cloudflare Turnstile이 브라우저 신호(브라우저·기기 정보와 IP 주소)로 사람이 보낸 요청인지 확인할 수 있습니다.</li>
          <li>AI 사업자로의 국외 이전을 원하지 않으면 AI 풀이를 요청하지 않으시면 됩니다. 이 경우 AI 풀이를 받을 수 없고, AI를 거치지 않는 지금의 한 장은 계속 쓸 수 있습니다. 호스팅은 서비스 제공에 꼭 필요해, 거부하시면 서비스를 이용할 수 없습니다.</li>
        </ul>
      </LegalSection>

      <LegalSection id="cookies" title={`${num(5)}. 쿠키와 브라우저 저장소`}>
        <ul className={s.list}>
          {ga ? (
            <li>
              {`운영자는 서비스 제공에 필요한 범위에서 아래 쿠키를 쓰고, 방문 통계를 허용한 경우에만 아래 방문 통계 쿠키를 씁니다. ${ads ? "가이드 글 페이지에서는 아래 광고 쿠키가 쓰일 수 있습니다. 타로·사주 풀이 화면에는 광고를 싣지 않습니다." : "광고 쿠키는 쓰지 않습니다."}`}
            </li>
          ) : ads ? (
            <li>운영자는 서비스 제공에 필요한 범위에서 아래 쿠키를 쓰고, 가이드 글 페이지에서는 아래 광고 쿠키가 쓰일 수 있습니다. 타로·사주 풀이 화면에는 광고를 싣지 않습니다.</li>
          ) : (
            <li>운영자는 서비스 제공에 필요한 범위에서만 아래 쿠키를 쓰며, 광고나 행동 추적을 위한 쿠키는 쓰지 않습니다.</li>
          )}
          <li>운영자의 쿠키는 스크립트가 읽을 수 없게(HttpOnly) 만들고, 위조되지 않도록 서명합니다.</li>
        </ul>
        <Facts rows={COOKIES} stack />
        <ul className={s.list}>
          <li>입력하신 내용과 풀이 기록은 쿠키가 아닌 브라우저 저장소에 보관합니다.</li>
          {BONDS ? <li>별자리 인연과 행운 번호의 표시용 정보(내 태양 별자리, 새 별을 마지막으로 본 시각, 이번 주 번호)도 브라우저 저장소에 둡니다. 생년월일은 두지 않습니다.</li> : null}
          <li>브라우저 설정에서 쿠키 저장을 거부하거나 저장된 쿠키와 사이트 데이터를 지울 수 있습니다. 거부하시면 하루 이용 횟수가 맞게 표시되지 않거나 오늘의 한 장을 다시 열 수 없는 등 일부 기능을 쓰기 어려울 수 있습니다.</li>
        </ul>
        <h3 className={s.sub}>카카오톡 공유</h3>
        <ul className={s.list}>
          <li>카카오톡으로 보내기를 누를 때만 카카오의 공유 스크립트를 불러옵니다. 이때 카카오에는 공유할 문구(뽑은 카드 이름 등)와 서비스 링크가 전달되고, 카카오의 개인정보처리방침이 적용됩니다.</li>
          <li>공유에는 질문, 메모, 출생 정보를 담지 않습니다.</li>
        </ul>
        {ga ? (
          <div id="analytics" className={s.analytics}>
            <h3 className={s.sub}>방문 통계 쿠키(허용한 경우에만)</h3>
            <ul className={s.list}>
              <li>
                방문 통계 정보는 Google LLC(미국)로 국외 이전됩니다. 이전 항목과 보유 기간은{" "}
                <a href="#google-transfer">{`${num(4)}항 처리 위탁과 국외 이전의 Google LLC 안내`}</a>에 있습니다.
              </li>
              <li>
                방문 통계를 허용한 경우에만 Google 애널리틱스를 불러오고, 그때 Google 애널리틱스가 아래 쿠키를 만듭니다. 쿠키는 앱(starlog.yeolmaeapps.kr)과
                가이드(yeolmaeapps.kr)가 함께 쓰는 도메인(.yeolmaeapps.kr)에 저장됩니다.
              </li>
            </ul>
            <Facts
              rows={[
                ["_ga", "이 브라우저를 다른 방문자와 구별하는 무작위 식별값입니다. 마지막 방문부터 최대 2년 뒤 만료됩니다."],
                [GA_COOKIE, "같은 방문을 이어서 세는 데 씁니다. 마지막 방문부터 최대 2년 뒤 만료됩니다."],
              ]}
              stack
            />
            <ul className={s.list}>
              <li>운영자는 Google 애널리틱스 보고서에서 어떤 페이지를 얼마나 보는지, 어디서 들어오는지 같은 방문 통계를 봅니다. Google 신호와 광고 맞춤 신호는 끈 채로 쓰고, 방문 통계를 광고에 쓰지 않습니다.</li>
              <li>
                허용과 거부는 처음 방문할 때 나오는 안내나 아래 방문 통계 설정에서 언제든 바꿀 수 있습니다. 거부하면 Google 애널리틱스를 불러오지 않고, 이미 불러온
                화면에서도 더 보내지 않으며, 이 브라우저의 방문 통계 쿠키를 지웁니다. 거부해도 서비스 이용에 제한이 없습니다.
              </li>
              <li>설정은 이 브라우저에 저장되고, 앱과 가이드에서 따로 여쭤봅니다. 브라우저의 사이트 데이터를 지우면 다시 여쭤봅니다.</li>
              <li>브라우저 설정에서 쿠키를 지우거나 막을 수도 있지만, 그것만으로는 방문 통계가 멈추지 않을 수 있으니 거부는 아래 설정으로 해 주세요.</li>
            </ul>
            <AnalyticsSetting />
          </div>
        ) : null}
        {ads ? (
          <>
            <h3 className={s.sub}>광고 쿠키와 행태정보</h3>
            <ul className={s.list}>
              <li>가이드 글 페이지에는 Google 애드센스 광고가 실립니다. Google 등 제3자 광고 사업자는 쿠키를 써서 이 사이트와 다른 사이트 방문 기록을 바탕으로 광고를 보여 줄 수 있습니다.</li>
              <li>수집되는 행태정보: 웹 방문 기록, 광고 노출과 클릭 기록, 쿠키 등 온라인 식별자. 가이드 글 페이지를 열 때 광고 사업자가 자동으로 수집하며, 운영자는 이 정보를 받거나 보관하지 않습니다.</li>
              <li>
                보유 기간과 처리 방식은 광고 사업자의 정책을 따릅니다. Google이 정보를 쓰는 방식은{" "}
                <a href="https://policies.google.com/technologies/partner-sites">Google 파트너 사이트 정보 이용 안내</a>에서 볼 수 있습니다.
              </li>
              <li>
                맞춤 광고는 <a href="https://adssettings.google.com">Google 광고 설정</a>에서 끌 수 있고, 브라우저에서 제3자 쿠키를 차단해도 됩니다. 꺼도 광고 수는 줄지 않고 관심사와 관계없는 광고가 보입니다.
              </li>
              <li>
                Google 외 제3자 광고 사업자의 맞춤 광고도 <a href="https://www.aboutads.info">www.aboutads.info</a>에서 끌 수 있습니다.
              </li>
              <li>만 14세 미만 아동을 대상으로 한 맞춤형 광고는 하지 않습니다.</li>
            </ul>
          </>
        ) : null}
      </LegalSection>

      <LegalSection id="rights" title={`${num(6)}. 이용자의 권리와 행사 방법`}>
        <ul className={s.list}>
          <li>이용자는 언제든지 자신의 개인정보에 대해 열람, 정정, 삭제, 처리정지를 요구할 수 있습니다.</li>
          <li>기기에 저장된 기록은 내 정보의 기록 지우기나 브라우저의 사이트 데이터 삭제로 직접 지울 수 있습니다.</li>
          <li>{`${synced ? SYNC_KEPT : KEPT}는 내 정보에서 지울 수 있고, 탈퇴도 내 정보에서 할 수 있습니다.`}</li>
          {BONDS ? <li>별자리 인연에서 주인은 별을 직접 지우고 랭킹 공개를 끌 수 있습니다. 별자리 전체나 친구로 남긴 별의 삭제는 아래 개인정보 보호책임자에게 요청해 주세요.</li> : null}
          <li>운영자가 보관하는 정보에 대한 요구는 아래 개인정보 보호책임자에게 해 주시면 지체 없이 조치합니다. 법정대리인이나 위임을 받은 사람을 통해서도 요구할 수 있습니다.</li>
        </ul>
      </LegalSection>

      <LegalSection id="children" title={`${num(7)}. 만 14세 미만 아동`}>
        <p>
          {`${nameKo}는 만 14세 이상만 이용할 수 있으며, 만 14세 미만 아동의 개인정보를 받지 않습니다. 만 14세 미만 아동의 정보가 처리된 사실을 알게 되면 바로 파기합니다.${BONDS ? " 별자리 인연을 시작하거나 친구로 참여할 때도 만 14세 이상인지 확인합니다." : ""}`}
        </p>
      </LegalSection>

      <LegalSection id="security" title={`${num(8)}. 안전성 확보 조치`}>
        <ul className={s.list}>
          <li>모든 통신을 HTTPS로 암호화합니다.</li>
          <li>
            {`${
              synced
                ? "로그인하지 않고 연 풀이의 입력은 이용자가 계정으로 옮기지 않는 한 서버에 저장하지 않고, 계정에 보관하는 풀이는"
                : `로그인하지 않고 연 풀이와 오픈 기념 무료로 연 풀이의 입력은 서버에 저장하지 않고, ${KEPT}는`
            } AES-256-GCM으로 암호화해 저장하며, 카카오 회원번호, Google 계정 식별값, IP 주소는 비밀 키로 변환한 값으로만 다루는 등 꼭 필요한 정보만 처리합니다.`}
          </li>
          {BONDS ? <li>별자리 인연 저장소에는 생년월일을 남기지 않고, 친구의 기기 식별값은 해시로만 둡니다. 초대코드는 새로 만들면 예전 코드가 바로 막힙니다.</li> : null}
          <li>운영자의 쿠키와 풀이 확인값은 서명해 위조를 막습니다.</li>
          <li>AI 사업자 API 키 같은 비밀 정보는 코드와 분리해 서버에만 두고, 접근 권한을 운영자로 한정합니다.</li>
          <li>보안 헤더로 다른 사이트에 이 서비스를 몰래 끼워 넣는 공격 등을 막습니다.</li>
        </ul>
      </LegalSection>

      <LegalSection id="officer" title={`${num(9)}. 개인정보 보호책임자`}>
        <Facts
          rows={[
            ["성명", business.ceo],
            ["직위", "대표"],
            ...contacts,
          ]}
        />
        {contacts.length > 0 ? null : <p className={s.muted}>연락처는 이 자리에 안내합니다.</p>}
      </LegalSection>

      <LegalSection id="remedies" title={`${num(10)}. 권익침해 구제 방법`}>
        <p>개인정보 침해로 도움이 필요하면 아래 기관에 분쟁 해결이나 상담을 신청할 수 있습니다.</p>
        <ul className={s.list}>
          <li>개인정보분쟁조정위원회: 1833-6972 (www.kopico.go.kr)</li>
          <li>개인정보침해신고센터: 국번 없이 118 (privacy.kisa.or.kr)</li>
          <li>대검찰청: 국번 없이 1301 (www.spo.go.kr)</li>
          <li>경찰청: 국번 없이 182 (ecrm.police.go.kr)</li>
        </ul>
      </LegalSection>

      <LegalSection id="changes" title={`${num(11)}. 방침의 변경`}>
        <p>{`이 방침을 바꿀 때는 시행 7일 전부터 서비스 안에 공지합니다. 이 방침은 ${koreanDate(effective)}부터 시행합니다.`}</p>
      </LegalSection>
    </LegalPage>
  );
}
