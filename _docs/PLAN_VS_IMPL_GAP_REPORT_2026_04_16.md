# Gap Report: Plan Maestro vs Implementación Real
**Fecha:** 2026-04-16
**Método:** 3 agentes especializados auditaron dimensiones distintas contra MCP_EXPANSION_PLAN.md + MCP_EXPANSION_AUDIT.md (V1) + MCP_EXPANSION_AUDIT_V2.md (V2). Evidencia verificada directamente con grep en el código fuente.
**Verdict:** El MCP server implementa la **estructura** del plan (90 tools, servicios fundacionales presentes) pero NO la **lógica de negocio**. La Fase 0/0.5 quedó incompleta y todas las fases encima heredan esos gaps.

---

## Score por dominio (evidencia verificada)

| Dominio | Reglas en plan | Implementadas | Score | Nota |
|---------|---------------|---------------|-------|------|
| **Country rules (direcciones)** | 47 | 14 completas, 8 parciales | 30% | Solo MX/BR/CO/AR/US cubiertos; ES/IT/IN/PT/FR sin detección territorial |
| **Rate business rules** | 14 | 2 | 14% | Falta volumétrico, hour_limit, coverage, cross-border, MPS, branch COD |
| **Generate business rules** | 10 | 4 | 40% | Falta debt check, intl activation, duties validation, fulfillment trigger |
| **Cancel reglas** | 10 | 1 | 10% | Falta límite diario, is_cancellable, COD chargeback, notifications |
| **Pickup reglas** | 8 | 2 (schemas ok) | 25% | Sin validación rango, import check, fee calc, balance check |
| **Ecommerce V4 campos** | 12 | 0 | 0% | fulfillment_status_id, cod_active, HS codes no expuestos |
| **Additional services (cálculos)** | 15 tipos | 0 | 0% | Solo listing, ningún cálculo de precio |
| **Servicios especiales (validaciones)** | 12+ | 0 | 0% | Sin validación de COD+branch, LTL auto-inject, insurance rename |
| **Error map códigos** | 10 críticos | 9 | 90% | Falta 1116 (cross-company) |
| **Carrier-specific rules** | 12 | 0 | 0% | Sin avisos de FedEx/DHL/Estafeta/Coordinadora/Correios |

**Cobertura global estimada: ~25-30% del plan V1+V2 (126 reglas).**

---

## El patrón detectado: "Foundation built, not wired"

Muchos constantes y flags están definidos en `country-rules.ts` pero **nunca se consultan** en los builders. Evidencia verificada:

| Constante / función | Dónde se define | Dónde se usa | Realidad |
|---------------------|-----------------|--------------|----------|
| `DEFAULT_DECLARED_VALUES` (MX=3000) | country-rules.ts:40 | **Ninguna** | Plan exige auto-aplicar en rate/generate MX sin declared_value. **Nunca pasa.** |
| `DOMESTIC_AS_INTERNATIONAL` (BR, IN) | country-rules.ts:31 | 3 tools ✅ | Wiring OK en create-label, get-shipping-rates, get-ecommerce-order |
| `EXCEPTIONAL_TERRITORIES` (Canarias, ultramar, islas) | country-rules.ts:19 | Solo tax-rules | Plan exige transformar country='ES' → 'IC' si CP 35xxx/38xxx en dirección. **Nunca pasa.** |
| `IDENTIFICATION_REQUIRED_ALWAYS` (BR, CO) | country-rules.ts:34 | identification-validator ✅ | Wiring parcial — solo chequea presencia, no el checksum real en algunos paths |
| `transformPostalCode` (BR/AR/US) | country-rules.ts:60 | Solo create-label indirect | update-address y create-address NO la llaman. **Direcciones guardadas sin transformar.** |
| `transformPhone` (FR) | country-rules.ts:98 | Solo address-resolver | Tools que reciben phone sin pasar por address-resolver no lo normalizan |
| `generic-form` validation | generic-form.ts ✅ | **Solo 2 de 7+ tools con direcciones** | create-address, update-address, update-order-address, create-client, update-client NO validan contra generic-form |

Esto es peligroso porque da la **ilusión** de que la validación existe (el servicio está ahí) mientras que en producción los datos fluyen sin validarse.

