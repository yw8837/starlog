"use client";

import { useEffect, useState } from "react";
import { StarRating } from "@/components/tarot/Feedback";
import { Button } from "@/components/ui/Button";
import { useAccount } from "@/lib/account/client";
import { REVIEW_MAX } from "@/lib/reviews/text";
import { deleteReview, fetchMyReview, saveReview, type MyReview } from "@/lib/reviews/client";
import f from "@/components/tarot/Feedback.module.css";
import s from "./reviews.module.css";

type State = { at: "loading" } | { at: "writing"; editing?: MyReview } | { at: "saved"; review: MyReview; fresh: boolean };

/**
 * 풀이 후기 at the end of a saved reading (spec §7): the stars first, then an optional line, then
 * 후기 남기기. One review per reading; it can be rewritten or deleted. Shown for a reading saved in
 * the account (`readingId`); the others keep the plain stars (Feedback).
 */
export function ReviewPrompt({ readingId }: { readingId: string }) {
  const account = useAccount();
  const [state, setState] = useState<State>({ at: "loading" });
  const [score, setScore] = useState(0);
  const [line, setLine] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const loggedIn = Boolean(account?.user);

  useEffect(() => {
    if (!loggedIn) return;
    let live = true;
    void fetchMyReview(readingId).then((review) => {
      if (!live) return;
      setState(review ? { at: "saved", review, fresh: false } : { at: "writing" });
    });
    return () => {
      live = false;
    };
  }, [readingId, loggedIn]);

  const submit = async () => {
    setBusy(true);
    setProblem("");
    const result = await saveReview(readingId, score, line);
    setBusy(false);
    if (result.ok) setState({ at: "saved", review: result.review, fresh: true });
    else setProblem(result.message);
  };

  const edit = (review: MyReview) => {
    setScore(review.rating);
    setLine(review.body ?? "");
    setState({ at: "writing", editing: review });
  };

  const remove = async (review: MyReview) => {
    if (await deleteReview(review.id)) {
      setScore(0);
      setLine("");
      setState({ at: "writing" });
    } else setProblem("지우지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
  };

  if (state.at === "saved") {
    const { review } = state;
    return (
      <section className={f.feedback} aria-labelledby="review-title">
        <h2 id="review-title" className={f.title}>
          {state.fresh ? "후기를 남겨 줘서 고마워요" : "내가 남긴 후기"}
        </h2>
        <p className={s.mine} aria-label={`5점 중 ${review.rating}점`}>
          {"★".repeat(review.rating)}
          <span className={s.dim}>{"★".repeat(5 - review.rating)}</span>
        </p>
        {review.body ? <p className={s.mineBody}>{review.body}</p> : null}
        {review.hidden ? <p className={s.note}>운영 원칙에 따라 숨긴 후기예요. 다른 사람에게는 보이지 않아요.</p> : null}
        <div className={s.row}>
          <Button variant="ghost" size="md" onClick={() => edit(review)}>
            고치기
          </Button>
          <Button variant="ghost" size="md" onClick={() => void remove(review)}>
            지우기
          </Button>
        </div>
        {problem ? (
          <p className={s.problem} role="alert">
            {problem}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className={f.feedback} aria-labelledby="review-title">
      <h2 id="review-title" className={f.title}>
        이 풀이, 얼마나 와닿았나요?
      </h2>
      <StarRating value={score} onChange={setScore} labelledBy="review-title" />
      {score > 0 && loggedIn && state.at === "writing" ? (
        <div className={s.compose}>
          <label className={s.label} htmlFor="review-line">
            한 줄 후기 <span className={s.dim}>(선택)</span>
          </label>
          <textarea
            id="review-line"
            className={s.field}
            rows={3}
            maxLength={REVIEW_MAX}
            value={line}
            onChange={(e) => setLine(e.currentTarget.value)}
            placeholder="어떤 점이 와닿았는지 남겨 주세요"
          />
          <p className={s.note}>후기는 다른 사람에게 공개돼요. 질문이나 개인적인 이야기는 쓰지 말아 주세요.</p>
          {problem ? (
            <p className={s.problem} role="alert">
              {problem}
            </p>
          ) : null}
          <Button block onClick={() => void submit()} disabled={busy}>
            {busy ? "남기는 중…" : state.editing ? "후기 고치기" : "후기 남기기"}
          </Button>
        </div>
      ) : (
        <p className={f.thanks} aria-live="polite">
          {score && !loggedIn ? "알려 줘서 고마워요" : ""}
        </p>
      )}
    </section>
  );
}
