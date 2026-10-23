-- 별자리 인연, friends' scores on the owner's public link (owner 2026-10-23: "완성 전에도 개별 점수는 보여줘야지"). A star whose
-- friend joined after the join form said so ("○○님이 별자리를 공유하면 내 닉네임과 ○○님과의 인연 점수가 공유 링크와 이미지에
-- 보여요") is 1: its score may show on the owner's share link and image. 0: joined before, told only that the nickname
-- shows; its score stays the owner's (lib/bonds/share.ts hides the total too, which would give it away). A column with a
-- default, so every earlier star is 0; the code joins without it on a database this has not reached (d1BondsRepo.ts).
ALTER TABLE stars ADD COLUMN score_public INTEGER NOT NULL DEFAULT 0;
