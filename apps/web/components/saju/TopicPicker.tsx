"use client";

import Link from "next/link";
import { useFreshSajuContextOnEntry } from "@/lib/sajuFlow";
import { SAJU_TOPICS, TOPIC_PICK_LINES } from "@/lib/sajuTopics";
import s from "./TopicPicker.module.css";

/**
 * Saju step 1 (owner 2026-10-14): 사주팔자 or one of the four 운, each a link to the birth input that
 * carries it (/saju/new?topic=…; the form opens the chart on it). The flow starts here, so an entry
 * from elsewhere starts the status chips clean, as the form did when it came first.
 */
export function TopicPicker() {
  useFreshSajuContextOnEntry();
  return (
    <ul className={s.list} aria-label="무엇이 궁금해요?">
      {SAJU_TOPICS.map((topic) => (
        <li key={topic.id}>
          <Link href={`/saju/new?topic=${topic.id}`} className={s.item}>
            <strong className={s.name}>{topic.label}</strong>
            <span className={s.line}>{TOPIC_PICK_LINES[topic.id]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
