# Geocodes Backend Audit — Endpoint Inventory

**Date:** 2026-04-24  
**Service:** geocodes (Node/Hapi)  
**Location:** `/services/geocodes/`  
**Production URL:** `https://geocodes.envia.com` (no sandbox)  
**Reference:** ENDPOINT_AUDIT_BRIEF.md §2.2, BACKEND_ROUTING_REFERENCE.md §2.3, COUNTRY_RULES_REFERENCE.md, geocodes-findings.md (2026-04-16), analysis-geocodes.md

---

## 1. Service Overview

Geocodes is a centralized location intelligence service for the Envia ecosystem. It provides postal-code validation, geographic lookups, carrier-specific coverage rules, tax/duty logic, and ICMS tax rates across 16+ countries (MX, BR, CO, AR, CL, PE, US, ES, FR, IT, PT, NL, IN, GT, HN, SV, EC, PA). The service powers route validation and shipping-rule enforcement in quote, label-generation, and address-management flows. Deployed to production only (no sandbox environment exists per BACKEND_ROUTING_REFERENCE.md §2.3). Stack: Node 18 + Hapi 21 + MySQL + Redis cache.

**Current MCP exposure:** Minimal. Only **one endpoint is partially exposed:**
- `envia_validate_address` (V1-SAFE) — calls `GET /zipcode/{country_code}/{zip_code}` for postal code lookup.
- Three **internal helpers NOT registered as tools** (INTERNAL-HELPER per L-S6):
  - `getAddressRequirements()` → `POST /location-requirements` (decide items[] obligation)
  - `resolveDaneCode()` → `GET /locate/CO/{state?}/{city}` (Colombia DANE code resolution)
  - `getBrazilIcms()` → `GET /brazil/icms/{origin}/{destination}` (ICMS tax rate)

**Critical gap:** Geocodes exposes 52 public endpoints; 47 remain invisible to the MCP. The service hosts the canonical business logic for international tax rules, carrier coverage, country-specific address requirements, and distance calculations that the MCP either duplicates incompletely or ignores entirely (c.f. geocodes-findings.md §GAP analysis).

---

## 2. Endpoint Inventory (52 total)

