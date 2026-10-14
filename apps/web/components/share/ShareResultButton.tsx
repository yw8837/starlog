"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ShareButton } from "@/components/ui/ShareButton";
import type { ShareLinkResult } from "@/lib/share/client";
import s from "./ShareResultButton.module.css";

/** What a result screen hands 공유하기: making the reading's link and taking it down. */
export interface ShareActions {
  /** Makes (or finds) the reading's public link. */
  create: () => Promise<ShareLinkResult>;
  /** Stops sharing it; false when that failed. */
  stop: () => Promise<boolean>;
  /** The live link this device already made for the reading, if any (lib/share/client.ts knownShareLink). */
  current?: () => { url: string; imageUrl: string } | null;
}

type ShareResultButtonProps = ShareActions & {
  kind: "tarot" | "saju";
  /** What the share sheet and the Kakao message say with the link, e.g. "스타로그에서 뽑은 카드 · 은둔자 · 별". */
  text: string;
};

const SHOWN: Record<ShareResultButtonProps["kind"], { shown: string; hidden: string }> = {
  tarot: { shown: "뽑은 카드와 풀이 전체", hidden: "질문과 직접 쓴 말, 고른 상황, 이어서 물어본 내용" },
  saju: { shown: "한눈에 보기와 풀이", hidden: "생년월일과 태어난 시각, 명식, 고른 상황, 이어서 물어본 내용" },
};

type Phase =
  | { at: "intro" }
  | { at: "making" }
  | { at: "ready"; url: string; imageUrl: string; error?: string }
  | { at: "failed"; message: string }
  | { at: "stopped" };

/**
 * 결과 공유 (owner 2026-10-13): 공유하기 first says what a friend will see and what stays hidden, and
 * only 링크 만들기 publishes the reading's copy (/s/<id>). Then the usual share buttons send that link,
 * each from its own tap (a phone's share sheet must open from one). 공유 그만하기 takes the link down,
 * and shows whenever the reading has a live link (`current`); after it, a new link can be made.
 */
export function ShareResultButton({ kind, text, create, stop, current }: ShareResultButtonProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ at: "intro" });
  const copy = SHOWN[kind];

  const make = async () => {
    setPhase({ at: "making" });
    const result = await create();
    setPhase(result.ok ? { at: "ready", url: result.url, imageUrl: result.imageUrl } : { at: "failed", message: result.message });
  };

  const takeDown = async (live: Extract<Phase, { at: "ready" }>) => {
    if (await stop()) setPhase({ at: "stopped" });
    else setPhase({ ...live, error: "공유를 멈추지 못했어요. 잠시 뒤에 다시 시도해 주세요." });
  };

  const openSheet = () => {
    const live = phase.at === "intro" ? current?.() : null;
    if (live) setPhase({ at: "ready", ...live });
    setOpen(true);
  };

  return (
    <>
      <Button variant="secondary" size="md" onClick={openSheet}>
        공유하기
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy="share-result-title">
        <div className={s.sheet}>
          <h2 id="share-result-title" className={s.title}>
            결과 공유하기
          </h2>
          <p className={s.lead}>
            링크를 받은 사람에게는 <strong>{copy.shown}</strong>가 보여요. {copy.hidden}은 보이지 않아요.
          </p>
          {phase.at === "ready" ? (
            <>
              <p className={s.link}>{phase.url.replace(/^https?:\/\//, "")}</p>
              <div className={s.actions}>
                <ShareButton text={text} target={{ url: phase.url, imageUrl: phase.imageUrl, button: "풀이 보기", description: "뽑은 카드와 풀이 전체를 볼 수 있어요. 질문과 개인 정보는 가렸어요." }} />
              </div>
              {phase.error ? (
                <p className={s.note} role="alert">
                  {phase.error}
                </p>
              ) : null}
              <button type="button" className={s.stop} onClick={() => takeDown(phase)}>
                공유 그만하기
              </button>
            </>
          ) : (
            <>
              {phase.at === "failed" ? (
                <p className={s.note} role="alert">
                  {phase.message}
                </p>
              ) : phase.at === "stopped" ? (
                <p className={s.note} role="status">
                  공유를 멈췄어요. 보낸 링크는 이제 열리지 않아요.
                </p>
              ) : null}
              <Button block onClick={make} disabled={phase.at === "making"}>
                {phase.at === "making" ? "링크를 만드는 중…" : "공유 링크 만들기"}
              </Button>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
