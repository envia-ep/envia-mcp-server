#!/usr/bin/env bash
# verify-carriers-ref.sh
#
# Re-validates every quantitative claim in
# `_docs/CARRIERS_DEEP_REFERENCE.md` against the carriers source
# repo. Exits non-zero on any mismatch.
#
# Why this exists: docs rot silently. Without an automated check,
# claims like "126 models" or "Delhivery injects 6 services at lines
# X-Y" become wrong the moment the source changes. CI runs this
# weekly; on failure, file an issue against the master doc.
#
# Usage:
#     ./scripts/verify-carriers-ref.sh /path/to/services/carriers
#
# If no arg given, defaults to ../../services/carriers relative to
# this repo (matches the `envia-repos` monorepo layout).

set -uo pipefail

# ---- Path resolution ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_CARRIERS_PATH="${SCRIPT_DIR}/../../../services/carriers"
CARRIERS_PATH="${1:-$DEFAULT_CARRIERS_PATH}"

if [[ ! -d "$CARRIERS_PATH" ]]; then
    echo "ERROR: carriers repo not found at: $CARRIERS_PATH" >&2
    echo "Pass the path as the first arg, e.g.:" >&2
    echo "    $0 /path/to/services/carriers" >&2
    exit 2
fi

cd "$CARRIERS_PATH" || exit 2

# ---- Result tracking ----
PASS=0
FAIL=0
FAILED_CHECKS=()

check() {
    local name="$1"
    local expected="$2"
    local actual="$3"
    if [[ "$expected" == "$actual" ]]; then
        printf "  ✅ %-50s expected=%s actual=%s\n" "$name" "$expected" "$actual"
        PASS=$((PASS + 1))
    else
        printf "  ❌ %-50s expected=%s actual=%s\n" "$name" "$expected" "$actual"
        FAIL=$((FAIL + 1))
        FAILED_CHECKS+=("$name (expected $expected, got $actual)")
    fi
}

check_contains() {
    local name="$1"
    local file="$2"
    local needle="$3"
    if grep -qF "$needle" "$file" 2>/dev/null; then
        printf "  ✅ %-50s found in %s\n" "$name" "$file"
        PASS=$((PASS + 1))
    else
        printf "  ❌ %-50s NOT found in %s\n" "$name" "$file"
        FAIL=$((FAIL + 1))
        FAILED_CHECKS+=("$name (substring not found in $file)")
    fi
}

echo "=========================================================="
echo "  carriers deep-reference verification"
echo "  source: $(pwd)"
echo "=========================================================="

# -----------------------------------------------------------
# § 1.1 / § 1.3 — file & model counts
# -----------------------------------------------------------
echo
echo "[§1.1, §1.3] File and model counts"

CARRIER_TOPLEVEL=$(find app/ep/carriers -maxdepth 1 -type f -name "*.php" 2>/dev/null | wc -l | tr -d ' ')
check "carrier files (top-level)" 119 "$CARRIER_TOPLEVEL"

CARRIER_TOTAL=$(find app/ep/carriers -type f -name "*.php" 2>/dev/null | wc -l | tr -d ' ')
check "carrier files (incl. subdirs)" 481 "$CARRIER_TOTAL"

MODELS=$(find app/Models -maxdepth 1 -type f -name "*.php" 2>/dev/null | wc -l | tr -d ' ')
check "Eloquent models" 126 "$MODELS"

# -----------------------------------------------------------
# § 47 — CarrierUtil
# -----------------------------------------------------------
echo
echo "[§47] CarrierUtil"

CU_LINES=$(wc -l < app/ep/util/CarrierUtil.php 2>/dev/null | tr -d ' ')
check "CarrierUtil line count" 7734 "$CU_LINES"

CU_METHODS=$(grep -cE "^    public static function|^    private static function|^    public function|^    protected static function|^    protected function|^    private function" app/ep/util/CarrierUtil.php 2>/dev/null)
check "CarrierUtil method count" 272 "$CU_METHODS"

# -----------------------------------------------------------
# § 48 — AbstractCarrier and interface
# -----------------------------------------------------------
echo
echo "[§48] AbstractCarrier + ICarrier"

AC_LINES=$(wc -l < app/ep/carriers/AbstractCarrier.php 2>/dev/null | tr -d ' ')
check "AbstractCarrier line count" 24 "$AC_LINES"

ICARRIER_METHODS=$(grep -cE "^    public static function" app/ep/carriers/ICarrier.php 2>/dev/null)
check "ICarrier interface methods" 7 "$ICARRIER_METHODS"

ICARRIER_RAW_METHODS=$(grep -cE "^    public static function" app/ep/carriers/ICarrierRaw.php 2>/dev/null)
check "ICarrierRaw interface methods" 2 "$ICARRIER_RAW_METHODS"

# -----------------------------------------------------------
# § 50 — Action input schemas
# -----------------------------------------------------------
echo
echo "[§50] JSON schemas"

SCHEMAS=$(find app/ep/schemas -name "*.v1.schema" -type f 2>/dev/null | wc -l | tr -d ' ')
check "schema file count" 21 "$SCHEMAS"

# -----------------------------------------------------------
# § 15 / § 51 — DB ground truth (CSVs)
# -----------------------------------------------------------
echo
echo "[§15, §51] DB ground truth"

# Counting data rows via `awk 'NR>1'` is robust to missing trailing
# newline (wc -l alone undercounts by 1 in that case).
CARRIERS_CSV_ROWS=$(awk 'NR>1' knowledge-base/queries/1_prod_carriers.csv 2>/dev/null | wc -l | tr -d ' ')
check "1_prod_carriers data rows" 168 "$CARRIERS_CSV_ROWS"

