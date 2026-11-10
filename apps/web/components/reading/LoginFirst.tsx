"use client";

import { useId, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { isInAppBrowser, isKakaoTalk } from "@/lib/inApp";
import s from "./reading.module.css";

const noSubscribe = () => () => {};
/** An app's own browser other than KakaoTalk's (its Kakao login stays inside, lib/account/kakao.ts). */
const outsideKakao = () => isInAppBrowser(navigator.userAgent) && !isKakaoTalk(navigator.userAgent);

type LoginFirstProps = {
  title: string;
  body: string;
  /** loginHref(...) back to this very screen: what was chosen stays on the device and the reading goes on from it */
  href: string;
  action: string;
  /** what a login that came back said (lib/account/loginMessage.ts: 취소, 실패…), shown above the button */
  note?: string | null;
  /** runs when the login button is pressed, before leaving (the tarot result keeps its draw for the trip) */
  onGo?: () => void;
};

/**
 * In place of a free AI reading for a visitor (owner 2026-11-04: 맛보기 and 오늘의 한 장 need a login): what needs it, that
 * nothing chosen is lost, and the way to log in. The question, the cards and the free 명식 stay on screen around it. In an
 * app's own browser (Instagram, Threads…) the login can end up in another browser, which this device's storage does not
 * reach (code review 2026-11-04 #9): one line says where to open it and that it starts over there.
 */
export function LoginFirst({ title, body, href, action, note, onGo }: LoginFirstProps) {
  const inApp = useSyncExternalStore(noSubscribe, outsideKakao, () => false);
  const titleId = useId();
  return (
    <section className={s.error} aria-labelledby={titleId}>
      <h2 id={titleId} className={s.errorTitle}>
        {title}
      </h2>
      <p className={s.errorBody}>{body}</p>
      {note ? <p className={s.errorBody}>{note}</p> : null}
      {inApp ? <p className={s.errorBody}>인스타그램·스레드 같은 앱 안에서 로그인이 끝나지 않으면 Safari·Chrome에서 열어 주세요. 브라우저를 옮기면 처음부터 다시 해야 해요.</p> : null}
      <div className={s.errorActions}>
        <Button block href={href} onClick={onGo} trailing="→">
          {action}
        </Button>
      </div>
    </section>
  );
}
