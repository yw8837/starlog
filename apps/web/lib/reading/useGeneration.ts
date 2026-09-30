import { useCallback, useEffect, useRef, useState } from "react";
import { postGeneration, type ApiError, type ApiResult } from "./api";
import { advanceProgress, startProgress, type ProgressPlan, type ProgressState } from "./progress";

export type GenerationState =
  | { status: "idle" }
  | { status: "running"; progress: ProgressState }
  | { status: "done" }
  | { status: "error"; error: ApiError };

/**
 * One generation call at a time with its waiting-screen progress. Leaving the screen (or starting
 * another call) aborts the request, which stops the server's generation too: nothing is spent
 * until the reading is done. `run` resolves null for an aborted call.
 */
export function useGeneration<T>() {
  const [state, setState] = useState<GenerationState>({ status: "idle" });
  const current = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    current.current?.abort();
    current.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const run = useCallback(async (path: string, body: unknown, plan: ProgressPlan): Promise<ApiResult<T> | null> => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    setState({ status: "running", progress: startProgress(plan) });
    const result = await postGeneration<T>(path, body, {
      signal: controller.signal,
      onProgress: (event) => {
        if (controller.signal.aborted) return;
        setState((prev) => (prev.status === "running" ? { status: "running", progress: advanceProgress(prev.progress, event, plan) } : prev));
      },
    });
    if (controller.signal.aborted) return null;
    current.current = null;
    setState(result.ok ? { status: "done" } : { status: "error", error: result.error });
    return result;
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState({ status: "idle" });
  }, [cancel]);

  return { state, run, cancel, reset };
}
