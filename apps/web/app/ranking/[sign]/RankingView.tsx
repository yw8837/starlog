"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CONSTELLATIONS, getConstellation, type SignId } from "@starlog/core";
import { CompletedCard } from "@/components/bonds/CompletedCard";
import { ConfirmDialog } from "@/components/bonds/ConfirmDialog";
import { ConstellationArt } from "@/components/bonds/ConstellationArt";
import { ConstellationBackdrop } from "@/components/bonds/ConstellationBackdrop";
import { InviteShareButton } from "@/components/bonds/InviteShareButton";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { bondsApi, bondsMessage } from "@/lib/bonds/client";
import type { RankingRowView, RankingView as Ranking } from "@/lib/bonds/service";
import { StarList } from "../../bonds/StarList";
import b from "@/components/bonds/bonds.module.css";
import s from "./RankingView.module.css";

export type BoardTab = "week" | "all";

const TABS: { id: BoardTab; label: string; note: string }[] = [
  { id: "week", label: "이번 주", note: "월요일 0시(한국 시간)에 새로 시작해요" },
  { id: "all", label: "명예의 전당", note: "지금까지 완성한 기록 전체예요" },
];

const PLACES = ["first", "second", "third"] as const;

/**
 * One sign's ranking (spec §6). The board: tabs (이번 주 / 명예의 전당) over the same layout, a podium for
 * 1~3위, 내 순위 (always shown, even beyond the list) and 4~20위 as a compact list. Beside it (below on
 * phones): my constellation of this sign (complete, filling or another sign in progress) and the other signs.
 *
 * Phones: header → tabs → podium → 내 순위 → 4~20위 → my constellation → signs.
 * Desktop: header, my constellation and signs on the left; the board on the right with 내 순위 kept in view.
 */
export function RankingView({ sign }: { sign: SignId }) {
  const def = getConstellation(sign);
  const [data, setData] = useState<Ranking | undefined>(undefined);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<BoardTab>("week");

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
    <div className={s.layout}>
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

      <section className={s.board} aria-labelledby="board-title">
        <h2 id="board-title" className="sr-only">
          {def.ko} 순위
        </h2>
        <Board sign={sign} tab={tab} onTab={setTab} data={data} error={error} reload={load} />
      </section>

      {data ? (
        <div className={s.status}>
          <MyCard sign={sign} data={data} reload={load} />
        </div>
      ) : null}

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
    </div>
  );
}

type BoardProps = {
  sign: SignId;
  tab: BoardTab;
  onTab: (tab: BoardTab) => void;
  data: Ranking | undefined;
  error: string;
  reload: () => void;
};

