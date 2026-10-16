import Link from "next/link";
import { ChevronIcon } from "@/components/home/icons";
import { Stepper } from "@/components/tarot/Stepper";
import { SITE, won } from "@/lib/config";
import { DEEP_TAROT_HREF, NEW_TAROT_HREF } from "@/lib/freshStart";
import { times } from "@/lib/helpGuide";
import { PREMIUM } from "@/lib/premium/products";
import s from "./TarotBridge.module.css";

/**
 * The 다리 화면 (owner 2026-10-16): which tarot to read before the question is built. 일반 타로 is today's
 * 3-card flow and the screen's one gold choice; 켈틱 크로스 10장 (심층 타로) is the quiet ivory one with its
 * price. Both go on to the same question builder; the ten-card one carries the display flag `spread=deep`.
 */
export function TarotBridge() {
  const deep = PREMIUM["tarot-deep"];
  return (
    <div className={s.screen}>
      <Stepper label="타로 보기" backHref="/" backLabel="홈으로" />
      <h1 className={s.title}>어떤 타로를 볼까요?</h1>
      <ul className={s.list} aria-label="타로 고르기">
        <li>
          <Link href={NEW_TAROT_HREF} className={`${s.card} ${s.primary}`} data-primary="">
            <span className={s.text}>
              <span className={s.name}>일반 타로</span>
              <span className={s.sub}>카드 3장으로 지금을 봐요</span>
              <span className={s.meta}>{`첫 풀이는 하루 ${times(SITE.beta.teaserPerDay)} 무료 · 전체 풀이 ${won(SITE.price.tarotStandardKrw)}`}</span>
            </span>
            <span className={s.arrow} aria-hidden="true">
              <ChevronIcon size={18} />
            </span>
          </Link>
        </li>
        <li>
          <Link href={DEEP_TAROT_HREF} className={`${s.card} ${s.ivory}`}>
            <span className={s.text}>
              <span className={s.name}>{deep.entry}</span>
              <span className={s.sub}>{`${deep.name} · ${deep.sub}`}</span>
              <span className={s.price}>{won(deep.krw)}</span>
            </span>
            <span className={s.arrow} aria-hidden="true">
              <ChevronIcon size={18} />
            </span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
