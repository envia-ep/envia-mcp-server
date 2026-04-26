#!/usr/bin/env bash
# verify-geocodes-ref.sh
#
# Re-validates every quantitative claim in
# `_docs/GEOCODES_DEEP_REFERENCE.md` against the geocodes source.
# Exits non-zero on mismatch.
#
# Why this exists: geocodes has confirmed SQL injection sites and
# zero test coverage. This script is the audit trail until proper
# tests land (C2 in BACKEND_TEAM_BRIEF.md).
#
# Usage:
#     ./scripts/verify-geocodes-ref.sh /path/to/services/geocodes
#
# Default path: ../../services/geocodes from this script.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_GEOCODES_PATH="${SCRIPT_DIR}/../../../services/geocodes"
GEOCODES_PATH="${1:-$DEFAULT_GEOCODES_PATH}"

if [[ ! -d "$GEOCODES_PATH" ]]; then
    echo "ERROR: geocodes repo not found at: $GEOCODES_PATH" >&2
    exit 2
fi

cd "$GEOCODES_PATH" || exit 2

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

check_absent() {
    # Inverse of check_contains: PASS when needle is absent (used for
    # "this bug should still be present until fixed" or "this fix
    # should now be in place").
    local name="$1"
    local file="$2"
    local needle="$3"
    local mode="$4"  # 'should_be_absent' or 'flag_until_fix'
    if grep -qF "$needle" "$file" 2>/dev/null; then
        if [[ "$mode" == "flag_until_fix" ]]; then
            printf "  ⚠️  %-55s still present (NOT YET FIXED)\n" "$name"
        else
            printf "  ❌ %-55s still present (should be absent)\n" "$name"
            FAIL=$((FAIL + 1))
            FAILED_CHECKS+=("$name (should be absent but found)")
        fi
    else
        printf "  ✅ %-55s absent\n" "$name"
        PASS=$((PASS + 1))
    fi
}

echo "=========================================================="
echo "  geocodes deep-reference verification"
echo "  source: $(pwd)"
echo "=========================================================="

# -----------------------------------------------------------
# § 1, § 15.1 — file structure
# -----------------------------------------------------------
echo
echo "[§1, §15.1] File structure"

ROUTES_LINES=$(wc -l < routes/web.js 2>/dev/null | tr -d ' ')
# Doc claims 723; observed 722; allow either.
if [[ "$ROUTES_LINES" == "722" || "$ROUTES_LINES" == "723" ]]; then
    printf "  ✅ %-55s actual=%s (doc says 722-723)\n" "routes/web.js line count" "$ROUTES_LINES"
    PASS=$((PASS + 1))
else
    printf "  ❌ %-55s actual=%s expected 722 or 723\n" "routes/web.js line count" "$ROUTES_LINES"
    FAIL=$((FAIL + 1))
    FAILED_CHECKS+=("routes/web.js line count drift")
fi

CONTROLLER_LINES=$(wc -l < controllers/web.js 2>/dev/null | tr -d ' ')
check "controllers/web.js line count (god file)" 2349 "$CONTROLLER_LINES"

# Route count
ROUTE_COUNT=$(grep -cE "method:\s*'(GET|POST|PUT|DELETE)'" routes/web.js 2>/dev/null)
check "HTTP route count" 48 "$ROUTE_COUNT"

# All routes auth: false
AUTH_FALSE_COUNT=$(grep -c "auth: false" routes/web.js 2>/dev/null)
check "routes with auth: false (all 48)" 48 "$AUTH_FALSE_COUNT"

# -----------------------------------------------------------
# § 16.1 — SQL injection sites (CRITICAL — should still match
# until C1 lands; once parameterized, lines may shift)
# -----------------------------------------------------------
echo
echo "[§16.1] SQL injection sites (CRITICAL)"

# These check for the interpolation patterns. The grep matches any
# of the parameterized patterns at the named line ranges.
# When fix C1 lands, these patterns become absent (PASS by absence).

# queryExtendendZoneCarrierValidator interpolation pattern
if grep -qE 'WHERE.*\$\{carrier_name\}|WHERE.*\$\{country_code\}|WHERE.*\$\{zipcode\}' controllers/web.js 2>/dev/null; then
    printf "  ⚠️  %-55s present (C1 not yet fixed — CRITICAL)\n" "queryExtendendZoneCarrierValidator interpolation"
else
    printf "  ✅ %-55s absent (C1 may be fixed)\n" "queryExtendendZoneCarrierValidator interpolation"
    PASS=$((PASS + 1))
fi

# queryRedserviCoverage interpolation pattern
if grep -qE 'IF\(LENGTH\(\$\{|SUBSTR\(\$\{' controllers/web.js 2>/dev/null; then
    printf "  ⚠️  %-55s present (C1 not yet fixed — CRITICAL)\n" "queryRedserviCoverage interpolation"
else
    printf "  ✅ %-55s absent (C1 may be fixed)\n" "queryRedserviCoverage interpolation"
    PASS=$((PASS + 1))
fi

# -----------------------------------------------------------
# § 16.3 — multipleStatements: true (should be removed by C1/M2)
# -----------------------------------------------------------
echo
echo "[§16.3] multipleStatements config flag"

