"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AI_NOTE } from "@/components/reading/AiNote";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/config";
import { isInAppBrowser } from "@/lib/inApp";
import { kstDate } from "@/lib/kst";
import { useCopy } from "@/lib/useCopy";
import s from "./SavePdfButton.module.css";

/** When a reading was kept, and whether in the account (another browser shows it after a login) or in this browser only. */
export type KeptReading = { at: number; inAccount: boolean };

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
 * 링크 복사 where the reading opens there too. `kept` absent: the demo, which opens anywhere.
 */
export function SavePdfButton({ type, kept }: { type: string; kept?: KeptReading }) {
  const inApp = useSyncExternalStore(noSubscribe, () => isInAppBrowser(navigator.userAgent), () => false);
  const [guide, setGuide] = useState(false);
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
    const title = document.title;
    document.title = `${SITE.nameKo}-${type.replace(/\s+/g, "")}-${kstDate(kept?.at ?? Date.now())}`;
    window.addEventListener(
      "afterprint",
      () => {
        document.title = title;
      },
      { once: true },
    );
    window.print();
  };

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
      {inApp ? null : <p className={s.hint}>인쇄 화면에서 &apos;PDF로 저장&apos;을 고르면 돼요</p>}
      {guide ? (
        <div className={s.guide}>
          <p>카카오톡·인스타그램 같은 앱 안에서는 PDF 저장이 잘 안 돼요. {how}</p>
          {deviceOnly ? null : (
            <>
              <Button variant="secondary" size="md" onClick={() => void copy(window.location.href)}>
                링크 복사
              </Button>
              <p role="status">{state === "copied" ? "링크를 복사했어요" : state === "failed" ? "링크를 복사하지 못했어요" : ""}</p>
              {manual ? (
                <label className={s.manual}>
                  <span>링크를 길게 눌러 복사해 주세요</span>
                  <input className={s.manualField} type="url" readOnly value={window.location.href} onFocus={(e) => e.currentTarget.select()} />
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

/** The printed page's end: the AI note every reading carries, and the address. Print only. */
export function PrintFoot() {
  return (
    <div className={s.printFoot}>
      <p>{AI_NOTE}</p>
      <p>{SITE_HOST}</p>
    </div>
  );
}