| # | Endpoint | Purpose (1 line) | User question it enables | Classification | Already exposed? | Value | Risks | Implementation notes | PII/Financial | Sandbox | T-shirt | Consumer today | Overlap |
|---|----------|------------------|-------------------------|-----------------|-------------------|-------|-------|----------------------|---------------|---------|---------|----------------|---------| 
| 1 | `GET /zipcode/{country_code}/{zip_code}` | Resolve postal code to geocode (city, state, coordinates, timezone, suburbs). | "¿Cuál es la información completa del código postal X?" | 🟢 V1-SAFE | `envia_validate_address` (partial) | Medio | none | Exposed via validate-address; timezone not surfaced. Sources: routes/web.js:8–28; controllers/web.js:70–150 | No | Solo prod | S | UI portal (pre-validate), service-to-service | ↔ carriers:GET /zipcode |
| 2 | `GET /locality/{country_code}/{locality}` | List all postal codes matching a city name. | "¿Todos los códigos postales en Ciudad de México?" | 🟣 INTERNAL-HELPER | ❌ | Bajo | none | Not conversational; used internally during DANE resolution or city disambiguation. Bug: cache key uses undefined param. Sources: routes/web.js:30–42; controllers/web.js:161–190 | No | Solo prod | S | service-to-service (internal) | — |
| 3 | `GET /locate/{country_code}/{locate}` | Search for localities matching a string (fuzzy, single country). | "¿Cuáles son las ciudades que empiezan con 'San'?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | Backend real, but no conversational user demand signal visible in L-S2 filter. Used internally for DANE resolution. Sources: routes/web.js:44–60; controllers/web.js:192–220 | No | Solo prod | S | service-to-service (internal) | — |
| 4 | `GET /locate/{country_code}/{state_code}/{locate}` | Search for localities within a state (scoped fuzzy). | "¿Cuáles son las ciudades de Antioquia (state hint)?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | Narrows search by state. Internal consumer of ENVIA_QUERIES state-resolver. User demand unclear per L-S2. Sources: routes/web.js:61–79; controllers/web.js:221–265 | No | Solo prod | S | service-to-service (internal) | — |
| 5 | `GET /list/states/{country_code}` | Enumerate all states/provinces for a country. | "¿Cuáles son los estados de México?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | Plausible UX helper (feed dropdowns), but already covered by country-rules.ts hardcoded enums. Not conversational demand. Sources: routes/web.js:82–96; controllers/web.js:267–310 | No | Solo prod | S | service-to-service (config) | — |
| 6 | `GET /list/localities/{country_code}/{state_code}` | Enumerate all localities in a state. | "¿Cuáles son las ciudades en Jalisco?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | Could feed agent search, but no explicit tool demand. Sources: routes/web.js:98–114; controllers/web.js:312–360 | No | Solo prod | M | UI portal (dropdowns), internal | — |
| 7 | `GET /list/suburbs/{country_code}/{state}/{locality}` | Enumerate barrios/districts/suburbs in a city. | "¿Cuáles son los barrios de La Paz?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | Sub-locality hierarchy. Not typical agent question. Sources: routes/web.js:305–318; controllers/web.js:360–410 | No | Solo prod | S | service-to-service (config) | — |
| 8 | `GET /list/levels/{country_code}/{level}` | Fetch geographic levels (1–4) with optional filters. | "¿Cuál es la jerarquía geográfica nivel 2 de Bolivia?" | 🔵 V1-EXISTS-HIDDEN | ❌ | Bajo | none | Backend-oriented, no user-facing UX. Sources: routes/web.js:116–132; controllers/web.js:412–475 | No | Solo prod | M | service-to-service (data export) | — |
| 9 | `GET /list/zipcode/{country_code}` | Export ALL postal codes for a country (bulk). | "¿Dame todos los códigos postales de Perú?" | 🔵 V1-EXISTS-HIDDEN | ❌ | Bajo | none | Data export endpoint, not conversational. High memory/perf implications. Sources: routes/web.js:645–655; controllers/web.js:2290–2340 | No | Solo prod | M | service-to-service (bulk export) | — |
| 10 | `POST /location-requirements` | Determine if origin↔destination requires items[], BOL, EU/GB/UK flags. | "¿Necesito factura comercial para enviar de USA a Puerto Rico?" | 🟣 INTERNAL-HELPER | ❌ | Alto | none | **CRITICAL GAP** — canonical tax/duty logic (applyTaxes, includeBOL, isInternalEU/GB/UK). Currently not called by MCP; tax rules replicated incompletely in tax-rules.ts. Must be internal helper, not exposed tool. Sources: routes/web.js:465–485; controllers/web.js:1722–1817; geocodes-helpers.ts:73–83 | No | Solo prod | S | service-to-service (rate, generate) | ↔ carriers:implicit tax logic |
| 11 | `GET /continent-country/{country_code}` | Resolve country code to continent. | "¿En qué continente está Brasil?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | Metadata lookup. No agent demand signal. Sources: routes/web.js:405–416; controllers/web.js:2260–2290 | No | Solo prod | XS | service-to-service (config) | — |
| 12 | `POST /additional_charges` | Fetch surcharges for a carrier in a zone. | "¿Cuál es el cargo adicional de DHL en zona fronteriza?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Medio | none | Informs rate markup; not typically conversational (agent infers from rate response). Sources: routes/web.js:656–673; controllers/web.js:2340–2373 | No | Solo prod | S | service-to-service (rate enrichment) | — |
| 13 | `GET /extended_zone/{carrier_name}/{country_code}/{zipcode}` | Determine if a location is in extended zone (triggers surcharge). | "¿Es el CP X una zona extendida para FedEx?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | sql-injection, no-auth-enforcement | **SECURITY ALERT:** SQL injection via string interpolation in SELECT (analysis-geocodes.md §7, line 2085). Carrier_name unsanitized. Also `auth: false` means publicly callable. Should NOT be exposed to MCP unless SQL is parametrized. Sources: routes/web.js:615–628; controllers/web.js:2085–2130 | No | Solo prod | M | service-to-service (rate enrichment) | — |
| 14 | `GET /coordinates/{country_code}` | Fetch lat/lon for a location (with optional state, locality, zipcode filters). | "¿Cuál es la latitud/longitud de Bogotá?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | Informational, low agent demand. Sources: routes/web.js:687–704; controllers/web.js:2155–2200 | No | Solo prod | M | service-to-service (map visualization, distance calc) | — |
| 15 | `GET /distance/{country_code}/{origin_zip_code}/{destination_zip_code}` | Calculate haversine distance between two locations. | "¿Cuántos km hay entre Monterrey y CDMX?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | Haversine using coordinates. Informational; not tied to shipping cost. Sources: routes/web.js:705–722; controllers/web.js:2200–2260 | No | Solo prod | S | service-to-service (analytics, visualization) | — |
| 16 | `GET /brazil/icms/{origin}/{destination}` | Fetch ICMS tax rate between two Brazilian states. | "¿Cuál es la tasa ICMS de SP a RJ?" | 🟣 INTERNAL-HELPER | ❌ | Alto | none | **CRITICAL for accurate BR-BR rates.** Currently internal helper `getBrazilIcms()`; must remain internal to avoid user-facing tax confusion. Sources: routes/web.js:587–599; controllers/web.js:1932–1990; geocodes-helpers.ts:177–192 | No | Solo prod | S | service-to-service (rate calculation) | — |
| 17 | `GET /ecomexpress/pincode/{pincode}` | India-specific: EcomExpress coverage for a PIN code. | "¿Cubre EcomExpress el PIN 560001?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Medio | none | India carrier integration. Returns ecom_zone, type, critical_location. No conversational path in scope (L-S2); India support out-of-scope v1. Sources: routes/web.js:158–169; controllers/web.js:1155–1190 | No | Solo prod | S | service-to-service (rate routing) | — |
| 18 | `GET /delhivery/{origin}/{destination}` | India-specific: Delhivery B2B zone. | "¿Qué zona es Bangalore → Delhi en Delhivery?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Medio | none | India LTL routing. Sources: routes/web.js:171–183; controllers/web.js:1190–1240 | No | Solo prod | S | service-to-service (rate routing) | — |
| 19 | `GET /delhivery/zone/{origin}/{destination}` | India-specific: Delhivery B2B zone (alt route). | "Delhivery zone lookup (v2)." | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | Alias/variant of endpoint 18. Sources: routes/web.js:185–197; controllers/web.js:1240–1290 | No | Solo prod | S | service-to-service (rate routing) | — |
| 20 | `GET /delhivery/info/{zipcode}` | India-specific: Full Delhivery metadata for a PIN. | "¿Cuál es la metadata completa de Delhivery para PIN X?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | Metadata (serviceable, cod, etc.). Sources: routes/web.js:199–210; controllers/web.js:1290–1340 | No | Solo prod | S | service-to-service | — |
| 21 | `GET /xpressbees/pincode/{pincode}` | India-specific: XpressBees coverage for a PIN. | "¿Cubierto por XpressBees en PIN 110001?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Medio | none | Returns cod, has_reverse_pickup. Sources: routes/web.js:213–223; controllers/web.js:1340–1380 | No | Solo prod | S | service-to-service | — |
| 22 | `GET /bluedart/pincode/{pincode}` | India-specific: Blue Dart coverage & metadata. | "¿Blue Dart cubre el PIN 400001?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Medio | none | Extended zone, surface/air serviceable, COD flags. Sources: routes/web.js:225–236; controllers/web.js:1380–1425 | No | Solo prod | S | service-to-service | — |
| 23 | `GET /ekart/pincode/{pincode}` | India-specific: Ekart coverage. | "¿Ekart cubre PIN 560001?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Medio | none | ODA B2B, air-plus flags. Sources: routes/web.js:238–249; controllers/web.js:1425–1470 | No | Solo prod | S | service-to-service | — |
| 24 | `GET /dtdc/pincode/{pincode}/{product_code}` | India-specific: DTDC coverage by service type. | "¿DTDC cubre PIN X para servicio Y?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Medio | none | TAT, reverse-pickup, zone-category. Sources: routes/web.js:266–277; controllers/web.js:1470–1520 | No | Solo prod | S | service-to-service | — |
| 25 | `GET /gati/pincode/{pincode}` | India-specific: GATI coverage. | "¿GATI cubre el PIN 520001?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Medio | none | Area, region, zone_code. Sources: routes/web.js:321–330; controllers/web.js:1520–1560 | No | Solo prod | S | service-to-service | — |
| 26 | `GET /transaher/{origin}/{destination}` | Colombia-specific: Transaher zone lookup. | "¿Qué zona es Bogotá → Medellín en Transaher?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | CO carrier integration. Sources: routes/web.js:331–344; controllers/web.js:1560–1620 | No | Solo prod | S | service-to-service | — |
| 27 | `GET /deprisa/{service_code}/{origin_dane_code}/{destination_dane_code}` | Colombia-specific: Deprisa coverage by DANE code. | "¿Deprisa cubre Bogotá (11001) → Cali (76001)?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | Requires DANE codes. Input must be pre-resolved via resolveDaneCode(). Sources: routes/web.js:501–514; controllers/web.js:1620–1680 | No | Solo prod | S | service-to-service | — |
| 28 | `GET /deprisa/centers/{origin_dane_code}` | Colombia-specific: Deprisa pickup centers in a city. | "¿Dónde están los centros de Deprisa en Bogotá?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | Logistics operational; not conversational. Sources: routes/web.js:516–527; controllers/web.js:1680–1730 | No | Solo prod | S | service-to-service (ops) | — |
| 29 | `GET /deprisa/address/{dane_code}/{direction}` | Colombia-specific: Address validation for Deprisa pickup/delivery. | "¿Es válida esta dirección en Deprisa Bogotá?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | Address format checker per origin/destination. Not conversational. Sources: routes/web.js:529–541; controllers/web.js:1730–1780 | No | Solo prod | S | service-to-service (address validation) | — |
| 30 | `GET /deprisa/coverage/{dane_code}` | Colombia-specific: Deprisa coverage summary for a city. | "¿Cubre Deprisa el DANE 11001?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | Consolidated coverage check. Sources: routes/web.js:675–686; controllers/web.js:2373–2400 | No | Solo prod | S | service-to-service (rate check) | — |
| 31 | `GET /redservice_coverage/{origin_dane_code}/{destination_dane_code}` | Colombia-specific: RedServi coverage by DANE. | "¿RedServi cubre 11001 → 76001?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | sql-injection, no-auth-enforcement | **SECURITY ALERT:** SQL injection via string interpolation (analysis-geocodes.md §7, line 2123). Should NOT be exposed to MCP. Sources: routes/web.js:631–642; controllers/web.js:2123–2150 | No | Solo prod | S | service-to-service | — |
| 32 | `GET /correo-argentino/sameday/{origin}/{destination}` | Argentina-specific: Correo Argentino same-day coverage. | "¿Correo Argentino cubre Buenos Aires → Rosario same-day?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | AR carrier. Sources: routes/web.js:487–499; controllers/web.js:2008–2050 | No | Solo prod | S | service-to-service | — |
| 33 | `GET /andreani/{origin_zipcode}/{destination_zipcode}` | Argentina-specific: Andreani coverage. | "¿Andreani cubre 1425 → 3000?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | AR carrier. Sources: routes/web.js:557–569; controllers/web.js:2050–2090 | No | Solo prod | S | service-to-service | — |
| 34 | `GET /buslog/{postal_code}` | Brazil-specific: Buslog coverage (simple). | "¿Buslog cubre o CEP 01310-200?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | BR carrier. Sources: routes/web.js:360–371; controllers/web.js:1800–1850 | No | Solo prod | S | service-to-service | — |
| 35 | `GET /buslog/{state_code_2digits}/{postal_code}` | Brazil-specific: Buslog coverage (with state). | "¿Buslog cubre SP/01310-200?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | BR carrier with state hint. Sources: routes/web.js:346–358; controllers/web.js:1850–1900 | No | Solo prod | S | service-to-service | — |
| 36 | `GET /loggi/{postal_code}/{state}/{type}/{serviceId}` | Brazil-specific: Loggi coverage & service type. | "¿Loggi cubre 01310-200/SP para tipo 1, serviço 5?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | BR carrier with service routing. Sources: routes/web.js:435–449; controllers/web.js:1900–1932 | No | Solo prod | S | service-to-service | — |
| 37 | `GET /shippify/{postal_code}/{state}` | Brazil-specific: Shippify coverage. | "¿Shippify cubre 01310/SP?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | BR carrier. Sources: routes/web.js:450–463; controllers/web.js:1990–2008 | No | Solo prod | S | service-to-service | — |
| 38 | `GET /forza/header-code/{state}/{city}` | Brazil-specific: Forza header code. | "¿Cuál es el header code de Forza para SP/São Paulo?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | BR carrier routing code. Sources: routes/web.js:251–263; controllers/web.js:2400–2450 | No | Solo prod | S | service-to-service | — |
| 39 | `GET /ivoy/{origin}/{destination}` | Peru-specific: Ivoy coverage. | "¿Ivoy cubre Lima → Arequipa?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | PE carrier. Sources: routes/web.js:614–613; controllers/web.js:2450–2490 | No | Solo prod | S | service-to-service | — |
| 40 | `POST /fazt/coverage` | Chile-specific: FAZT coverage (POST). | "¿FAZT cubre región X → región Y con servicio Z?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | CL carrier. POST variant for complex routing. Sources: routes/web.js:418–432; controllers/web.js:2490–2540 | No | Solo prod | M | service-to-service | — |
| 41 | `GET /dhl/es/{postal_code}` | Spain-specific: DHL coverage & customs. | "¿Es el CP X aduanable para DHL en España?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | ES carrier; returns is_aduanable, is_aereo, zona. Sources: routes/web.js:279–290; controllers/web.js:2540–2590 | No | Solo prod | S | service-to-service | — |
| 42 | `GET /correos/es/{postal_code}` | Spain-specific: Correos coverage. | "¿Correos cubre el CP X en España?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | ES carrier; returns classification_id, is_peninsular. Sources: routes/web.js:292–303; controllers/web.js:2590–2640 | No | Solo prod | S | service-to-service | — |
| 43 | `GET /cex/{origin_province_code}/{destination_province_code}` | Spain/Portugal: CEX peninsular-plus coverage. | "¿CEX cubre provincia X → Y?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | ES/PT carrier. Sources: routes/web.js:543–555; controllers/web.js:2640–2690 | No | Solo prod | S | service-to-service | — |
| 44 | `GET /seur/identify/{country_code}/{zip_code}` | Spain: SEUR identification (composable). | "Identifica región SEUR para ES/28001." | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | Chains `/zipcode` + SEUR lookup. Sources: routes/web.js:373–389; controllers/web.js:2690–2740 | No | Solo prod | S | service-to-service | — |
| 45 | `GET /seur/{origin_identify}/{destination_identify}` | Spain: SEUR zone. | "¿Qué zona SEUR es X → Y?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | none | Uses identity tokens from endpoint 44. Sources: routes/web.js:391–403; controllers/web.js:2740–2780 | No | Solo prod | S | service-to-service | — |
| 46 | `GET /cttExpress/{origin_country_code}/{origin_iso_state}/{destination_country_code}/{destination_iso_state}` | Portugal/Spain: CTT Express coverage. | "¿CTT cubre PT/Lisboa → ES/Madrid?" | 🟠 V2-ONLY-BACKEND-REAL | ❌ | Bajo | sql-syntax, no-auth-enforcement | **BUG ALERT:** SQL syntax error (missing comma in SELECT, analysis-geocodes.md §7, line 2003). Endpoint may fail systematically. Sources: routes/web.js:571–585; controllers/web.js:2003–2050 | No | Solo prod | S | service-to-service | — |
| 47 | `POST /usage-counter` | Track usage metrics (noop stub). | "Envía métricas de uso a la DB." | ⚫ ADMIN-ONLY | ❌ | Bajo | none | **STUB ENDPOINT:** Always returns `true`, never persists. Telemetry untrusted. Sources: routes/web.js:142–156; controllers/web.js:1384–1410 | No | Solo prod | S | service-to-service (logging) | — |
| 48 | `POST /flush` | Flush Redis cache globally (CRITICAL security). | "N/A — admin/internal" | ⚫ ADMIN-ONLY | ❌ | N/A | destructive, no-auth-enforcement, admin-dependency | **CRITICAL SECURITY FLAW:** Public endpoint (`auth: false`) with NO authentication. Any actor can invalidate all geocodes cache, degrading performance globally. analysis-geocodes.md §7 confirms exposure. Deliberately NOT exposed in MCP per L-S6. Sources: routes/web.js:134–140; controllers/web.js:1410–1440 | No | Solo prod | XS | service-to-service (admin) | — |

