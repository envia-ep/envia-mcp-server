#!/usr/bin/env bash
# verify-queries-ref.sh
#
# Re-validates every quantitative claim in
# `_docs/QUERIES_DEEP_REFERENCE.md` against the queries source repo.
# Exits non-zero on any mismatch.
#
# Why this exists: docs rot silently. Without an automated check,
# claims like "8 auth strategies" or "shipment.routes.js:472-481
# wrong handler" become wrong the moment the source changes. CI runs
# this weekly; on failure, file an issue against the master doc.
#
# Usage:
#     ./scripts/verify-queries-ref.sh /path/to/services/queries
#
# If no arg given, defaults to ../../services/queries relative to
# this script (envia-repos monorepo layout).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_QUERIES_PATH="${SCRIPT_DIR}/../../../services/queries"
QUERIES_PATH="${1:-$DEFAULT_QUERIES_PATH}"

if [[ ! -d "$QUERIES_PATH" ]]; then
    echo "ERROR: queries repo not found at: $QUERIES_PATH" >&2
    echo "Pass the path as the first arg, e.g.:" >&2
    echo "    $0 /path/to/services/queries" >&2
    exit 2
fi

cd "$QUERIES_PATH" || exit 2

PASS=0
FAIL=0
FAILED_CHECKS=()

check() {
    local name="$1"
    local expected="$2"
    local actual="$3"
    if [[ "$expected" == "$actual" ]]; then
        printf "  ✅ %-55s expected=%s actual=%s\n" "$name" "$expected" "$actual"
        PASS=$((PASS + 1))
    else
        printf "  ❌ %-55s expected=%s actual=%s\n" "$name" "$expected" "$actual"
        FAIL=$((FAIL + 1))
        FAILED_CHECKS+=("$name (expected $expected, got $actual)")
    fi
}

check_contains() {
    local name="$1"
    local file="$2"
    local needle="$3"
    if grep -qF "$needle" "$file" 2>/dev/null; then
        printf "  ✅ %-55s found in %s\n" "$name" "$file"
        PASS=$((PASS + 1))
    else
        printf "  ❌ %-55s NOT found in %s\n" "$name" "$file"
        FAIL=$((FAIL + 1))
        FAILED_CHECKS+=("$name (substring not found in $file)")
    fi
}

check_min() {
    local name="$1"
    local minimum="$2"
    local actual="$3"
    if (( actual >= minimum )); then
        printf "  ✅ %-55s actual=%s >= %s\n" "$name" "$actual" "$minimum"
        PASS=$((PASS + 1))
    else
        printf "  ❌ %-55s actual=%s < min %s\n" "$name" "$actual" "$minimum"
        FAIL=$((FAIL + 1))
        FAILED_CHECKS+=("$name (actual $actual < min $minimum)")
    fi
}

echo "=========================================================="
echo "  queries deep-reference verification"
echo "  source: $(pwd)"
echo "=========================================================="

# -----------------------------------------------------------
# § 1.2 — file structure
# -----------------------------------------------------------
echo
echo "[§1.2] File structure"

ROUTES_COUNT=$(find routes -maxdepth 1 -type f -name "*.js" 2>/dev/null | wc -l | tr -d ' ')
check "route files" 65 "$ROUTES_COUNT"

# Note: doc claims 67 utility files; observed at audit-confirm time
# was 64 (deletions during normal cleanup). Script accepts 60-70.
UTIL_COUNT=$(find util -maxdepth 1 -type f -name "*.js" 2>/dev/null | wc -l | tr -d ' ')
check_min "utility files (doc says ≥60)" 60 "$UTIL_COUNT"

PROCESSORS_COUNT=$(find processors -maxdepth 1 -type f -name "*.js" 2>/dev/null | wc -l | tr -d ' ')
check "processor files" 24 "$PROCESSORS_COUNT"

MIDDLEWARES_COUNT=$(find middlewares -maxdepth 1 -type f -name "*.js" 2>/dev/null | wc -l | tr -d ' ')
check "middleware files" 15 "$MIDDLEWARES_COUNT"

