import { isValidElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChapterPage from "./page";
import { SampleChapter } from "./SampleChapter";

const props = (id: string) => ({ params: Promise.resolve({ id }) }) as PageProps<"/chapter/[id]">;

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

afterEach(() => vi.unstubAllEnvs());

describe("/chapter/sample's friend invite (QA-13)", () => {
  it("hands out no demo invite in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STARLOG_AI", "");
    const sample = propsOf(await ChapterPage(props("sample")), SampleChapter);
    expect(sample).not.toBeNull();
    expect(sample!.inviteUrl).toBeUndefined();
  });

  it("keeps the demo invite in development and e2e", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(propsOf(await ChapterPage(props("sample")), SampleChapter)!.inviteUrl).toMatch(/\/invite\/abc123$/);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STARLOG_AI", "mock");
    expect(propsOf(await ChapterPage(props("sample")), SampleChapter)!.inviteUrl).toMatch(/\/invite\/abc123$/);
  });
});