/** The tabs and, for the chosen one, podium → 내 순위 → 4~20위 (내 순위 moves under the list on desktop). */
export function Board({ sign, tab, onTab, data, error, reload }: BoardProps) {
  const def = getConstellation(sign);
  const id = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = TABS.find((t) => t.id === tab)!;

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = (next + TABS.length) % TABS.length;
    onTab(TABS[target]!.id);
    tabRefs.current[target]?.focus();
  };

  const rows = data ? data[tab] : [];
  return (
    <>
      <div className={s.tabs} role="tablist" aria-label="랭킹 기간">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-${t.id}`}
            aria-selected={t.id === tab}
            aria-controls={`${id}-panel`}
            tabIndex={t.id === tab ? 0 : -1}
            className={s.tab}
            onClick={() => onTab(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} className={s.panel}>
        <p className={s.tabNote}>{current.note}</p>
        {data === undefined ? (
          error ? (
            <div className={s.state}>
              <p className={b.error} role="alert">
                {error}
              </p>
              <Button variant="secondary" onClick={reload}>
                다시 불러오기
              </Button>
            </div>
          ) : (
            // The final shape while loading (no layout shift when the lists arrive).
            <div className={s.skeleton} aria-busy="true" data-skeleton="">
              <div className={s.skeletonPodium} />
              <div className={s.skeletonList} />
              <p className="sr-only" role="status">
                랭킹을 불러오는 중이에요
              </p>
            </div>
          )
        ) : (
          <>
            <Podium sign={sign} rows={rows.slice(0, 3)} />
            {rows.length === 0 ? (
              <div className={s.empty}>
                <p>{tab === "week" ? `이번 주에 ${def.ko}를 완성한 사람이 아직 없어요. 첫 번째가 되어 보세요.` : `아직 ${def.ko}를 완성한 사람이 없어요.`}</p>
                {tab === "week" && data.all.length ? (
                  <button type="button" className={s.textButton} onClick={() => onTab("all")}>
                    명예의 전당 보기
                  </button>
                ) : null}
              </div>
            ) : null}
            <MyRank sign={sign} tab={tab} data={data} reload={reload} onShowAll={() => onTab("all")} />
            {rows.length > 3 ? (
              <ol className={s.list} start={4} aria-label={`4~${rows.length}위`}>
                {rows.slice(3).map((row) => (
                  <li key={`${row.rank}-${row.nickname}`} className={s.row} data-mine={row.mine ? "" : undefined}>
                    <span className={s.rank}>
                      {row.rank}
                      <span className={s.unit}>위</span>
                    </span>
                    <span className={s.name}>
                      {row.nickname}
                      {row.mine ? <span className={s.me}>나</span> : null}
                    </span>
                    <span className={s.total}>
                      <span className="sr-only">인연 </span>
                      {row.total}
                      <span className={s.unit}>점</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

/**
 * 1~3위 on gold, silver and bronze steps: 1위 in the middle on the tallest, 2위 on the left, 3위 on the
 * right, each under a medal. The sign's constellation glows faintly behind the podium. Read in rank order
 * (1, 2, 3); an empty place is only drawn.
 */
function Podium({ sign, rows }: { sign: SignId; rows: RankingRowView[] }) {
  return (
    <div className={s.stage}>
      <ConstellationBackdrop sign={sign} className={s.backdrop} />
      <ol className={s.podium} aria-label="1~3위">
        {PLACES.map((place, i) => {
          const row = rows[i];
          return (
            <li key={place} className={s.place} data-place={place} data-mine={row?.mine ? "" : undefined} aria-hidden={row ? undefined : true}>
              <div className={s.who}>
                {row ? <Medal place={(i + 1) as 1 | 2 | 3} /> : <span className={s.ghost} />}
                <span className={s.podName}>
                  {row ? (
                    <>
                      <span className="sr-only">{i + 1}위 </span>
                      {row.nickname}
                    </>
                  ) : (
                    "빈 자리"
                  )}
                </span>
                {row?.mine ? <span className={s.me}>나</span> : null}
                {row ? (
                  <span className={s.podTotal}>
                    <span className="sr-only">인연 </span>
                    {row.total}
                    <small>점</small>
                  </span>
                ) : null}
              </div>
              <div className={s.step}>
                <span className={s.stepNum} aria-hidden="true">
                  {i + 1}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const METALS = {
  1: { stops: ["#fff0b8", "#f3c969", "#b8862b", "#e9c46f"], rim: "#8a6420", ink: "#4a3108" },
  2: { stops: ["#ffffff", "#e8edf3", "#9aa6b2", "#d5dbe2"], rim: "#6c7682", ink: "#2c333c" },
  3: { stops: ["#f8d2ae", "#e2a46f", "#8a5a2b", "#c88a5a"], rim: "#6a4220", ink: "#3d2410" },
} as const;

/** A medal: two ribbon straps and a metal disc (gold, silver or bronze) with its place, and a soft sheen. */
function Medal({ place }: { place: 1 | 2 | 3 }) {
  const id = useId().replace(/:/g, "");
  const metal = METALS[place];
  return (
    <svg className={s.medal} data-rank={place} viewBox="0 0 48 62" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-m`} x1="0.15" y1="0" x2="0.85" y2="1">
          {metal.stops.map((c, i) => (
            <stop key={c} offset={[0, 0.35, 0.75, 1][i]} stopColor={c} />
          ))}
        </linearGradient>
        <linearGradient id={`${id}-r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7d6cf0" />
          <stop offset="1" stopColor="#4a3cae" />
        </linearGradient>
      </defs>
      <path d="M9 0h12l10 30H19z" fill={`url(#${id}-r)`} />
      <path d="M39 0H27L17 30h12z" fill={`url(#${id}-r)`} />
      <path d="M15 0l10 30M33 0L23 30" stroke="#cfc6ff" strokeOpacity="0.55" strokeWidth="1.2" />
      <circle cx="24" cy="42" r="17" fill={`url(#${id}-m)`} stroke={metal.rim} strokeWidth="1.5" />
      <circle cx="24" cy="42" r="12.5" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1" />
      <ellipse cx="17.5" cy="34.5" rx="6.5" ry="3" fill="#fff" fillOpacity="0.45" transform="rotate(-35 17.5 34.5)" />
      <text x="24" y="47.5" textAnchor="middle" className={s.medalNum} fill={metal.ink}>
        {place}
      </text>
    </svg>
  );
}

type MyRankProps = { sign: SignId; tab: BoardTab; data: Ranking; reload: () => void; onShowAll: () => void };

/**
 * 내 순위, always shown: the rank and total of this device's completed constellation of the sign (also
 * beyond the list), why it is not on this week's board, that the name is kept off the rankings (with the
 * switch), or that a rank appears here once the sign is complete.
 */
