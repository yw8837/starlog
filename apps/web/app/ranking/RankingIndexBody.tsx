import { Button } from "@/components/ui/Button";
import type { Leaders } from "./loadLeaders";
import { SignIndex } from "./SignIndex";
import s from "./SignIndex.module.css";

/** The 별자리 인연 랭킹 page body (rendered by app/ranking/page.tsx with the all-time leaders). */
export function RankingIndexBody({ leaders }: { leaders: Leaders | null }) {
  return (
    <>
      <header className={s.intro}>
        <p className={s.eyebrow}>별자리 인연</p>
        <h1 className={s.title}>별자리 인연 랭킹</h1>
        <p className={s.lead}>별자리마다 인연 점수 합계 1~3위예요. 같은 별자리를 완성한 사람끼리만 겨뤄요.</p>
      </header>
      <SignIndex leaders={leaders} />
      <Button href="/bonds" block>
        내 별자리 채우러 가기
      </Button>
    </>
  );
}
