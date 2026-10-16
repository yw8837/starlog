import { isValidElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DeepResultPage, { metadata } from "./page";
import { DeepResult } from "./DeepResult";

const gate = vi.hoisted(() => ({ open: false }));
vi.mock("@/lib/premium/pageGate", () => ({ premiumPageOpen: async () => gate.open }));
const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
}));
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const props = (query: Record<string, string>) => ({ searchParams: Promise.resolve(query) }) as PageProps<"/premium/deep-tarot/result">;

/** The props of the first element of `type` in a server component's returned tree (not rendered). */
function propsOf(node: ReactNode, type: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = propsOf(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const elementProps = node.props as Record<string, unknown> & { children?: ReactNode };
  if (node.type === type) return elementProps;
  return propsOf(elementProps.children, type);
}

afterEach(() => notFound.mockClear());

describe("/premium/deep-tarot/result", () => {
  it("does not exist (404) while premium is off here and nothing of it was bought", async () => {
    gate.open = false;
    await expect(DeepResultPage(props({}))).rejects.toThrow("404");
    expect(notFound).toHaveBeenCalled();
  });

  it("shows the result screen otherwise, opening once after checkout (?unlock=paid), never indexed", async () => {
    gate.open = true;
    expect(propsOf(await DeepResultPage(props({ instant: "1", unlock: "paid" })), DeepResult)).toEqual({ instant: true, autoUnlock: true });
    expect(propsOf(await DeepResultPage(props({})), DeepResult)).toEqual({ instant: false, autoUnlock: false });
    expect(metadata.robots).toMatchObject({ index: false });
  });
});