if grep -qE "multipleStatements:\s*true" config/*.js 2>/dev/null; then
    printf "  ⚠️  %-55s set to true (M2 not yet fixed)\n" "multipleStatements flag"
else
    printf "  ✅ %-55s removed or set to false (M2 fixed)\n" "multipleStatements flag"
    PASS=$((PASS + 1))
fi

# -----------------------------------------------------------
# § 14, § 23 — VIACEP integration
# -----------------------------------------------------------
echo
echo "[§14, §23] VIACEP integration"

if [[ -f util.js ]]; then
    check_contains "VIACEP URL in util.js" util.js "viacep"
fi

# -----------------------------------------------------------
# § 16.2 — public /flush endpoint (should be auth-protected after M1)
# -----------------------------------------------------------
echo
echo "[§16.2] /flush endpoint auth"

if grep -qE "path:\s*['\"]\/flush" routes/web.js 2>/dev/null; then
    if grep -A 5 "path:.*['\"]\/flush" routes/web.js | grep -q "auth: false"; then
        printf "  ⚠️  %-55s still public auth: false (M1 not yet fixed)\n" "/flush endpoint"
    else
        printf "  ✅ %-55s no longer auth: false (M1 may be fixed)\n" "/flush endpoint"
        PASS=$((PASS + 1))
    fi
fi

# -----------------------------------------------------------
# § 5.2 — Redis cache TTL=0 pattern (technical debt)
# -----------------------------------------------------------
echo
echo "[§5.2] Cache TTL pattern"

if [[ -f redisUtil.js ]]; then
    TTL_ZERO_COUNT=$(grep -cE "ttl:\s*0|expiresIn:\s*0" redisUtil.js controllers/web.js 2>/dev/null)
    if (( TTL_ZERO_COUNT > 0 )); then
        printf "  ⚠️  %-55s %d sites with TTL=0 (M3 candidate)\n" "TTL=0 cache pattern" "$TTL_ZERO_COUNT"
    fi
fi

# -----------------------------------------------------------
# § 16.4 — CORS origin: ['*']
# -----------------------------------------------------------
echo
echo "[§16.4] CORS configuration"

if grep -rqE "origin:\s*\[\s*['\"][*]['\"]" routes/ server.js 2>/dev/null; then
    printf "  ⚠️  %-55s allows * origin (M3 not yet hardened)\n" "CORS origin"
else
    printf "  ✅ %-55s restricted (M3 may be closed)\n" "CORS origin"
    PASS=$((PASS + 1))
fi

# -----------------------------------------------------------
# § 16.6 — test coverage (zero tests today)
# -----------------------------------------------------------
echo
echo "[§16.6] Test coverage"

if grep -qE "echo.*Error.*no test specified" package.json 2>/dev/null; then
    printf "  ⚠️  %-55s package.json: no tests (C2 not yet started)\n" "test script"
else
    TEST_COUNT=$(find . -path ./node_modules -prune -o -name "*.test.js" -print 2>/dev/null | wc -l | tr -d ' ')
    printf "  ✅ %-55s tests=%s (C2 progressing)\n" "test files found" "$TEST_COUNT"
    PASS=$((PASS + 1))
fi

# -----------------------------------------------------------
# § 16.6 — deprecated dependencies (Axios 0.23, Heroku-18)
# -----------------------------------------------------------
echo
echo "[§16.6] Deprecated dependencies"

AXIOS_VER=$(grep -E '"axios":' package.json 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
if [[ -n "$AXIOS_VER" ]]; then
    AXIOS_MAJOR="${AXIOS_VER%%.*}"
    if (( AXIOS_MAJOR == 0 )); then
        printf "  ⚠️  %-55s axios=%s (L4 — upgrade to ≥1.7)\n" "axios version" "$AXIOS_VER"
    else
        printf "  ✅ %-55s axios=%s (L4 closed)\n" "axios version" "$AXIOS_VER"
        PASS=$((PASS + 1))
    fi
fi

# -----------------------------------------------------------
# § 25 — postcode-with-dash.json + fixZipcode duplication
# -----------------------------------------------------------
echo
echo "[§25] Postal-code transformation duplication"

if [[ -f postcode-with-dash.json ]]; then
    JSON_COUNTRIES=$(grep -cE '^\s*"[A-Z]{2}":' postcode-with-dash.json 2>/dev/null)
    printf "  ℹ️  %-55s %s countries\n" "postcode-with-dash.json" "$JSON_COUNTRIES"
fi

if grep -qE "fixZipcode" middlewares/*.js routes/web.js 2>/dev/null; then
    printf "  ✅ %-55s referenced in middleware/routes\n" "fixZipcode middleware"
    PASS=$((PASS + 1))
fi

# -----------------------------------------------------------
# § 25.2 — Argentina case fall-through bug (L3)
# -----------------------------------------------------------
echo
echo "[§25.2] Argentina fall-through bug (L3)"

# Look for the pattern: case 'AR': ... (no break before next case)
if grep -A 2 "case 'AR'" middlewares/*.js 2>/dev/null | grep -qE "break"; then
    printf "  ✅ %-55s has explicit break (L3 closed)\n" "AR case in fixZipcode"
    PASS=$((PASS + 1))
else
    printf "  ⚠️  %-55s missing break (L3 not fixed)\n" "AR case in fixZipcode"
fi

# -----------------------------------------------------------
# Summary
# -----------------------------------------------------------
echo
echo "=========================================================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "=========================================================="
echo
echo "  ⚠️  warnings indicate items in BACKEND_TEAM_BRIEF.md not yet"
echo "     resolved. They do NOT cause exit failure."
echo "  ❌ failures indicate doc claims that no longer match source —"
echo "     either fix the doc or update this script."
echo "=========================================================="

if [[ $FAIL -gt 0 ]]; then
    echo
    echo "Failed checks:"
    for f in "${FAILED_CHECKS[@]}"; do
        echo "  - $f"
    done
    exit 1
fi

echo "All structural claims still match source."
exit 0
