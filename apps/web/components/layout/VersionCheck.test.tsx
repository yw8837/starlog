// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reload = vi.fn();

async function mount(serverBuild: string | null) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_BUILD_ID", "build-a");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ build: serverBuild })));
  const { VersionCheck } = await import("./VersionCheck");
  render(<VersionCheck />);
}

async function returnToTab() {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  document.dispatchEvent(new Event("visibilitychange"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("VersionCheck", () => {
  beforeEach(() => {
    reload.mockReset();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reloads once the tab comes back and the server serves another build", async () => {
    await mount("build-b");
    await returnToTab();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does nothing while the server serves the same build", async () => {
    await mount("build-a");
    await returnToTab();
    expect(reload).not.toHaveBeenCalled();
  });

  it("never reloads while a reading is being written", async () => {
    await mount("build-b");
    const busy = document.createElement("section");
    busy.setAttribute("aria-busy", "true");
    document.body.appendChild(busy);
    await returnToTab();
    expect(reload).not.toHaveBeenCalled();
  });
});
