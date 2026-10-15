"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { refreshAccount, useAccount } from "@/lib/account/client";
import s from "./OwnerForm.module.css";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "done" } | { kind: "error"; message: string };

/**
 * One password field; the code goes only in the POST body, never in a URL. A device that holds the pass
 * (just now, or from before) sees that it does and where to go next instead (owner 2026-10-15).
 */
export function OwnerForm() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const account = useAccount();

  if (status.kind === "done" || account?.owner === true) {
    return (
      <section className={s.form} aria-labelledby="owner-title">
        <h1 id="owner-title" className={s.title}>
          운영자로 확인된 기기예요
        </h1>
        <p className={s.lead} role="status">
          이 기기에서는 결제 없이 풀이를 열 수 있고, 결제도 시험할 수 있어요.
        </p>
        <Button href="/" block>
          홈으로 가기
        </Button>
        <Button href="/saju/start?new=1" variant="secondary" block>
          사주 보러 가기
        </Button>
      </section>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim()) {
      setStatus({ kind: "error", message: "코드를 입력해 주세요." });
      return;
    }
    setStatus({ kind: "sending" });
    try {
      const response = await fetch("/api/owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (response.ok) {
        setCode("");
        setStatus({ kind: "done" });
        // The pass is new: the page's account state learns it, and the review desk below opens.
        void refreshAccount();
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      setStatus({ kind: "error", message: data.message ?? "잠시 뒤에 다시 시도해 주세요." });
    } catch {
      setStatus({ kind: "error", message: "연결이 불안정해요. 잠시 뒤에 다시 시도해 주세요." });
    }
  };

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <h1 className={s.title}>운영자 확인</h1>
      <p className={s.lead}>코드를 넣으면 이 기기에서는 횟수 제한 없이 풀이를 볼 수 있어요.</p>
      <label className={s.label} htmlFor="owner-code">운영자 코드</label>
      <input
        id="owner-code"
        className={s.input}
        type="password"
        autoComplete="current-password"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        aria-invalid={status.kind === "error"}
        aria-describedby="owner-status"
      />
      <p id="owner-status" className={status.kind === "error" ? s.error : s.status} role="status" aria-live="polite">
        {status.kind === "error" ? status.message : ""}
      </p>
      <Button type="submit" block disabled={status.kind === "sending"}>
        {status.kind === "sending" ? "확인하는 중" : "확인하기"}
      </Button>
    </form>
  );
}
