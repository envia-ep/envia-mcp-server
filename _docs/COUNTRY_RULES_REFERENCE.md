# Country Rules Reference — envia-mcp-server

Ground-truth inventory of **what the MCP does itself** vs **what it delegates
to the backend** for multi-country address handling. Useful when debugging
country-specific failures in staging / prod, or when adding new countries.

Last verified: 2026-04-17 against commit `e231e58`.

## Design principle

LESSONS L-C2 (graceful degradation > preventive validation) and L-S5 (reuse
existing infrastructure). The MCP only replicates rules that are:
- Trivially static (postal-code formatting, phone normalisation).
- Needed before calling the backend (to avoid obvious 1129/1125 errors).

Everything else (tax logic, coverage, state naming, document checksums,
complex territory rules) is delegated to canonical backend endpoints
(`/location-requirements`, `/generic-form`, `/locate`, `/brazil/icms`).

## 1. Static rules in `src/services/country-rules.ts`

### 1.1 Postal-code transformation (`transformPostalCode`)

| Country | Rule | Example |
|---------|------|---------|
| BR | Insert `-` at position 5 when length ≥ 8 and no existing `-` | `01310200` → `01310-200` |
| AR | Strip the leading character when length > 4 | `C1425` → `1425` |
| US (ZIP+4) | 9 digits → `XXXXX-XXXX` | `123456789` → `12345-6789` |
| US (short) | More than 5 digits but not 9 → truncate to 5 | `123456` → `12345` |
| All others | Trim and return as-is | — |

**Not handled here (delegated):**
- CO postal = DANE code — see `resolveDaneCode` in `geocodes-helpers.ts`.
- ES Canarias postal (35xxx / 38xxx → country `IC`) — backend carriers handle this.
- IT islands (Sicilia 90–98, Sardegna 07–09) — backend carriers.

### 1.2 Phone normalisation (`transformPhone`)

| Country | Rule |
|---------|------|
| FR | Force `+33XXXXXXXXX`: strip leading `33` if it leaves > 9 digits, then strip leading `0` |
| All others | Keep digits plus a single leading `+` |

### 1.3 Document-type detection

| Helper | Input | Outputs |
|--------|-------|---------|
| `detectBrazilianDocumentType(id)` | Any string | `CPF` (11 digits), `CNPJ` (14 digits), `unknown` |
| `detectSpanishDocumentType(id)` | Any string | `DNI` (`^\d{8}[A-Z]$`), `NIE` (`^[XYZ]\d{7}[A-Z]$`), `NIF` (`^[A-W]\d{7,8}[A-Z0-9]?$`), `unknown` |

**Limitation:** Only length + regex shape. Full checksum validation for
CPF / CNPJ / DNI is **not** performed — the backend rejects bad checksums.

### 1.4 Country metadata (`getCountryMeta`)

Aggregates flags from four module-level sets/maps:

| Constant | Contents |
|----------|----------|
| `EU_COUNTRIES` | 27 ISO-2 EU member states |
| `EXCEPTIONAL_TERRITORIES` | `FR-GF`, `FR-GP`, `FR-MQ`, `FR-YT`, `FR-RE`, `PT-20`, `PT-30`, `ES-CN`, `ES-TF`, `ES-GC`, `ES-35`, `ES-38`, `NL-SX`, `FR-MC` |
| `COUNTRIES_WITH_SEPARATE_NUMBER` | `MX`, `BR` (exterior number is a separate field) |
| `DOMESTIC_AS_INTERNATIONAL` | `BR`, `IN` (domestic ships through international pipeline → `items[]` required) |
| `IDENTIFICATION_REQUIRED_ALWAYS` | `BR`: origin + destination · `CO`: origin + destination |
| `DEFAULT_DECLARED_VALUES` | `MX`: 3000 MXN |

Return shape of `getCountryMeta(cc)`:
```ts
{
  requiresSeparateNumber: boolean;
  treatedAsInternationalDomestic: boolean;
  defaultDeclaredValue: number | undefined;
  identificationRequiredFor: readonly string[];
}
```

## 2. Backend delegation in `src/services/geocodes-helpers.ts`

These helpers are **INTERNAL** — never registered as LLM-visible tools
(LESSONS L-S6). They hit `https://geocodes.envia.com` (no sandbox).

### 2.1 `getAddressRequirements(client, { origin, destination })`

- Endpoint: `POST /location-requirements`.
- Returns `{ applyTaxes, includeBOL, isInternalEU, isInternalGB, isInternalUK }`.
- Consumed by quote / generate tools to decide whether `items[]` is required
  (instead of hardcoding tax rules like US↔PR, ES→IC, FR→Overseas, intra-EU).

