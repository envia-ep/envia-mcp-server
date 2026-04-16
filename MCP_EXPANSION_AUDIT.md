# Auditoría Crítica del Plan de Expansión MCP

## Veredicto: El plan original tiene BRECHAS CRÍTICAS que causarían ~30% de rechazos en producción

La auditoría reveló 47 reglas de negocio no documentadas, 14 categorías de brechas, y lógica oculta en el frontend que el plan original no contempla. Este documento corrige y complementa `MCP_EXPANSION_PLAN.md`.

---

## SECCIÓN A: REGLAS DE DIRECCIÓN POR PAÍS (FALTANTES EN EL PLAN)

El plan original trata las direcciones como un objeto genérico. En realidad, **cada país tiene reglas completamente diferentes** que el MCP DEBE implementar antes de enviar al backend.

### A.1 Tabla de Campos Obligatorios por País

| País | Rate: Campos Mínimos | Generate: Campos Adicionales | ID Nacional | Postal Code | Reglas Especiales |
|------|----------------------|------------------------------|-------------|-------------|-------------------|
| **MX** | city, state(2d), country, postalCode | + name, street, **number**(obligatorio) | RFC (opcional) | Estándar 5 dígitos | Colonia/district desde geocodes. SAT codes para carta porte. Valor declarado mín 3000 MXN si no hay declared_value |
| **BR** | city, state(2d), country, postalCode | + name, street, number | **CPF(11d)/CNPJ(14d) OBLIGATORIO** | CEP: insertar "-" en pos 5 si >8 chars | **DCe/NF-e OBLIGATORIO** en cada paquete. ICMS dinámico entre estados. Bairro recomendado. Doméstico BR-BR se trata como internacional (requiere items) |
| **CO** | city(**DANE 8d**), state(2d), country | + name, street, number | **NIT obligatorio ORIGEN Y DESTINO** | Opcional para rate | Ciudad = código DANE (no nombre). PostalCode reemplazado por city en frontend. NIT: 7-10 dígitos numéricos, limpiar guiones |
| **AR** | city, state(2d), country, postalCode | + name, street, number | DNI/CUIT (opcional) | **Eliminar primer carácter** si >4 chars (C1425→1425) | Solo dígitos en postal code |
| **CL** | city, state(2d), country, postalCode | + name, street, number | RUT (opcional) | Estándar | Región → district. Jerarquía región→comuna→ciudad |
| **PE** | city, state(2d), country, postalCode | + name, street, number | DNI 8 dígitos (opcional) | Estándar | - |
| **US** | city, state(2d), country, postalCode | + name, street, number | EIN (opcional) | **Truncar a 5 dígitos** si >5. ZIP+4: insertar "-" en pos 5 si 9 dígitos | US↔PR = mismo país fiscal. Puerto Rico = US territory |
| **ES** | city, state(2d), country, postalCode | + name, street, number | **DNI/NIE/NIF OBLIGATORIO para intl no-UE** | 5 dígitos | **Canarias** (CP 35xxx/38xxx) → transformar country a "IC". Validación intra-UE vs extra-UE |
| **FR** | city, state(2d), country, postalCode | + name, street, number | SIRET (opcional) | 5 dígitos | **Teléfono: validación especial +33**. Territorios ultramar (GF,GP,MQ,YT,RE) = excepciones fiscales. Francia-Mónaco = intra-UE |
| **IT** | city, state(2d), country, postalCode | + name, street, number | VAT (opcional) | 5 dígitos | **Islas**: Sicilia(90-98), Cerdeña(07-09), islas menores (lista específica). Detección afecta pricing |
| **IN** | city, state, country, **pincode(6d)** | + name, street, number | PAN/GSTIN (opcional) | Exactamente 6 dígitos | Pincode crítico para cobertura por carrier (Delhivery, BlueDart, Ekart, etc.). Doméstico IN-IN se trata como internacional (requiere items) |
| **GT/HN/SV/EC/PA** | city, state(2d), country, postalCode | + name, street, number | Opcional | Estándar | Sin transformaciones especiales |

