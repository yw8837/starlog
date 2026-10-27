"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getConstellation, type SignId } from "@starlog/core";
import type { WeekTop } from "@/app/ranking/loadLeaders";
import { BondsMoreTiles } from "@/components/bonds/BondsMoreTiles";
import { CompletedCard } from "@/components/bonds/CompletedCard";
import { ConfirmDialog } from "@/components/bonds/ConfirmDialog";
import { ConstellationArt } from "@/components/bonds/ConstellationArt";
import { Dogam } from "@/components/bonds/Dogam";
import { HowToButton, HowToCard } from "@/components/bonds/HowTo";
import { InviteShareButton } from "@/components/bonds/InviteShareButton";
import { SignPicker } from "@/components/bonds/SignPicker";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { loginHref } from "@/lib/account/client";
import { bondsApi, bondsMessage, copyText, markSeen, monthDay, savedSunSign, seenUntil } from "@/lib/bonds/client";
import type { JoinedView, LinkOffer, OwnerSummary, OwnerView } from "@/lib/bonds/service";
import { OwnerSetup } from "./OwnerSetup";
import { StarList } from "./StarList";
import { ConstellationStats } from "@/components/bonds/BondScore";
import { BondsShareButton } from "@/components/bonds/BondsShareButton";
import b from "@/components/bonds/bonds.module.css";
import s from "./BondsView.module.css";

/** `signedIn`: a new owner logs in first; `link`: this device's owner can be linked to the account (owner 2026-10-27) */
type Me = ({ owner: null } | OwnerView) & { weekTop?: WeekTop | null; joined?: JoinedView[]; signedIn?: boolean; link?: LinkOffer };

/**
 * 별자리 인연, the owner's single scroll (spec §3): the constellation being filled with its stars, the
 * invite, the 도감 (each cell opens that sign's ranking) and the best 5 bonds. Before the first start,
 * the nickname and birth-date step; between constellations, the picker for the next one.
 */
export function BondsView({ initialSign }: { initialSign: SignId | null }) {
  const [me, setMe] = useState<Me | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  // What this device had seen before this visit: newer stars sparkle, a newer completion celebrates.
  const seenAtLoad = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoadError("");
    const result = await bondsApi<Me>("me");
    if (!result.ok) {
      setLoadError(bondsMessage(result));
      return;
    }
    const { ok: _ok, ...data } = result;
    setMe(data as Me);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Remember the newest star and completion as seen once they are on screen.
  useEffect(() => {
    if (!me || me.owner === null) return;
    if (seenAtLoad.current === null) seenAtLoad.current = seenUntil();
    const times = [
      ...(me.filling?.stars.map((star) => star.createdAt) ?? []),
      ...me.completed.flatMap((c) => [c.completedAt ?? 0, ...c.stars.map((star) => star.createdAt)]),
    ];
    markSeen(Math.max(seenUntil(), Date.now(), ...times));
  }, [me]);

  if (me === undefined) {
    return loadError ? (
      <div className={s.state}>
        <p className={b.error} role="alert">
          {loadError}
        </p>
        <Button variant="secondary" onClick={load}>
          다시 불러오기
        </Button>
      </div>
    ) : (
      <BondsSkeleton />
    );
  }

  if (me.owner === null) {
    return (
      <>
        <Intro />
        {/* Starting needs a login (owner 2026-10-27); after it the visitor comes back here and goes on with the form. */}
        {me.signedIn === false ? (
          <LoginToStart />
        ) : (
          // The nickname this device used as a friend, if any; a friend's code is entered in 내 정보, not here (owner 2026-10-02).
          <OwnerSetup onDone={load} defaultNickname={me.joined?.flatMap((j) => j.members).find((m) => m.me)?.nickname ?? ""} />
        )}
        <JoinedList joined={me.joined ?? []} />
      </>
    );
  }

  return <OwnerScreen view={me} seenBefore={seenAtLoad.current ?? seenUntil()} initialSign={initialSign} reload={load} />;
}

/**
 * Q-06: while this device's 별자리 loads, the page already has its final shape: the header and a
 * panel at least a screen tall, so nothing visible moves when the data arrives (the footer starts below
 * the fold instead of jumping down from the middle of the screen).
 */
