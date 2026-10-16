// @vitest-environment jsdom
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PremiumProgress } from "@/components/premium/PremiumProgress";
import { PremiumRows } from "@/components/premium/PremiumRows";
import { PremiumUnlock } from "@/components/premium/PremiumUnlock";
import { PREMIUM_IDS } from "@/lib/premium/products";
import { resetPremiumStatusForTests } from "@/lib/premium/status";

/**
 * Plan task 24's copy bans over the premium screens stage 3 adds or touches: no model or vendor name, no beta or
 * opening-promotion framing, no accuracy or secret-method claim; the panel that leads to checkout keeps the product
 * names (no tradition name, owner 2026-10-16: only the entries may say 켈틱 크로스); no premium text under 13px.
 */

const BANS = /셀틱|celtic|베타|오픈 기념|claude|anthropic|gpt|opus|sonnet|정확|적중|비법/i;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetPremiumStatusForTests();
});

/** vitest runs from the repo root or from apps/web. */
const webRoot = ["apps/web", "."].map((path) => resolve(process.cwd(), path)).find((path) => existsSync(join(path, "components/premium")))!;
function cssUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? cssUnder(path) : name.endsWith(".module.css") ? [path] : [];
  });
}

describe("premium copy and type size", () => {
  it("the open panel and the waiting screen of every product", () => {
    for (const id of PREMIUM_IDS) {
      const { container } = render(
        <>
          <PremiumUnlock id={id} account={{ payments: true, login: true, owner: false, user: null }} status={{ open: true, opensAt: null }} returnTo="/x" onOpen={vi.fn()} />
          <PremiumProgress id={id} part={0} state={{ caption: "적고 있어요", fraction: 0.2, reached: 1 }} />
        </>,
      );
      expect(container.textContent).not.toMatch(BANS);
      expect(container.textContent).not.toMatch(/켈틱/);
      cleanup();
    }
  });

  it("the premium rows of the home, the reading ends and the guides", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ products: PREMIUM_IDS.map((id) => ({ id, open: true, visible: true, opensAt: null })) })));
    const { container } = render(<PremiumRows ids={PREMIUM_IDS} title="더 깊게 보기" />);
    await screen.findByRole("region", { name: "더 깊게 보기" });
    expect(container.textContent).not.toMatch(BANS);
  });

  it("never sets premium text under 13px", () => {
    const files = [...cssUnder(join(webRoot, "components/premium")), ...cssUnder(join(webRoot, "app/premium"))];
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) {
      const css = readFileSync(file, "utf8");
      for (const [, size] of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) expect(Number(size), file).toBeGreaterThanOrEqual(13);
      expect(css, file).not.toMatch(/font-size:\s*var\(--fs-tab\)/);
    }
  });
});
