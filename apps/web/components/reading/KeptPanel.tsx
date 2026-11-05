"use client";

import { useSyncExternalStore } from "react";
import { ErrorPanel } from "@/components/reading/ErrorPanel";
import { LoginFirst } from "@/components/reading/LoginFirst";
import { loginHref, loginMessage, refreshAccount, useAccount } from "@/lib/account/client";

/**
 * What this device keeps of AI readings shows only with a session (owner 2026-11-05: "애초에 로그인한 적이 없는데 계속 보이게
 * 남았다"): never logged in or logged out alike, it stays hidden, not deleted, and shows again after the login.
 * - `pending`: not known yet, so nothing kept shows;
 * - `unknown`: /api/me could not answer: nothing kept shows either, so blocking that request shows nothing;
 * - `visitor`: no session.
 */
export type KeptGate = "pending" | "member" | "visitor" | "unknown";

export function useKeptGate(): KeptGate {
  const account = useAccount();
  if (account === undefined) return "pending";
  if (account === null) return "unknown";
  return account.user ? "member" : "visitor";
}

const noSubscribe = () => () => {};
const loginFlag = () => new URLSearchParams(window.location.search).get("login");

type KeptPanelProps = {
  gate: "visitor" | "unknown";
  title: string;
  body: string;
  action: string;
  /** where the login comes back to: this very screen */
  returnTo: string;
};

/** The session could not be checked: nothing kept shows, and this asks again. */
export function SessionRetry() {
  return <ErrorPanel view={{ title: "로그인 상태를 확인하지 못했어요", body: "연결을 확인하고 다시 시도해 주세요.", action: "retry" }} onRetry={() => void refreshAccount()} />;
}

/** In place of what is kept: the login for a visitor, 다시 시도 when the session could not be checked. */
export function KeptPanel({ gate, title, body, action, returnTo }: KeptPanelProps) {
  const flag = useSyncExternalStore(noSubscribe, loginFlag, () => null);
  if (gate === "unknown") return <SessionRetry />;
  return <LoginFirst title={title} body={body} href={loginHref(returnTo)} action={action} note={loginMessage(flag)} />;
}
