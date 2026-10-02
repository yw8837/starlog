"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getConstellation } from "@starlog/core";
import type { WeekTop } from "@/app/ranking/loadLeaders";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import { bondsApi, seenUntil } from "@/lib/bonds/client";
import type { OwnerView } from "@/lib/bonds/service";
import { normalizeCode } from "@/lib/bonds/text";
import { BondsMoreTiles } from "./BondsMoreTiles";
import { ConstellationArt } from "./ConstellationArt";
import { InviteShareButton } from "./InviteShareButton";
import s from "./BondsHomeRow.module.css";

type Me = ({ owner: null } | OwnerView) & { weekTop?: WeekTop | null };

/**
 * The home's 별자리 인연 section (spec §3 홈 화면 자리): a section header (eyebrow, h2, one line), then by state
 * - first visit: two entry cards, 내 별자리 만들기 (시작하기) and 친구 초대코드로 참여 (code + 참여하기), side by
 *   side on desktop and stacked with 또는 between them on phones;
 * - filling: the small figure, the badge `양자리 2/4 · 174점` and 초대하기 (a new star sparkles until the owner
 *   page is opened), and the code entry as one quiet line;
 * - between constellations: the way to the next one and the 도감 count.
 * Every state ends with the 별자리 인연 랭킹 and 이번 주 행운 번호 tiles. Renders nothing while loading, on an
 * error, or with the feature off.
 */
export function BondsHomeRow({ enabled = SITE.features.bonds, className }: { enabled?: boolean; className?: string }) {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void bondsApi<Me>("me?view=home").then((result) => {
      if (!live || !result.ok) return;
      const { ok: _ok, ...data } = result;
      setMe(data as Me);
    });
    return () => {
      live = false;
    };
  }, [enabled]);

  if (!enabled || !me) return null;
  const sectionClass = [s.section, className].filter(Boolean).join(" ");

  return (
    <section className={sectionClass} aria-labelledby="bonds-home-title">
      <header className={s.head}>
        <p className={s.eyebrow}>WITH FRIENDS</p>
        <h2 id="bonds-home-title" className={s.heading}>
          별자리 인연
        </h2>
        <p className={s.lead}>친구가 별이 되어 내 별자리를 채워요</p>
      </header>
      {me.owner === null ? <StartChoices /> : <OwnerCard me={me} />}
      <BondsMoreTiles weekTop={me.weekTop} />
    </section>
  );
}

/** This device's 별자리 인연: the constellation being filled (or the next to choose), then a quiet code-entry line. */
function OwnerCard({ me }: { me: OwnerView }) {
  const filling = me.filling;
  if (!filling) {
    return (
      <div className={s.card}>
        <Link href="/bonds" className={s.main} aria-label={`별자리 인연, 도감 ${me.completed.length}/12`}>
          <span className={s.text}>
            <span className={s.title}>내 별자리 보기</span>
            <span className={s.sub}>{me.completed.length ? "다음에 채울 별자리를 골라요" : "채울 별자리를 골라요"}</span>
          </span>
          <span className={s.badge}>도감 {me.completed.length}/12</span>
        </Link>
        <JoinLine />
      </div>
    );
  }

  const def = getConstellation(filling.row.sign);
  const seen = seenUntil();
  const total = filling.stars.reduce((sum, star) => sum + star.score, 0);
  const newSlots = seen > 0 ? filling.stars.filter((star) => star.createdAt > seen).map((star) => star.slot) : [];
  const badge = `${def.ko} ${filling.stars.length}/${def.slots} · ${total}점`;

  return (
    <div className={s.card}>
      <Link href="/bonds" className={s.main} aria-label={`별자리 인연, ${badge}${newSlots.length ? `, 새 별 ${newSlots.length}개` : ""}`}>
        <ConstellationArt sign={def.id} lit={filling.stars.map((star) => star.slot)} newSlots={newSlots} size={64} decorative className={s.art} />
        <span className={s.text}>
          <span className={s.title}>내 별자리 보기</span>
          <span className={s.sub}>{newSlots.length ? `새 별이 ${newSlots.length}개 들어왔어요` : `별 ${def.slots - filling.stars.length}개만 더 모이면 완성이에요`}</span>
        </span>
        <span className={s.badge}>{badge}</span>
      </Link>
      <div className={s.actions}>
        <InviteShareButton code={me.invite.code} sign={def.id} filled={filling.stars.length} variant="secondary" />
      </div>
      <JoinLine />
    </div>
  );
}

/** For an owner, joining a friend's constellation is the rare case: one quiet link to the code screen. */
function JoinLine() {
  return (
    <Link href="/b" className={s.joinLine}>
      친구 초대코드로 참여하기
    </Link>
  );
}

/** First visit: the two ways in, as equal sibling cards. */
function StartChoices() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  return (
    <div className={s.choices}>
      <div className={s.choice}>
        <span className={s.icon} aria-hidden="true">
          <svg viewBox="0 0 32 32" focusable="false">
            <path d="M16 4.5l3.1 7.3 7.9.7-6 5.2 1.8 7.7L16 21.3l-6.8 4.1 1.8-7.7-6-5.2 7.9-.7z" fill="#f3dca1" />
          </svg>
        </span>
        <h3 className={s.choiceTitle}>내 별자리 만들기</h3>
        <p className={s.choiceSub}>별자리를 고르고 친구를 초대해요</p>
        <Button size="md" block href="/bonds">
          시작하기
        </Button>
      </div>
      <p className={s.or} aria-hidden="true">
        또는
      </p>
      <form
        className={s.choice}
        onSubmit={(e) => {
          e.preventDefault();
          const clean = normalizeCode(code);
          if (!clean) {
            setError("코드를 다시 확인해 주세요");
            return;
          }
          router.push(`/b/${clean}`);
        }}
        noValidate
      >
        <span className={s.icon} aria-hidden="true">
          <svg viewBox="0 0 32 32" focusable="false">
            <rect x="5" y="9" width="22" height="15" rx="2.5" fill="none" stroke="#cfc6ff" strokeWidth="1.8" />
            <path d="M6 10.5l10 7 10-7" fill="none" stroke="#cfc6ff" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M16 6.2c-.9-1.6-3.4-1.2-3.4.7 0 1.5 2.2 2.6 3.4 3.6 1.2-1 3.4-2.1 3.4-3.6 0-1.9-2.5-2.3-3.4-.7z" fill="#f08a7e" />
          </svg>
        </span>
        <h3 id="bonds-home-join" className={s.choiceTitle}>
          친구 초대코드로 참여
        </h3>
        <p className={s.choiceSub}>받은 6자리 코드를 넣어요</p>
        <div className={s.joinRow}>
          <input
            id="bonds-home-code"
            className={s.input}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.slice(0, 8));
              setError("");
            }}
            placeholder="6자리 코드"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="go"
            aria-labelledby="bonds-home-join"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "bonds-home-code-error" : undefined}
          />
          <Button type="submit" variant="secondary" size="md">
            참여하기
          </Button>
        </div>
        {error ? (
          <p id="bonds-home-code-error" className={s.error} role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
