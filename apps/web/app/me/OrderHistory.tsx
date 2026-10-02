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
}

const label = (item: OrderItem) =>
  item.status === "paid" ? (item.opened ? "열어 봤어요" : "열지 않음") : item.status === "refunded" ? "환불됨" : item.status === "refunding" ? "환불 중" : "확인 중";

const day = (ms: number) => {
  const kst = new Date(ms + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}. ${kst.getUTCMonth() + 1}. ${kst.getUTCDate()}.`;
};

/** 결제 내역 with Toss receipts (spec section 6). The 환불받기 link of a failed paid reading points here (#orders). */
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