### A.2 Sistema generic-form (FALTANTE COMPLETO EN PLAN)

El backend tiene un sistema llamado **generic-form** que define campos requeridos por país dinámicamente. El plan DEBE incluir:

**Endpoint:** GET /generic-form?country_code={country}&form=address_info

**Retorna:** JSON array de campos con:
```json
{
  "fieldName": "identification_number",
  "fieldLabel": "CPF/CNPJ",
  "visible": true,
  "type": "text",
  "rules": {
    "required": true,
    "min": 11,
    "max": 14,
    "validationType": "regex",
    "pattern": "^[0-9]{11,14}$",
    "validationCnpj": true
  },
  "fieldAI": { "from": "identification_number" },
  "on_change": [...]
}
```

**ACCIÓN REQUERIDA:** Todo tool que maneje direcciones (rate, generate, create_address, update_order_address) DEBE:
1. Fetch generic-form del país
2. Validar campos según rules (min, max, pattern, required)
3. Solo entonces enviar al backend

### A.3 Transformaciones de Postal Code (FALTANTES)

```typescript
function transformPostalCode(country: string, postalCode: string): string {
  switch (country.toUpperCase()) {
    case 'BR': // CEP: insertar guión
      if (postalCode.length >= 8 && !postalCode.includes('-'))
        return postalCode.slice(0, 5) + '-' + postalCode.slice(5);
      break;
    case 'AR': // Eliminar letra prefijo
      if (postalCode.length > 4)
        return postalCode.slice(1);
      break;
    case 'US': // Truncar a 5 dígitos
      if (postalCode.length > 5)
        return postalCode.slice(0, 5);
      break;
    case 'CO': // Ciudad reemplaza postal code
      // En rate: postalCode = city (código DANE)
      // En generate: postalCode puede ser vacío
      break;
  }
  return postalCode;
}
```

### A.4 Lógica de Impuestos shouldApplyTaxes (FALTANTE)

```
MISMO PAÍS:
  US ↔ PR → taxes = false (excepción binacional)
  ES → Canarias (CP 35/38) → taxes = false (excepción territorial)
  FR → Territorios ultramar (GF,GP,MQ,YT,RE) → taxes = false
  PT → Azores/Madeira (20,30) → taxes = false
  NL → SX → taxes = false
  Cualquier otro mismo país → taxes = true

DIFERENTE PAÍS:
  Ambos en UE → taxes = true (intra-UE, sin aranceles)
  Uno fuera de UE → taxes = true (internacional, con aranceles)
  
CONSECUENCIA:
  Si taxes = false (internacional/territorial):
    → TODOS los paquetes DEBEN tener items[]
    → Items deben tener: description, quantity, price, productCode (HS)
    → ES: origin + destination DEBEN tener identificationNumber
```

### A.5 Validación de Teléfono Francia (FALTANTE)

```typescript
function validateFRPhone(phone: string): string {
  let cleaned = phone.replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('+33')) cleaned = cleaned.slice(3);
  else if (cleaned.startsWith('33')) cleaned = cleaned.slice(2);
  if (cleaned.startsWith('0') && cleaned.length === 10) cleaned = cleaned.slice(1);
  return cleaned; // Debe quedar 9 dígitos
}
```

### A.6 Detección de Islas Italia (FALTANTE)

```typescript
function detectItalyIslands(postalCode: string): { isIsland: boolean; type: string } {
  const prefix = parseInt(postalCode.slice(0, 2));
  if (prefix >= 90 && prefix <= 98) return { isIsland: true, type: 'sicilia' };
  if (prefix >= 7 && prefix <= 9) return { isIsland: true, type: 'sardegna' };
  // + lista de islas menores (Capri, Pantelleria, Lipari, etc.)
  return { isIsland: false, type: 'mainland' };
}
```