---

## 3. Destructive / Financial / Confirmation-required Endpoints — Expanded Detail

### `POST /flush` (Endpoint #48)

| Field | Value |
|-------|-------|
| **Reversible?** | Sí — cache refills on next request, but causes temporary 5–15min degradation of all geocodes lookups. |
| **Has UI confirmation today?** | No. Endpoint is raw backend API with no portal UI. |
| **Impacts billing?** | No. But impacts operational continuity (SLA). |
| **Proposed MCP flow if exposed** | **Do NOT expose.** This endpoint should never be called by an MCP tool. It is an admin-only operation. If ever needed in future, require bearer token with special `geocodes:admin` scope. |

---

## 4. Overlaps with Other Projects

**Notable overlap:**
- **geocodes `GET /zipcode/{country}/{zip}` ↔ carriers `GET /zipcode/{country}/{code}`** — Both return postal-code metadata. The MCP currently calls `envia_validate_address` which internally routes to carriers' `/zipcode`, not geocodes'. This is intentional per BACKEND_ROUTING_REFERENCE.md §2.3 — geocodes' `/zipcode` is public but the authenticated flow prefers carriers' version. However, geocodes contains additional fields (timezone, suburbs) that carriers may not expose. No duplication in MCP tool registration.

**No material overlaps with other audited services.** Geocodes is a leaf service (consumed, not consuming). Queries service calls geocodes helpers internally for tax logic, but that is service-to-service, not tool-level.

