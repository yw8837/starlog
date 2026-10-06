# Deploy runbook

Production runs on Cloudflare Workers through OpenNext (`apps/web/wrangler.jsonc`). Build with `pnpm cf:build`, check with `pnpm check:worker-env` (it fails when the build carries a secret from a local `.env` file, which the Worker would fall back on; build in a clean checkout), deploy with `pnpm --filter @starlog/web cf:deploy`. `pnpm deploy` runs all three.

## D1 database and migrations

App data lives in Cloudflare D1: database `starlog` (id `78c6fb07-ee97-42d5-9633-21801fe596eb`), bound as `DB` (`d1_databases` in `apps/web/wrangler.jsonc`). The code that uses it is `apps/web/lib/db/` (the pattern is described at the top of `lib/db/index.ts`).

- Schema changes are numbered files in `apps/web/migrations/` (`0001_bonds.sql`, then `0002_...`). Never edit a migration that has been applied anywhere. Put every change in the next number.
- **Apply migrations before you deploy code that needs them.** Run these from `apps/web`:

  ```sh
  npx wrangler d1 migrations list starlog --remote    # what is still pending
  npx wrangler d1 migrations apply starlog --remote   # apply it (asks for confirmation)
  ```

  Use `--local` in place of `--remote` for the local D1 under `apps/web/.wrangler/state`.
- The D1 repository passes the same contract suite as the in-memory one, run against a real local D1 with every migration applied: `npx vitest run apps/web/lib/db` (from the repo root). The workerd start takes about 15 s. Set `CI_NO_WORKERD=1` only where workerd cannot run.
- Look at stored rows: `npx wrangler d1 execute starlog --remote --command "SELECT * FROM stars LIMIT 5"`. Rows must never hold a birth date: owners keep only the derived basis (`basis_json`), and stars keep nickname, message, card, score and parts.

## Turning on 별자리 인연 (and 이번 주 행운 번호)

`SITE.features.bonds` (`apps/web/lib/config.ts`) is on in dev and tests. A production build turns it on only when it is built with `NEXT_PUBLIC_FEATURE_BONDS=1`:

```sh
NEXT_PUBLIC_FEATURE_BONDS=1 pnpm cf:build
pnpm --filter @starlog/web cf:deploy
```

Before the first build with the flag:

1. Apply `0001_bonds.sql` to the remote database (see above).
2. Check that `wrangler.jsonc` still has the `DB` binding, `DAILY_KV` (it also holds the 10-minute code-guessing blocks and the 오늘의 인연 카드 lines), and the `BOND_JOIN_LIMITER` (1006), `BOND_CODE_LIMITER` (1007) and `BOND_VIEW_LIMITER` (1008) rate limits.
3. Share images (`/api/og/*`) use next/og on the Worker and fetch Korean glyph subsets from Google Fonts. Before the first launch, check them on `pnpm --filter @starlog/web cf:preview` (open `/api/og/invite/ZZZZZZ` and a completed constellation's `/api/og/bonds/<id>`), and check the Worker's gzip size in the build output, because next/og brings its WebAssembly renderer.
4. The existing secrets cover it. `STARLOG_SIGNING_SECRET` signs the `sl_uid` and `sl_fid` cookies, and the API key is needed for the 오늘의 인연 카드 line (without a provider the line falls back to rule-based text).

With the flag off, `/bonds`, `/ranking/*`, `/b`, `/lucky`, `/api/bonds/*`, `/api/lucky` and the 별자리·초대·행운 번호 share images answer 404, the home row renders nothing, and the privacy policy and terms leave the 별자리 인연 sections out.
