"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ChevronIcon } from "@/components/home/icons";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import { normalizeCode } from "@/lib/bonds/text";
import s from "./MeView.module.css";

/**
 * 내 정보's 초대코드로 참여 row, for a friend who got only the code: one quiet menu line that opens a
 * code box in place. The invite link (/b/<code>) fills the code in by itself, so the home has no box.
 */
export function InviteCodeRow({ enabled = SITE.features.bonds }: { enabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const id = useId();
  if (!enabled) return null;

  return (
    <li>
      <button type="button" className={s.item} aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen((v) => !v)}>
        <span>초대코드로 참여</span>
        <span className={open ? `${s.disclosure} ${s.disclosureOpen}` : s.disclosure}>
          <ChevronIcon />
        </span>
      </button>
      {open ? (
        <form
          id={`${id}-panel`}
          className={s.codePanel}
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
          <label htmlFor={`${id}-code`} className="sr-only">
            초대코드
          </label>
          <div className={s.codeRow}>
            <input
              id={`${id}-code`}
              className={s.codeInput}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.slice(0, 12));
                setError("");
              }}
              placeholder="6자리 코드"
              autoComplete="off"
              autoCapitalize="characters"
              enterKeyHint="go"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : `${id}-hint`}
            />
            <Button type="submit" variant="secondary" size="md">
              참여
            </Button>
          </div>
          {error ? (
            <p id={`${id}-error`} className={s.codeError} role="alert">
              {error}
            </p>
          ) : (
            <p id={`${id}-hint`} className={s.codeHint}>
              친구가 보낸 링크로 들어오면 코드는 자동으로 들어가요
            </p>
          )}
        </form>
      ) : null}
    </li>
  );
}