function BondsSkeleton() {
  return (
    <div className={s.skeleton} aria-busy="true" data-skeleton="">
      <header className={s.intro}>
        <p className={b.eyebrow}>별자리 인연</p>
        <h1 className={s.title}>별자리 인연</h1>
      </header>
      <div className={`${b.panel} ${s.skeletonPanel}`}>
        <span className={s.skeletonBar} />
        <span className={s.skeletonArt} />
        <span className={s.skeletonBar} />
      </div>
      <p className="sr-only" role="status">
        별자리를 불러오는 중이에요
      </p>
    </div>
  );
}

function Intro() {
  return (
    <>
      <header className={s.intro}>
        <p className={b.eyebrow}>별자리 인연</p>
        <h1 className={s.title}>친구가 별이 되어 내 별자리를 채워요</h1>
        <p className={s.lead}>
          별자리를 하나 고르고 카톡으로 초대 링크를 보내요. 들어온 친구마다 사주로 본 인연 점수가 붙고, 다 채우면 도감에 들어가고 랭킹에 올라요.
        </p>
      </header>
      <HowToCard />
    </>
  );
}

/**
 * 내 별자리는 로그인해서 만들어요 (owner 2026-10-27: "계정 위주로 돌아가는 게 맞다"): the constellation belongs to the
 * account, so the same one, its invite link and scores show on every device. /login brings the visitor back to /bonds,
 * where the start form follows. A friend joins without logging in.
 */
function LoginToStart() {
  return (
    <section className={`${b.panel} ${s.login}`} aria-labelledby="bonds-login-title">
      <h2 id="bonds-login-title" className={b.sectionTitle}>
        내 별자리는 로그인해서 만들어요
      </h2>
      <p className={b.helper}>로그인하면 휴대폰과 PC 어디서든 같은 별자리와 초대 링크, 점수가 보여요. 친구는 로그인 없이 참여해요.</p>
      <Button href={loginHref("/bonds")} block size="lg" trailing="→">
        로그인하고 시작하기
      </Button>
      <p className={b.helper}>이미 만든 별자리가 있으면 로그인하면 그대로 보여요.</p>
    </section>
  );
}

/**
 * 연결하기 (owner 2026-10-27): this device's owner, made before accounts, joins the logged-in account only when tapped.
 * Where the account already has its own, both are shown and the one kept is chosen; the other is deleted (lib: api/bonds/link),
 * after a confirm when it holds friends' stars.
 */
