"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useAccount } from "@/lib/account/client";
import { syncRevisionInForce } from "@/lib/legal";
import { useChapters } from "@/lib/storage/chapters";
import { moveToAccount, movableNow, putOffMove, useMoveMarks } from "@/lib/storage/move";
import s from "./MoveToAccount.module.css";

/**
 * Account sync on 내 기록 and 내 정보 (owner 2026-10-23): logged in, from the privacy revision of SYNC_REVISION_DATE, the
 * readings this device kept on its own are offered to move into the account, with what goes and where said before the
 * button (nothing leaves before 옮기기). 나중에 folds the offer into one line that still leads back to it. Nothing shows
 * with nothing to move, before the date, or logged out.
 */
export function MoveToAccount() {
  const account = useAccount();
  const chapters = useChapters();
  const marks = useMoveMarks();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  const movable = account?.user && chapters && syncRevisionInForce() ? movableNow(chapters, marks) : [];
  const status = (
    <p className={s.status} role="status">
      {result}
    </p>
  );
  if (movable.length === 0) return result ? status : null;

  const offered = open || movable.some((chapter) => !marks.later.includes(chapter.id));
  const count = movable.length;

  const move = async () => {
    setBusy(true);
    const { moved, kept, failed } = await moveToAccount(movable);
    setBusy(false);
    setOpen(false);
    const lines = [
      moved > 0 ? `풀이 ${moved}개를 내 계정으로 옮겼어요. 다른 기기의 내 기록에서도 보여요.` : "",
      kept > 0 ? `${kept}개는 스타로그가 만든 풀이인지 확인할 수 없어 이 기기에만 남겨 뒀어요.` : "",
      failed ? "옮기지 못한 풀이가 있어요. 잠시 뒤에 다시 시도해 주세요." : "",
    ];
    setResult(lines.filter(Boolean).join(" "));
  };

  if (!offered) {
    return (
      <>
        <div className={s.row}>
          <span className={s.rowText}>{`이 기기에만 있는 풀이 ${count}개`}</span>
          <Button variant="ghost" size="md" onClick={() => setOpen(true)}>
            계정으로 옮기기
          </Button>
        </div>
        {status}
      </>
    );
  }

  return (
    <>
      <section className={s.offer} aria-labelledby="move-title">
        <h2 id="move-title" className={s.title}>{`이 기기에서 본 풀이 ${count}개를 내 계정에 옮길까요?`}</h2>
        <p className={s.lead}>옮기면 다른 기기에서도 보여요.</p>
        <p className={s.fine}>
          옮기는 풀이의 질문·고른 상황·메모나 출생 정보, 풀이와 이어서 물어본 내용을 암호화해 내 계정에 보관해요. 내 정보에서 지우거나 탈퇴하면
          지워지고, 로그아웃하면 다른 계정 풀이처럼 이 기기에서 빠져요. 스타로그가 만든 풀이인지 확인할 수 있는 것만 옮겨요.{" "}
          <Link href="/privacy" className={s.link}>
            개인정보처리방침
          </Link>
        </p>
        <div className={s.actions}>
          <Button size="md" onClick={() => void move()} disabled={busy}>
            {busy ? "옮기는 중…" : "옮기기"}
          </Button>
          <Button
            size="md"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              putOffMove(movable);
              setOpen(false);
            }}
          >
            나중에
          </Button>
        </div>
      </section>
      {status}
    </>
  );
}
