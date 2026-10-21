"use client";

import { CatHanbok } from "./CatHanbok";
import { CatTarot } from "./CatTarot";
import { CharacterFrame } from "./CharacterFrame";
import { PlushArt, plushSrc } from "./plush";
import type { CharacterProps } from "./types";

const COPY = {
  tarot: { label: "별을 읽는 점성술사 고양이 타로로", line: "냥, 섞어볼까" },
  hanbok: { label: "한복 입은 고양이 조수 타로로", line: "냥, 여기 있어요" },
} as const;

/** Cream cat. Tarot: astrologer leader. Saju: 색동 저고리 assistant. */
export function Cat({ outfit, expression = "idle", size = 160, action = "none", reactOnTap = true, label, art = "plush" }: CharacterProps) {
  const copy = COPY[outfit];
  const act = action === "shuffle" || action === "glow" ? action : "none";
  const plush = art === "plush" ? plushSrc("cat", outfit, act) : null;
  return (
    <CharacterFrame size={size} reactOnTap={reactOnTap} label={label ?? copy.label} line={copy.line} expression={expression}>
      {(shown) =>
        plush ? (
          <PlushArt src={plush} size={size} />
        ) : outfit === "tarot" ? (
          <CatTarot expression={shown} action={act} />
        ) : (
          <CatHanbok expression={shown} action={act} />
        )
      }
    </CharacterFrame>
  );
}
