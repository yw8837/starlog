"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { kstMonthDay } from "@/lib/kst";
import { REPORT_REASONS, fetchReviews, markHelpful, reportReview, type PublicReview, type ReviewPage } from "@/lib/reviews/client";
import s from "./reviews.module.css";

const FILTERS = [
  { id: "", label: "전체" },
  { id: "tarot", label: "타로" },
  { id: "saju", label: "사주" },
] as const;

function ReviewCard({ review }: { review: PublicReview }) {
  // Starts from what the server says this viewer marked, and follows the server's own answer after a tap.
  const [helpful, setHelpful] = useState({ on: review.helpfulByMe, count: review.helpful });
  const [note, setNote] = useState("");
  const [reporting, setReporting] = useState(false);

  const toggle = async () => {
    const result = await markHelpful(review.id, !helpful.on);
    if (result.ok) setHelpful({ on: result.on, count: result.helpful });
    else setNote(result.code === "LOGIN_REQUIRED" ? "로그인하면 누를 수 있어요." : result.message || "지금은 누를 수 없어요.");
  };

  const report = async (reason: (typeof REPORT_REASONS)[number]) => {
    const result = await reportReview(review.id, reason);
    setReporting(false);
    setNote(result.ok ? "신고했어요. 운영 원칙에 맞는지 확인할게요." : result.code === "LOGIN_REQUIRED" ? "로그인하면 신고할 수 있어요." : "지금은 신고하지 못했어요.");
  };

  return (
    <li className={s.card}>
      <div className={s.cardTop}>
        <span className={s.stars} aria-label={`5점 중 ${review.rating}점`}>
          {"★".repeat(review.rating)}
          <span className={s.dim}>{"★".repeat(5 - review.rating)}</span>
        </span>
        <span>{review.label}</span>
        <span className={s.badge}>풀이 확인</span>
      </div>
      {review.body ? <p className={s.body}>{review.body}</p> : null}
      <div className={s.cardFoot}>
        <span>
          {review.nickname} · {kstMonthDay(review.createdAt)}
          {review.edited ? " · 고침" : ""}
        </span>
        <span className={s.row}>
          <button type="button" className={s.helpful} aria-pressed={helpful.on} onClick={() => void toggle()}>
            도움돼요 {helpful.count}
          </button>
          <button type="button" className={s.report} onClick={() => setReporting((open) => !open)} aria-expanded={reporting}>
            신고
          </button>
        </span>
      </div>
      {reporting ? (
        <div className={s.reasons} role="group" aria-label="신고 사유">
          {REPORT_REASONS.map((reason) => (
            <button key={reason} type="button" className={s.chip} onClick={() => void report(reason)}>
              {reason}
            </button>
          ))}
        </div>
      ) : null}
      {note ? (
        <p className={s.note} role="status">
          {note}
        </p>
      ) : null}
    </li>
  );
}

/**
 * 이용 후기 (spec §7): the visible reviews, newest first, every rating (never only the good ones), with
 * 도움돼요 and 신고. Hidden while there is none, so an empty section never shows.
 */
export function ReviewList({ title = "이용 후기" }: { title?: string }) {
  const [product, setProduct] = useState<string>("");
  const [page, setPage] = useState<ReviewPage | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchReviews(product || undefined).then((next) => {
      if (live) setPage(next);
    });
    return () => {
      live = false;
    };
  }, [product]);

  const loadMore = async () => {
    if (!page?.next) return;
    setMore(true);
    const next = await fetchReviews(product || undefined, page.next);
    setMore(false);
    if (next) setPage({ ...next, reviews: [...page.reviews, ...next.reviews] });
  };

  // Nothing to show yet (or the list could not be read): no empty section on the page.
  if (!page || (page.summary.count === 0 && product === "")) return null;

  return (
    <section className={s.list} aria-labelledby="reviews-title">
      <div className={s.head}>
        <h2 id="reviews-title" className={s.title}>
          {title}
        </h2>
        <p>
          후기 {page.summary.count}개
          {page.summary.average !== null ? <span className={s.average}> · 평균 ★ {page.summary.average.toFixed(1)}</span> : null}
        </p>
      </div>
      <div className={s.filters}>
        {FILTERS.map((filter) => (
          <button key={filter.id} type="button" className={s.chip} aria-pressed={product === filter.id} onClick={() => setProduct(filter.id)}>
            {filter.label}
          </button>
        ))}
      </div>
      {page.reviews.length === 0 ? <p className={s.note}>아직 이 풀이의 후기가 없어요.</p> : null}
      <ul className={s.list}>
        {page.reviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </ul>
      {page.next ? (
        <Button variant="secondary" block onClick={() => void loadMore()} disabled={more}>
          {more ? "불러오는 중…" : "후기 더 보기"}
        </Button>
      ) : null}
      <p className={s.note}>풀이를 연 사람만 후기를 남길 수 있고, 별점과 관계없이 모든 후기를 최신순으로 보여 줘요.</p>
    </section>
  );
}
