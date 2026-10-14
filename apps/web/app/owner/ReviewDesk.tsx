"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import r from "@/components/reviews/reviews.module.css";
import { useAccount } from "@/lib/account/client";
import { kstMonthDay } from "@/lib/kst";
import { REPORT_REASONS, fetchReportedReviews, setReviewHidden, type ReportedReview } from "@/lib/reviews/client";
import s from "./ReviewDesk.module.css";

type Reason = (typeof REPORT_REASONS)[number];

/** How many reports gave each reason (the API sends one reason per report, joined). */
function tally(reasons: string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const reason of reasons.split(", ")) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return [...counts];
}

const reasonCount = (counted: Array<[string, number]>, reason: string) => counted.find(([name]) => name === reason)?.[1] ?? 0;

function DeskRow({ review, onChange }: { review: ReportedReview; onChange: (next: ReportedReview) => void }) {
  const counted = tally(review.reasons);
  // The reason most reports gave is the one offered first.
  const [reason, setReason] = useState<Reason>(() =>
    REPORT_REASONS.reduce((best, next) => (reasonCount(counted, next) > reasonCount(counted, best) ? next : best), REPORT_REASONS[0]),
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const hidden = review.status === "hidden";

  const change = async () => {
    setBusy(true);
    setProblem("");
    const ok = await setReviewHidden(review.id, hidden ? null : reason);
    setBusy(false);
    if (ok) onChange({ ...review, status: hidden ? "visible" : "hidden", hiddenReason: hidden ? null : reason });
    else setProblem("저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
  };

  return (
    <li className={r.card}>
      <div className={r.cardTop}>
        <span className={r.stars} aria-label={`5점 중 ${review.rating}점`}>
          {"★".repeat(review.rating)}
          <span className={r.dim}>{"★".repeat(5 - review.rating)}</span>
        </span>
        <span>{review.label}</span>
        <span className={r.badge}>{hidden ? `숨김${review.hiddenReason ? ` · ${review.hiddenReason}` : ""}` : "공개 중"}</span>
      </div>
      {review.body ? <p className={r.body}>{review.body}</p> : <p className={r.note}>별점만 남긴 후기예요.</p>}
      <p className={r.note}>
        {review.nickname} · {kstMonthDay(review.createdAt)}
      </p>
      <p className={r.note}>
        신고 {review.reports}건 ({counted.map(([name, count]) => `${name} ${count}`).join(", ")})
      </p>
      <div className={s.actions}>
        {hidden ? null : (
          <>
            <label className={s.reason} htmlFor={`reason-${review.id}`}>
              숨김 사유
            </label>
            <select id={`reason-${review.id}`} className={s.select} value={reason} onChange={(e) => setReason(e.currentTarget.value as Reason)}>
              {REPORT_REASONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </>
        )}
        <Button variant={hidden ? "secondary" : "ghost"} size="md" onClick={() => void change()} disabled={busy}>
          {hidden ? "다시 보이기" : "숨기기"}
        </Button>
      </div>
      {problem ? (
        <p className={s.error} role="alert">
          {problem}
        </p>
      ) : null}
    </li>
  );
}

/**
 * 후기 관리 on /owner (spec §3): the reviews people reported, newest first, each with its text, stars and
 * reports, and 숨기기 (for one of the rule reasons, never for being unfavourable) or 다시 보이기. Shown to a
 * device with the owner pass only; the API checks the pass again.
 */
export function ReviewDesk() {
  const account = useAccount();
  const owner = Boolean(account?.owner);
  // undefined: loading; null: could not be read
  const [reviews, setReviews] = useState<ReportedReview[] | null | undefined>(undefined);

  useEffect(() => {
    if (!owner) return;
    let live = true;
    void fetchReportedReviews().then((next) => {
      if (live) setReviews(next);
    });
    return () => {
      live = false;
    };
  }, [owner]);

  if (!owner) return null;

  return (
    <section className={s.desk} aria-labelledby="review-desk-title">
      <h2 id="review-desk-title" className={s.title}>
        신고된 후기
      </h2>
      <p className={s.lead}>욕설, 개인정보, 광고, 풀이와 관계없는 글만 숨길 수 있어요. 별점이 낮다는 이유로는 숨기지 않아요.</p>
      {reviews === undefined ? <p className={r.note}>불러오는 중…</p> : null}
      {reviews === null ? <p className={s.error}>후기를 불러오지 못했어요. 새로 고쳐 주세요.</p> : null}
      {reviews?.length === 0 ? <p className={r.note}>신고된 후기가 없어요.</p> : null}
      {reviews && reviews.length > 0 ? (
        <ul className={s.list}>
          {reviews.map((review) => (
            <DeskRow key={review.id} review={review} onChange={(next) => setReviews((list) => list?.map((item) => (item.id === next.id ? next : item)) ?? list)} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
