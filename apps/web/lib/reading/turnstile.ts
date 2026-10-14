/**
 * Cloudflare Turnstile in the browser, for the free generations the server asks a bot check for
 * (403 BOT_CHECK with the site key, lib/api/turnstile.ts; lib/reading/api.ts postGeneration). The
 * script loads once, at the first ask, straight from challenges.cloudflare.com (explicit rendering).
 * One managed widget, appearance "interaction-only" (most people never see it), waits at the bottom
 * of the screen and runs a fresh challenge for each request (tokens are single use, 300 s), reset
 * after each. When a person has to take part, a status line says so. Resolves null when the script
 * cannot load, the challenge fails or times out, or the caller leaves: never a silent wait.
 */

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** The script loads within this, or the check fails (the next request tries again). */
const LOAD_MS = 15_000;
/** A challenge answers within this, an interactive one included, or it fails. */
const SOLVE_MS = 120_000;
const INTERACTIVE_NOTE = "보안 확인이 필요해요. 아래 확인란을 눌러 주세요.";
const BOX_STYLE = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;max-width:calc(100vw - 32px)";
const NOTE_STYLE = "margin:0 0 8px;padding:8px 12px;border-radius:8px;background:#fff;color:#1b1b1f;font-size:15px;line-height:1.5";

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string | null | undefined;
  execute(widgetId: string): void;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

interface Widget {
  id: string;
  note: HTMLElement;
  /** Set while a request waits for this widget's answer. */
  settle: ((token: string | null) => void) | null;
}

let loading: Promise<TurnstileApi | null> | null = null;
let widget: Widget | null = null;
let queue: Promise<unknown> = Promise.resolve();

function loadScript(): Promise<TurnstileApi | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve) => {
    const script = document.createElement("script");
    const done = () => {
      clearTimeout(timer);
      if (!window.turnstile) {
        loading = null;
        script.remove();
      }
      resolve(window.turnstile ?? null);
    };
    const timer = setTimeout(done, LOAD_MS);
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = done;
    script.onerror = done;
    document.head.append(script);
  });
  return loading;
}

function showNote(note: HTMLElement, on: boolean): void {
  note.textContent = on ? INTERACTIVE_NOTE : "";
  note.setAttribute("style", on ? NOTE_STYLE : "margin:0");
}

/** The page's one widget, rendered on first use; null when Turnstile refuses to render it. */
function widgetFor(api: TurnstileApi, siteKey: string): Widget | null {
  if (widget) return widget;
  const box = document.createElement("div");
  box.setAttribute("style", BOX_STYLE);
  const note = document.createElement("p");
  note.setAttribute("role", "status");
  showNote(note, false);
  const slot = document.createElement("div");
  box.append(note, slot);
  document.body.append(box);
  const current: Widget = { id: "", note, settle: null };
  const settle = (token: string | null) => current.settle?.(token);
  try {
    current.id =
      api.render(slot, {
        sitekey: siteKey,
        appearance: "interaction-only",
        execution: "execute",
        callback: (token: string) => settle(token),
        "error-callback": () => {
          settle(null);
          return true; // handled here: the page shows its own error
        },
        "timeout-callback": () => settle(null),
        "unsupported-callback": () => settle(null),
        "before-interactive-callback": () => showNote(note, true),
        "after-interactive-callback": () => showNote(note, false),
      }) ?? "";
  } catch {
    current.id = "";
  }
  if (!current.id) {
    box.remove();
    return null;
  }
  widget = current;
  return current;
}

async function solve(siteKey: string, signal?: AbortSignal): Promise<string | null> {
  const api = signal?.aborted ? null : await loadScript();
  const current = api && !signal?.aborted ? widgetFor(api, siteKey) : null;
  if (!api || !current) return null;
  return new Promise<string | null>((resolve) => {
    const finish = (token: string | null) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", give);
      current.settle = null;
      showNote(current.note, false);
      try {
        api.reset(current.id); // ready for the next request's challenge
      } catch {
        // the next execute still runs
      }
      resolve(token);
    };
    const give = () => finish(null);
    const timer = setTimeout(give, SOLVE_MS);
    signal?.addEventListener("abort", give, { once: true });
    current.settle = finish;
    try {
      api.execute(current.id);
    } catch {
      finish(null);
    }
  });
}

/** A fresh Turnstile token for `siteKey`, or null. One challenge at a time on the page's one widget. */
export function turnstileToken(siteKey: string, signal?: AbortSignal): Promise<string | null> {
  const run = queue.then(() => solve(siteKey, signal)).catch(() => null);
  queue = run;
  return run;
}

/** Tests: forget the script, the widget and the queue. */
export function resetTurnstile(): void {
  loading = null;
  widget = null;
  queue = Promise.resolve();
}
