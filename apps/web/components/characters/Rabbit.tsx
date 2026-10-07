"use client";

import { CharacterFrame } from "./CharacterFrame";
import { PlushArt, plushSrc } from "./plush";
import { RabbitHanbok } from "./RabbitHanbok";
import { RabbitTarot } from "./RabbitTarot";
import type { CharacterProps } from "./types";
import s from "./characters.module.css";

const COPY = {
  tarot: { label: "기록하는 사서 토끼", line: "톡, 적어둘게요" },
  hanbok: { label: "한복 입은 토끼 선생님", line: "어디 한번 볼까요" },
} as const;

/** White rabbit. Tarot: librarian staff (never a hat). Saju: 두루마기 leader. */
export function Rabbit({ outfit, expression = "idle", size = 160, action = "none", reactOnTap = true, label, art = "plush" }: CharacterProps) {
  const copy = COPY[outfit];
  const plush = art === "plush" ? plushSrc("rabbit", outfit, action === "write" ? "write" : "none") : null;
  return (
    <CharacterFrame size={size} reactOnTap={reactOnTap} label={label ?? copy.label} line={copy.line} expression={expression}>
      {(shown) =>
        plush ? (
          <PlushArt src={plush} size={size} />
        ) : (
          <g className={action === "write" ? s.writing : undefined}>
            {outfit === "tarot" ? <RabbitTarot expression={shown} writing={action === "write"} /> : <RabbitHanbok expression={shown} />}
          </g>
        )
      }
    </CharacterFrame>
  );
}