export function MyRank({ sign, tab, data, reload, onShowAll }: MyRankProps) {
  const def = getConstellation(sign);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mine = data.mine;
  const hidden = data.owner !== null && !data.owner.rankingPublic;
  const rank = mine ? (tab === "week" ? mine.weekRank : mine.allRank) : null;
  const leader = data[tab][0];

  const start = async () => {
    setBusy(true);
    setError("");
    const result = await bondsApi("choose", { sign });
    setBusy(false);
    if (result.ok) router.push("/bonds");
    else setError(bondsMessage(result));
  };

  const publish = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await bondsApi("settings", { rankingPublic: true });
    setBusy(false);
    if (result.ok) reload();
    else setError(bondsMessage(result));
  };

  const ranked = Boolean(mine && !hidden && rank !== null);
  const idle = !mine && !data.filling;

  return (
    <section className={s.myBox} data-state={ranked ? "ranked" : undefined} aria-label="내 순위">
      {ranked && mine && rank !== null ? (
        <>
          <p className={s.myHead}>
            <span className={s.myLabel}>내 순위</span>
            <strong className={s.myRank}>{rank}위</strong>
            <span className={s.myTotal}>
              <span className="sr-only">인연 </span>
              {mine.row.total}점
            </span>
          </p>
          <p className={s.mySub}>
            {rank === 1
              ? tab === "week"
                ? "이번 주 1위예요"
                : "명예의 전당 1위예요"
              : leader && leader.total > mine.row.total
                ? `1위와 ${leader.total - mine.row.total}점 차이예요`
                : "1위와 같은 점수예요. 같은 점수는 먼저 완성한 순서예요."}
          </p>
        </>
      ) : mine && !hidden && tab === "week" ? (
        <>
          <p className={s.myHead}>
            <span className={s.myLabel}>내 순위</span>
            <strong className={s.myMain}>이번 주 순위에는 없어요</strong>
          </p>
          <p className={s.mySub}>
            이번 주에 완성한 별자리만 이번 주 랭킹에 올라요.
            {mine.allRank !== null ? ` 명예의 전당에서는 ${mine.allRank}위예요.` : ""}
          </p>
          <button type="button" className={s.textButton} onClick={onShowAll}>
            명예의 전당 보기
          </button>
        </>
      ) : hidden ? (
        <>
          <p className={s.myHead}>
            <span className={s.myLabel}>내 순위</span>
            <strong className={s.myMain}>랭킹에 이름을 올리지 않았어요</strong>
          </p>
          <p className={s.mySub}>{mine ? "켜면 내 순위가 여기에 떠요." : "켜 두면 완성했을 때 순위가 여기에 떠요."}</p>
          <Checkbox checked={false} onChange={publish}>
            랭킹에 내 이름 올리기
          </Checkbox>
        </>
      ) : mine ? (
        // complete and public, but not counted yet (the rank is read fresh on the next load)
        <p className={s.myHead}>
          <span className={s.myLabel}>내 {def.ko}</span>
          <strong className={s.myMain}>인연 {mine.row.total}점</strong>
        </p>
      ) : (
        <>
          <p className={s.myHead}>
            <span className={s.myLabel}>내 순위</span>
            <strong className={s.myMain}>완성하면 여기에 순위가 떠요</strong>
          </p>
          {data.filling ? (
            <p className={s.mySub}>
              {data.filling.sign === sign
                ? `지금 별 ${data.filling.filled}/${def.slots}개예요.`
                : `지금은 ${getConstellation(data.filling.sign).ko}를 채우는 중이에요.`}
            </p>
          ) : null}
        </>
      )}
      {idle ? (
        data.owner ? (
          <Button block onClick={start} disabled={busy}>
            이 별자리 채우기
          </Button>
        ) : (
          <Button block href={`/bonds?sign=${sign}`}>
            이 별자리 채우기
          </Button>
        )
      ) : null}
      {error ? (
        <p className={b.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/**
 * My constellation of this sign: complete (the share card and its stars), being filled (progress and
 * 초대하기), or another sign in progress (switch, confirmed once stars would be lost). Nothing when this
 * device fills nothing: 내 순위 offers 이 별자리 채우기 then.
 */
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

  if (!data.owner || !data.filling) return null;

  const current = getConstellation(data.filling.sign);
  const filled = data.filling.filled;
  const start = async () => {
    setBusy(true);
    setError("");
    const result = await bondsApi("switch", { sign });
    setBusy(false);
    setConfirm(false);
    if (result.ok) router.push("/bonds");
    else setError(bondsMessage(result));
  };
  return (
    <section className={`${b.panel} ${s.mine}`} aria-label={`내 ${def.ko}`}>
      <p className={b.eyebrow}>내 {def.ko}</p>
      <p className={s.note}>
        지금은 {current.ko}를 채우는 중이에요 ({filled}/{current.slots}). 한 번에 하나씩 채울 수 있어요.
      </p>
      <Button variant="secondary" block disabled={busy} onClick={() => (filled === 0 ? start() : setConfirm(true))}>
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
          {filled > 0 ? `지금 모은 별 ${filled}개가 사라지고 ` : ""}
          {def.ko}를 처음부터 채워요.
        </p>
      </ConfirmDialog>
    </section>
  );
}