### 2.2 `resolveDaneCode(client, cityOrCode, stateHint?)`

- Input precedence:
  1. If input already matches `^\d{5,8}$` → return verbatim.
  2. Else call `GET /locate/CO/{state?}/{city}` and take the first match's `zip`.
- Returns `null` on failure — callers must surface a clear error, not fall
  back to a default DANE value.

### 2.3 `getBrazilIcms(client, originState, destinationState)`

- Endpoint: `GET /brazil/icms/{origin}/{destination}` (2-letter state codes).
- Returns the numeric ICMS percentage, or `null` if unknown.
- Used when building BR-BR rate/generate payloads.

## 3. Dynamic validation in `src/services/generic-form.ts`

Integrated into `create_address`, `update_address`, `create_client`,
`update_client`, `create_shipment`. Root cause it prevents: users saving
invalid addresses that later break `rate` with cryptic 1129s.

### 3.1 Flow

1. `fetchGenericForm(cc)` → `GET /generic-form?country_code={cc}&form=address_info` (queries service). **Note:** form name was `address_form` until 2026-04-25; that name returned 422 (no row in `generic_forms` table) and made the validation a silent no-op — see fix in commit 3ca323b's iter-7 root cause analysis.
2. Process-level cache per country (cleared only in tests via `clearFormCache`).
3. Parses either an array or a JSON string (backend returns both shapes historically).
4. On fetch failure → returns `[]` (graceful degradation).

### 3.2 Required-field extraction (`getRequiredFields`)

Only fields where `rules.required === true` and `visible !== false`. Fields
in `UNSUPPORTED_FIELD_IDS` (`alias`, `state_registration`) are skipped with
a warning — the tool has no parameter for them and the backend will decide.

### 3.3 Field-ID mapping

`FIELD_TO_TOOL_PARAM` (used in error messages so the agent knows which
param to populate):

| `fieldId` | MCP tool param |
|-----------|----------------|
| `postalCode` | `postal_code` |
| `address1` | `street` |
| `address2` | `number` |
| `address3` | `interior_number` |
| `city` / `city_select` | `city` |
| `state` | `state` |
| `district` / `district_select` | `district` |
| `identificationNumber` | `identification_number` |
| `reference` | `reference` |

### 3.4 High-level entry point (`validateAddressForCountry`)

Returns `{ ok, missing, errorMessage? }`. Semantics:
- `ok: true, missing: []` — all required fields present **OR** form fetch
  failed (degradation) **OR** country code is not 2 chars.
- `ok: false` — at least one required field is empty; `errorMessage`
  enumerates them with both label and `tool param` name.

## 4. Documented rules NOT implemented in the MCP (intentional)

From memory `reference_country_address_rules.md`, the following live
**only on the backend** (MCP does not duplicate):

| Rule | Reason for not duplicating |
|------|----------------------------|
| CO postal → DANE transform in the client | Resolved via `resolveDaneCode` (backend). |
| ES Canarias `35xxx`/`38xxx` → country `IC` | Carriers backend. |
| IT island detection (Sicilia, Sardegna) | Carriers backend. |
| MX exterior number mandatory at generate | Carriers validates; MCP only exposes `requiresSeparateNumber`. |
| Full CPF/CNPJ/DNI/NIE checksum validation | Carriers backend. |
| Tax logic (US↔PR, ES→IC, FR→Overseas, intra-EU) | Delegated to `getAddressRequirements`. |
| BR↔BR items[] obligation | Consumed from `applyTaxes: false` result of `getAddressRequirements`. |

## 5. Adding a new country — checklist

1. **Does it need postal transformation?** Add a case to `transformPostalCode`.
2. **Does it use a non-standard phone format?** Add a case to `transformPhone`.
3. **Does it have a recognizable ID document?** Add a `detect*DocumentType` helper.
4. **Is it EU / exceptional territory / treats domestic as international?**
   Add to the relevant set/map in `country-rules.ts`.
5. **Does the backend already expose the rule via `/generic-form`, `/location-requirements`, or `/locate`?** Don't duplicate — rely on the helper.
6. **Write tests** — one per rule, AAA, one logical assertion (LESSONS L-T1/L-T2).

## 6. Files of record

- `src/services/country-rules.ts` — static per-country transforms, sets, detectors.
- `src/services/geocodes-helpers.ts` — backend-delegated business rules.
- `src/services/generic-form.ts` — dynamic required-field validation.
- `src/tools/addresses/*.ts`, `src/tools/clients/*.ts` — consumers of `validateAddressForCountry`.
- `src/tools/create-label.ts`, `src/tools/get-shipping-rates.ts` — consumers of `getAddressRequirements`.

Update this doc whenever any of these files changes a public rule.
