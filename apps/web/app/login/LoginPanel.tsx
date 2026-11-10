"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Rabbit } from "@/components/characters/Rabbit";
import { Stepper } from "@/components/tarot/Stepper";
import { Checkbox } from "@/components/ui/Checkbox";
import { loginMessage } from "@/lib/account/client";
import { safeReturnTo } from "@/lib/account/returnTo";
import { SITE } from "@/lib/config";
import { isInAppBrowser } from "@/lib/inApp";
import s from "./LoginPanel.module.css";

type LoginPanelProps = {
  /** where to come back after Kakao or Google (already a safe same-site path) */
  next: string;
  /** the ?login= flag a previous attempt brought back */
  status: string | null;
  /** 오픈 기념 무료 still runs, by the server's clock (app/login/page.tsx): only then does its login say so. */
  opening?: boolean;
  /** tests: replaces the browser navigation */
  navigate?: (url: string) => void;
};

/**
 * Where 돌아가기 goes: `next`, except the checkout, which only sends a visitor who is not logged in
 * here again (QA-09): the page the payment started from, else home.
 */
function backTarget(next: string): string {
  const [path, search = ""] = next.split("?");
  return path === "/pay/checkout" ? safeReturnTo(new URLSearchParams(search).get("returnTo")) : next;
}

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/**
 * What the login is for, from where it comes back to (spec 2026-11-11 entry funnel renewal 3.9): the reason the visitor came,
 * in 해요체. The tarot 맛보기's login carries its one-time ?resume= mark (FreeResult); the unlock sheet's 로그인하고 전체 풀이
 * 보기 does not, so that one keeps the full reading's title, as do the checkout and premium.
 */
function purpose(next: string, opening: boolean): { bubble: string; title: string } {
  const [path = "", search = ""] = next.split("#")[0]!.split("?");
  const query = new URLSearchParams(search);
  if (under(path, "/bonds")) return { bubble: "내 별자리를 계정에 적어둘게요", title: "로그인하고 내 별자리 만들기" };
  if (under(path, "/me")) return { bubble: "내 기록을 계정에 적어둘게요", title: "로그인하고 내 기록 이어 보기" };
  if (path === "/tarot/result" && opening && query.get("unlock") === "opening") return { bubble: "계정마다 한 번, 로그인하면 바로 확인해 줄게요", title: "로그인하고 오픈 기념 무료 확인하기" };
  if (path === "/tarot/result" && query.has("resume")) return { bubble: "고른 카드와 질문은 그대로 둘게요", title: "로그인하고 맛보기 이어 보기" };
  // 사주's lock sheet marks its login ?for=full (SajuChartView): that one keeps the full reading's title.
  if (path === "/saju/chart" && query.get("for") !== "full") return { bubble: "명식과 입력한 정보는 그대로 있어요", title: "로그인하고 사주 맛보기 보기" };
  if (path === "/today") return { bubble: "고른 카드는 그대로 기억해 둘게요", title: "로그인하고 오늘의 카드 펼치기" };
  if (path.startsWith("/b/")) return { bubble: "적은 닉네임과 카드는 그대로 있어요", title: "로그인하고 별 되기" };
  if (under(path, "/saju/grade")) return { bubble: "등급 카드는 그대로 있어요", title: "로그인하고 등급 풀이 열기" };
  return { bubble: `이 풀이를 ${SITE.nameKo}에 적어둘게요`, title: "로그인하고 전체 풀이 보기" };
}

/**
 * Sign-in right before paying (spec 5.1; no signup gift any more, owner 2026-10-14 evening): Kakao, and Google under it (Google's
 * sign-in branding: white, the standard G mark). The 만 14세 box must be ticked first; a same-origin
 * POST (/api/auth/age) then hands back that provider's start URL with a signed 5-minute token for it,
 * and the check is recorded on the account.
 */
export function LoginPanel({ next, status, opening = false, navigate = (url) => window.location.assign(url) }: LoginPanelProps) {
  const [adult, setAdult] = useState(false);
  const [showError, setShowError] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const checkbox = useRef<HTMLInputElement>(null);
  const note = loginMessage(failure ?? status);
  const copy = purpose(next, opening);
  // Google refuses apps' browsers (api/auth/google/start): say so before the tap.
  const [inApp, setInApp] = useState(false);
  useEffect(() => setInApp(isInAppBrowser(navigator.userAgent)), []);

  const start = async (provider: "kakao" | "google") => {
    if (!adult) {
      setShowError(true);
      checkbox.current?.focus();
      return;
    }
    try {
      const res = await fetch("/api/auth/age", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ageConfirmed: true, returnTo: next, ...(provider === "google" ? { provider } : {}) }),
      });
      const body = res.ok ? ((await res.json()) as { url?: unknown }) : null;
      if (typeof body?.url === "string") return navigate(body.url);
      setFailure(res.status === 429 ? "busy" : "unavailable");
    } catch {
      setFailure("unavailable");
    }
  };

  return (
    <div className={s.screen}>
      <Stepper label="로그인" backHref={backTarget(next)} backLabel="돌아가기" />

      <div className={s.intro}>
        <div className={s.hero}>
          <p className={s.bubble}>{copy.bubble}</p>
          <Rabbit outfit="tarot" action="write" size={168} />
        </div>
        <h1 className={s.title}>{copy.title}</h1>
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

        <button type="button" className={`${s.provider} ${s.kakao}`} onClick={() => void start("kakao")}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M12 3.5c-5.2 0-9.4 3.3-9.4 7.4 0 2.6 1.7 4.9 4.3 6.2l-1 3.6c-.1.4.3.7.6.5l4.3-2.8c.4 0 .8.1 1.2.1 5.2 0 9.4-3.3 9.4-7.4S17.2 3.5 12 3.5z" />
          </svg>
          카카오로 계속하기
        </button>

        <button type="button" className={`${s.provider} ${s.google}`} onClick={() => void start("google")}>
          {/* Google's standard-colour G, as in its sign-in buttons: never recoloured. */}
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          Google로 계속하기
        </button>
        {inApp && status !== "in-app" ? <p className={s.consent}>앱 안 브라우저에서는 카카오로 로그인해 주세요. Google로 가입했다면 Safari·Chrome에서 열어 주세요.</p> : null}

        <p className={s.consent}>
          계속하면 <Link href="/terms">이용약관</Link>과 <Link href="/privacy">개인정보처리방침</Link>에 동의하게 돼요
        </p>
      </div>
    </div>
  );
}
