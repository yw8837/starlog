"use client";

import { useEffect, useRef, useState } from "react";
import s from "./CopyButton.module.css";

type CopyButtonProps = {
  text: string;
  /** Accessible name, e.g. "첫 문장 1 복사하기". */
  label: string;
  className?: string;
};

type State = "idle" | "copied" | "failed";

export function CopyButton({ text, label, className }: CopyButtonProps) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2000);
  };

  return (
    <button type="button" className={className ? `${s.copy} ${className}` : s.copy} onClick={copy} aria-label={label} data-state={state}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {state === "copied" ? (
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        ) : (
          <>
            <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
            <path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
          </>
        )}
      </svg>
      <span aria-live="polite">{state === "copied" ? "복사했어요" : state === "failed" ? "복사하지 못했어요" : "복사"}</span>
    </button>
  );
}
