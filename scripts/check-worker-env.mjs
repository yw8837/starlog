// Fails when the Worker build carries secrets. OpenNext copies the build machine's .env files
// (.env, .env.production, .env.local, .env.production.local) into
// apps/web/.open-next/cloudflare/next-env.mjs, and the Worker fills process.env from its `production`
// values wherever it has no value of its own (process.env[key] ??= …): a secret deleted from the Worker
// would live on from the build. Two checks, reported by name only, never a value:
// - a secret-like name among next-env.mjs's production keys;
// - a secret of the local .env files, loaded as Next loads them (@next/env loadEnvConfig), whose value
//   sits in production under another name.
// usage: pnpm check:worker-env   (after `pnpm cf:build`; `pnpm deploy` runs it before uploading)
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, "apps/web");
const nextEnvFile = join(appDir, ".open-next/cloudflare/next-env.mjs");

/** The app's secrets by name, and anything named like a secret. */
const SECRET_NAME = /^(REVIEW_LOGIN_|ANTHROPIC_)|^(TOSS_SECRET_KEY|KAKAO_CLIENT_SECRET|STARLOG_OWNER_CODE|STARLOG_SIGNING_SECRET|GOOGLE_CLIENT_SECRET|TURNSTILE_SECRET_KEY)$|SECRET|PASSWORD|_KEY$|TOKEN/;

/** Named like a secret but public by design: the Turnstile site key goes to every browser the check runs in. */
const PUBLIC_NAMES = new Set(["TURNSTILE_SITE_KEY"]);

/**
 * A name whose value must never ride in a build (NEXT_PUBLIC_ values are public by design).
 * @param {string} name
 */
export function secretLike(name) {
  return !name.startsWith("NEXT_PUBLIC_") && !PUBLIC_NAMES.has(name) && SECRET_NAME.test(name);
}

/**
 * What is wrong with next-env.mjs's `production` values, by name only: secret-like names, and values
 * of the local secrets (`local`, name → value) found under another name. Empty when fine.
 * @param {Record<string, string>} production
 * @param {Record<string, string | undefined>} [local]
 * @returns {string[]}
 */
export function bakedSecrets(production, local = {}) {
  const problems = Object.keys(production).filter(secretLike);
  for (const [name, value] of Object.entries(local)) {
    const secret = value?.trim() ?? "";
    if (!secretLike(name) || secret.length < 8) continue;
    for (const [key, held] of Object.entries(production)) {
      if (!secretLike(key) && String(held).includes(secret)) problems.push(`${key} (holds the value of ${name})`);
    }
  }
  return [...new Set(problems)].sort();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const shown = relative(root, nextEnvFile);
  if (!existsSync(nextEnvFile)) {
    console.error(`check-worker-env: ${shown} not found. Run \`pnpm cf:build\` first.`);
    process.exit(2);
  }
  let production;
  try {
    ({ production } = await import(pathToFileURL(nextEnvFile).href));
  } catch (error) {
    // Only the error's name: a message or code frame could quote the file, values included.
    console.error(`check-worker-env: could not load ${shown} (${error instanceof Error ? error.name : "error"})`);
    process.exit(2);
  }
  if (!production || typeof production !== "object") {
    console.error(`check-worker-env: ${shown} has no \`production\` export`);
    process.exit(2);
  }
  const { loadEnvConfig } = createRequire(join(appDir, "package.json"))("@next/env");
  const { loadedEnvFiles } = loadEnvConfig(appDir, false, { info() {}, error() {} });
  const problems = [...new Set([bakedSecrets(production), ...loadedEnvFiles.map((file) => bakedSecrets(production, file.env))].flat())].sort();
  const files = loadedEnvFiles.map((file) => file.path).join(", ") || "none";
  if (problems.length) {
    console.error(`check-worker-env: ${shown} carries secrets in its production values (names only; local env files: ${files}):`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error("Build in a clean checkout whose .env files hold no secrets; the Worker's secrets come from `wrangler secret put`.");
    process.exit(1);
  }
  console.log(`check-worker-env: ok, ${Object.keys(production).length} production keys in next-env.mjs, no secret among them (local env files checked: ${files})`);
}