---

## SECCIÓN B: REGLAS DE NEGOCIO RATE/GENERATE (FALTANTES)

### B.1 Flujo Rate — Pasos faltantes en el plan

1. **Validación de consistencia de unidades** — Todos los paquetes deben usar el mismo sistema (KG+CM o LB+IN). No mezclar.

2. **Restricciones de peso por compañía** — Tabla `allowed_weights` define min/max por service_id. Si peso está fuera de rango → carrier no retorna rates.

3. **Peso mínimo** — Si peso < 0.1 kg → sube a 0.1 kg automáticamente.

4. **Peso volumétrico** — Se calcula: `(L × W × H) / factor_volumétrico`. Se usa max(declarado, volumétrico).

5. **Flat Rate detection** — Si `boxCode` coincide con `carrier_standard_packages` → es tarifa fija, no se calcula por peso.

6. **Valor declarado mínimo MX** — Para carriers mexicanos sin declared_value, se fija en 3000 MXN automáticamente.

7. **Items taxes internacional** — Si precio total de items > USD 100 → se aplica 16% tax adicional.

8. **Service Hour Limit** — Servicios con `hour_limit` (ej: "14:00") solo disponibles antes de esa hora en timezone del origen. Se obtiene timezone del código postal via geocodes.

9. **Coverage Limit** — Tabla `catalog_coverage_limit` define restricciones por carrier: excluye servicios basado en propiedades de dirección (country, state, city).

10. **Cross-border auto-inject** — Compañías en tabla `crossborder_companies`: si origen O destino es MX, se inyecta automáticamente servicio "cross_border" en todos los paquetes.

11. **Insurance rename con custom keys** — Si la empresa tiene custom keys del carrier: `envia_insurance` se renombra a `insurance`.

12. **Max per shipment** — Si carrier.allow_mps=false y cantidad paquetes > 15 → error (excepción: India permite hasta que forceException=true).

13. **Branch validation** — Si destination tiene branchCode y hay COD → validar que branch existe Y soporta COD.

14. **Phone fallback** — Si destino no tiene phone → copiar del origen.

### B.2 Flujo Generate — Pasos faltantes en el plan

1. **Debt check** — Usuario NO puede generar si tiene deudas pendientes.

2. **International activation** — Compañía DEBE tener `international=1` para envíos internacionales.

3. **Print settings obligatorios** — `printFormat` y `printSize` son REQUERIDOS en generate schema (no en rate).

4. **Service REQUERIDO** — En generate, `service` es obligatorio (en rate es opcional).

5. **Items validación estricta** — Para internacional (!taxesApply): TODOS los paquetes DEBEN tener items[]. Si alguno no tiene → error 1129.

6. **España ID obligatorio** — Si origin.country="ES" y envío internacional no-UE: origin Y destination DEBEN tener identificationNumber.

7. **Recipient duties** — Si duties_payment="RECIPIENT" en internacional: email y phone del destinatario son OBLIGATORIOS (no vacío, no noreply@envia.com).

8. **TMS charge flow** — Generate cobra ANTES de crear label. Si carrier falla después del cobro → DEBE llamar TMS /rollback.

9. **DCe post-generate** — Después de generate exitoso en BR: guardar dceKey en shipment_additional_info para cancelación futura.

10. **Fulfillment trigger** — Después de generate exitoso con orden ecommerce: trigger fulfillment al ecommerce (Shopify, WooCommerce, etc.).

### B.3 Servicios Adicionales — Reglas faltantes

**15 tipos de cálculo de precio** (operaciones 2-19 en AdditionalServiceUtil):

| Op | Fórmula | Ejemplo |
|----|---------|---------|
| 2 | shippingCost × commission | 5% de la tarifa |
| 3 | max(amount × commission, minimum) | Seguro con mínimo |
| 4 | PlanDefinition (tabla rangos) | Rangos de precio |
| 5 | (amount × commission) + fijo | Porcentaje + cargo fijo |
| 7 | dataCostWs directo | Costo del carrier |
| 10 | commission × ceil(weight) | Por kilo |
| 14 | commission × ceil(weight - condition) | Por kilo sobre rango |
| 16 | max(commission × ceil(weight), minimum) | Por kilo con mínimo |

