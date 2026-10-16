#!/usr/bin/env bash
# Production deploy of ONE gated commit, from the isolated clone (committed code only).
# usage: bash deploy.sh <full-or-short-sha-that-gate3-passed>
set -u
SHA="${1:?gated commit sha required}"
SP="${DEPLOY_SP:-/c/starlog-ops}"   # folder holding the isolated clone ./deploy: on the SSD (D: is a USB disk, 10x slower) and out of %TEMP% (Windows cleaned files out of the old one, 10/16 and 10/17)
D="$SP/deploy"
LOG="${OPS_LOG:-$HOME/starlog-ops}/deploy-run"
mkdir -p "$LOG"; rm -f "$LOG"/*.log
step() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG/summary.log"; }
source "$(dirname "$0")/preclean.sh"; preclean
for port in 8787 3100; do for p in $(netstat -ano | grep -E "[:.]$port[[:space:]].*LISTENING" | awk '{print $NF}' | sort -u); do [ "$p" != "0" ] && taskkill //F //T //PID $p > /dev/null 2>&1; done; done

cd "$D" || exit 1
git checkout -q -- . && { git fetch -q /d/Money/apps/saju-tarot feat/p1-foundation || git -c fetch.negotiationAlgorithm=noop fetch -q /d/Money/apps/saju-tarot feat/p1-foundation; } && git checkout -q --detach "$SHA" || { step "checkout $SHA failed"; exit 1; }
BUILD_ID="$(git rev-parse --short=12 HEAD)"
step "HEAD $(git log --oneline -1)"
pnpm install --frozen-lockfile > "$LOG/install.log" 2>&1; step "install exit=$?"

cd apps/web
npx wrangler d1 migrations list starlog --remote > "$LOG/migrations.log" 2>&1
step "remote D1 pending migrations: $(grep -cE '^[│| ]*000[0-9]' "$LOG/migrations.log") (see migrations.log; 'No migrations' means none)"
grep -qi "no migrations" "$LOG/migrations.log" || { step "STOP: pending migrations or unknown state — apply them first"; exit 2; }

rm -rf .open-next; [ -e .open-next ] && { step "STOP: .open-next still locked"; exit 9; }
unset STARLOG_AI STARLOG_PAY NEXT_PUBLIC_SAJU_TOPICS NEXT_PUBLIC_LOCALES NEXT_PUBLIC_LOCALES_PREVIEW
export NEXT_PUBLIC_SPLIT_HOSTS=1 NEXT_PUBLIC_FEATURE_BONDS=1 NEXT_PUBLIC_BUILD_ID="$BUILD_ID"
[ -n "${TOPICS:-}" ] && export NEXT_PUBLIC_SAJU_TOPICS="$TOPICS"   # off (default) | owner | on
step "saju topics: ${NEXT_PUBLIC_SAJU_TOPICS:-off (production default)}"
# AdSense publisher id (public): read at build time; /ads.txt, /privacy, /faq and the guides are static
unset ADSENSE_CLIENT; export ADSENSE_CLIENT="${ADSENSE:-ca-pub-2460558039875296}"   # applied 2026-10-08; ADSENSE=off-by-empty is not supported on purpose
step "adsense: ${ADSENSE_CLIENT:-off}"
# search-engine ownership codes (public, build time): NAVER=<content> GOOGLE=<content> BING=<content>
export NEXT_PUBLIC_NAVER_SITE_VERIFICATION="${NAVER:-13fb39cf72bf1a51ed4bd136f5c7d78d3a96d608,3be267814e5e3e1fe10641c4304bc55928634208}"   # app + guide ownership (public, 2026-10-08)
export NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION="${GOOGLE:-MqMj7Z-R0z8mE55r8l_PfFoFxb8lIkpUv4czOhVWuIA}"   # studioyeolmae.com@gmail.com, https://yeolmaeapps.kr/ (2026-10-08)
[ -n "${BING:-}" ] && export NEXT_PUBLIC_BING_SITE_VERIFICATION="$BING"
step "verification: naver=${NEXT_PUBLIC_NAVER_SITE_VERIFICATION:-none} google=${NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION:-none} bing=${NEXT_PUBLIC_BING_SITE_VERIFICATION:-none}"
export NEXT_PUBLIC_KAKAO_JS_KEY="$(grep -E '^NEXT_PUBLIC_KAKAO_JS_KEY=' /d/Money/apps/saju-tarot/apps/web/.env.local | cut -d= -f2- | tr -d '\r"')"
pnpm cf:build > "$LOG/build.log" 2>&1; rc=$?; step "cf:build exit=$rc"; [ $rc -eq 0 ] || exit 3
if [ -f ../../scripts/check-worker-env.mjs ]; then (cd ../.. && node scripts/check-worker-env.mjs) > "$LOG/worker-env.log" 2>&1; rc=$?; step "worker env secret-name check exit=$rc $(tail -1 "$LOG/worker-env.log")"; [ $rc -eq 0 ] || exit 5; else step "STOP: scripts/check-worker-env.mjs missing in this commit"; exit 5; fi
(cd ../.. && node scripts/check-client-bundle.mjs) > "$LOG/bundle.log" 2>&1; rc=$?; step "client bundle check exit=$rc"; [ $rc -eq 0 ] || exit 6
pnpm --filter @starlog/web cf:deploy > "$LOG/deploy.log" 2>&1; rc=$?; step "cf:deploy exit=$rc $(grep -oE 'Current Version ID: [0-9a-f-]+' "$LOG/deploy.log")"; [ $rc -eq 0 ] || exit 4

for i in $(seq 1 30); do v=$(curl -s https://starlog.yeolmaeapps.kr/api/version); echo "$v" | grep -q "$BUILD_ID" && break; sleep 4; done
step "live /api/version: $v (want $BUILD_ID)"
for u in https://starlog.yeolmaeapps.kr/ https://starlog.yeolmaeapps.kr/pricing https://starlog.yeolmaeapps.kr/refund https://starlog.yeolmaeapps.kr/now https://starlog.yeolmaeapps.kr/today https://starlog.yeolmaeapps.kr/login/review https://starlog.yeolmaeapps.kr/login https://yeolmaeapps.kr/; do
  step "$(curl -s -o /dev/null -w '%{http_code}' "$u") $u"
done
# The guide's home is the root domain's /: the tarot tab's old address redirects there.
for u in https://yeolmaeapps.kr/guide/tarot https://starlog.yeolmaeapps.kr/guide/tarot; do
  step "$(curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}' "$u") $u"
done
if [ -n "${ADSENSE_CLIENT:-}" ]; then
  step "ads.txt: $(curl -s https://yeolmaeapps.kr/ads.txt | head -1)"
  step "apex meta: $(curl -s https://yeolmaeapps.kr/ | grep -o '<meta name="google-adsense-account"[^>]*>' | head -1)"
  step "privacy ad section: $(curl -s https://starlog.yeolmaeapps.kr/privacy | grep -c '광고 쿠키와 행태정보')"
fi
step "DONE"
