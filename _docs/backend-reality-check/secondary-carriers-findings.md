# Secondary Carriers — Backend Reality Check Findings

## Summary Table

| Carrier | Rate | Generate | Track | Cancel | Pickup | Countries | Notes |
|---------|------|----------|-------|--------|--------|-----------|-------|
| **TresGuerras** | ✅ | ✅ | ✅ | ✅ | ✅ | MX | LTL variant; RFC + SAT district lookup required |
| **Almex** | ❌ | ❌ | ✅ | ✅ | ❌ | MX | LTL-only; rate/generate return "Not implemented" |
| **FedexFreight** | ❌ | ❌ | ✅ | ✅ | ✅ | MX, AR, BR | LTL-only; delegates to FedexRestApi |
| **Sendex** | ✅ | ✅ | ✅ | ✅ | ✅ | MX | State-restricted; max 120×120×120cm |
| **Afimex** | ✅ | ✅ | ✅ | ✅ | ✅ | MX | Max insurance 10,000; requires state name lookup |
| **AmPm** | ✅ | ✅ | ✅ | ✅ | ❌ | MX, BR | Parcel-only; volumetric 5kg max |
| **JTExpress** | ✅ | ✅ | ✅ | ✅ | ✅ | MX, BR | Email-based pickup; Brazil ICMS tax calc |
| **Entrega** | ✅ | ✅ | ✅ | ✅ | ✅ | MX | LTL + parcel; track limit enforced |
| **99 Minutos** | ✅ | ✅ | ✅ | ✅ | ✅ | MX, CL, CO | Package size detection; weekend filtering |
| **FletesMexico** | ❌ | ❌ | ✅ | ✅ | ❌ | MX | LTL-only; rate/generate return "Not implemented" |

## Per-Carrier Details

### TresGuerras
- **File**: `app/ep/carriers/TresGuerras.php` (1130 lines, updated Apr 2026)
- **Implemented**: rate ✅ generate ✅ track ✅ cancel ✅ pickup ✅
- **Auth env var**: `TRESGUERRAS_MX=user|password` (custom key override supported)
- **Address constraints**: Requires SAT district lookup (24h cache); RFC validation (type M vs N); max 6 pkgs / 7,000 kg; LTL: 244×244×210cm
- **Known quirks**: Auto-cancel detection via `ESTADO_TALON=CANCELADO`; pickup auto-created on generate; SAT district naming lookup required

### Almex
- **File**: `app/ep/carriers/Almex.php` (850 lines)
- **Implemented**: rate ❌ generate ❌ track ✅ cancel ✅ pickup ❌
- **Auth env var**: `ALMEX_MX=key|secret`; email cancellations use 3 separate env vars
- **LTL only**: pallet max 200×244×400cm; PDF merging via iio/libmergepdf
- **Known quirks**: rate() and generate() return string "Not implemented"; Zendesk integration for cancellations

### FedexFreight
- **File**: `app/ep/carriers/FedexFreight.php` (520 lines, updated Mar 2026)
- **Implemented**: rate ❌ generate ❌ track ✅ cancel ✅ pickup ✅
- **Countries**: MX, AR, BR (international LTL)
- **Auth**: Delegates to FedexRestApi credential chain
- **Known quirks**: AR requires destination ID number; tracks piece-level tracking numbers; inherits FedEx REST timeout handling

### Sendex
- **File**: `app/ep/carriers/Sendex.php` (750 lines)
- **Implemented**: rate ✅ generate ✅ track ✅ cancel ✅ pickup ✅
- **Auth env var**: `SENDEX_MX=user|password`
- **Address constraints**: Coverage pre-validated against available states in DB; max 120×120×120cm
- **Known quirks**: RateWS may fail with ETA fallback; multi-piece splitting; PDF→ZPL conversion (4×6.5)

### Afimex
- **File**: `app/ep/carriers/Afimex.php` (630 lines)
- **Implemented**: rate ✅ generate ✅ track ✅ cancel ✅ pickup ✅
- **Auth env var**: `AFIMEX_MX=apiKey`
- **Known quirks**: Max insurance 10,000; K_Zona hardcoded to 6; pickup validated against last-shipments; requires state name lookup from State model