---

## Breakdown por dimensión que mencionaste

### 🏠 DIRECCIONES — Score 3/10

**Lo que funciona:**
- Scaffolding de country-rules con 16 países mencionados
- BR postal transform (guión CEP) ✅
- AR postal transform (strip leading char) ✅
- US postal transform (truncar/ZIP+4) ✅
- CPF/CNPJ checksum real con mod-11 ✅ (evidencia: `identification-validator.ts:30-93`)
- BR/IN doméstico=internacional wired ✅
- Generic-form existe y funciona ✅

**Lo que falla silenciosamente:**
- **Colombia postal=city** — El plan V1 §C.1 dice "postalCode debe ser el código DANE (city code), no el nombre de ciudad". Actualmente hay solo un fallback parcial en `address-resolver.ts:273-274` (si postalCode está vacío Y city ya tiene formato DANE, usa city). No hay traducción de "Bogotá" → "11001000". **Agente que pasa postal real para CO → rate vacío.**
- **España Canarias** — La constante ES-CN/ES-35/ES-38 existe en EXCEPTIONAL_TERRITORIES pero **nunca hay lógica que detecte CP 35xxx/38xxx y cambie country='ES' → 'IC'**. Plan V1 §A.1.
- **Italia islas** — Sicilia (90-98), Cerdeña (07-09), islas menores — **cero detección**. Plan V1 §A.6.
- **India pincode** — Plan exige exactamente 6 dígitos validados. No hay regex.
- **Portugal Azores/Madeira** — CP 20/30 — no detectados.
- **Francia ultramar** — Territorios GF/GP/MQ/YT/RE solo en set de constantes, sin lógica que los detecte por postal.
- **Generic-form NO se usa** en `create-address`, `update-address`, `update-order-address`, `create-client`, `update-client`. Agente crea direcciones inválidas que se rechazan después.
- **Transform NO se aplica** en create-address/update-address. Dirección guardada en DB sin transformar.

**Impacto:** ~25% de operaciones fuera de MX/BR fallan o se degradan silenciosamente.

---

### 📦 SERVICIOS (Rate + Generate) — Score 2/10

**Lo que funciona:**
- Print settings (format, size) resueltos en create-label ✅
- Items obligatorios para internacional validados ✅ (parcial)
- BR/IN doméstico como internacional ✅
- Country rules scaffolding presente

**Lo que falla (14/14 reglas de Rate + muchas de Generate):**

| Regla del plan | Estado | Consecuencia |
|---------------|--------|--------------|
| Consistencia unidades (KG+CM vs LB+IN) | ❌ | Agente mezcla, backend rechaza silenciosamente |
| Peso mínimo 0.1 kg auto-elevar | ❌ | Paquetes ligeros obtienen 0 o error |
| Peso volumétrico calc | ❌ | Cotización subestima shipments voluminosos |
| Flat rate detection por boxCode | ❌ | Tarifa fija no aplicada, precio incorrecto |
| Valor declarado mín MX 3000 | ❌ | Constante existe, nunca se usa |
| Service hour_limit | ❌ | Servicios expirados aparecen disponibles |
| Coverage limit catálogo | ❌ | Servicio cotizado pero no disponible en dirección |
| Cross-border auto-inject | ❌ | `grep` confirmó 0 ocurrencias. Servicio cross_border nunca se agrega |
| Insurance rename custom keys | ❌ | Carriers con custom keys reciben nombre incorrecto |
| Max per shipment (>15 pkgs) | ❌ | Shipments masivos aceptados, luego rechazados |
| Branch validation COD | ❌ | Envío a sucursal no COD-compatible pasa |
| Phone fallback origen→destino | ❌ | Destination sin phone → backend error |
| Debt check (generate) | ❌ | Label generada pero cobro falla después |
| International activation flag | ❌ | Intl rechaza sin motivo claro |
| Recipient duties email/phone | ❌ | Duties=RECIPIENT con destino sin email → error 1129 |
| TMS rollback si falla carrier | ❌ | Cobro sin label, reconciliación manual |
| Fulfillment trigger post-generate | ❌ | Orden ecommerce no sincronizada, double-shipping risk |
| LTL auto-inject pickup+delivery schedule | ❌ | `grep` confirmó 0 ocurrencias |