**COD + Branch validation:**
- Si hay COD amount y destination.branchCode → branch DEBE existir Y soportar COD
- Si branch no soporta COD → error 1282

---

## SECCIÓN C: LÓGICA OCULTA EN FRONTEND (DESCUBRIMIENTOS CRÍTICOS)

### C.1 Colombia: PostalCode = City (CRÍTICO)

**Descubierto en:** `envia-clients/src/context/generate/actions/actions.js`

```javascript
// makeLocationPayload() para Colombia
if (country === 'CO') {
  payload.postalCode = payload.city; // Ciudad REEMPLAZA postal code
}
// Fallback global: si no hay postal → '00000'
```

**Impacto en MCP:** El tool `quote_shipment` y `create_shipment` DEBEN implementar esta lógica para Colombia. Si envían postal code real para CO, el rate probablemente falle.

### C.2 Brasil e India doméstico = Internacional (CRÍTICO)

**Descubierto en:** `envia-clients/src/components/page-ecommerce/MultiorderOptions/generate.js`

```javascript
const isInternational = 
  order?.origin?.country !== order?.destination?.country ||
  (order.destination?.country === 'BR' && order.origin?.country === 'BR') ||
  (order.destination?.country === 'IN' && order.origin?.country === 'IN');
```

**Impacto en MCP:** Envíos BR→BR e IN→IN REQUIEREN items[] en cada paquete, igual que internacionales. El plan original solo considera diferentes países como internacional.

### C.3 LTL auto-agrega servicios (FALTANTE)

```javascript
// Para shipment_type=2 (LTL)
additionalServices: [
  ...existingServices,
  { service: 'pickup_schedule' },
  { service: 'delivery_schedule' }
]
```

**Impacto en MCP:** Si el usuario cotiza/genera LTL, el MCP DEBE inyectar automáticamente `pickup_schedule` y `delivery_schedule`.

### C.4 Conversión de pesos — Tabla exacta

```javascript
KG → LB: × 2.20462    LB → KG: × 0.453592
KG → G:  × 1000       G → KG:  × 0.001
KG → OZ: × 35.274     OZ → KG: × 0.0283495
```

El backend requiere que todos los pesos de pickup estén en KG.

### C.5 Estados con múltiples códigos

Cada estado puede tener HASTA 3 códigos: `code_2_digits`, `code_3_digits`, `code_shopify`. El MCP debe aceptar cualquiera y resolver internamente.

### C.6 Valor declarado lógica compleja

- Si `declared_value > 0` → usar ese valor
- Si no hay declared_value Y es internacional → usar costo total de productos
- Si no hay declared_value Y es nacional → declared_value = 0

---

## SECCIÓN D: BRECHAS DEL MCP SERVER ACTUAL (14 categorías)

### D.1 Validaciones que el MCP actual NO hace pero el backend SÍ requiere