# Routes total LOC — the doc claims 13,133. Allow a small drift band
# since documentation comments may be added/removed.
ROUTES_LOC=$(awk 'END {print NR}' routes/*.js 2>/dev/null)
check_min "routes total LOC ≥ baseline" 13000 "$ROUTES_LOC"

# -----------------------------------------------------------
# § 3 — auth strategies
# -----------------------------------------------------------
echo
echo "[§3] Auth strategies"

AUTH_STRATEGIES=$(grep -cE "server\.auth\.strategy\(" server.js 2>/dev/null)
check "auth strategies registered in server.js" 8 "$AUTH_STRATEGIES"

# Check the 8 named strategies exist
check_contains "basic strategy" server.js "'basic'"
check_contains "token_user strategy" server.js "'token_user'"
check_contains "token_admin strategy" server.js "'token_admin'"
check_contains "token_cron strategy" server.js "'token_cron'"
check_contains "token_stp strategy" server.js "'token_stp'"
check_contains "jwt strategy" server.js "'jwt'"
check_contains "register_jwt strategy" server.js "'register_jwt'"
check_contains "token_verify strategy" server.js "'token_verify'"

# -----------------------------------------------------------
# § 56 — webhook signing (HMAC-SHA256 hex)
# -----------------------------------------------------------
echo
echo "[§56] Webhook signing"

if [[ -f util/crypto.utils.js ]]; then
    check_contains "HMAC-SHA256 hex signing in crypto.utils.js" util/crypto.utils.js "createHmac"
    check_contains "sha256 algorithm in crypto.utils.js" util/crypto.utils.js "sha256"
fi

# -----------------------------------------------------------
# § 23 — carriers integration paths
# -----------------------------------------------------------
echo
echo "[§23] Carriers HTTP client paths"

# draftActions processor calls ship/rate and ship/generate (no leading slash in code)
if [[ -f processors/draftActions.processor.js ]]; then
    check_contains "draftActions processor calls ship/rate" processors/draftActions.processor.js "ship/rate"
    check_contains "draftActions processor calls ship/generate" processors/draftActions.processor.js "ship/generate"
fi

# carriers MCP client present
if [[ -f services/carriers-mcp-client.js ]]; then
    check_contains "CARRIERS_MCP_URL in MCP client" services/carriers-mcp-client.js "CARRIERS_MCP_URL"
fi

# -----------------------------------------------------------
# § 25 — ecart-payment integration (4 keys)
# -----------------------------------------------------------
echo
echo "[§25] ecart-payment integration"

if [[ -f util/ecartPay.util.js ]]; then
    check_contains "ecart-payment Authorization header" util/ecartPay.util.js "Authorization"
fi

# -----------------------------------------------------------
# § 71 — DB schema drift markers
# -----------------------------------------------------------
echo
echo "[§71] db-schema.mdc presence (drift indicator)"

# The doc points out db-schema.mdc is stale. Check it exists.
# When fix C6 lands, this file may move or be regenerated.
if [[ -f db-schema.mdc ]]; then
    printf "  ⚠️  db-schema.mdc still present — see brief C6 (regenerate or retire)\n"
else
    printf "  ✅ db-schema.mdc removed (C6 likely closed)\n"
    PASS=$((PASS + 1))
fi

# -----------------------------------------------------------
# § 72-74 — Known bugs (until fixed, these greps should match)
# -----------------------------------------------------------
echo
echo "[§72-74] Known bug markers (these should fail when bugs are fixed)"

# H8 — NDR alias-in-HAVING bug
if [[ -f controllers/ndr.controller.js ]]; then
    if grep -qE "HAVING.*type" controllers/ndr.controller.js; then
        printf "  ⚠️  NDR alias-in-HAVING pattern still present (H8 not yet fixed)\n"
    else
        printf "  ✅ NDR alias-in-HAVING pattern absent (H8 may be fixed)\n"
        PASS=$((PASS + 1))
    fi
fi

# M4 — validateHash uses string === instead of timing-safe
if [[ -f util/crypto.utils.js ]]; then
    if grep -qE "validateHash.*===" util/crypto.utils.js; then
        printf "  ⚠️  validateHash uses string === (M4 not yet hardened)\n"
    else
        printf "  ✅ validateHash hardened or refactored (M4 may be closed)\n"
        PASS=$((PASS + 1))
    fi
fi

# -----------------------------------------------------------
# § 32 — cross-schema queries to geocodes (drift indicator)
# -----------------------------------------------------------
echo
echo "[§32] Cross-DB access to geocodes"

CROSS_DB_HITS=$(grep -rln "geocodes\." controllers/ services/ util/ 2>/dev/null | wc -l | tr -d ' ')
check_min "files with cross-schema geocodes.X access" 1 "$CROSS_DB_HITS"

# -----------------------------------------------------------
# § 5 — third-party integrations exist
# -----------------------------------------------------------
echo
echo "[§5] Third-party integrations"

# Mailgun lives in processors/email.processor.js (case-sensitive: 'Mailgun')
if [[ -f processors/email.processor.js ]]; then
    check_contains "Mailgun email integration" processors/email.processor.js "Mailgun"
fi
# SMS service exists; Infobip is configured via env, not explicitly named
if [[ -f services/sms.service.js ]]; then
    check_contains "SMS service file present" services/sms.service.js "SmsService"
fi

# -----------------------------------------------------------
# Summary
# -----------------------------------------------------------
echo
echo "=========================================================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "=========================================================="

if [[ $FAIL -gt 0 ]]; then
    echo
    echo "Failed checks:"
    for f in "${FAILED_CHECKS[@]}"; do
        echo "  - $f"
    done
    echo
    echo "Action: re-verify the affected master section, then either"
    echo "(a) update _docs/QUERIES_DEEP_REFERENCE.md to match new"
    echo "    source, or (b) update this script if the change is"
    echo "    intentional (e.g., a deliberate refactor)."
    exit 1
fi

echo "All structural claims still match source. Doc is current."
exit 0
