import { describe, expect, it } from "vitest";
import { adsConfig, adsScriptSrc, adsTxt } from "./ads";

const CLIENT = "ca-pub-1234567890123456";

describe("adsConfig", () => {
  it("is off without a publisher id", () => {
    expect(adsConfig({})).toBeNull();
    expect(adsConfig({ ADSENSE_CLIENT: "" })).toBeNull();
  });

  it("rejects malformed publisher ids", () => {
    expect(adsConfig({ ADSENSE_CLIENT: "pub-1234567890123456" })).toBeNull();
    expect(adsConfig({ ADSENSE_CLIENT: "ca-pub-123" })).toBeNull();
    expect(adsConfig({ ADSENSE_CLIENT: `${CLIENT}"><script>` })).toBeNull();
  });

  it("reads the publisher id and the guide slot", () => {
    expect(adsConfig({ ADSENSE_CLIENT: ` ${CLIENT} `, ADSENSE_SLOT_GUIDE: "1234567890" })).toEqual({
      client: CLIENT,
      guideSlot: "1234567890",
    });
  });

  it("drops a malformed slot but keeps the script on", () => {
    expect(adsConfig({ ADSENSE_CLIENT: CLIENT, ADSENSE_SLOT_GUIDE: "abc" })).toEqual({ client: CLIENT, guideSlot: null });
  });
});

describe("ads.txt and script", () => {
  it("writes Google's seller line without the ca- prefix", () => {
    expect(adsTxt(CLIENT)).toBe("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  });

  it("loads the AdSense script for the publisher", () => {
    expect(adsScriptSrc(CLIENT)).toBe(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`);
  });
});
