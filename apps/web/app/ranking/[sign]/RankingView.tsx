"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CONSTELLATIONS, getConstellation, type SignId } from "@starlog/core";
import { CompletedCard } from "@/components/bonds/CompletedCard";
import { ConfirmDialog } from "@/components/bonds/ConfirmDialog";
import { ConstellationArt } from "@/components/bonds/ConstellationArt";
import { InviteShareButton } from "@/components/bonds/InviteShareButton";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { bondsApi, bondsMessage, monthDay } from "@/lib/bonds/client";
import type { RankingRowView, RankingView as Ranking } from "@/lib/bonds/service";
import { StarList } from "../../bonds/StarList";
import b from "@/components/bonds/bonds.module.css";
import s from "./RankingView.module.css";

/**
 * One sign's ranking (spec §6), a single scroll: my card on top (complete: 공유하기 · 새로 채우기;
 * filling: progress and 초대하기; otherwise 이 별자리 채우기), then this week's ranking and the hall of fame.
 */
export function RankingView({ sign }: { sign: SignId }) {
  const def = getConstellation(sign);
  const [data, setData] = useState<Ranking | undefined>(undefined);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const result = await bondsApi<Ranking>(`ranking/${sign}`);
    if (result.ok) {
      const { ok: _ok, ...view } = result;
      setData(view as Ranking);
    } else setError(bondsMessage(result));
  }, [sign]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <header className={s.head}>
        <ConstellationArt sign={sign} lit={def.slots} size={120} decorative className={s.headArt} />
        <div>
          <p className={b.eyebrow}>별자리 랭킹</p>
          <h1 className={s.title}>
            {def.ko} <span className={s.en}>· {def.en}</span>
          </h1>
          <p className={b.helper}>
            같은 별자리를 완성한 사람끼리 인연 점수 합계로 겨뤄요. 별 {def.slots}개를 채워야 올라요.
          </p>
        </div>
      </header>

      {data === undefined ? (
        error ? (
          <div className={s.state}>
            <p className={b.error} role="alert">
              {error}
            </p>
            <Button variant="secondary" onClick={load}>
              다시 불러오기
            </Button>
          </div>
        ) : (
          // The final shape while loading (no layout shift when the lists arrive).
          <div className={s.skeleton} aria-busy="true" data-skeleton="">
            <div className={`${b.panel} ${s.skeletonPanel}`} />
            <p className="sr-only" role="status">
              랭킹을 불러오는 중이에요
            </p>
          </div>
        )
      ) : (
        <>
          <MyCard sign={sign} data={data} reload={load} />
          <Board title="이번 주 랭킹" note="월요일 0시(한국 시간)에 새로 시작해요" rows={data.week} sign={sign} empty={`이번 주에 ${def.ko}를 완성한 사람이 아직 없어요. 첫 번째가 되어 보세요.`} />
          <Board title="명예의 전당" note="지금까지 완성한 기록 전체예요" rows={data.all} sign={sign} empty={`아직 ${def.ko}를 완성한 사람이 없어요.`} />
          {data.owner && !data.owner.rankingPublic ? <PrivateNote reload={load} /> : null}
        </>
      )}

      <nav className={s.signs} aria-label="다른 별자리 랭킹">
        <ul>
          {CONSTELLATIONS.map((c) => (
            <li key={c.id}>
              <Link href={`/ranking/${c.id}`} className={s.signChip} aria-current={c.id === sign ? "page" : undefined}>
                {c.ko}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

function MyCard({ sign, data, reload }: { sign: SignId; data: Ranking; reload: () => void }) {
  const def = getConstellation(sign);
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (data.mine && data.owner) {
    const mine = data.mine;
    return (
      <>
        <CompletedCard
          row={{ ...mine.row, stars: mine.stars }}
          ownerNickname={data.owner.nickname}
          weekRank={mine.weekRank}
          allRank={mine.allRank}
          filling={data.filling ? { sign: data.filling.sign, filled: data.filling.filled } : null}
          sharePrimary
          onRefilled={() => router.push("/bonds")}
        />
        <details className={`${b.panel} ${s.fold}`}>
          <summary>별 {mine.stars.length}개와 점수 근거</summary>
          <StarList sign={sign} stars={mine.stars} fresh={new Set()} complete otherFilling={data.filling} onChanged={reload} />
        </details>
      </>
    );
  }

  if (data.filling && data.filling.sign === sign) {
    return (
      <section className={`${b.panel} ${b.panelGold} ${s.mine}`} aria-label={`내 ${def.ko}`}>
        <p className={b.eyebrow}>내 {def.ko} · 채우는 중</p>
        <ConstellationArt sign={sign} lit={data.filling.filled} size={200} className={s.mineArt} />
        <p className={s.progress}>
          <strong>
            {data.filling.filled}/{def.slots}
          </strong>{" "}
          · 인연 {data.filling.total}점
        </p>
        <p className={b.helper}>다 채우면 이 랭킹에 올라요.</p>
        {data.invite ? <InviteShareButton code={data.invite.code} sign={sign} filled={data.filling.filled} /> : null}
        <Link href="/bonds" className={s.link}>
          내 별자리로 가기
        </Link>
      </section>
    );
  }

  const start = async () => {
    setBusy(true);
    setError("");
    const result = await bondsApi(data.filling ? "switch" : "choose", { sign });
    setBusy(false);
    setConfirm(false);
    if (result.ok) router.push("/bonds");
    else setError(bondsMessage(result));
  };

  if (data.owner && data.filling) {
    const current = getConstellation(data.filling.sign);
    return (
      <section className={`${b.panel} ${s.mine}`} aria-label={`내 ${def.ko}`}>
        <p className={b.eyebrow}>내 {def.ko}</p>
        <p className={s.note}>
          지금은 {current.ko}를 채우는 중이에요 ({data.filling.filled}/{current.slots}). 한 번에 하나씩 채울 수 있어요.
        </p>
        <Button variant="secondary" block disabled={busy} onClick={() => (data.filling!.filled === 0 ? start() : setConfirm(true))}>
          {def.ko}로 바꾸기
        </Button>
        <Link href="/bonds" className={s.link}>
          {current.ko} 계속 채우기
        </Link>
        {error ? (
          <p className={b.error} role="alert">
            {error}
          </p>
        ) : null}
        <ConfirmDialog open={confirm} title="별자리를 바꿀까요?" confirmLabel="바꾸고 처음부터 채우기" onConfirm={start} onClose={() => setConfirm(false)} busy={busy}>
          <p>
            {data.filling.filled > 0 ? `지금 모은 별 ${data.filling.filled}개가 사라지고 ` : ""}
            {def.ko}를 처음부터 채워요.
          </p>
        </ConfirmDialog>
      </section>
    );
  }

  return (
    <section className={`${b.panel} ${s.mine}`} aria-label={`내 ${def.ko}`}>
      <p className={b.eyebrow}>내 {def.ko}</p>
      <p className={s.note}>친구 {def.slots}명이 별이 되어 주면 완성이에요. 완성하면 이 랭킹에 올라요.</p>
      {data.owner ? (
        <Button block onClick={start} disabled={busy}>
          이 별자리 채우기
        </Button>
      ) : (
        <Button block href={`/bonds?sign=${sign}`}>
          이 별자리 채우기
        </Button>
      )}
      {error ? (
        <p className={b.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function Board({ title, note, rows, empty }: { title: string; note: string; rows: RankingRowView[]; sign: SignId; empty: string }) {
  return (
    <section className={s.board} aria-label={title}>
      <div className={b.sectionHead}>
        <h2 className={b.sectionTitle}>{title}</h2>
        <span className={b.count}>{note}</span>
      </div>
      {rows.length ? (
        <ol className={s.rows}>
          {rows.map((row) => (
            <li key={`${row.rank}-${row.nickname}`} className={s.row} data-mine={row.mine ? "" : undefined} data-top={row.rank <= 3 ? row.rank : undefined}>
              <span className={s.rank}>{row.rank}등</span>
              <span className={s.name}>
                {row.nickname}
                {row.mine ? <span className={s.me}>나</span> : null}
              </span>
              <span className={s.total}>인연 {row.total}점</span>
              <span className={s.date}>{monthDay(row.completedAt)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={s.empty}>{empty}</p>
      )}
    </section>
  );
}

function PrivateNote({ reload }: { reload: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className={b.panel}>
      <p className={s.note}>랭킹에 이름을 올리지 않았어요. 켜면 완성한 별자리가 이 목록에 올라가요.</p>
      <Checkbox
        checked={false}
        onChange={async () => {
          if (busy) return;
          setBusy(true);
          await bondsApi("settings", { rankingPublic: true });
          setBusy(false);
          reload();
        }}
      >
        랭킹에 내 이름 올리기
      </Checkbox>
    </section>
  );
}
