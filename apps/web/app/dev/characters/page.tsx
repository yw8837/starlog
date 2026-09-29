import type { Metadata } from "next";
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
        <p className={s.note}>탭하면 반응해요. 동작 줄이기 설정에서는 움직임 없이 표정만 바뀌어요.</p>

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
          <h2>크기 · 탭 반응 없음</h2>
          <div className={s.sizes} data-shot="sizes">
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
