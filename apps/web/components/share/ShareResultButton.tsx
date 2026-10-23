"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ShareButton } from "@/components/ui/ShareButton";
import type { ShareLink, ShareLinkResult } from "@/lib/share/client";
import s from "./ShareResultButton.module.css";

/** What a result screen hands 공유하기: making the reading's link and taking it down. */
export interface ShareActions {
  /** Makes (or finds) the reading's public link. */
  create: () => Promise<ShareLinkResult>;
  /**
   * Stops sharing it; false when that failed. Absent for a share that holds nothing of the person (지금의 한 장: the same
   * card, line and design is one link for everyone), so 공유 그만하기 does not show.
   */
  stop?: () => Promise<boolean>;
  /** The live link this device already made for the reading, if any (lib/share/client.ts knownShareLink). */
  current?: () => ShareLink | null;
  /**
   * Why this result cannot be shared yet (still being written, or a record not read whole): 공유하기 still shows on
   * every result screen (owner 2026-10-23) and its sheet says why instead of making a link.
   */
  unavailable?: string;
}

export type ShareKind = "tarot" | "saju" | "daily" | "now" | "tarot-free" | "saju-free" | "premium" | "bonds" | "bond";

type ShareResultButtonProps = ShareActions & {
  kind: ShareKind;
  /** What the share sheet and the Kakao message say with the link, e.g. "스타로그에서 뽑은 카드 · 은둔자 · 별". */
  text: string;
  /** More ways to send the same link once it is made (a premium reading's image). */
  extra?: (link: { url: string; imageUrl: string }) => ReactNode;
  /** The button's own label, where a screen has more than one thing to share (default 공유하기). */
  label?: string;
  /** The screen's gold primary (the ranking page's own constellation); a secondary otherwise. */
  primary?: boolean;
};

/** 이 after a final consonant, 가 after a vowel: "풀이 전체가", "합계와 평균이". */
const subject = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 !== 0 ? "이" : "가";
};

/**
 * What the sheet says a friend sees and what stays out, and the line under the Kakao message's title.
 * Only what lib/share/payload.ts really leaves out: the reading itself still carries what the worry is
 * about, and a saju reading can name the chart's pillars in Hangul, so neither promises more (A2 SHARE-1/2).
 */
const SHOWN: Record<ShareKind, { shown: string; hidden: string; kakao: string; button?: string }> = {
  tarot: {
    shown: "뽑은 카드와 풀이 전체",
    hidden: "질문 원문과 직접 쓴 말은 가려요. 다만 풀이에 고민 내용이 담겨 있으니 보낼 사람을 골라 주세요.",
    kakao: "뽑은 카드와 풀이 전체를 볼 수 있어요. 질문 원문과 직접 쓴 말은 가렸어요.",
  },
  saju: {
    shown: "한눈에 보기와 풀이",
    hidden: "생년월일과 태어난 시각, 고른 상황은 가려요. 다만 풀이에 내 사주 이야기가 담겨 있으니 보낼 사람을 골라 주세요.",
    kakao: "한눈에 보기와 사주 풀이를 볼 수 있어요. 생년월일과 태어난 시각은 가렸어요.",
  },
  daily: {
    shown: "오늘 뽑은 카드와 풀이",
    hidden: "이름이나 기기 정보 같은 개인 정보는 담기지 않아요.",
    kakao: "오늘 뽑은 카드와 풀이를 볼 수 있어요. 나도 오늘의 한 장을 뽑아 볼 수 있어요.",
  },
  now: {
    shown: "뽑은 카드와 카드가 건넨 한 문장, 그렇게 읽은 이유",
    hidden: "적은 고민은 담기지 않아요.",
    kakao: "친구가 뽑은 지금의 한 장이에요. 나도 한 장 뽑아 볼 수 있어요.",
    button: "카드 보기",
  },
  "tarot-free": {
    shown: "뽑은 카드와 무료로 본 첫 풀이",
    hidden: "질문 원문과 직접 쓴 말은 가리고, 결제해야 보이는 뒷부분은 담지 않아요. 다만 풀이에 고민 내용이 담겨 있으니 보낼 사람을 골라 주세요.",
    kakao: "뽑은 카드와 무료로 본 첫 풀이를 볼 수 있어요. 질문 원문과 직접 쓴 말은 가렸어요.",
  },
  "saju-free": {
    shown: "맛보기 제목과 요약",
    // Like the paid saju's: pillars in hanja are hidden, a Hangul one ("병화 일간") can stay (lib/share/payload.ts hidePillars).
    hidden: "생년월일과 태어난 시각은 가려요. 다만 맛보기에 내 사주 이야기가 담겨 있으니 보낼 사람을 골라 주세요.",
    kakao: "사주 맛보기의 제목과 요약을 볼 수 있어요. 생년월일과 태어난 시각은 가렸어요.",
  },
  premium: {
    shown: "어떤 프리미엄 풀이인지와 카드나 제목",
    hidden: "풀이 본문과 질문, 생년월일은 담기지 않아요.",
    kakao: "친구가 연 프리미엄 풀이예요. 나도 볼 수 있어요.",
  },
  bonds: {
    shown: "내 별자리와 별이 된 친구들의 닉네임",
    hidden: "인연 점수 합계와 평균은 별자리를 다 채운 뒤에만 보여요. 친구마다의 점수와 남긴 한 줄, 생년월일은 담기지 않아요.",
    kakao: "친구들이 별이 되어 채운 별자리예요. 나도 별자리 인연을 시작할 수 있어요.",
    button: "별자리 보기",
  },
  bond: {
    shown: "내 인연 카드와 인연 점수",
    hidden: "점수 근거와 생년월일, 남긴 한 줄은 담기지 않아요.",
    kakao: "별자리 인연에서 받은 인연 점수예요. 나도 친구와 점수를 볼 수 있어요.",
    button: "인연 보기",
  },
};