### AmPm
- **File**: `app/ep/carriers/AmPm.php` (770 lines)
- **Implemented**: rate ✅ generate ✅ track ✅ cancel ✅ pickup ❌ (DefaultPickup)
- **Countries**: MX, BR — auth: `AMPM_{COUNTRY}=user|password`
- **Address constraints**: Parcel-only (type=1); volumetric max 5kg; box weight max enforced
- **Known quirks**: Coverage error codes 260, 102154 = no coverage; PDF 4×6 → ZPL conversion

### JTExpress
- **File**: `app/ep/carriers/JTExpress.php` (600 lines, updated Apr 2026)
- **Implemented**: rate ✅ generate ✅ track ✅ cancel ✅ pickup ✅ (email-based)
- **Countries**: MX, BR
- **Address constraints**: MX: max 100cm per side, 160cm sum; BR: 60×60×60cm limit
- **Known quirks**: Brazil ICMS tax calc by state pair; pickup email-routed by state (env: `JTEXPRESS_PICKUP_EMAIL`); supports DACE file; folio = txlogisticId

### Entrega
- **File**: `app/ep/carriers/Entrega.php` (1300 lines)
- **Implemented**: rate ✅ generate ✅ track ✅ cancel ✅ pickup ✅ (LTL only)
- **Auth env var**: `ENTREGA_MX=user|password`
- **Known quirks**: Track limit enforced (returns error if exceeded); LTL max 120cm W / 240cm L; requires RFC + SAT complement for LTL; coverage pre-checked before rate

### 99 Minutos (Noventa9Minutos)
- **File**: `app/ep/carriers/Noventa9Minutos.php` (350 lines, updated Mar 2026)
- **Implemented**: rate ✅ generate ✅ track ✅ cancel ✅ pickup ✅ (default)
- **Countries**: MX, CL, CO
- **Known quirks**: Package size auto-detected from WS response; weekend same-day filtering; supports DCE (Complement action); ID defaults to `XAXX010101000`

### FletesMexico
- **File**: `app/ep/carriers/FletesMexico.php` (500 lines, updated Mar 2026)
- **Implemented**: rate ❌ generate ❌ track ✅ cancel ✅ pickup ❌
- **Auth env var**: `FLETESMEXICO_MX=user|password`
- **LTL only**: Coverage validated in DB; BOL generation required for generate
- **Known quirks**: rate(), generate(), pickup() all return "Not implemented"; pickup date auto-set to next weekday

## Technical Patterns

**Custom key override**: All 10 carriers check `if (isset($data->customKey))` — per-company credential override is universally supported.

**Pickup patterns**:
- Auto-on-generate: TresGuerras
- Email-based: JTExpress (state-routed)
- Dedicated API call: Sendex, Afimex, Entrega (LTL)
- Default/noop: 99 Minutos
- Not implemented: Almex, AmPm, FletesMexico

**LTL-only carriers** (rate/generate not functional for standard parcels): Almex, FedexFreight, FletesMexico

## Tool Opportunities

The existing `envia_create_label` / `envia_get_shipping_rates` tools already cover parcel-mode
operations for Sendex, Afimex, AmPm, JTExpress, Entrega (parcel), 99 Minutos, and TresGuerras.

**Gaps not filled by current generic tools:**

1. **LTL rate/generate workflow** — Almex, FedexFreight, FletesMexico, Entrega LTL require pallet-specific payload that the current Zod schema doesn't support. Propose: `envia_get_ltl_rates` + `envia_create_ltl_label` (MUTATION, Phase 2).
2. **Carrier compliance pre-validation** — RFC validation (TresGuerras, Entrega LTL), SAT district lookup, ICMS tax (JTExpress BR), insurance cap (Afimex). Propose: extend `envia_validate_address` with carrier-specific rules (READ_SAFE, Phase 2).
3. **Track limit detection** — Entrega enforces a per-company track limit; hitting it returns an error. The agent should surface this clearly. Already handled by `mapCarrierError` if error codes are mapped.

## Verdict

**No new tools needed immediately.** Generic MCP tools cover ~80% of use cases (parcel carriers
with full implementation). The LTL gap is real but LTL is a power-user flow not suitable for
conversational chat.

**Recommend for Sprint 2+:**
- LTL rate/generate tools (only if portal users actively request LTL via chat — validate demand first)
- Carrier constraint pre-check extension to `validateAddress`
