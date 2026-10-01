"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LUCKY_NOTICE, kstWeekId } from "@starlog/core";
import { BirthFields, DEFAULT_BIRTH, birthBody, type BirthValue } from "@/components/bonds/BirthFields";
import { Button } from "@/components/ui/Button";
import { ShareImageButton } from "@/components/ui/ShareImageButton";
import { SITE } from "@/lib/config";
import { bondsApi, bondsMessage } from "@/lib/bonds/client";
import { useSajuProfile } from "@/lib/sajuFlow";
import b from "@/components/bonds/bonds.module.css";
import s from "./LuckyView.module.css";

interface Lucky {
  weekId: string;
  numbers: { n: number; reason: string }[];
  card: { cardId: string; name: string };
  notice: string;
}

/** This week's numbers only (no birth date), so a reload shows them again without asking. */
const STORE_KEY = "starlog.lucky";

function stored(): Lucky | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "null") as Lucky | null;
    return value && value.weekId === kstWeekId(Date.now()) && Array.isArray(value.numbers) ? value : null;
  } catch {
    return null;
  }
}

function store(lucky: Lucky): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(lucky));
  } catch {
    // private mode: the numbers simply are asked for again
  }
}

/** "9월 28일 ~ 10월 4일" for a week id (its Monday). */
function weekRange(weekId: string): string {
  const monday = Date.parse(`${weekId}T00:00:00+09:00`);
  const fmt = (ms: number) => new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(ms);
  return `${fmt(monday)} ~ ${fmt(monday + 6 * 86_400_000)}`;
}

/**
 * 이번 주 행운 번호: six numbers from the 하도수 of my weakest element, my day master, this week's card
 * and the week's element, each with its reason, and the notice that every number is equally likely.
 */
export function LuckyView() {
  const [lucky, setLucky] = useState<Lucky | null | undefined>(undefined);

  useEffect(() => {
    const saved = stored();
    if (saved) {
      setLucky(saved);
      return;
    }
    // A 별자리 인연 owner already has a stored basis: no form needed.
    void bondsApi<Lucky>("/api/lucky").then((result) => {
      if (result.ok) {
        const { ok: _ok, ...data } = result;
        store(data as Lucky);
        setLucky(data as Lucky);
      } else setLucky(null);
    });
  }, []);

  return (
    <>
      <header className={s.intro}>
        <p className={b.eyebrow}>이번 주 행운 번호</p>
        <h1 className={s.title}>나의 오행으로 고른 이번 주 번호</h1>
        <p className={s.lead}>부족한 기운, 나의 일간, 이번 주 카드와 이번 주 기운에서 번호를 하나씩 골라요. 같은 주에는 언제 봐도 같은 번호예요.</p>
      </header>
      {lucky === undefined ? (
        <p className={b.helper} role="status">
          번호를 불러오는 중이에요
        </p>
      ) : lucky ? (
        <Result lucky={lucky} onAgain={() => setLucky(null)} />
      ) : (
        <LuckyForm
          onDone={(result) => {
            store(result);
            setLucky(result);
          }}
        />
      )}
      <p className={s.notice}>{LUCKY_NOTICE}</p>
    </>
  );
}

function LuckyForm({ onDone }: { onDone: (lucky: Lucky) => void }) {
  const { profile } = useSajuProfile();
  const initial: BirthValue = profile
    ? { calendar: profile.calendar, year: profile.year, month: profile.month, day: profile.day, isLeapMonth: profile.isLeapMonth }
    : DEFAULT_BIRTH;
  return <Form key={profile ? "profile" : "fresh"} initial={initial} onDone={onDone} />;
}

function Form({ initial, onDone }: { initial: BirthValue; onDone: (lucky: Lucky) => void }) {
  const [birth, setBirth] = useState<BirthValue>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await bondsApi<Lucky>("/api/lucky", { birth: birthBody(birth) });
    setBusy(false);
    if (!result.ok) {
      setError(bondsMessage(result));
      return;
    }
    const { ok: _ok, ...data } = result;
    onDone(data as Lucky);
  };
  return (
    <form className={`${b.panel} ${b.form}`} onSubmit={submit} noValidate>
      <BirthFields id="lucky-birth" value={birth} onChange={setBirth} error={error} helper="번호를 고르는 데만 쓰고 저장하지 않아요. 태어난 시간은 쓰지 않아요." />
      <Button type="submit" block disabled={busy}>
        이번 주 번호 받기
      </Button>
    </form>
  );
}

function Result({ lucky, onAgain }: { lucky: Lucky; onAgain: () => void }) {
  const query = `n=${lucky.numbers.map((x) => x.n).join("-")}&w=${lucky.weekId}`;
  return (
    <section className={`${b.panel} ${b.panelGold} ${s.result}`} aria-labelledby="lucky-week">
      <p id="lucky-week" className={b.eyebrow}>
        {weekRange(lucky.weekId)}
      </p>
      <ol className={s.balls} aria-label="이번 주 행운 번호">
        {lucky.numbers.map((x) => (
          <li key={x.n} className={s.ball}>
            {x.n}
          </li>
        ))}
      </ol>
      <ul className={s.reasons}>
        {lucky.numbers.map((x) => (
          <li key={x.n}>{x.reason}</li>
        ))}
      </ul>
      <p className={b.helper}>이번 주 카드 · {lucky.card.name}</p>
      <ShareImageButton
        imageUrl={`/api/og/lucky?${query}`}
        fileName={`starlog-lucky-${lucky.weekId}.png`}
        shareText={`이번 주 행운 번호 · ${SITE.nameKo}`}
        shareUrl={`${SITE.url}/lucky`}
        primary
      />
      <button type="button" className={b.textButton} onClick={onAgain}>
        다른 생년월일로 보기
      </button>
    </section>
  );
}
