/**
 * Google AdSense settings (spec: ads on guide pages only, never on readings).
 * Ads stay off until ADSENSE_CLIENT holds a valid publisher id. The values are public, but they
 * are read on the server only, so static pages pick them up at build time.
 */

const CLIENT_PATTERN = /^ca-pub-\d{16}$/;
const SLOT_PATTERN = /^\d{6,12}$/;

/** Google's certification authority id for ads.txt lines. */
const GOOGLE_CERT_ID = "f08c47fec0942fa0";

export type AdsConfig = {
  /** Publisher id, e.g. "ca-pub-0000000000000000". */
  client: string;
  /** Ad unit id for the slot under guide articles, or null to load the script without a unit. */
  guideSlot: string | null;
};

type Env = Readonly<Record<string, string | undefined>>;

export function adsConfig(env: Env = process.env): AdsConfig | null {
  const client = env.ADSENSE_CLIENT?.trim() ?? "";
  if (!CLIENT_PATTERN.test(client)) return null;
  const slot = env.ADSENSE_SLOT_GUIDE?.trim() ?? "";
  return { client, guideSlot: SLOT_PATTERN.test(slot) ? slot : null };
}

/** The ads.txt line that authorises Google to sell this site's inventory. */
export function adsTxt(client: string): string {
  return `google.com, ${client.replace(/^ca-/, "")}, DIRECT, ${GOOGLE_CERT_ID}\n`;
}

export function adsScriptSrc(client: string): string {
  return `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
}
