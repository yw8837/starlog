"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import { isInAppBrowser, isIos } from "@/lib/inApp";
import { kstDate } from "@/lib/kst";
import { useCopy } from "@/lib/useCopy";
import s from "./SavePdfButton.module.css";

/**
 * When a reading was kept, whether in the account (another browser shows it after a login) or in this browser only, and
 * its address there (`/chapter/<account id>` once in the account: a device's own id opens nothing elsewhere).
 */
export type KeptReading = { at: number; inAccount: boolean; path: string };

/** How long a print dialog may take to say beforeprint before print() counts as ignored (a webview no list names). */
const PRINT_WAIT_MS = 1500;

const SITE_HOST = SITE.url.replace(/^https?:\/\//, "");
const noSubscribe = () => () => {};

/** "2026년 10월 21일": the day in Korea. */
function kstLongDate(ms: number): string {
  const [year, month, day] = kstDate(ms).split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

/**
 * PDF로 저장 (owner 2026-10-21): the browser's print dialog, whose "PDF로 저장" keeps the reading as a file; the print
 * styles make it white A4 paper with the reading only. While the dialog is open the page title is the file's name
 * ("스타로그-타로-2026-10-21", the day it was read in Korea), put back on afterprint. In-app browsers (KakaoTalk,
 * Instagram, Threads…) usually ignore window.print(): there it says how to open the page in the phone's browser, with
 * 링크 복사 (the reading's account address) where it opens there too; so does a webview no list names once no dialog
 * came (beforeprint) within PRINT_WAIT_MS. `kept` absent: the demo, which opens anywhere.
 */
export function SavePdfButton({ type, kept }: { type: string; kept?: KeptReading }) {
  const inApp = useSyncExternalStore(noSubscribe, () => isInAppBrowser(navigator.userAgent), () => false);
  const [guide, setGuide] = useState(false);
  // The print under way: the page's own title, kept once (a second tap must not keep the file's name as it).
  const printing = useRef<{ title: string; opened: boolean } | null>(null);
  const { state, copy } = useCopy();
  // The link to copy by hand, once the clipboard refused it (in-app browsers often do).
  const [manual, setManual] = useState(false);
  useEffect(() => {
    if (state === "failed") setManual(true);
  }, [state]);

  const save = () => {
    if (inApp) {
      setGuide(true);
      return;
    }
    const job = printing.current ?? { title: document.title, opened: false };
    printing.current = job;
    const end = () => {
      if (printing.current !== job) return;
      printing.current = null;
      document.title = job.title;
    };
    document.title = `${SITE.nameKo}-${type.replace(/\s+/g, "")}-${kstDate(kept?.at ?? Date.now())}`;
    window.addEventListener(
      "beforeprint",
      () => {
        job.opened = true;
      },
      { once: true },
    );
    window.addEventListener("afterprint", end, { once: true });
    // No dialog said beforeprint in time: a webview that ignores print(). Not on iOS, whose Safari may never say it.
    if (!isIos(navigator.userAgent, navigator.maxTouchPoints)) {
      window.setTimeout(() => {
        if (job.opened || printing.current !== job) return;
        end();
        setGuide(true);
      }, PRINT_WAIT_MS);
    }
    window.print();
  };

  const link = () => (kept ? new URL(kept.path, window.location.origin).href : window.location.href);

  const deviceOnly = kept !== undefined && !kept.inAccount;
  const how = deviceOnly
    ? "이 풀이는 이 앱 안에만 보관돼 있어서 다른 브라우저에서는 열리지 않아요. 화면을 캡처해 간직해 주세요."
    : kept
      ? "링크를 복사해 크롬이나 사파리에서 열고, 같은 계정으로 로그인하면 저장할 수 있어요."
      : "링크를 복사해 크롬이나 사파리에서 열면 저장할 수 있어요.";

  return (
    <>
      <Button variant="secondary" size="md" onClick={save}>
        PDF로 저장
      </Button>
      {inApp ? null : <p className={s.hint}>인쇄 화면에서 &apos;PDF로 저장&apos;(아이폰은 공유 → 파일에 저장)을 고르면 돼요</p>}
      {guide ? (
        <div className={s.guide}>
          <p>카카오톡·인스타그램 같은 앱 안에서는 PDF 저장이 잘 안 돼요. {how}</p>
          {deviceOnly ? null : (
            <>
              <Button variant="secondary" size="md" onClick={() => void copy(link())}>
                링크 복사
              </Button>
              <p role="status">{state === "copied" ? "링크를 복사했어요" : state === "failed" ? "링크를 복사하지 못했어요" : ""}</p>
              {manual ? (
                <label className={s.manual}>
                  <span>링크를 길게 눌러 복사해 주세요</span>
                  <input className={s.manualField} type="url" readOnly value={link()} onFocus={(e) => e.currentTarget.select()} />
                </label>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </>
  );
}

/** The printed page's top line: the site, and the day the reading was read in Korea (none for the demo). Print only. */
export function PrintHead({ at }: { at?: number }) {
  return (
    <div className={s.printHead}>
      <span>{`${SITE.nameKo} · ${SITE_HOST}`}</span>
      {at === undefined ? null : <span>{kstLongDate(at)}</span>}
    </div>
  );
}

/** The printed page's end: the address (no AI note, owner 2026-10-23: 약관에만). Print only. */
export function PrintFoot() {
  return (
    <div className={s.printFoot}>
      <p>{SITE_HOST}</p>
    </div>
  );
}
