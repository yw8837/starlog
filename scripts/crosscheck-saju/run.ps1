# Saju calendar cross-check: our engine (packages/core) vs lunar_python / sxtwl / tzdata / KLC / astropy.
# Report: docs/research/saju-calendar-crosscheck-2026-10.md
#
# Usage (from the repo root, Windows PowerShell):
#   powershell -ExecutionPolicy Bypass -File scripts/crosscheck-saju/run.ps1 [-Python <path to python 3.11>]
# The first run creates scripts/crosscheck-saju/.venv from Python 3.11 (sxtwl 2.0.7 has Windows wheels only up
# to cp311; found with `py -0p` unless -Python is given) and installs requirements.txt into it.
# On this PC pip needs the CA bundle: $env:SSL_CERT_FILE = $env:PIP_CERT = "C:\Users\Public\agent-certs\cacert.pem"
param([string]$Python = "")
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$root = Resolve-Path (Join-Path $here "..\..")
$py = Join-Path $here ".venv\Scripts\python.exe"
$env:PYTHONUTF8 = "1"

if (-not (Test-Path $py)) {
  if (-not $Python) {
    $line = (py -0p) | Where-Object { $_ -match '3\.11' } | Select-Object -First 1
    if (-not ($line -match '([A-Za-z]:\\.*python\.exe)')) { throw "Python 3.11 not found by 'py -0p'; pass -Python <path>" }
    $Python = $Matches[1]
  }
  & $Python -m venv (Join-Path $here ".venv")
  if (-not $?) { throw "venv creation failed" }
  & $py -m pip install --disable-pip-version-check --only-binary=:all: -r (Join-Path $here "requirements.txt")
  if (-not $?) { throw "pip install failed" }
}

Push-Location $here
try {
  & $py gen_cases.py;      if (-not $?) { throw "gen_cases.py failed" }      # cases.json (100) + fuzz-cases.json (sweep)
  Push-Location $root
  try {
    npx vitest run -c scripts/crosscheck-saju/vitest.config.ts                # ours.json, ours-fuzz.json, ours-lunar.json
    if (-not $?) { throw "our engine run failed" }
  } finally { Pop-Location }
  & $py reference.py;      if (-not $?) { throw "reference.py failed" }      # ref.json
  & $py reference.py fuzz; if (-not $?) { throw "reference.py fuzz failed" } # ref-fuzz.json (about 2 min)
  & $py astro_terms.py;    if (-not $?) { throw "astro_terms.py failed" }    # astro_terms.json
  & $py compare.py                                                           # tables to stdout, results.json
  if (-not $?) { throw "compare.py found an unclassified difference" }       # exit 1 = unclassified difference
} finally { Pop-Location }
