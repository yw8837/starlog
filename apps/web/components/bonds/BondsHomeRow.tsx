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
 * The home's 별자리 인연 row (spec §3 홈 화면 자리). Filling: the small figure, the badge
 * `양자리 2/4 · 174점` (stars in / slots · 인연 total so far) and 초대하기; a new star sparkles until the owner
 * page is opened. Before the start: 별자리 인연 시작하기 and 초대코드로 참여. Secondary styles only (the
 * home keeps its one gold primary). Renders nothing while loading, on an error, or with the feature off.
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
  const rowClass = [s.row, className].filter(Boolean).join(" ");
  if (me.owner === null) return <StartRow className={rowClass} weekTop={me.weekTop} />;

  const filling = me.filling;
  if (!filling) {
    return (
      <section className={rowClass} aria-labelledby="bonds-home-title">
        <Link href="/bonds" className={s.main}>
          <span className={s.text}>
            <span id="bonds-home-title" className={s.title}>
              별자리 인연
            </span>
            <span className={s.sub}>{me.completed.length ? "다음에 채울 별자리를 골라요" : "채울 별자리를 골라요"}</span>
          </span>
          <span className={s.badge}>도감 {me.completed.length}/12</span>
        </Link>
        <BondsMoreTiles weekTop={me.weekTop} className={s.more} />
      </section>
    );
  }

  const def = getConstellation(filling.row.sign);
  const seen = seenUntil();
  const total = filling.stars.reduce((sum, star) => sum + star.score, 0);
  const newSlots = seen > 0 ? filling.stars.filter((star) => star.createdAt > seen).map((star) => star.slot) : [];
  const badge = `${def.ko} ${filling.stars.length}/${def.slots} · ${total}점`;

  return (
    <section className={rowClass} aria-labelledby="bonds-home-title">
      <Link href="/bonds" className={s.main} aria-label={`별자리 인연, ${badge}${newSlots.length ? `, 새 별 ${newSlots.length}개` : ""}`}>
        <ConstellationArt sign={def.id} lit={filling.stars.map((star) => star.slot)} newSlots={newSlots} size={64} decorative className={s.art} />
        <span className={s.text}>
          <span id="bonds-home-title" className={s.title}>
            별자리 인연
          </span>
          <span className={s.sub}>{newSlots.length ? `새 별이 ${newSlots.length}개 들어왔어요` : `별 ${def.slots - filling.stars.length}개만 더 모이면 완성이에요`}</span>
        </span>
        <span className={s.badge}>{badge}</span>
      </Link>
      <div className={s.actions}>
        <InviteShareButton code={me.invite.code} sign={def.id} filled={filling.stars.length} variant="secondary" />
      </div>
      <BondsMoreTiles weekTop={me.weekTop} className={s.more} />
    </section>
  );
}

function StartRow({ className, weekTop }: { className: string; weekTop?: WeekTop | null }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  return (
    <section className={className} aria-labelledby="bonds-home-title">
      <div className={s.text}>
        <span id="bonds-home-title" className={s.title}>
          별자리 인연
        </span>
        <span className={s.sub}>친구가 별이 되어 내 별자리를 채워요. 사주로 본 인연 점수로 랭킹에 올라요.</span>
      </div>
      <Button variant="secondary" size="md" block href="/bonds">
        별자리 인연 시작하기
      </Button>
      <form
        className={s.join}
        onSubmit={(e) => {
          e.preventDefault();
          const clean = normalizeCode(code);
          if (!clean) {
            setError("코드를 다시 확인해 주세요");
            return;
          }
          router.push(`/b/${clean}`);
        }}
      >
        <label htmlFor="bonds-home-code" className={s.joinLabel}>
          초대코드로 참여
        </label>
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
            enterKeyHint="go"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "bonds-home-code-error" : undefined}
          />
          <Button type="submit" variant="secondary" size="md">
            참여
          </Button>
        </div>
        {error ? (
          <p id="bonds-home-code-error" className={s.error} role="alert">
            {error}
          </p>
        ) : null}
      </form>
      <BondsMoreTiles weekTop={weekTop} className={s.more} />
    </section>
  );
}
