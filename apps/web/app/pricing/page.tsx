import type { Metadata } from "next";
import Link from "next/link";
import { LegalNote, LegalPage, LegalSection } from "@/components/legal/LegalPage";
import s from "@/components/legal/legal.module.css";
import { SITE, won } from "@/lib/config";
import { packReadings, perReadingLabel } from "@/lib/pricing";

const { price, currency, reading, nameKo } = SITE;

export const metadata: Metadata = {
  title: "가격 안내",
  description: `타로 심층 풀이 ${won(price.tarotStandardKrw)}, 사주 프롤로그 ${won(price.sajuStandardKrw)}. 무료로 볼 수 있는 부분과 ${currency.paid} 충전 상품, ${currency.free}, 결제 수단을 안내해요.`,
  alternates: { canonical: "/pricing" },
};

const count = (n: number) => (n === 1 ? "한 번" : `${n}번`);
const giftReadings = Math.floor(price.signupGiftFree / price.unitsPerReading);

const PRODUCTS = [
  {
    name: "타로 심층 풀이",
    sub: "카드 3장으로 보는 지금",
    krw: price.tarotStandardKrw,
    includes: ["카드별 풀이 전체", "세 카드의 연결, 시기, 오늘 해볼 행동"],
  },
  {
    name: "사주 프롤로그",
    sub: "타고난 결로 보는 나",
    krw: price.sajuStandardKrw,
    includes: ["명식을 주제별로 읽은 풀이 전체", "오행과 십신, 지금의 10년(대운)"],
  },
] as const;

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <LegalPage title="가격 안내" lead="풀이 한 번의 가격과 무료로 볼 수 있는 부분, 달빛과 별조각을 한곳에 모았어요.">
      <LegalNote>
        <p className={s.noteTitle}>결제는 심사 완료 후 열려요.</p>
        <p>지금은 결제 기능을 준비하고 있어서 결제가 되지 않아요. 가격이 바뀌면 이 페이지에 먼저 알려 드려요.</p>
      </LegalNote>

      <LegalSection id="readings" title="풀이 가격">
        <div className={`${s.cards} ${s.cardsTwo}`}>
          {PRODUCTS.map((product, i) => (
            <section key={product.name} className={s.card} aria-labelledby={`product-${i}`}>
              <div>
                <h3 id={`product-${i}`} className={s.cardTitle}>
                  {product.name}
                </h3>
                <p className={s.cardSub}>{product.sub}</p>
              </div>
              <p className={s.price}>
                {won(product.krw)}
                <span className={s.priceUnit}>1회</span>
              </p>
              <ul className={s.checks}>
                {[...product.includes, `후속 질문 ${reading.followUps}번`, `내 ${nameKo}에 보관`].map((item) => (
                  <li key={item}>
                    <Check />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p>
          {`바로 결제, ${currency.paid}, ${currency.free} 중 어떤 방법으로 열어도 풀이 내용과 후속 질문, 보관 범위는 같아요.`}
        </p>
      </LegalSection>

      <LegalSection id="free" title="무료로 볼 수 있는 부분">
        <ul className={s.list}>
          <li>타로는 카드 3장의 앞면과 자리별 한 줄 키워드, 첫 번째 카드 풀이를 로그인 없이 무료로 볼 수 있어요.</li>
          <li>사주는 명식(네 기둥, 오행 분포, 일간)과 요약 풀이를 무료로 볼 수 있어요.</li>
          <li>
            {`처음 가입하면 가입 선물로 ${currency.free} ${price.signupGiftFree}개를 드려요. 전체 풀이를 ${count(giftReadings)} 무료로 열 수 있어요.`}
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="moonlight" title={`${currency.paid} 충전`}>
        <p>{`${currency.paid}은 돈을 내고 충전하는 재화예요. 풀이 한 번은 ${currency.paid} ${price.unitsPerReading}개로 열려요.`}</p>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <caption>{`${currency.paid} 충전 상품`}</caption>
            <thead>
              <tr>
                <th scope="col">상품</th>
                <th scope="col">가격</th>
                <th scope="col">풀이</th>
                <th scope="col">1회당</th>
              </tr>
            </thead>
            <tbody>
              {SITE.moonPacks.map((pack) => {
                const { readings } = packReadings(pack);
                return (
                  <tr key={pack.units}>
                    <th scope="row">
                      {`${currency.paid} ${pack.units}`}
                      {pack.bonus > 0 ? <span className={s.bonus}>{`보너스 +${pack.bonus}`}</span> : null}
                    </th>
                    <td>{won(pack.krw)}</td>
                    <td>{`${readings}번`}</td>
                    <td>{perReadingLabel(pack)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className={s.muted}>
          {`1회당 가격은 충전 금액을 받는 ${currency.paid} 수(보너스 포함)로 나누고 ${price.unitsPerReading}개를 곱해 원 단위로 반올림한 값이에요. 풀이 횟수는 한 번에 ${price.unitsPerReading}개씩 쓸 때 열 수 있는 횟수이고, 남는 ${currency.paid}은 다음 충전과 합쳐 쓸 수 있어요. 바로 결제하면 타로 심층 풀이 ${won(price.tarotStandardKrw)}, 사주 프롤로그 ${won(price.sajuStandardKrw)}이에요.`}
        </p>
        <p>
          {`남은 ${currency.paid}의 환불은 `}
          <Link href="/refund">환불 정책</Link>
          {"을 따라요."}
        </p>
      </LegalSection>

      <LegalSection id="stardust" title={currency.free}>
        <ul className={s.list}>
          <li>{`${currency.free}은 가입 선물처럼 ${nameKo}가 무료로 드리는 재화예요.`}</li>
          <li>{`${currency.paid}처럼 풀이 한 번에 ${price.unitsPerReading}개가 쓰이고, 열리는 풀이도 같아요.`}</li>
          <li>무료로 받은 재화라 환불 대상이 아니고, 현금으로 바꿀 수 없어요.</li>
        </ul>
      </LegalSection>

      <LegalSection id="payment" title="결제 수단">
        <p>토스페이먼츠를 통해 신용·체크카드와 간편결제로 결제할 수 있어요.</p>
        <p>결제는 심사 완료 후 열려요. 지금은 결제 기능을 준비하고 있어요.</p>
        <p>
          {"풀이는 디지털 콘텐츠라 열리고 나면 청약철회가 제한될 수 있어요. 결제 전에 한 번 더 알려 드리고, 자세한 내용은 "}
          <Link href="/refund">환불 정책</Link>
          {"에 적어 두었어요."}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
