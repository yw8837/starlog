import { describe, expect, it } from "vitest";
import { serviceAccountProbes } from "../../../../scripts/secretProbes.mjs";

/** A made-up key in the PEM layout of a real one (64 base64 characters a line); nothing here is a real secret. */
const LINES = [`MIIE${"A".repeat(60)}`, `madeup${"B".repeat(58)}`, `notreal${"C".repeat(57)}`, "D".repeat(20)];
const PEM = `-----BEGIN PRIVATE KEY-----\n${LINES.join("\n")}\n-----END PRIVATE KEY-----\n`;
const ACCOUNT = JSON.stringify({ type: "service_account", client_email: "play-api@starlog-made-up.iam.gserviceaccount.com", private_key: PEM, private_key_id: "k1" });

describe("client bundle gate: the Google Play service account (scripts/check-client-bundle.mjs)", () => {
  it("probes the pieces that would leak on their own: client_email and a whole line of the private key's body", () => {
    const probes = serviceAccountProbes(ACCOUNT);
    expect(probes.map((probe: { label: string }) => probe.label)).toEqual(["client_email of PLAY_SERVICE_ACCOUNT_JSON", "private_key of PLAY_SERVICE_ACCOUNT_JSON"]);
    const [email, key] = probes as Array<{ value: string }>;
    // Compared as booleans so a failure never prints them.
    expect(email!.value === "play-api@starlog-made-up.iam.gserviceaccount.com").toBe(true);
    // The second line: the first starts alike in every RSA key (MIIE…), the second is this key's own.
    expect(key!.value === LINES[1]).toBe(true);
    // Found as one piece whether the key sits in a bundle as JSON (\n escaped) or as a PEM.
    expect([JSON.stringify(ACCOUNT).includes(key!.value), PEM.includes(key!.value)]).toEqual([true, true]);
  });

  it("probes nothing when the secret is not set or is not a service account's JSON", () => {
    for (const value of [undefined, "", "{not json", JSON.stringify({ client_email: "x" }), JSON.stringify({ private_key: "short" })]) {
      expect(serviceAccountProbes(value), String(value)).toEqual([]);
    }
  });
});
