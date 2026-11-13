"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import r from "@/components/reviews/reviews.module.css";
import { useAccount } from "@/lib/account/client";
import { getJson, postJson } from "@/lib/reading/api";
import { REPORT_KIND_LABEL, REPORT_REASON_LABEL, type OwnerReadingReport } from "@/lib/readings/report";
import s from "./ReviewDesk.module.css";

type Page = { reports: OwnerReadingReport[]; next: string | null };

/** "2026-11-13 12:05" in KST. */
const kstTime = (ms: number) => new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ");

const pageUrl = (before?: string) => `/api/owner/reading-reports${before ? `?before=${encodeURIComponent(before)}` : ""}`;

function ReportRow({ report, onChange }: { report: OwnerReadingReport; onChange: (next: OwnerReadingReport) => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const handled = report.handledAt !== null;

  const change = async () => {
    setBusy(true);
    setProblem("");
    const result = await postJson<{ ok: boolean; handledAt: number | null }>("/api/owner/reading-reports", { id: report.id, handled: !handled });
    setBusy(false);
    if (result.ok && result.data.ok) onChange({ ...report, handledAt: result.data.handledAt });
    else setProblem("저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요.");
  };

  return (
    <li className={r.card}>
      <div className={r.cardTop}>
        <span>{kstTime(report.createdAt)}</span>
        <span>{REPORT_KIND_LABEL[report.kind]}</span>
        <span className={r.badge}>{report.handledAt !== null ? `처리함 · ${kstTime(report.handledAt)}` : "확인 전"}</span>
      </div>
      <p className={r.body}>{REPORT_REASON_LABEL[report.reason]}</p>
      <p className={r.note}>{report.note ? `메모: ${report.note}` : "메모 없음"}</p>
      <p className={r.note}>
        {report.link ? (
          <a href={report.link} target="_blank" rel="noopener noreferrer">
            공유 링크 열기
          </a>
        ) : report.readingId ? (
          `풀이 번호 ${report.readingId} (신고한 사람만 열 수 있어요)`
        ) : (
          "풀이 번호 없음 (저장되지 않는 풀이예요)"
        )}
      </p>
      <div className={s.actions}>
        <Button variant={handled ? "secondary" : "ghost"} size="md" onClick={() => void change()} disabled={busy}>
          {handled ? "처리 전으로 되돌리기" : "처리 완료로 표시"}
        </Button>
      </div>
      {problem ? (
        <p className={s.error} role="alert">
          {problem}
        </p>
      ) : null}
    </li>
  );
}

/**
 * 풀이 신고 on /owner (owner 2026-11-13): the reports sent from the app's 신고 (components/report/ReportReading.tsx), newest
 * first, each with its time, kind, reading, reason and note, and 처리 완료로 표시 / 처리 전으로 되돌리기. Never the reading's
 * text or the reporter. Shown to a device with the owner pass only; the API checks the pass again.
 */
export function ReadingReportDesk() {
  const account = useAccount();
  const owner = Boolean(account?.owner);
  // undefined: loading; null: could not be read
  const [reports, setReports] = useState<OwnerReadingReport[] | null | undefined>(undefined);
  const [next, setNext] = useState<string | null>(null);
  const [more, setMore] = useState<"idle" | "busy" | "failed">("idle");

  useEffect(() => {
    if (!owner) return;
    let live = true;
    void getJson<Page>(pageUrl()).then((result) => {
      if (!live) return;
      setReports(result.ok ? result.data.reports : null);
      setNext(result.ok ? result.data.next : null);
    });
    return () => {
      live = false;
    };
  }, [owner]);

  if (!owner) return null;

  const loadMore = async () => {
    if (!next) return;
    setMore("busy");
    const result = await getJson<Page>(pageUrl(next));
    if (!result.ok) {
      setMore("failed");
      return;
    }
    setReports((list) => [...(list ?? []), ...result.data.reports]);
    setNext(result.data.next);
    setMore("idle");
  };

  return (
    <section className={s.desk} aria-labelledby="reading-report-desk-title">
      <h2 id="reading-report-desk-title" className={s.title}>
        풀이 신고
      </h2>
      <p className={s.lead}>앱에서 들어온 풀이 신고예요. 풀이 내용과 신고한 사람은 여기에 나오지 않아요. 살펴보고 조치했으면 처리 완료로 표시해 주세요. 신고는 1년이 지나면 지워져요.</p>
      {reports === undefined ? <p className={r.note}>불러오는 중…</p> : null}
      {reports === null ? <p className={s.error}>신고를 불러오지 못했어요. 새로 고쳐 주세요.</p> : null}
      {reports?.length === 0 ? <p className={r.note}>들어온 신고가 없어요.</p> : null}
      {reports && reports.length > 0 ? (
        <ul className={s.list}>
          {reports.map((report) => (
            <ReportRow key={report.id} report={report} onChange={(changed) => setReports((list) => list?.map((item) => (item.id === changed.id ? changed : item)) ?? list)} />
          ))}
        </ul>
      ) : null}
      {next ? (
        <div className={s.actions}>
          <Button variant="secondary" size="md" onClick={() => void loadMore()} disabled={more === "busy"}>
            더 보기
          </Button>
        </div>
      ) : null}
      {more === "failed" ? (
        <p className={s.error} role="alert">
          더 불러오지 못했어요. 잠시 뒤에 다시 시도해 주세요.
        </p>
      ) : null}
    </section>
  );
}
