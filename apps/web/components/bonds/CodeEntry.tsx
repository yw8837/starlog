"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { normalizeCode } from "@/lib/bonds/text";
import s from "./bonds.module.css";

/** 초대코드 6자리 → /b/<CODE> (case and spaces do not matter). */
export function CodeEntry({ id = "invite-code", autoFocus = false }: { id?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className={s.group}
      onSubmit={(e) => {
        e.preventDefault();
        const clean = normalizeCode(code);
        if (!clean) {
          setError("코드를 다시 확인해 주세요");
          return;
        }
        router.push(`/b/${clean}`);
      }}
      noValidate
    >
      <label htmlFor={id} className={s.label}>
        초대코드
      </label>
      <div className={s.codeRow}>
        <input
          id={id}
          className={`${s.input} ${s.codeInput}`}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.slice(0, 8));
            setError("");
          }}
          placeholder="6자리 코드"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="go"
          autoFocus={autoFocus}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <Button type="submit" variant="secondary" size="md">
          참여하기
        </Button>
      </div>
      {error ? (
        <p id={`${id}-error`} className={s.error} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
