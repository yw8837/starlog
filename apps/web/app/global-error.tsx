"use client";

/**
 * When even the root layout breaks: its own document (no global styles or fonts reach it), plain
 * Korean copy, one h1, retry and home. Never indexed.
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const button = {
    display: "block",
    width: "100%",
    minHeight: 48,
    marginTop: 12,
    border: "1px solid rgba(255, 255, 255, 0.35)",
    borderRadius: 24,
    fontSize: 16,
    fontWeight: 700,
    textAlign: "center" as const,
    textDecoration: "none",
    lineHeight: "46px",
    cursor: "pointer",
  };
  return (
    <html lang="ko">
      <head>
        <title>잠시 문제가 생겼어요 · Starlog</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, minHeight: "100dvh", background: "#0D0A26", color: "#F4F1FF", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 420, margin: "0 auto", padding: "25dvh 16px 48px", textAlign: "center" }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 24, lineHeight: 1.4 }}>화면을 보여 드리지 못했어요</h1>
          <p style={{ margin: "0 0 20px", color: "#C9C1EA", fontSize: 16, lineHeight: 1.6 }}>
            잠시 문제가 생겼어요. 다시 시도해 보고, 그래도 안 되면 홈에서 다시 시작해 주세요.
          </p>
          <button type="button" onClick={() => retry()} style={{ ...button, background: "#F2C94C", color: "#1B1440", borderColor: "#F2C94C" }}>
            다시 시도
          </button>
          <a href="/" style={{ ...button, background: "transparent", color: "#F4F1FF" }}>
            홈으로
          </a>
        </main>
      </body>
    </html>
  );
}
