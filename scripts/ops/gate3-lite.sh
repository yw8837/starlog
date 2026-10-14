#!/usr/bin/env bash
# Deploy gate v3 (uq-gate + local D1 migrations), run in the isolated clone on committed code only.
SP="${DEPLOY_SP:-/c/Users/최용우/AppData/Local/Temp/claude/D--Money-apps/4114789f-d0ea-4824-9406-16baa6850970/scratchpad}"   # folder holding the isolated clone ./deploy
D="$SP/deploy"; LOG="${OPS_LOG:-$HOME/starlog-ops}/gate3"; mkdir -p "$LOG"; rm -f "$LOG"/*.log
step() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG/summary.log"; }
source "$(dirname "$0")/preclean.sh"; preclean
# stale previews/dev servers from earlier gates would answer on 8787/3100 with an old build
for port in 8787 3100; do for p in $(netstat -ano | grep -E "[:.]$port[[:space:]].*LISTENING" | awk '{print $NF}' | sort -u); do [ "$p" != "0" ] && taskkill //F //T //PID $p > /dev/null 2>&1; done; done
# A failed fetch used to leave the clone on its old commit and the gate tested that (10/14): stop instead.
cd "$D" && git checkout -q -- . && git fetch -q /d/Money/apps/saju-tarot feat/p1-foundation && git checkout -q --detach FETCH_HEAD   || { step "STOP: could not move the clone to feat/p1-foundation (if objects are missing: git -c fetch.negotiationAlgorithm=noop fetch)"; exit 8; }
[ "$(git rev-parse HEAD)" = "$(git -C /d/Money/apps/saju-tarot rev-parse feat/p1-foundation)" ] || { step "STOP: clone HEAD is not feat/p1-foundation"; exit 8; }
step "HEAD $(git log --oneline -1)"
pnpm install --frozen-lockfile > "$LOG/install.log" 2>&1; step "install exit=$?"
STARLOG_AI=mock npx vitest run --maxWorkers=1 > "$LOG/unit.log" 2>&1; step "unit exit=$? $(grep -E 'Tests ' "$LOG/unit.log" | tail -1)"
pnpm typecheck > "$LOG/tsc.log" 2>&1; step "typecheck exit=$?"
cd apps/web && rm -rf .open-next; [ -e .open-next ] && { step "STOP: .open-next still locked"; exit 9; }
echo y | npx wrangler d1 migrations apply starlog --local > "$LOG/migrate-local.log" 2>&1; step "local D1 migrations exit=$?"; grep -oE "000[0-9]_[a-z_]+" "$LOG/migrate-local.log" | sort -u >> "$LOG/summary.log"
export NEXT_PUBLIC_FEATURE_BONDS=1 NEXT_PUBLIC_BUILD_ID=$(git rev-parse --short=12 HEAD) STARLOG_AI=mock
export NEXT_PUBLIC_KAKAO_JS_KEY="$(grep -E '^NEXT_PUBLIC_KAKAO_JS_KEY=' /d/Money/apps/saju-tarot/apps/web/.env.local | cut -d= -f2- | tr -d '\r\"')"
pnpm cf:build > "$LOG/build.log" 2>&1; step "cf:build exit=$?"
# Pages that read a runtime setting must not be prerendered: a build without the setting froze /login as a 404 (10/14).
node -e 'const r=require("./.next/prerender-manifest.json").routes;const bad=["/login"].filter(p=>p in r);console.log(bad.length?"prerendered: "+bad.join(" "):"ok");process.exit(bad.length?1:0)' > "$LOG/prerender.log" 2>&1; step "runtime pages not prerendered exit=$? $(tail -1 "$LOG/prerender.log")"
(cd ../.. && node scripts/check-client-bundle.mjs > "$LOG/bundle.log" 2>&1); step "bundle exit=$? $(tail -1 "$LOG/bundle.log")"
if [ -f ../../scripts/check-worker-env.mjs ]; then (cd ../.. && node scripts/check-worker-env.mjs > "$LOG/worker-env.log" 2>&1); step "worker env exit=$? $(tail -1 "$LOG/worker-env.log")"; fi
if grep -q '"check:worker"' package.json ../../package.json 2>/dev/null; then (cd ../.. && node scripts/check-worker-size.mjs > "$LOG/worker.log" 2>&1); step "worker size exit=$? $(tail -2 "$LOG/worker.log" | tr '\n' ' ')"; fi
npx opennextjs-cloudflare preview --port 8787 > "$LOG/preview.log" 2>&1 &
PREV=$!
for i in $(seq 1 90); do c=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8787/); [ "$c" = "200" ] && break; sleep 2; done
step "preview http=$c"
SPECS=$(ls e2e/*.spec.ts | grep -v pay-flow | grep -v saju-topics | tr '\n' ' ')
# Saju has no free full reading (owner 10/14): the specs open it with the preview's owner pass (.dev.vars, never printed).
E2E_OWNER_CODE="$(grep -E '^STARLOG_OWNER_CODE=' .dev.vars | cut -d= -f2- | tr -d '\r\"')" E2E_BASE_URL=http://localhost:8787 E2E_ALLOW_LIVE=1 npx playwright test $SPECS --workers=2 --grep-invert "saju-chart-topic" --reporter=line > "$LOG/e2e-preview.log" 2>&1; step "e2e preview exit=$? $(grep -E '[0-9]+ (passed|failed|skipped|flaky)' "$LOG/e2e-preview.log" | tr '\n' ' ')"
kill $PREV 2>/dev/null; taskkill //F //T //PID $PREV > /dev/null 2>&1
for p in $(powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \"Name='workerd.exe' or Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'scratchpad\\deploy\\' }).ProcessId"); do taskkill //F //T //PID $p > /dev/null 2>&1; done
for port in 8787 3100; do for p in $(netstat -ano | grep -E "[:.]$port[[:space:]].*LISTENING" | awk '{print $NF}' | sort -u); do [ "$p" != "0" ] && taskkill //F //T //PID $p > /dev/null 2>&1; done; done
sleep 3
STARLOG_AI=mock pnpm e2e e2e/pay-flow.spec.ts --workers=1 --project=desktop --project=mobile --reporter=line > "$LOG/e2e-pay.log" 2>&1; step "e2e pay-flow exit=$? $(grep -E '[0-9]+ (passed|failed|skipped|flaky)' "$LOG/e2e-pay.log" | tr '\n' ' ')"
step "DONE"