type Phase =
  | { at: "intro" }
  | { at: "making" }
  | ({ at: "ready"; error?: string } & ShareLink)
  | { at: "failed"; message: string }
  | { at: "stopped" };

/**
 * 결과 공유 (owner 2026-10-13): 공유하기 first says what a friend will see and what stays hidden, and
 * only 링크 만들기 publishes the reading's copy (/s/<id>). Then the usual share buttons send that link,
 * each from its own tap (a phone's share sheet must open from one). 공유 그만하기 takes the link down,
 * and shows whenever the reading has a live link (`current`); after it, a new link can be made.
 */
export function ShareResultButton({ kind, text, create, stop, current, unavailable, extra, label = "공유하기", primary = false }: ShareResultButtonProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ at: "intro" });
  const copy = SHOWN[kind];

  const make = async () => {
    setPhase({ at: "making" });
    const result = await create();
    setPhase(result.ok ? { at: "ready", url: result.url, imageUrl: result.imageUrl, ...(result.preview ? { preview: result.preview } : {}) } : { at: "failed", message: result.message });
  };

  const takeDown = async (live: Extract<Phase, { at: "ready" }>) => {
    if (!stop) return;
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
      <Button variant={primary ? "primary" : "secondary"} size="md" onClick={openSheet}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy="share-result-title">
        <div className={s.sheet}>
          <h2 id="share-result-title" className={s.title}>
            결과 공유하기
          </h2>
          <p className={s.lead}>
            링크를 받은 사람에게는 <strong>{copy.shown}</strong>
            {subject(copy.shown)} 보여요. {copy.hidden}
          </p>
          {unavailable ? (
            <p className={s.note} role="status">
              {unavailable}
            </p>
          ) : phase.at === "ready" ? (
            <>
              <p className={s.link}>{phase.url.replace(/^https?:\/\//, "")}</p>
              <div className={s.actions}>
                <ShareButton
                  text={phase.preview?.title ?? text}
                  target={{
                    url: phase.url,
                    imageUrl: phase.imageUrl,
                    button: copy.button ?? "풀이 보기",
                    description: phase.preview?.description ?? copy.kakao,
                    // 나도 뽑아 보기 / 내 별자리 만들기: the visitor's own try, on this site.
                    ...(phase.preview ? { second: { title: phase.preview.try.label, url: new URL(phase.preview.try.path, phase.url).toString() } } : {}),
                    attachImage: true,
                  }}
                />
              </div>
              {extra ? <div className={s.actions}>{extra({ url: phase.url, imageUrl: phase.imageUrl })}</div> : null}
              {phase.error ? (
                <p className={s.note} role="alert">
                  {phase.error}
                </p>
              ) : null}
              {stop ? (
                <button type="button" className={s.stop} onClick={() => takeDown(phase)}>
                  공유 그만하기
                </button>
              ) : null}
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