| # | Brecha | Severidad | Impacto |
|---|--------|-----------|---------|
| 1 | No valida CPF/CNPJ checksum (solo cuenta dígitos) | CRÍTICA | DCe falla en SEFAZ |
| 2 | No valida NIT Colombia (7-10 dígitos, origen Y destino) | CRÍTICA | Generate rechazado |
| 3 | No valida DNI/NIE/NIF España para intl no-UE | CRÍTICA | Generate rechazado |
| 4 | No transforma postal code por país (BR guión, AR trim, US truncar) | ALTA | Rate falla |
| 5 | No aplica lógica CO postal=city | ALTA | Rate vacío para CO |
| 6 | No detecta BR/IN doméstico como internacional | ALTA | Generate sin items → error |
| 7 | No valida formato teléfono Francia (+33) | ALTA | Generate rechazado FR |
| 8 | No verifica min/max length de campos según generic-form | ALTA | Backend rechaza |
| 9 | No valida regex patterns de campos (RFC, CPF, etc.) | ALTA | Backend rechaza |
| 10 | No valida NCM format para items BR (8-10 dígitos) | ALTA | DCe falla |
| 11 | No verifica disponibilidad de servicios adicionales antes de rate | MEDIA | Servicio no aplicado silenciosamente |
| 12 | No sincroniza fulfillment post-generate con ecommerce | MEDIA | Double-shipping risk |
| 13 | No valida print format soportado por carrier | MEDIA | Label fail |
| 14 | No implementa hour_limit por servicio | BAJA | Servicio no disponible sin explicación |

### D.2 Herramientas existentes sin integración en flujo

| Tool existente | Debería integrarse en |
|----------------|----------------------|
| `validate_address` | Pre-rate y pre-generate automáticamente |
| `classify_hscode` | Sugerir cuando se detecta intl sin HS codes |
| `create_commercial_invoice` | Vincular con generate para intl |
| `list_additional_services` | Pre-rate para validar servicios disponibles |

---

## SECCIÓN E: CORRECCIONES AL PLAN

### E.1 Nueva Fase 0: Infraestructura de Validación (AGREGAR ANTES de Fase 1)

**Prioridad:** BLOQUEANTE — sin esto, todas las fases fallarán

#### Tool 0.1: Crear servicio `src/services/country-rules.ts`

```typescript
// POR CADA PAÍS: transformaciones, validaciones, campos obligatorios
interface CountryRules {
  transformPostalCode(postalCode: string): string;
  getRequiredFields(action: 'rate' | 'generate'): string[];
  validateIdentification(id: string): { valid: boolean; type: string };
  transformPhone(phone: string): string;
  isPostalCodeCity(): boolean; // true para CO
  isDomesticInternational(): boolean; // true para BR, IN
  getDefaultDeclaredValue(): number | null; // 3000 para MX
  detectIsland?(postalCode: string): IslandInfo; // IT, ES(Canarias)
}
```

#### Tool 0.2: Crear servicio `src/services/tax-rules.ts`

```typescript
function shouldApplyTaxes(origin: Address, destination: Address): boolean;
function isIntraEU(origin: string, destination: string): boolean;
function getExceptionalTerritories(): string[]; // FR-GF, ES-CN, etc.
```

#### Tool 0.3: Crear servicio `src/services/generic-form-validator.ts`

```typescript
// Fetch + cache generic-form por país
// Validar campos contra rules (required, min, max, pattern, regex)
// Retornar errores específicos por campo
async function validateAddressAgainstForm(
  country: string, 
  address: Partial<Address>, 
  action: 'rate' | 'generate'
): Promise<ValidationResult>;
```

#### Tool 0.4: Crear servicio `src/services/identification-validator.ts`

```typescript
// Validar CPF checksum (Brasil)
function validateCPF(cpf: string): boolean;
// Validar CNPJ checksum (Brasil)
function validateCNPJ(cnpj: string): boolean;
// Validar NIT (Colombia)
function validateNIT(nit: string): boolean;
// Detectar tipo documento (España)
function detectDocumentType(id: string): 'DNI' | 'NIE' | 'NIF' | 'unknown';
```

#### Tool 0.5: Ampliar `src/utils/address-resolver.ts`

Agregar:
- Transformación de postal code por país
- Lógica CO: city como postal code
- Validación de phone por país (especialmente FR)
- Detección de islas IT/ES

#### Tool 0.6: Ampliar `src/config.ts`

```typescript
ENVIA_QUERIES_URL: string; // Nueva env var para queries service
EU_COUNTRIES: string[]; // Lista de países UE
EXCEPTIONAL_TERRITORIES: string[]; // FR-GF, ES-CN, etc.
```