**Impacto:** Rate/Generate son el 80% del volumen del MCP. La mayoría de estas reglas son **silenciosas en unit tests** pero visibles en producción. El agente AI no sabe por qué su shipment fue rechazado.

---

### ⚡ SERVICIOS ESPECIALES (Additional Services) — Score 0/10

Este es el dominio **más vacío**. El MCP tiene `envia_list_additional_services` que lista los servicios disponibles, pero:

- **0 de 15 tipos de cálculo de precio** implementados (operaciones 2-19 del plan V1 §B.3). El agente no puede estimar el costo de COD/insurance/signature antes de cotizar.
- **COD + branch validation** — Plan exige validar que el branch soporta COD. No se valida. Error 1282 en runtime.
- **Insurance rename con custom keys** — Plan V1 §B.1.11. No implementado.
- **Declared value lógica nacional vs internacional** — Plan V1 §C.6. Sin condicional.
- **LTL auto-inject** de pickup_schedule + delivery_schedule — no implementado.
- **Cross-border auto-inject** — no implementado.
- **Servicios como signature, saturday, hold, dry_ice, fragile, oversize** — sin validación. Se pasan through al backend.

**Impacto:** Los agentes no pueden tomar decisiones informadas sobre servicios adicionales. El "servicios especiales" del plan maestro (Plan V1 §B.3 + referencia completa en `reference_v1_additional_services.md`) es esencialmente un black box.

---

### 🚫 CANCEL — Score 1/10

Plan V2 §2 documentó 10 reglas. Solo 1 parcial implementada (balanceReturned en respuesta).

Faltan:
- Límite diario de reembolsos por tipo (5/2/5)
- Empresas exentas (70279, 456605, 75110, 649207)
- Flag `is_cancellable` consulta
- COD chargeback si Delivered
- DCe cancellation Brasil
- Ecommerce fulfillment cancel sync
- Webhook + email + socket notifications post-cancel
- Monto reembolsado reportado al agente
- Razón de rechazo (excedido límite vs otros)

**Impacto:** Cancel funciona pero el agente no tiene visibilidad. Support tickets se disparan cuando reembolsos no llegan y el agente no sabe por qué.

---

### 🚚 PICKUP — Score 2/10 (schemas OK)

Los schemas de track-pickup y cancel-pickup están correctos. Pero schedule-pickup:
- No valida rango de fechas del carrier (`pickup_maximum_days`)
- No valida días operativos (pickup_rules day_1..day_7)
- No detecta mezcla import+export (isImportPickup)
- No consulta pickup_fee
- No valida balance antes de ejecutar

**Impacto:** Agente solicita pickup que el carrier rechaza por día no operativo. Fee se cobra sin aviso.

---

### 🛒 ECOMMERCE V4 — Score 0/10

`get-ecommerce-order.ts` transforma órdenes V4 pero **pierde 12 campos críticos** documentados en Plan V2 §5:

- `fulfillment_status_id` — agente no sabe si la orden ya fue completada → double-shipping
- `cod_active` / `cod_value` por paquete — config COD por paquete individual se pierde
- `partial_available` — cumplimiento parcial no se expone
- `fraud_risk` — bandera de riesgo se pierde
- `order_comment` — notas del equipo se pierden
- `fulfillment_info` — sincronización con ecommerce nativo se pierde
- `return_reason` por producto — contexto perdido
- **`harmonized_system_code`** — HS codes de productos NO mapean a items[] del builder. El agente pierde los HS codes que ya están en la DB.
- `country_code_origin` — país de fabricación perdido

**Impacto:** Agentes que usan órdenes ecommerce para generar envíos internacionales pierden datos que ya existen en la DB. Tienen que pedírselos al usuario o generar con HS code vacío (fail en aduana).

---

## Priorización: ¿qué cerrar antes del pivot HTTP?

### 🔴 BLOQUEANTE para producción multi-tenant (cerrar ANTES de HTTP pivot)

