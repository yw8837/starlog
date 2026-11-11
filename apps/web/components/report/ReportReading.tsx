"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { REPORT_NOTE_MAX, REPORT_READING_ID, REPORT_REASONS, REPORT_REASON_LABEL, type ReportKind, type ReportReason } from "@/lib/readings/report";
import { postJson } from "@/lib/reading/api";
import s from "./ReportReading.module.css";

type ReportReadingProps = {
  kind: ReportKind;
  /** The saved reading's or the share link's id, when it has one (sent only in the shape the server takes). */
  readingId?: string;
};

/**
 * 신고 on an AI reading, inside the Starlog app only (`app-only`: the public web is unchanged). A quiet text button opens a
 * short form: one fixed reason, an optional note, 보내기 / 취소; POST /api/readings/report, never the reading's text. Google
 * Play's AI-generated content policy asks for a way to report offensive content without leaving the app.
 */
export function ReportReading({ kind, readingId }: ReportReadingProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  const close = () => {
    setOpen(false);
    setReason(null);
    setNote("");
    setState("idle");
  };

  const send = async () => {
    if (!reason || state === "sending") return;
    setState("sending");
    const res = await postJson<{ ok: true }>("/api/readings/report", {
      kind,
      ...(readingId && REPORT_READING_ID.test(readingId) ? { readingId } : {}),
      reason,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setState(res.ok ? "sent" : "failed");
  };

  return (
    <div className={`app-only ${s.report}`}>
      {state === "sent" ? (
        <p className={s.done} role="status">
          신고가 접수됐어요. 확인하고 조치할게요.
        </p>
      ) : !open ? (
        <button type="button" className={s.toggle} onClick={() => setOpen(true)}>
          신고
        </button>
      ) : (
        <form
          className={s.panel}
          aria-labelledby={`${id}-title`}
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <fieldset className={s.reasons}>
            <legend id={`${id}-title`} className={s.title}>
              이 풀이에서 어떤 점이 문제인가요?
            </legend>
            {REPORT_REASONS.map((value) => (
              <label key={value} className={s.reason}>
                <input type="radio" name={`${id}-reason`} value={value} checked={reason === value} onChange={() => setReason(value)} />
                <span>{REPORT_REASON_LABEL[value]}</span>
              </label>
            ))}
          </fieldset>
          <label className={s.noteLabel} htmlFor={`${id}-note`}>
            더 알려 주실 내용 (선택)
          </label>
          <textarea id={`${id}-note`} className={s.note} value={note} maxLength={REPORT_NOTE_MAX} rows={3} onChange={(event) => setNote(event.target.value)} />
          {state === "failed" ? (
            <p className={s.failed} role="alert">
              보내지 못했어요. 잠시 뒤에 다시 시도해 주세요.
            </p>
          ) : null}
          <div className={s.actions}>
            <Button type="submit" size="md" disabled={!reason || state === "sending"}>
              보내기
            </Button>
            <Button variant="ghost" size="md" onClick={close}>
              취소
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