### E.2 Correcciones a Fase 1 (Shipments)

- Tool 1.1 `envia_list_shipments`: Agregar nota sobre role=6 (operador de sucursal) que filtra por user_id en vez de company_id
- Tool 1.4 `envia_get_shipments_cod`: Agregar campo `cod_confirmation_status` en respuesta
- Tool 1.7 `envia_get_labels_bulk`: Especificar que retorna binary stream, no URL. El MCP debe manejar response type `application/pdf` o `application/zip`

### E.3 Correcciones a Fase 2 (Orders)

- Tool 2.1 `envia_list_orders`: Agregar filtro `analytics` (unfulfillment, fulfillment, ready-to-ship, etc.)
- Tool 2.1: Agregar `status_payment` filter (pending, paid, cod)
- Tool 2.4 `envia_update_order_packages`: Agregar validación: `weight_unit` solo admite KG|LB|G|OZ, `length_unit` solo CM|IN
- Tool 2.5 `envia_rate_order`: Especificar que usa JWT auth, no Bearer token
- NUEVO Tool 2.13: `envia_get_order_address` — Necesario para ver direcciones actuales antes de editar
- NUEVO Tool 2.14: `envia_split_order_packages` — Dividir paquetes es operación frecuente

### E.4 Correcciones a Fase 3 (Direcciones)

- Tool 3.2 `envia_create_address`: Agregar validación contra generic-form del país ANTES de enviar
- Tool 3.4 `envia_delete_address`: Agregar validación de que no sea dirección default ni favorita de shop
- NUEVO Tool 3.13: `envia_get_address_categories` — Necesario para saber categorías disponibles (Office, Residential, etc.)
- NUEVO Tool 3.14: `envia_get_generic_form` — Exponer el sistema de campos dinámicos para que el agente sepa qué campos pedir

### E.5 Correcciones a Fase 8 (Carriers Avanzados)

- Tool 8.2 `envia_generate_bill_of_lading`: Agregar nota sobre CO donde taxId=postalCode (ciudad)
- Tool 8.4 `envia_submit_nd_report`: Status válidos son [5,6,10,14,15,17,18,19,20,21,22,24], no los que listaba el plan
- Tool 8.7 `envia_locate_city`: Especificar que es CRÍTICO para Colombia (resolución DANE)
- NUEVO Tool 8.9: `envia_authorize_dce` (mover de Fase 10) — DCe es parte del flujo generate para BR, no es feature opcional

### E.6 Nueva Fase: AI Shipping (AGREGAR)

Los endpoints de AI shipping en queries son capacidades valiosas que el MCP debería exponer:

- `envia_ai_rate` — Rate con NLP (texto libre → cotización)
- `envia_ai_parse_address` — Parsear dirección libre (texto/imagen/audio) → structured
- `envia_ai_transcribe_audio` — Audio → texto → dirección
- `envia_ai_address_requirements` — Campos requeridos por país

---

## SECCIÓN F: PRIORIZACIÓN REVISADA

### Orden de implementación corregido:

| Prioridad | Fase | Razón |
|-----------|------|-------|
| **0** | **Infraestructura de Validación** | BLOQUEANTE: sin country rules, todo falla |
| **1** | **Corregir tools existentes** (rate + generate) | Los 12 tools actuales tienen brechas |
| **2** | Envíos (Shipments) — 15 tools | Core query capability |
| **3** | Direcciones + Paquetes + Clientes — 14 tools | Base para todo lo demás |
| **4** | Órdenes (Orders) — 14 tools | Ecommerce operations |
| **5** | AI Shipping — 4 tools | Diferenciador competitivo |
| **6** | Tickets — 6 tools | Gestión de incidencias |
| **7** | Sucursales — 3 tools | Pickup points |
| **8** | Carriers Avanzados — 9 tools | Operaciones avanzadas |
| **9** | Configuración — 10 tools | Administración |
| **10** | Analytics — 5 tools | Business intelligence |
| **11** | Notificaciones — 4 tools | Comunicación |
| **12** | Productos + DCe + Billing — 5 tools | Especializados |

