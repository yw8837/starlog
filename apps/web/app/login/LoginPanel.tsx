"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Rabbit } from "@/components/characters/Rabbit";
import { Stepper } from "@/components/tarot/Stepper";
import { Checkbox } from "@/components/ui/Checkbox";
import { SITE } from "@/lib/config";
import { withFlags } from "@/lib/flowState";
import s from "./LoginPanel.module.css";

/** Which reading the sign-in opens: the tarot sample chapter or the saju prologue. */
export type LoginChapter = "sample" | "prologue";

/**
 * Sign-in right before a reading opens (P1 fixture: both buttons continue to the chapter).
 * The age checkbox is required; the buttons stay enabled and explain what is missing.
 */
export function LoginPanel({ instant, chapter }: { instant: boolean; chapter: LoginChapter }) {
  const router = useRouter();
  const [adult, setAdult] = useState(false);
  const [showError, setShowError] = useState(false);
  const checkbox = useRef<HTMLInputElement>(null);

  const saju = chapter === "prologue";

  // P2 wires the real Kakao / Google sign-in; in P1 both continue to the chapter.
  const continueToReading = () => {
    if (!adult) {
      setShowError(true);
      checkbox.current?.focus();
      return;
    }
    router.push(withFlags(`/chapter/${chapter}?from=unlock`, { instant }));
  };

  return (
    <div className={s.screen}>
      <Stepper label="로그인" backHref={withFlags(saju ? "/saju/chart" : "/tarot/result", { instant })} backLabel="풀이로 돌아가기" />

      <div className={s.intro}>
        <div className={s.hero}>
          <p className={s.bubble}>{`이 풀이를 ${SITE.nameKo}에 적어둘게요`}</p>
          {saju ? <Rabbit outfit="hanbok" size={168} /> : <Rabbit outfit="tarot" action="write" size={168} />}
        </div>

        <h1 className={s.title}>로그인하고 전체 풀이 보기</h1>
        <p className={s.gift}>{`가입 선물 ${SITE.currency.free} ${SITE.price.signupGiftFree}개로 바로 열려요`}</p>
      </div>

      <div className={s.form}>
        <Checkbox
          ref={checkbox}
          checked={adult}
          onChange={(checked) => {
            setAdult(checked);
            if (checked) setShowError(false);
          }}
          invalid={showError}
          describedBy={showError ? "age-error" : undefined}
        >
          만 14세 이상이에요
        </Checkbox>
        {showError ? (
          <p id="age-error" className={s.error} role="alert">
            만 14세 이상인지 먼저 확인해 주세요
          </p>
        ) : null}

        <button type="button" className={`${s.provider} ${s.kakao}`} onClick={continueToReading}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M12 3.5c-5.2 0-9.4 3.3-9.4 7.4 0 2.6 1.7 4.9 4.3 6.2l-1 3.6c-.1.4.3.7.6.5l4.3-2.8c.4 0 .8.1 1.2.1 5.2 0 9.4-3.3 9.4-7.4S17.2 3.5 12 3.5z" />
          </svg>
          카카오로 계속하기
        </button>
        <button type="button" className={`${s.provider} ${s.google}`} onClick={continueToReading}>
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.7 6c4.5-4.2 7.1-10.3 7.1-17.4z" />
            <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.7l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
          </svg>
          Google로 계속하기
        </button>

        <p className={s.consent}>
          계속하면 <Link href="/terms">이용약관</Link>과 <Link href="/privacy">개인정보처리방침</Link>에 동의하게 돼요
        </p>
      </div>
    </div>
  );
}