SERVICES_CSV_ROWS=$(awk 'NR>1' knowledge-base/queries/2_prod_services.csv 2>/dev/null | wc -l | tr -d ' ')
check "2_prod_services data rows" 473 "$SERVICES_CSV_ROWS"

OPS_DISTINCT_IDS=$(awk -F',' 'NR>1 {print $1}' knowledge-base/queries/8_prod_catalog_price_operations.csv 2>/dev/null | sort -u | wc -l | tr -d ' ')
check "distinct operation_ids" 19 "$OPS_DISTINCT_IDS"

INTL3_COUNT=$(awk -F',' 'NR>1 && $8==3' knowledge-base/queries/2_prod_services.csv 2>/dev/null | wc -l | tr -d ' ')
check "services with international=3" 2 "$INTL3_COUNT"

INTL3_FEDEX_ONLY=$(awk -F',' 'NR>1 && $8==3 && $1!="fedex"' knowledge-base/queries/2_prod_services.csv 2>/dev/null | wc -l | tr -d ' ')
check "non-fedex services with international=3" 0 "$INTL3_FEDEX_ONLY"

# -----------------------------------------------------------
# § 22 / § 45 — Delhivery code-injection points
# -----------------------------------------------------------
echo
echo "[§22, §45.8] Delhivery code-injected services"

# Each grep should match exactly one line where the injection happens.
# We don't pin to a specific line number — line numbers drift with code changes.
# Instead we verify the pattern exists.
check_contains "Delhivery green_tax injection" app/ep/carriers/Delhivery.php '"service" => "green_tax"'
check_contains "Delhivery owner_risk injection" app/ep/carriers/Delhivery.php '"service" => "owner_risk"'
check_contains "Delhivery reverse_pickup injection" app/ep/carriers/Delhivery.php '"service" => "reverse_pickup"'
check_contains "Delhivery oda injection" app/ep/carriers/Delhivery.php '"service" => "oda"'
# state_charge and extended_zone share a ternary branch:
check_contains "Delhivery state/extended_zone injection (ternary)" app/ep/carriers/Delhivery.php '"state_charge" : "extended_zone"'

# -----------------------------------------------------------
# § 22 / § 46 — BlueDart code-injection points
# -----------------------------------------------------------
echo
echo "[§22, §46.8] BlueDart code-injected services"

check_contains "BlueDart owner_risk injection" app/ep/carriers/utils/BlueDartUtil.php '"owner_risk"'
check_contains "BlueDart reverse_pickup injection" app/ep/carriers/utils/BlueDartUtil.php '"reverse_pickup"'
check_contains "BlueDart state_charge injection" app/ep/carriers/utils/BlueDartUtil.php "'state_charge'"
check_contains "BlueDart green_tax injection" app/ep/carriers/utils/BlueDartUtil.php "'green_tax'"

# RAS state list (§46.6 / §52.5 S claim)
check_contains "BlueDart RAS state list (BH/JH/KL/JK/LA)" app/ep/carriers/utils/BlueDartUtil.php '["BH", "JH", "KL", "JK", "LA"]'

# -----------------------------------------------------------
# § 44 — Correios distinctive logic
# -----------------------------------------------------------
echo
echo "[§44.7] Correios rateOverWeight + Mini→PAC"

check_contains "Correios rateOverWeight method exists" app/ep/carriers/Correios.php "public static function rateOverWeight"
check_contains "Correios Mini→PAC downgrade rule" app/ep/carriers/Correios.php "shipment->service == 'mini'"

# -----------------------------------------------------------
# § 42 / § 52.5 S1 — Estafeta allows_mps runtime override
# -----------------------------------------------------------
echo
echo "[§42, §52.5 S1] Estafeta runtime override"

check_contains "Estafeta runtime allows_mps=1 override" app/ep/carriers/Estafeta.php 'carrierModel->allows_mps = 1'

# -----------------------------------------------------------
# § 42 / § 52.5 S2 — Estafeta LTL 1100 kg cutoff
# -----------------------------------------------------------
echo "[§42, §52.5 S2] Estafeta LTL weight limit"

check_contains "Estafeta LTL > 1100 kg rejection" app/ep/carriers/Estafeta.php '> 1100'

# -----------------------------------------------------------
# § 16.1 — TMS endpoints (9)
# -----------------------------------------------------------
echo
echo "[§16.1] TMS endpoint inventory"

check_contains "TMS /token endpoint"             app/ep/util/Util.php       '/token'
check_contains "TMS /check endpoint"             app/ep/util/Util.php       '/check'
check_contains "TMS /apply endpoint"             app/ep/util/Util.php       '/apply'
check_contains "TMS /rollback endpoint"          app/ep/util/Util.php       '/rollback'
check_contains "TMS /payment-cod endpoint"       app/ep/util/TmsUtil.php    '/payment-cod'
check_contains "TMS /chargeback-cod endpoint"    app/ep/util/TmsUtil.php    '/chargeback-cod'
check_contains "TMS /cancellation endpoint"      app/ep/util/TmsUtil.php    '/cancellation'
check_contains "TMS /return-to-origin endpoint"  app/ep/util/CarrierUtil.php '/return-to-origin'
check_contains "TMS /pickup-cancellation endpoint" app/ep/util/CarrierUtil.php '/pickup-cancellation'

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
    echo "(a) update _docs/CARRIERS_DEEP_REFERENCE.md to match the new"
    echo "    source, or (b) update this script if the change is"
    echo "    intentional (e.g., a deliberate refactor)."
    exit 1
fi

echo "All claims still match source. Doc is current."
exit 0
