import type { Metadata } from "next";
import { CONSTELLATIONS } from "@starlog/core";
import { ConstellationArt } from "@/components/bonds/ConstellationArt";
import { Dogam } from "@/components/bonds/Dogam";
import { Cat } from "@/components/characters/Cat";
import { Rabbit } from "@/components/characters/Rabbit";
import type { CharacterAction, Expression, Outfit } from "@/components/characters/types";
import { NightSky } from "@/components/sky/NightSky";
import s from "./page.module.css";

// Internal character sheet: not linked from navigation and kept out of search.
export const metadata: Metadata = {
  title: "캐릭터 시트",
  robots: { index: false, follow: false },
};

type Who = "cat" | "rabbit";

const EXPRESSIONS: readonly Expression[] = ["idle", "happy", "focus", "surprise", "wink"];

const ROWS: ReadonlyArray<{ who: Who; outfit: Outfit; title: string }> = [
  { who: "cat", outfit: "tarot", title: "고양이 · 타로 리더 (점성술사)" },
  { who: "rabbit", outfit: "tarot", title: "토끼 · 타로 스태프 (사서)" },
  { who: "rabbit", outfit: "hanbok", title: "토끼 · 사주 리더 (두루마기)" },
  { who: "cat", outfit: "hanbok", title: "고양이 · 사주 조수 (색동 저고리)" },
];

const ACTIONS: ReadonlyArray<{ who: Who; outfit: Outfit; action: CharacterAction }> = [
  { who: "cat", outfit: "tarot", action: "shuffle" },
  { who: "cat", outfit: "tarot", action: "glow" },
  { who: "rabbit", outfit: "tarot", action: "write" },
  { who: "rabbit", outfit: "hanbok", action: "write" },
  { who: "cat", outfit: "hanbok", action: "shuffle" },
  { who: "cat", outfit: "hanbok", action: "glow" },
];

function Character({ who, ...props }: { who: Who; outfit: Outfit; expression?: Expression; action?: CharacterAction; size?: number; reactOnTap?: boolean }) {
  return who === "cat" ? <Cat {...props} /> : <Rabbit {...props} />;
}

export default function CharacterSheetPage() {
  return (
    <div className="page-shell">
      <NightSky />
      <main className={s.sheet}>
        <h1>캐릭터 시트</h1>
        <p className={s.note}>탭하면 반응해요. 동작 줄이기 설정에서는 움직임 없이 표정과 말풍선만 바뀌어요.</p>

        <section className={s.section}>
          <h2>모드별 두 캐릭터</h2>
          <div className={s.pairs}>
            <figure className={s.pair} data-shot="pair-tarot">
              <div>
                <Cat outfit="tarot" size={176} />
                <Rabbit outfit="tarot" size={144} />
              </div>
              <figcaption>타로: 고양이 리더 + 토끼 사서</figcaption>
            </figure>
            <figure className={s.pair} data-shot="pair-saju">
              <div>
                <Rabbit outfit="hanbok" size={176} />
                <Cat outfit="hanbok" size={144} />
              </div>
              <figcaption>사주: 토끼 리더 + 고양이 조수</figcaption>
            </figure>
          </div>
        </section>

        {ROWS.map((row) => (
          <section key={`${row.who}-${row.outfit}`} className={s.section}>
            <h2>{row.title}</h2>
            <div className={s.grid}>
              {EXPRESSIONS.map((expression) => (
                <figure key={expression} className={s.cell} data-shot={`${row.who}-${row.outfit}-${expression}`}>
                  <Character who={row.who} outfit={row.outfit} expression={expression} size={140} />
                  <figcaption>{expression}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        ))}

        <section className={s.section}>
          <h2>동작</h2>
          <div className={s.grid}>
            {ACTIONS.map(({ who, outfit, action }) => (
              <figure key={`${who}-${outfit}-${action}`} className={s.cell} data-shot={`${who}-${outfit}-${action}`}>
                <Character who={who} outfit={outfit} action={action} expression="focus" size={140} />
                <figcaption>
                  {who} · {outfit} · {action}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className={s.section}>
          <h2>별자리</h2>
          <p className={s.note}>빈 별자리, 별 2개, 완성(친구 닉네임 포함). 새로 들어온 별은 반짝여요.</p>
          <div className={s.grid}>
            {CONSTELLATIONS.flatMap((c) => [
              <figure key={`${c.id}-empty`} className={s.cell} data-shot={`bonds-${c.id}-empty`}>
                <ConstellationArt sign={c.id} lit={0} size={180} />
                <figcaption>{c.ko} · 0/{c.slots}</figcaption>
              </figure>,
              <figure key={`${c.id}-two`} className={s.cell} data-shot={`bonds-${c.id}-two`}>
                <ConstellationArt sign={c.id} lit={2} newSlots={[1]} labels={["민지", "하늘이"]} size={180} />
                <figcaption>{c.ko} · 2/{c.slots}</figcaption>
              </figure>,
              <figure key={`${c.id}-done`} className={s.cell} data-shot={`bonds-${c.id}-done`}>
                <ConstellationArt sign={c.id} lit={c.slots} labels={["민지", "하늘이", "도윤", "서아", "별빛", "지우", "Momo"].slice(0, c.slots)} size={300} />
                <figcaption>{c.ko} · 완성</figcaption>
              </figure>,
            ])}
          </div>
          <div className={s.section} data-shot="bonds-dogam">
            <Dogam completed={["aries", "libra"]} filling={{ sign: "leo", filled: 2 }} />
          </div>
        </section>

        <section className={s.section}>
          <h2>크기</h2>
          <p className={s.note}>32px 고양이만 탭에 반응해요(탭 영역 44px). 나머지는 탭 반응 없이 그려요.</p>
          <div className={s.sizes} data-shot="sizes">
            <figure className={s.cell} data-shot="hit-area">
              <Cat outfit="hanbok" size={32} />
              <figcaption>32px · 탭 반응 · 탭 영역 44px</figcaption>
            </figure>
            <Cat outfit="tarot" size={64} reactOnTap={false} />
            <Rabbit outfit="tarot" size={64} reactOnTap={false} />
            <Rabbit outfit="hanbok" size={96} reactOnTap={false} />
            <Cat outfit="hanbok" size={96} reactOnTap={false} />
            <Cat outfit="tarot" size={240} reactOnTap={false} />
          </div>
        </section>
      </main>
    </div>
  );
}
