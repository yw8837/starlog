"use client";

import { useState, type FormEvent } from "react";
import { Rabbit } from "@/components/characters/Rabbit";
import { Stepper } from "@/components/tarot/Stepper";
import { Button } from "@/components/ui/Button";
import s from "../LoginPanel.module.css";
import f from "./ReviewLoginForm.module.css";

type ReviewLoginFormProps = {
  /** tests: replaces the browser navigation */
  navigate?: (url: string) => void;
};

/** /login's look with an ID and a password instead of Kakao. Both travel only in the POST body. */
export function ReviewLoginForm({ navigate = (url) => window.location.assign(url) }: ReviewLoginFormProps) {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!id.trim() || !password.trim()) {
      setError("아이디와 비밀번호를 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, password }) });
      if (res.ok) return navigate("/");
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      setError(data.message ?? "지금은 로그인할 수 없어요. 잠시 뒤에 다시 시도해 주세요.");
    } catch {
      setError("연결이 불안정해요. 잠시 뒤에 다시 시도해 주세요.");
    }
    setBusy(false);
  };

  return (
    <div className={s.screen}>
      <Stepper label="로그인" backHref="/" backLabel="홈으로" />

      <div className={s.intro}>
        <div className={s.hero}>
          <Rabbit outfit="tarot" action="write" size={168} />
        </div>
        <h1 className={s.title}>로그인</h1>
        <p className={s.consent}>심사용 계정 전용 로그인이에요.</p>
      </div>

      <form className={s.form} onSubmit={submit} noValidate>
        <label className={f.label} htmlFor="review-id">
          아이디
        </label>
        <input id="review-id" className={f.input} autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} />
        <label className={f.label} htmlFor="review-password">
          비밀번호
        </label>
        <input id="review-password" className={f.input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error ? (
          <p className={s.error} role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" block disabled={busy}>
          로그인
        </Button>
      </form>
    </div>
  );
}
