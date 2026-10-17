import Link from "next/link";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import { ChevronIcon } from "@/components/home/icons";
import { MiniSpread } from "@/components/tarot/MiniSpread";
import { Stepper } from "@/components/tarot/Stepper";
import { SpeechBubble } from "@/components/ui/SpeechBubble";
import { SITE, won } from "@/lib/config";
import { DEEP_TAROT_HREF, NEW_TAROT_HREF } from "@/lib/freshStart";
import { times } from "@/lib/helpGuide";
import { PREMIUM } from "@/lib/premium/products";
import s from "./TarotBridge.module.css";

const num = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

/**
 * The 다리 화면 (owner 2026-10-16): which tarot to read before the question is built, laid out like saju
 * step 1 (the question in the rabbit's bubble, the pair in hanbok, the choices below on a phone and beside
 * them on desktop). 일반 타로 is today's 3-card flow and the screen's one gold choice; 켈틱 크로스 10장 is the
 * quiet ivory one with its price. Each card shows its spread in miniature and one scope line, every number
 * from config. Both go on to the same question builder; the ten-card one carries the display flag `spread=deep`.
 */
export function TarotBridge() {
  const deep = PREMIUM["tarot-deep"];
  return (
    <div className={s.screen}>
      <div className={s.stepper}>
        <Stepper label="타로 보기" backHref="/" backLabel="홈으로" />
      </div>

      <header className={s.greeting}>
        <SpeechBubble as="h1">어떤 타로를 볼까요?</SpeechBubble>
        <div className={s.cast}>
          <Rabbit outfit="hanbok" size={148} />
          <span className={s.assistant}>
            <Cat outfit="hanbok" size={92} />
          </span>
        </div>
      </header>

      <div className={s.choices}>
        <ul className={s.list} aria-label="타로 고르기">
          <li>
            <Link href={NEW_TAROT_HREF} className={`${s.card} ${s.primary}`} data-primary="">
              <MiniSpread kind="three" className={s.art} />
              <span className={s.head}>
                <span className={s.nameRow}>
                  <span className={s.name}>일반 타로</span>
                  <span className={s.arrow} aria-hidden="true">
                    <ChevronIcon size={18} />
                  </span>
                </span>
                <span className={s.sub}>카드 3장으로 지금을 봐요</span>
              </span>
              <span className={s.scope}>
                <span className={s.scopeLine}>
                  <span className={s.piece}>{`첫 풀이 하루 ${times(SITE.beta.teaserPerDay)} 무료`}</span>
                  {" · "}
                  <span className={s.piece}>{`전체 풀이 ${won(SITE.price.tarotStandardKrw)}`}</span>
                </span>
              </span>
            </Link>
          </li>
          <li>
            <Link href={DEEP_TAROT_HREF} className={`${s.card} ${s.ivory}`}>
              <MiniSpread kind="celtic" className={s.art} />
              <span className={s.head}>
                <span className={s.nameRow}>
                  <span className={s.name}>{deep.name}</span>
                  <span className={s.arrow} aria-hidden="true">
                    <ChevronIcon size={18} />
                  </span>
                </span>
                <span className={s.sub}>{deep.sub}</span>
              </span>
              <span className={s.scope}>
                <span className={s.scopeLine}>
                  <span className={s.piece}>{`약 ${num(deep.approxChars)}자`}</span>
                  {" · "}
                  <span className={s.piece}>{`이어서 물어보기 ${deep.followUps}번`}</span>
                </span>
                <span className={s.price}>{won(deep.krw)}</span>
              </span>
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