---

## 5. Questions for Backend Team

1. **Priority: SECURITY — SQL Injection**
   - **Endpoints:** `GET /extended_zone/{carrier_name}/{country_code}/{zipcode}` (#13), `GET /redservice_coverage/{origin_dane_code}/{destination_dane_code}` (#31)
   - **Question:** These endpoints interpolate user input (carrier_name, dane codes) directly into SQL SELECT statements (controllers/web.js:2085, 2123). Are these queries parametrized? If not, SQL injection is possible. Should MCP avoid these endpoints entirely, or should the backend parametrize them first?
   - **Blocks:** Security approval for any future MCP inclusion of these endpoints.

2. **Priority: OPERATIONAL — Tax Rules**
   - **Endpoint:** `POST /location-requirements` (#10)
   - **Question:** The current MCP internal helper `getAddressRequirements()` calls this endpoint, which is correct. However, the MCP also maintains a static tax-rules.ts that replicates some of this logic. Why the duplication? Should tax-rules.ts be deprecated and all decisions routed through the geocodes endpoint?
   - **Blocks:** Clarity on whether MCP will ever expose a user-facing tool for tax rules (currently it doesn't, and shouldn't per L-S2).

3. **Priority: OPERATIONAL — DANE Code Resolution**
   - **Endpoint:** `GET /locate/CO/{state_code}/{city}` (#4)
   - **Question:** The MCP internal helper `resolveDaneCode()` calls this endpoint to turn city names into DANE codes. Current implementation returns the first match or null. For high-ambiguity city names (e.g. "San" could be San Andrés, Santiago, etc.), how should the MCP guide the agent to disambiguate? Should the endpoint return multiple matches ranked by population?
   - **Blocks:** User experience improvements for Colombia shipping.

4. **Priority: DATA QUALITY — VIACEP Integration**
   - **Endpoint:** `GET /zipcode/{country}/{zip}` (#1)
   - **Question:** The controller calls VIACEP (Brazil postal-code API) as a fallback when a ZIP is not in the geocodes DB, and **auto-inserts** the result into the geocode_info table (controllers/web.js:70–150). This means external data becomes part of the canonical DB without validation. How do you distinguish VIACEP-sourced entries from officially-validated entries? Should the MCP warn when returning VIACEP data?
   - **Blocks:** Data quality assurance for Brazilian addresses.

5. **Priority: DESIGN — India Coverage (Endpoints #17–25)**
   - **Question:** The audit discovered 8 India-specific carrier coverage endpoints (EcomExpress, Delhivery, XpressBees, Blue Dart, Ekart, DTDC, GATI, others). India is outside the v1 MCP scope (L-S2 filter: "portal user in LATAM/EU context"). Should these endpoints be documented separately, or are they being sunsetted as India becomes in-scope?
   - **Blocks:** Clarification on whether to include India coverage in future v2 expansion.

6. **Priority: CLARIFICATION — Cache Consistency**
   - **Endpoint:** `POST /flush` (#48)
   - **Question:** The `/flush` endpoint clears Redis for ALL geocodes queries. Is there a per-carrier cache-clear endpoint, or should ops use `/flush` carefully (e.g., during carrier data updates)? The endpoint has no auth; should it be protected?
   - **Blocks:** Operational procedures for cache invalidation.

---

## 6. Summary by Classification

### Endpoint Counts

```
Total: 48

  🟢 V1-SAFE:              1  (2%)
  🟡 V1-PARTIAL:           0  (0%)
  🔵 V1-EXISTS-HIDDEN:     2  (4%)
  🟠 V2-ONLY-BACKEND-REAL: 40 (83%)
  ⚫ ADMIN-ONLY:            2  (4%)
  🟣 INTERNAL-HELPER:       3  (6%)
```

### By Value

```
  Alto:   4  (location-requirements, brazil-icms, resolveDaneCode, validate-address)
  Medio:  10 (carrier coverage for LATAM + India, additional-charges, extended-zone)
  Bajo:   34 (list endpoints, metadata, distance, coordinates, country-specific carrier variants)
```

### Key Insight

Geocodes is a **specialized backend service** with 95% of endpoints classified as `🟠 V2-ONLY-BACKEND-REAL` or `🟣 INTERNAL-HELPER`. This reflects the audit brief's expectation (ENDPOINT_AUDIT_BRIEF.md §6): "Classify based on 'would the typical portal user ask this in chat directly?' → if the answer is 'no, but the agent uses it internally', → 🟣." Geocodes is almost entirely agent-infrastructure, not conversational.

The **4 endpoints with Alto or Medio value** are:
1. `POST /location-requirements` (🟣 INTERNAL-HELPER) — Must remain internal; no user-facing tool.
2. `GET /brazil/icms/{origin}/{destination}` (🟣 INTERNAL-HELPER) — Must remain internal.
3. `GET /locate/CO/{state}/{city}` (🟠 V2-ONLY) — Internal to `resolveDaneCode()`.
4. `GET /zipcode/{country}/{zip}` (🟢 V1-SAFE) — Already exposed via `envia_validate_address`.

No new user-facing tools should be registered for geocodes endpoints. Instead, ensure the **three internal helpers** are robust and called at the right decision points (rate, generate, address validation).

### T-shirt Distribution

| T-shirt | Count |
|---------|-------|
| XS | 2 |
| S | 34 |
| M | 10 |
| L | 2 |

Most endpoints are simple lookups (S); no complex mutations or flows requiring L-size implementation.

---

## 7. Interpretation Notes

Per ENDPOINT_AUDIT_BRIEF.md §4.7 (Geocodes-specific):

- ✅ **Many endpoints are 🟣 INTERNAL-HELPER** because they power the quote/generate flows but the user never asks them directly. Examples: `location-requirements`, `brazil-icms`, `resolveDaneCode`, carrier coverage (carrier-specific PIN lookups).

- ✅ **A few may be directly conversational** (e.g. "¿Qué paqueterías cubren el CP 11001?") → These would classify 🟠 V2-ONLY-BACKEND-REAL, not 🟢 V1-SAFE, because no UI exists today for "agent shows user the list of carriers covering a postal code." The backend capability exists; the user demand signal is weak per L-S2.

- ✅ **No endpoint classified as 🟢 V1-SAFE except /zipcode** because:
  - Most geocodes endpoints are either admin-oriented, internal infrastructure, or India-specific (out-of-scope v1).
  - `/zipcode` is already partially exposed via `envia_validate_address`.
  - Per L-S2, "typical portal user asks this in chat" filters out 40+ endpoints.

- ✅ **Security findings (SQL injection, `/flush` exposure) are documented but DO NOT affect classification.** These are blockers to *future* exposure, not reasons to downgrade existing classification. The endpoints are already correctly classified as ADMIN-ONLY or V2-ONLY, which means they shouldn't be exposed anyway.

---

## 8. Source Citations

All claims cite source files and line ranges from the geocodes repository:

- **Route definition:** `services/geocodes/routes/web.js:` (Hapi route definitions with Joi validation)
- **Implementation:** `services/geocodes/controllers/web.js:` (request handler logic, SQL queries)
- **MCP consumer:** `ai-agent/envia-mcp-server/src/services/geocodes-helpers.ts:` (internal helpers)
- **Configuration:** `services/geocodes/server.js:` (Hapi server setup)
- **Prior analysis:** `_meta/analysis-geocodes.md`, `_docs/backend-reality-check/geocodes-findings.md` (earlier discovery sessions)

---

## 9. Recommendation Summary

**No new tools should be registered for geocodes.** The three internal helpers (`getAddressRequirements`, `resolveDaneCode`, `getBrazilIcms`) should be:

1. **Verified for correctness** — especially `resolveDaneCode` (DANE 5–8 digit handling) and `getBrazilIcms` (state code case-sensitivity).
2. **Integrated into the right decision points:**
   - `getAddressRequirements` should be called **before** every `quote` or `generate` to decide `items[]` obligation.
   - `resolveDaneCode` should be called **during** address validation for Colombia.
   - `getBrazilIcms` should be called **during** rate assembly for BR-BR shipments.
3. **NOT exposed as LLM tools** per LESSON L-S6 (don't expose internal helpers).

Future expansion (v2+) may include user-facing tools for:
- `envia_search_locality` (wrapper of `/locate/{country}/{city}`)
- `envia_check_carrier_coverage` (unified wrapper of 30+ carrier endpoints)
- India coverage tools (when India becomes in-scope)

But those are v2 decisions, outside this v1 audit scope.

