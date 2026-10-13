import { getJson, postJson } from "@/lib/reading/api";

/** 풀이 후기 from the browser (app/api/reviews). Types mirror lib/reviews/store.ts. */

export interface PublicReview {
  id: string;
  product: string;
  label: string;
  rating: number;
  body: string | null;
  nickname: string;
  createdAt: number;
  edited: boolean;
  helpful: number;
}

export interface MyReview extends PublicReview {
  hidden: boolean;
}

export interface ReviewPage {
  reviews: PublicReview[];
  next: string | null;
  summary: { count: number; average: number | null };
}

export const REPORT_REASONS = ["욕설·비하", "개인정보", "광고·홍보", "풀이와 관계없는 글"] as const;

const FAILED = "지금은 후기를 저장하지 못했어요. 잠시 뒤에 다시 시도해 주세요.";

export async function fetchMyReview(readingId: string): Promise<MyReview | null | undefined> {
  const result = await getJson<{ review: MyReview | null }>(`/api/reviews/mine?readingId=${encodeURIComponent(readingId)}`);
  return result.ok ? result.data.review : undefined;
}

export async function saveReview(readingId: string, rating: number, body: string): Promise<{ ok: true; review: MyReview } | { ok: false; message: string }> {
  const result = await postJson<{ review: MyReview }>("/api/reviews", { readingId, rating, body });
  return result.ok ? { ok: true, review: result.data.review } : { ok: false, message: result.error.message || FAILED };
}

export async function deleteReview(id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/reviews?id=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin", headers: { Accept: "application/json" } });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchReviews(product?: string, before?: string): Promise<ReviewPage | null> {
  const params = new URLSearchParams();
  if (product) params.set("product", product);
  if (before) params.set("before", before);
  const query = params.toString();
  const result = await getJson<ReviewPage>(`/api/reviews${query ? `?${query}` : ""}`);
  return result.ok ? result.data : null;
}

/** 도움돼요: the error's message when it could not be set (logged out, my own review). */
export async function markHelpful(id: string, on: boolean): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const result = await postJson<{ ok: boolean }>("/api/reviews/helpful", { id, on });
  return result.ok ? { ok: true } : { ok: false, code: result.error.code, message: result.error.message ?? "" };
}

export async function reportReview(id: string, reason: (typeof REPORT_REASONS)[number]): Promise<{ ok: true } | { ok: false; code: string }> {
  const result = await postJson<{ ok: boolean }>("/api/reviews/report", { id, reason });
  return result.ok ? { ok: true } : { ok: false, code: result.error.code };
}
