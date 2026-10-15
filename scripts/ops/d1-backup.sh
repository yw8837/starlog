#!/usr/bin/env bash
# Export the production D1 database (schema + data) to a dated .sql file OUTSIDE the repo (it holds personal data).
# D1 Time Travel (30 days on the paid plan) is the first restore path; this file is the copy that outlives it.
# Usage: bash scripts/ops/d1-backup.sh [out-dir]   (default D:/Money/backups/starlog)
# Restore into a NEW database, never over production: npx wrangler d1 execute <new-db> --remote --file <file>
set -euo pipefail
OUT="${1:-/d/Money/backups/starlog}"
mkdir -p "$OUT"
FILE="$OUT/starlog-$(date +%Y%m%d-%H%M%S).sql"
cd "$(dirname "$0")/../../apps/web"
npx wrangler d1 export starlog --remote --output "$FILE"
echo "saved $FILE ($(wc -c < "$FILE") bytes)"
