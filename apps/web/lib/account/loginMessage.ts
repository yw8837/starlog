// Server-safe: no React. 내 정보 (a Server Component) and the client views share these lines.

const LOGIN_MESSAGES: Record<string, string> = {
  cancel: "로그인을 취소했어요",
  failed: "로그인하지 못했어요. 다시 시도해 주세요.",
  closed: "지금은 새로 가입할 수 없어요",
  unavailable: "지금은 로그인할 수 없어요. 잠시 뒤에 다시 시도해 주세요.",
  busy: "요청이 잠깐 많았어요. 1분 뒤에 다시 시도해 주세요.",
  // Google refuses to sign in inside in-app browsers (api/auth/google/start).
  "in-app": "Google 로그인은 앱 안 브라우저에서는 안 돼요. 카카오로 로그인하거나 Safari·Chrome에서 열어 주세요.",
};

/** What to say for the ?login= flag a login brought back (nothing for ok). */
export function loginMessage(flag: string | null): string | null {
  return flag ? (LOGIN_MESSAGES[flag] ?? null) : null;
}