1. **Colombia postal=city bidireccional** — sin esto, todos los envíos CO desde agentes externos fallan
2. **Generic-form en create-address + update-address + update-order-address + create-client** — sin esto, datos inválidos entran al sistema
3. **Valor declarado mín MX 3000** auto-aplicar — constante ya existe, es wiring trivial
4. **Peso mínimo 0.0001 + consistencia KG+CM/LB+IN** — validación schema-level
5. **Items obligatorios validados estrictamente** (BR→BR, IN→IN, intl) — lógica ya existe, falta enforcement
6. **Error map expansion** — agregar 1116 + mensajes accionables para los 10 del plan V2

### 🟠 ALTO IMPACTO (cerrar en paralelo al HTTP pivot)

7. **Ecommerce V4 — exponer 12 campos** — transformación de tipos, esfuerzo medio
8. **Cancel — reportar monto reembolsado + razón** — mejora de agent UX
9. **Pickup — validar rango fechas + fee** — reduce shipments fallidos
10. **Carrier-specific warnings** — Estafeta no intl, Correios CEP obligatorio, etc. Tool `envia_get_carrier_constraints`
11. **España Canarias + Italia islas + Portugal Azores/Madeira** — territorial completeness

### 🟡 NICE-TO-HAVE (pueden esperar)

12. Additional services calculation (ops 2-19) — reqiere lógica compleja, agentes pueden pedir precio al usuario
13. LTL auto-inject pickup_schedule/delivery_schedule — casos específicos
14. TMS charge rollback — infra complexity, backend ya lo hace parcialmente
15. Debt check pre-generate — infra complexity

---

## Recomendación de sequencing (revisada)

El audit previo (ayer) proponía 3 sprints: HTTP auth + logger → tools ergonomics → typed payloads. **Este reality check cambia la prioridad.**

### Sprint 0 (nueva, BLOQUEANTE, 1 semana) — "Cerrar deuda del plan Fase 0/0.5"

Fix los 6 bloqueantes:
1. CO postal=city completo (en resolveAddress + rate + generate + create-address)
2. Generic-form en las 5 tools de dirección faltantes
3. Auto-apply DEFAULT_DECLARED_VALUES en builders
4. Peso mínimo + consistencia unidades a nivel schema
5. Items enforcement estricto (BR→BR, IN→IN, intl)
6. Error map a 15+ códigos con mensajes accionables

**Exit criteria:** cobertura del plan V1+V2 de 25% → 55%.

### Sprint 1 (como estaba propuesto) — "Make it safe to ship"
HTTP auth + pino logger + Dockerfile + CORS whitelist + CI audit.

### Sprint 2 — "Agent UX + ecosystem alignment"
- Ecommerce V4 12 campos
- Carrier constraints tool
- Carrier enum (conectado a data real de tabla `services`)
- Status ID enums
- Cancel/Pickup info enriquecida

### Sprint 3 — "Code quality interna"
Typed payloads, tool registry, builder dedup (audit de ayer).

### Sprint 4+ — "Nice-to-haves"
Additional services calc, LTL auto-services, Fase 11 (AI rate), Fase 12 (Drafts).

---

## Conclusión

**Tu instinto fue correcto.** Entre las últimas sesiones (coordinando Fases 6-10 en paralelo con la sesión principal del portal web, auditorías V1/V2 escritas pero no re-leídas cada sesión), el foco se movió hacia **completar tool coverage** en vez de **completar business rule coverage**.

El MCP hoy es un **excelente adaptador de APIs con shells correctos** pero un **validador incompleto de reglas LATAM**. Los agentes AI pueden invocar 90 tools, pero muchos de ellos van a fallar silenciosamente en producción porque los datos no están siendo transformados/validados como el plan exige.

La buena noticia: la **infraestructura está construida** (constants, services, generic-form-validator). Lo que falta es **wiring** — conectar esos servicios a todos los tools que reciben direcciones/servicios/paquetes. Es trabajo de 1-2 sprints bien dirigidos, no un rewrite.

**Siguiente paso sugerido:** empezar Sprint 0 (cerrar Fase 0/0.5) antes de cualquier otra cosa — incluyendo antes del HTTP pivot. Un MCP HTTP multi-tenant con estos gaps multiplicaría el blast radius de los errores silenciosos.