function LinkPrompt({ link, reload }: { link: LinkOffer; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"device" | "account" | null>(null);

  const send = async (keep?: "device" | "account") => {
    setBusy(true);
    setError("");
    const result = await bondsApi("link", keep ? { keep } : {});
    setBusy(false);
    setConfirm(null);
    if (!result.ok) {
      setError(bondsMessage(result, "연결하지 못했어요. 잠시 뒤에 다시 시도해 주세요"));
      return;
    }
    reload();
  };

  if (link.kind === "offer") {
    return (
      <section className={`${b.panel} ${s.link}`} aria-labelledby="link-title">
        <h2 id="link-title" className={b.sectionTitle}>
          이 기기에서 만든 별자리를 내 계정에 연결할까요?
        </h2>
        <p className={b.helper}>연결하면 다른 기기에서도 보여요. 로그인한 계정으로 같은 별자리와 초대 링크, 점수를 볼 수 있어요.</p>
        <Button block onClick={() => void send()} disabled={busy}>
          {busy ? "연결하는 중이에요" : "연결하기"}
        </Button>
        {error ? (
          <p className={b.error} role="alert">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  const dropped = confirm === "device" ? link.account : link.device;
  const keep = (which: "device" | "account") => {
    const other = which === "device" ? link.account : link.device;
    if (other.stars > 0) setConfirm(which);
    else void send(which);
  };
  return (
    <section className={`${b.panel} ${s.link}`} aria-labelledby="link-title">
      <h2 id="link-title" className={b.sectionTitle}>
        남길 별자리를 하나 골라 주세요
      </h2>
      <p className={b.helper}>이 기기에서 만든 별자리와 내 계정의 별자리가 따로 있어요. 계정에는 하나만 남길 수 있고, 고르지 않은 별자리는 지워져요.</p>
      <ul className={s.linkChoices}>
        <OwnerChoice label="내 계정의 별자리" summary={link.account} onKeep={() => keep("account")} busy={busy} />
        <OwnerChoice label="이 기기에서 만든 별자리" summary={link.device} onKeep={() => keep("device")} busy={busy} />
      </ul>
      {error ? (
        <p className={b.error} role="alert">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirm !== null}
        title="고르지 않은 별자리를 지울까요?"
        confirmLabel="지우고 남기기"
        onConfirm={() => void send(confirm ?? undefined)}
        onClose={() => setConfirm(null)}
        busy={busy}
      >
        <p>
          {`${dropped.nickname}님의 ${summaryName(dropped)}와 친구 별 ${dropped.stars}개가 지워져요. 지운 별자리는 되돌릴 수 없어요.`}
        </p>
      </ConfirmDialog>
    </section>
  );
}

const summaryName = (summary: OwnerSummary) => (summary.sign ? getConstellation(summary.sign).ko : "별자리");

function OwnerChoice({ label, summary, onKeep, busy }: { label: string; summary: OwnerSummary; onKeep: () => void; busy: boolean }) {
  const filled = summary.sign ? `별 ${summary.filled}/${summary.slots}` : "아직 별자리를 고르지 않았어요";
  return (
    <li className={s.linkChoice}>
      <p className={b.eyebrow}>{label}</p>
      <p className={s.linkName}>{`${summary.nickname}님의 ${summaryName(summary)}`}</p>
      <p className={b.helper}>{`${filled}${summary.completed ? ` · 완성 ${summary.completed}개` : ""} · ${monthDay(summary.createdAt)}에 만들었어요`}</p>
      <Button variant="secondary" block onClick={onKeep} disabled={busy}>
        이 별자리 남기기
      </Button>
    </li>
  );
}

/**
 * 내가 들어간 별자리 (owner 2026-10-14): friends' constellations this device joined, newest first, each with
 * whose it is, how far it is filled and who is in it (나 for this device). Nothing when it joined none.
 */
function JoinedList({ joined }: { joined: JoinedView[] }) {
  if (!joined.length) return null;
  return (
    <section className={s.section} aria-labelledby="joined-title">
      <div className={b.sectionHead}>
        <h2 id="joined-title" className={b.sectionTitle}>
          내가 들어간 별자리
        </h2>
        <span className={b.count}>{joined.length}개</span>
      </div>
      <ul className={s.joined}>
        {joined.map((item, i) => (
          <li key={`${item.ownerNickname}-${item.sign}-${i}`}>
            <p className={s.joinedHead}>
              <span className={s.joinedName}>{`${item.ownerNickname}님의 ${getConstellation(item.sign).ko}`}</span>
              <span className={s.joinedState}>{item.status === "complete" ? "완성" : `${item.filled}/${item.slots}`}</span>
            </p>
            <p className={s.joinedMembers}>{item.members.map((m) => (m.me ? "나" : m.nickname)).join(" · ")}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OwnerScreen({ view, seenBefore, initialSign, reload }: { view: OwnerView & { weekTop?: WeekTop | null; joined?: JoinedView[]; link?: LinkOffer }; seenBefore: number; initialSign: SignId | null; reload: () => void }) {
  const { owner, invite, filling, completed, top5, ranks } = view;
  // A sign was just chosen here: the invite is brought into view once (owner 2026-10-23).
  const [justMade, setJustMade] = useState(false);
  const completedSigns = completed.map((c) => c.sign);
  const mySign = savedSunSign();
  const latest = completed.length ? completed.reduce((a, c) => ((c.completedAt ?? 0) > (a.completedAt ?? 0) ? c : a)) : null;
  const fresh = useMemo(() => {
    const ids = new Set<string>();
    for (const star of [...(filling?.stars ?? []), ...completed.flatMap((c) => c.stars)]) if (seenBefore > 0 && star.createdAt > seenBefore) ids.add(star.id);
    return ids;
  }, [filling, completed, seenBefore]);
  const fillingInfo = filling ? { sign: filling.row.sign, filled: filling.stars.length } : null;

  return (
    <>
      <header className={s.intro}>
        <p className={b.eyebrow}>별자리 인연</p>
        <h1 className={s.title}>{owner.nickname}님의 별자리</h1>
        <HowToButton />
      </header>
      {view.link ? <LinkPrompt link={view.link} reload={reload} /> : null}

      {filling ? (
        <>
          {latest && filling.stars.length === 0 ? (
            <CompletedCard
              row={latest}
              ownerNickname={owner.nickname}
              allRank={ranks[latest.sign]?.all ?? null}
              filling={fillingInfo}
              sharePrimary={false}
              celebrate={seenBefore > 0 && (latest.completedAt ?? 0) > seenBefore}
              onRefilled={reload}
            />
          ) : null}
          <FillingSection
            view={view}
            fresh={fresh}
            completedSigns={completedSigns}
            mySign={mySign}
            reload={reload}
            autoNext={Boolean(latest) && filling.stars.length === 0}
            justMade={justMade}
          />
        </>
      ) : (
        <>
          {latest ? (
            <CompletedCard
              row={latest}
              ownerNickname={owner.nickname}
              allRank={ranks[latest.sign]?.all ?? null}
              filling={null}
              sharePrimary={false}
              celebrate={seenBefore > 0 && (latest.completedAt ?? 0) > seenBefore}
              onRefilled={reload}
            />
          ) : null}
          <ChooseSection
            first={completed.length === 0}
            mySign={mySign}
            completed={completedSigns}
            initialSign={initialSign && !completedSigns.includes(initialSign) ? initialSign : null}
            onChosen={() => {
              setJustMade(true);
              reload();
            }}
          />
          <InviteCode code={invite.code} filling={null} onChanged={reload} />
        </>
      )}

      {latest && (!filling || filling.stars.length === 0) ? (
        <details className={`${b.panel} ${s.fold}`}>
          <summary>
            {getConstellation(latest.sign).ko}의 별 {latest.stars.length}개 보기
          </summary>
          <StarList sign={latest.sign} stars={latest.stars} fresh={fresh} complete otherFilling={fillingInfo} onChanged={reload} />
        </details>
      ) : null}

      <JoinedList joined={view.joined ?? []} />

      <section className={s.section} aria-labelledby="dogam-title">
        <div className={b.sectionHead}>
          <h2 id="dogam-title" className={b.sectionTitle}>
            도감
          </h2>
          <span className={b.count}>12개 중 {completed.length}개 완성</span>
        </div>
        <Dogam completed={completedSigns} filling={fillingInfo} />
        <p className={b.helper}>칸을 누르면 그 별자리의 랭킹을 볼 수 있어요.</p>
      </section>

      <section className={s.section} aria-labelledby="top-title">
        <div className={b.sectionHead}>
          <h2 id="top-title" className={b.sectionTitle}>
            내 인연 TOP 5
          </h2>
        </div>
        {top5.length ? (
          <ol className={s.top}>
            {top5.map((star, i) => (
              <li key={star.id}>
                <span className={s.topRank}>{i + 1}</span>
                <span className={s.topName}>{star.nickname}</span>
                <span className={s.topSign}>{getConstellation(star.sign).ko}</span>
                <span className={s.topScore}>{star.score}점</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className={b.helper}>첫 별이 들어오면 인연 점수가 높은 순서로 보여 드려요.</p>
        )}
      </section>

      <nav className={s.section} aria-labelledby="more-title">
        <h2 id="more-title" className={b.sectionTitle}>
          더 보기
        </h2>
        <BondsMoreTiles weekTop={view.weekTop} />
      </nav>

      <Settings rankingPublic={owner.rankingPublic} reload={reload} />
    </>
  );
}

function FillingSection({ view, fresh, completedSigns, mySign, reload, autoNext, justMade = false }: {
  view: OwnerView; fresh: ReadonlySet<string>; completedSigns: SignId[]; mySign: SignId | null; reload: () => void;
  /** started by itself after a completion, still empty: say so and offer a swap without a confirm */
  autoNext: boolean;
  /** chosen just now on this page: the invite comes into view (a share sheet cannot open by itself, so it is a big button) */
  justMade?: boolean;
}) {
  const inviteRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (justMade) inviteRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [justMade]);
  const filling = view.filling!;
  const def = getConstellation(filling.row.sign);
  const filled = filling.stars.length;
  const total = filling.stars.reduce((sum, star) => sum + star.score, 0);
  const labels = Array.from({ length: def.slots }, (_, i) => filling.stars.find((star) => star.slot === i)?.nickname ?? null);
  const litSlots = filling.stars.map((star) => star.slot);
  const newSlots = filling.stars.filter((star) => fresh.has(star.id)).map((star) => star.slot);
  const [switching, setSwitching] = useState(false);
  const [target, setTarget] = useState<SignId | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const doSwitch = async () => {
    if (!target) return;
    setBusy(true);
    const result = await bondsApi("switch", { sign: target });
    setBusy(false);
    setConfirm(false);
    if (result.ok) {
      setSwitching(false);
      setTarget(null);
      reload();
    } else setError(bondsMessage(result));
  };

  return (
    <>
      <section className={`${b.panel} ${s.current}`} aria-labelledby="current-title">
        <p className={b.eyebrow}>{autoNext ? "다음 별자리" : "지금 채우는 별자리"}</p>
        <h2 id="current-title" className={s.currentTitle}>
          {autoNext ? `다음은 ${def.ko}예요` : def.ko} <span className={s.en}>· {def.en}</span>
        </h2>
        {autoNext ? <p className={b.helper}>바꾸고 싶으면 지금 바꿀 수 있어요. 아직 별이 없어서 바로 바뀌어요.</p> : null}
        {/* Just made (no star yet): the invite comes first, big; a browser may refuse to open a share sheet by itself. */}
        {filled === 0 ? (
          <div ref={inviteRef} className={s.inviteFirst}>
            <InviteShareButton code={view.invite.code} sign={def.id} filled={filled} ownerNickname={view.owner.nickname} />
          </div>
        ) : null}
        <ConstellationArt sign={def.id} lit={litSlots} newSlots={newSlots} labels={labels} size={320} className={s.art} />
        <p className={s.progress}>
          <strong>
            {filled}/{def.slots}
          </strong>
          <span> · 인연 {total}점</span>
        </p>
        <ConstellationStats scores={filling.stars.map((star) => star.score)} />
        <p className={b.helper}>
          {filled === 0 ? "카톡으로 초대 링크를 보내면 친구가 첫 번째 별이 돼요." : `별 ${def.slots - filled}개만 더 모이면 완성이에요.`}
        </p>
        {filled > 0 ? (
          <div className={s.inviteFirst}>
            <InviteShareButton code={view.invite.code} sign={def.id} filled={filled} ownerNickname={view.owner.nickname} />
          </div>
        ) : null}
        <InviteCode code={view.invite.code} filling={{ sign: def.id, filled }} onChanged={reload} />
        {filled > 0 ? (
          <div className={s.shareRow}>
            {/* No score in what a filling share says: a sum of few friends is their scores (privacy §4). */}
            <BondsShareButton constellationId={filling.row.id} text={`${view.owner.nickname}님의 ${def.ko} · 별 ${filled}/${def.slots}`} />
          </div>
        ) : null}
      </section>

      <section className={s.section} aria-labelledby="stars-title">
        <div className={b.sectionHead}>
          <h2 id="stars-title" className={b.sectionTitle}>
            들어온 별
          </h2>
          <span className={b.count}>{filled}개</span>
        </div>
        <StarList sign={def.id} stars={filling.stars} fresh={fresh} complete={false} otherFilling={null} onChanged={reload} />
      </section>

      <section className={s.section}>
        {switching ? (
          <div className={b.panel}>
            <h2 className={b.sectionTitle}>바꿀 별자리를 골라요</h2>
            <SignPicker mySign={mySign} completed={completedSigns} current={def.id} selected={target} onSelect={setTarget} />
            <div className={b.actionsRow}>
              <Button variant="secondary" disabled={!target || busy} onClick={() => (filled === 0 ? doSwitch() : setConfirm(true))}>
                {target ? `${getConstellation(target).ko}로 바꾸기` : "별자리를 골라 주세요"}
              </Button>
              <Button variant="ghost" onClick={() => setSwitching(false)}>
                그대로 채울게요
              </Button>
            </div>
            {error ? (
              <p className={b.error} role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <Button variant="secondary" block onClick={() => setSwitching(true)}>
            별자리 바꾸기
          </Button>
        )}
        <ConfirmDialog open={confirm} title="별자리를 바꿀까요?" confirmLabel="바꾸고 처음부터 채우기" onConfirm={doSwitch} onClose={() => setConfirm(false)} busy={busy}>
          <p>
            {filled > 0 ? `지금 모은 별 ${filled}개가 사라지고 ` : ""}
            {target ? getConstellation(target).ko : "새 별자리"}를 처음부터 채워요.
          </p>
        </ConfirmDialog>
      </section>
    </>
  );
}

function ChooseSection({ first, mySign, completed, initialSign, onChosen }: {
  first: boolean; mySign: SignId | null; completed: SignId[]; initialSign: SignId | null; onChosen: () => void;
}) {
  const allDone = completed.length >= 12;
  const [selected, setSelected] = useState<SignId | null>(initialSign ?? (mySign && !completed.includes(mySign) ? mySign : null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    const result = await bondsApi("choose", { sign: selected });
    setBusy(false);
    if (result.ok) onChosen();
    else setError(bondsMessage(result));
  };
  if (allDone) {
    return (
      <section className={b.panel}>
        <h2 className={b.sectionTitle}>열두 별자리를 모두 채웠어요</h2>
        <p className={b.helper}>마음에 드는 별자리를 새로 채우면 다시 랭킹에 도전할 수 있어요.</p>
      </section>
    );
  }
  return (
    <section className={b.panel} aria-labelledby="choose-title">
      <h2 id="choose-title" className={b.sectionTitle}>
        {first ? "채울 별자리를 골라요" : "다음에 채울 별자리를 골라요"}
      </h2>
      <p className={b.helper}>한 번에 하나씩 채워요. 친구는 들어온 순서대로 다음 칸의 별이 돼요.</p>
      <SignPicker mySign={mySign} completed={completed} selected={selected} onSelect={setSelected} />
      <Button block disabled={!selected || busy} onClick={start}>
        {selected ? `${getConstellation(selected).ko}로 시작하기` : "별자리를 골라 주세요"}
      </Button>
      {error ? (
        <p className={b.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The code itself, folded under 초대코드 보기 (owner 2026-10-23, the 2026-10-02 decision): the invite is a link sent on
 * KakaoTalk (InviteShareButton); the code, its copy and 코드 새로 만들기 are for the rare friend who gets the code only.
 */
function InviteCode({ code: initialCode, filling, onChanged }: { code: string; filling: { sign: SignId; filled: number } | null; onChanged: () => void }) {
  const [code, setCode] = useState(initialCode);
  const [toast, setToast] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const regenerate = async () => {
    setBusy(true);
    const result = await bondsApi<{ code: string }>("invite", {});
    setBusy(false);
    setConfirm(false);
    if (result.ok) {
      setCode(result.code);
      setToast("새 코드를 만들었어요. 예전 코드와 링크는 이제 열리지 않아요");
      // The big invite buttons read the page's view: load it again so they send the new link, not the blocked one (QA H1).
      onChanged();
    } else setToast(bondsMessage(result));
  };

  return (
    <details className={s.invite}>
      <summary className={s.inviteSummary}>초대코드 보기</summary>
      <p className={s.code} aria-label={`초대코드 ${code.split("").join(" ")}`}>
        {code}
      </p>
      <div className={s.inviteTools}>
        <button
          type="button"
          className={b.textButton}
          onClick={async () => setToast((await copyText(code)) === "copied" ? "코드를 복사했어요" : "복사하지 못했어요")}
        >
          코드 복사
        </button>
        <button type="button" className={b.textButton} onClick={() => setConfirm(true)}>
          코드 새로 만들기
        </button>
      </div>
      <p className={b.toast} role="status">
        {toast}
      </p>
      {filling ? null : <p className={b.helper}>지금은 친구가 코드를 열면 다음 별자리를 고르는 중이라고 안내해요.</p>}
      <ConfirmDialog open={confirm} title="코드를 새로 만들까요?" confirmLabel="새 코드 만들기" onConfirm={regenerate} onClose={() => setConfirm(false)} busy={busy}>
        <p>지금 코드와 링크는 바로 막혀요. 모르는 사람에게 퍼졌을 때 써 주세요. 이미 들어온 별은 그대로예요.</p>
      </ConfirmDialog>
    </details>
  );
}

function Settings({ rankingPublic, reload }: { rankingPublic: boolean; reload: () => void }) {
  const [on, setOn] = useState(rankingPublic);
  const [error, setError] = useState("");
  const change = async (next: boolean) => {
    setOn(next);
    setError("");
    const result = await bondsApi("settings", { rankingPublic: next });
    if (!result.ok) {
      setOn(!next);
      setError(bondsMessage(result));
    } else reload();
  };
  return (
    <section className={s.section} aria-labelledby="settings-title">
      <h2 id="settings-title" className={b.sectionTitle}>
        설정
      </h2>
      <Checkbox checked={on} onChange={change}>
        랭킹에 내 이름 올리기
      </Checkbox>
      <p className={b.helper}>
        끄면 랭킹에서 빠지고, 다른 사람에게는 비공개라는 표시도 보이지 않아요. 기록은 이 기기에서 이어져요. 브라우저 데이터를 지우면 이어서 볼 수 없어요.
      </p>
      {error ? (
        <p className={b.error} role="alert">
          {error}
        </p>
      ) : null}
      <p className={b.helper}>
        <Link href="/privacy" className={s.inlineLink}>
          개인정보처리방침
        </Link>
        에서 무엇을 저장하는지 볼 수 있어요.
      </p>
    </section>
  );
}
