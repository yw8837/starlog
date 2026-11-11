"use client";

import { useEffect, useState } from "react";
import { won } from "@/lib/config";
import { productById } from "@/lib/pay/catalog";
import { getJson } from "@/lib/reading/api";
import s from "./account.module.css";

interface OrderItem {
  orderId: string;
  productId: string;
  amount: number;
  status: "confirming" | "paid" | "refunding" | "refunded" | "created" | "failed";
  createdAt: number;
  receiptUrl: string | null;
  method: string | null;
  refundable: boolean;
  opened: boolean;
  /** the readings of it opened or being opened (a set says which of its two) */
  openedProducts?: string[];
  /** refunded so far, in 원: 일부 환불 while the order stays paid (a set's unopened part) */
  refunded?: number;
  /** used up before its reading was finished (left while written a fourth time) */
  unfinished?: boolean;
}

const nameOf = (id: string) => productById(id)?.name ?? "풀이";

/** A set with one reading opened names it, and the other if it is still unopened; a partial refund says how much. */
function paidLabel(item: OrderItem): string {
  if (item.unfinished) return "다 받기 전에 끊겨 쓴 것으로 처리됐어요. 문제가 있으면 문의해 주세요.";
  const readings = productById(item.productId)?.includes;
  const opened = item.openedProducts ?? [];
  const refunded = item.refunded ?? 0;
  const parts =
    readings && opened.length > 0 && opened.length < readings.length
      ? [`${opened.map(nameOf).join(", ")} 열어 봤어요`, ...(refunded > 0 ? [] : [`${readings.filter((id) => !opened.includes(id)).map(nameOf).join(", ")} 열지 않음`])]
      : [item.opened ? "열어 봤어요" : "열지 않음"];
  return [...parts, ...(refunded > 0 ? [`일부 환불 ${won(refunded)}`] : [])].join(" · ");
}
const label = (item: OrderItem) =>
  item.status === "paid" ? paidLabel(item) : item.status === "refunded" ? "환불됨" : item.status === "refunding" ? "환불 중" : "확인 중";

const day = (ms: number) => {
  const kst = new Date(ms + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}. ${kst.getUTCMonth() + 1}. ${kst.getUTCDate()}.`;
};

/** 결제 내역 with Toss receipts (spec section 6). 환불받기 is under 결제한 풀이 (AccountPanel, #purchases). */
export function OrderHistory() {
  const [items, setItems] = useState<OrderItem[] | null>(null);
  useEffect(() => {
    void getJson<{ orders: OrderItem[] }>("/api/pay/orders").then((res) => setItems(res.ok ? res.data.orders : []));
  }, []);
  if (!items || items.length === 0) return null;
  return (
    <section id="orders" className={s.orders} aria-labelledby="orders-title">
      <h3 id="orders-title" className={s.sectionTitle}>
        결제 내역
      </h3>
      <ul className={s.orderList}>
        {items.map((item) => (
          <li key={item.orderId} className={s.order}>
            <span className={s.muted}>{day(item.createdAt)}</span>
            <span>{productById(item.productId)?.name ?? "풀이"}</span>
            <span>{won(item.amount)}</span>
            <span className={s.muted}>{label(item)}</span>
            {item.receiptUrl ? (
              <a className={s.link} href={item.receiptUrl} target="_blank" rel="noopener noreferrer">
                영수증 보기
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
