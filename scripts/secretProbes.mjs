// Pieces of a secret that would leak on their own, for scripts/check-client-bundle.mjs. Returns probes `{label, value}`;
// callers report the label only, never the value.

/**
 * The Google Play service account's JSON key (PLAY_SERVICE_ACCOUNT_JSON) beside the whole string: its client_email, and one
 * whole line of its private key's body. The second line: the first starts alike in every RSA key (MIIE…), the second is
 * this key's own, and a whole PEM line is found the same whether the key sits in a bundle as a PEM or inside JSON (where the
 * line breaks are escaped). Nothing when the value is not a service account's JSON.
 * @param {string | undefined} json
 * @returns {Array<{ label: string, value: string }>}
 */
export function serviceAccountProbes(json) {
  let value;
  try {
    value = JSON.parse(json ?? "");
  } catch {
    return [];
  }
  const probes = [];
  if (typeof value?.client_email === "string" && value.client_email.includes("@") && value.client_email.length >= 8) {
    probes.push({ label: "client_email of PLAY_SERVICE_ACCOUNT_JSON", value: value.client_email });
  }
  const body = typeof value?.private_key === "string" ? value.private_key.split(/\r?\n/).filter((line) => line && !line.startsWith("-----")) : [];
  if ((body[1]?.length ?? 0) >= 40) probes.push({ label: "private_key of PLAY_SERVICE_ACCOUNT_JSON", value: body[1] });
  return probes;
}