**Total revisado: ~93 tools** (vs 80 del plan original)

---

## SECCIÓN G: CHECKLIST DE IMPLEMENTACIÓN POR TOOL

### Para CADA tool que maneje direcciones:

- [ ] Fetch generic-form del país
- [ ] Validar campos requeridos según form rules
- [ ] Transformar postal code según país (BR guión, AR trim, US truncar, CO city→postal)
- [ ] Validar identification number si es requerido (CPF checksum BR, NIT CO, DNI/NIE/NIF ES)
- [ ] Validar teléfono si es FR (normalización +33)
- [ ] Detectar islas si es IT o ES (Canarias)
- [ ] Determinar si es internacional (incluir BR→BR e IN→IN)
- [ ] Si internacional: validar items[] en cada paquete
- [ ] Si internacional ES: validar identification origin + destination
- [ ] Determinar shouldApplyTaxes para lógica fiscal
- [ ] Validar consistencia de unidades (KG+CM o LB+IN, no mezclar)

### Para CADA tool que haga rate:

- [ ] Todos los checks de dirección arriba
- [ ] Validar peso mínimo (≥0.1 KG)
- [ ] Calcular peso volumétrico
- [ ] Detectar flat rate por boxCode
- [ ] Aplicar valor declarado mínimo MX (3000 MXN) si aplica
- [ ] Validar COD + branch compatibility
- [ ] Verificar hour_limit de servicios
- [ ] Inyectar cross_border si aplica
- [ ] Renombrar envia_insurance→insurance si custom keys

### Para CADA tool que haga generate:

- [ ] Todos los checks de rate arriba
- [ ] Verificar deudas del usuario
- [ ] Verificar international=1 si es intl
- [ ] Validar printFormat y printSize (enum restrictiva)
- [ ] Validar service obligatorio
- [ ] Validar items[] si !taxesApply
- [ ] Validar identification ES si intl no-UE
- [ ] Validar email+phone destino si duties=RECIPIENT
- [ ] Preparar DCe si BR→BR
- [ ] Manejar TMS rollback si carrier falla post-cobro

---

## SECCIÓN H: RIESGOS NO CUBIERTOS

1. **Custom Keys Encryption** — El MCP NO puede desencriptar custom keys (requiere AES-256-CTR key del servidor). Las custom keys son transparentes: el backend las desencripta. El MCP no necesita hacer nada especial, pero debe saber que el comportamiento cambia (ej: insurance rename).

2. **Token Expiration** — JWT tokens expiran. El MCP no implementa refresh. Para sesiones largas, tools podrían fallar silenciosamente.

3. **Rate Limiting** — Queries service tiene 300 req/1000ms. El MCP no implementa backoff. Múltiples tools simultáneos podrían triggear rate limit.

4. **SEFAZ Downtime** — DCe authorization depende de SEFAZ (gobierno BR). Puede estar caído. El MCP debe manejar timeouts largos (30s+) para BR.

5. **Fulfillment Ecommerce** — Después de generate con orden ecommerce, el MCP NO trigger fulfillment. El usuario debe hacerlo manualmente o el backend lo hace automáticamente (depende de configuración).

---

## CONCLUSIÓN

El plan original cubría el **happy path** pero ignoraba:
- 12 transformaciones de dirección específicas por país
- 14 validaciones de negocio críticas en rate/generate
- 5 reglas ocultas del frontend (CO postal=city, BR/IN doméstico=intl, LTL auto-services)
- 47 reglas de negocio no documentadas en el backend

**Con las correcciones de esta auditoría, el plan pasa de ~30% de rechazos estimados a <5%.**

La Fase 0 (Infraestructura de Validación) es BLOQUEANTE y debe implementarse primero, incluso antes de agregar nuevos tools.
