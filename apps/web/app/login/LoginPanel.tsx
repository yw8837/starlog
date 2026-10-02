"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Rabbit } from "@/components/characters/Rabbit";
import { Stepper } from "@/components/tarot/Stepper";
import { Checkbox } from "@/components/ui/Checkbox";
import { loginMessage } from "@/lib/account/client";
import { SITE } from "@/lib/config";
import s from "./LoginPanel.module.css";

type LoginPanelProps = {
  /** where to come back after Kakao (already a safe same-site path) */
  next: string;
  /** the ?login= flag a previous attempt brought back */
  status: string | null;
  /** tests: replaces the browser navigation */
  navigate?: (url: string) => void;
};

/**
 * Sign-in right before paying or claiming the gift (spec 5.1). Kakao only. The 만 14세 box must be
 * ticked first; it travels to the server as age=1 and is recorded on the account.
 */
export function LoginPanel({ next, status, navigate = (url) => window.location.assign(url) }: LoginPanelProps) {
  const [adult, setAdult] = useState(false);
  const [showError, setShowError] = useState(false);
  const checkbox = useRef<HTMLInputElement>(null);
  const note = loginMessage(status);

  const kakao = () => {
    if (!adult) {
      setShowError(true);
      checkbox.current?.focus();
      return;
    }
    navigate(`/api/auth/kakao/start?age=1&returnTo=${encodeURIComponent(next)}`);
  };

  return (
    <div className={s.screen}>
      <Stepper label="로그인" backHref={next} backLabel="돌아가기" />

      <div className={s.intro}>
        <div className={s.hero}>
          <p className={s.bubble}>{`이 풀이를 ${SITE.nameKo}에 적어둘게요`}</p>
          <Rabbit outfit="tarot" action="write" size={168} />
        </div>
        <h1 className={s.title}>로그인하고 전체 풀이 보기</h1>
        <p className={s.gift}>{`처음 가입하면 ${SITE.currency.free} ${SITE.price.signupGiftFree}개를 드려요`}</p>
      </div>

      <div className={s.form}>
        <p className="sr-only" role="status">
          {note ?? ""}
        </p>
        {note ? <p className={s.error}>{note}</p> : null}
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

        <button type="button" className={`${s.provider} ${s.kakao}`} onClick={kakao}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M12 3.5c-5.2 0-9.4 3.3-9.4 7.4 0 2.6 1.7 4.9 4.3 6.2l-1 3.6c-.1.4.3.7.6.5l4.3-2.8c.4 0 .8.1 1.2.1 5.2 0 9.4-3.3 9.4-7.4S17.2 3.5 12 3.5z" />
          </svg>
          카카오로 계속하기
        </button>

        <p className={s.consent}>
          계속하면 <Link href="/terms">이용약관</Link>과 <Link href="/privacy">개인정보처리방침</Link>에 동의하게 돼요
        </p>
      </div>
    </div>
  );
}
