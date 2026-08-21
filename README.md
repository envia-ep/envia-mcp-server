# @envia/envia-mcp

[![npm version](https://img.shields.io/npm/v/@envia/envia-mcp.svg)](https://www.npmjs.com/package/@envia/envia-mcp)
[![CI](https://github.com/envia-ep/envia-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/envia-ep/envia-mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/node/v/@envia/envia-mcp.svg)](https://nodejs.org)

MCP server for [Envia](https://envia.com) shipping APIs. Quote rates, create labels, track packages, schedule pickups, manage ecommerce orders, and more — directly from your AI assistant.

> **Deployment model:** HTTP mode is mixed-auth. Tracking and catalog tools can
> run without the end user signing in; quoting, labels, and other account
> actions require OAuth (or an `api_key`). See [Authentication](#authentication)
> and [documentation/tool-access.md](documentation/tool-access.md).

## Quick start

```bash
# Run with npx (no install needed)
npx @envia/envia-mcp
```

Set your API key via environment variable or pass it per-request (see [Authentication](#authentication)):

```bash
export ENVIA_API_KEY="your_jwt_token_here"

# Optional: use production (default is sandbox)
# export ENVIA_ENVIRONMENT="production"
```

Get your API key from **Desarrolladores → Acceso de API** in your dashboard:
- **Sandbox:** [shipping-test.envia.com/settings/developers](https://shipping-test.envia.com/settings/developers) · [Sign up](https://accounts-sandbox.envia.com/signup)
- **Production:** [shipping.envia.com/settings/developers](https://shipping.envia.com/settings/developers) · [Sign up](https://accounts.envia.com/signup)

## IDE setup

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "envia": {
      "command": "npx",
      "args": ["@envia/envia-mcp"],
      "env": {
        "ENVIA_API_KEY": "your_jwt_token_here"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "envia": {
      "command": "npx",
      "args": ["@envia/envia-mcp"],
      "env": {
        "ENVIA_API_KEY": "your_jwt_token_here"
      }
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json` in your project root:

```json
{
  "servers": {
    "envia": {
      "type": "stdio",
      "command": "npx",
      "args": ["@envia/envia-mcp"],
      "env": {
        "ENVIA_API_KEY": "your_jwt_token_here"
      }
    }
  }
}
```

## Transport modes

The server supports two transport modes, controlled by the `MCP_TRANSPORT` environment variable:

| Mode | Description | Intended use case |
|------|-------------|-------------------|
| `http` (default) | Streamable HTTP on Express with a demo browser chat UI at `/` | **Portal-embedded** deployment (v1): the Envia portal backend calls the MCP over HTTP inside a controlled network. The chat UI at `/` is a **development-only demo** (see [Chat demo](#chat-demo-development-only)). |
| `stdio` | JSON-RPC over stdin/stdout | **IDE integrations** (Claude Desktop, Cursor, VS Code). The per-request `api_key` parameter is meant for this path, where each developer uses their own credential. |

### Authentication

HTTP mode is **mixed-auth**. `POST /mcp` verifies a Bearer token when one is
sent and allows requests without `Authorization` so clients can initialize,
list tools, and call public tools.

| Access | User OAuth | Uses `ENVIA_API_KEY` | Tools |
|--------|------------|----------------------|-------|
| **Anonymous** | Optional | No | `envia_track_package` |
| **Public catalog** | Optional | Yes, when the user has no credential | Carriers, add-ons, address validation, quotes, HS codes, branches |
| **Authenticated** | Required | No (never inherited on anonymous HTTP) | Labels, orders, pickups, cancellations |

- **HTTP:** unauthenticated calls to authenticated tools do **not** inherit
  `ENVIA_API_KEY`. Catalog tools do, because those Envia APIs still require a
  server-side token. Invalid Bearer tokens still receive `401`.
- **stdio / IDE:** set `ENVIA_API_KEY` in the MCP host config. Passing `api_key`
  inline per tool call is supported for multi-account local workflows.

How to mark a new catalog tool (ChatGPT `noauth` + inherit `ENVIA_API_KEY`):
see [documentation/tool-access.md](documentation/tool-access.md).

```bash
# HTTP mode (default)
npx @envia/envia-mcp

# stdio mode
MCP_TRANSPORT=stdio npx @envia/envia-mcp

# Or use the convenience script
npm run start:stdio
```

## Chat demo (development only)

HTTP mode serves a browser chat UI at `/` (`src/chat/index.html`). This UI
is a **development and local-testing tool**, not a production flow:

- The user pastes their Anthropic or OpenAI API key and their Envia token
  directly into browser inputs.
- Messages are sent from the browser **directly** to the LLM provider
  (Anthropic uses the `anthropic-dangerous-direct-browser-access: true`
  header that the official SDK marks as unsafe for production).
- Keys and tokens entered into the UI are visible to browser DevTools,
  extensions, and anyone with access to the host.

**Do not paste production credentials into the chat UI.** The production
pattern is the portal-embedded agent, where the Envia portal backend
calls the MCP over HTTP and invokes Anthropic with a server-side key.

If you deploy the MCP and do not need the demo UI, disabling the static
route that serves `src/chat/` is tracked as a Sprint 4 item.

## Available tools

| Tool | Access | Description |
|------|--------|-------------|
| `envia_validate_address` | catalog | Validate postal codes, look up cities, and surface country-specific required fields |
| `envia_list_carriers` | catalog | List available carriers and services for a country |
| `envia_list_additional_services` | catalog | List optional add-ons (insurance, COD, signatures) for a route |
| `envia_quote_shipment` | catalog | Compare rates across carriers with auto-resolved addresses |
| `envia_create_shipment` | authenticated | Purchase a shipping label with dynamic address validation and BR DCe support |
| `envia_get_ecommerce_order` | authenticated | Fetch ecommerce order details and build shipment payloads |
| `envia_track_package` | anonymous | Track one or more shipments (no API key or OAuth required) |
| `envia_cancel_shipment` | authenticated | Void a label and reclaim balance |
| `envia_schedule_pickup` | authenticated | Schedule carrier pickup |
| `envia_get_shipment_history` | authenticated | List shipments by month |
| `envia_classify_hscode` | catalog | Classify product HS/NCM code for customs and BR DCe |
| `envia_create_commercial_invoice` | authenticated | Generate customs invoice PDF |

### Authentication

Every tool accepts an optional `api_key` that overrides the request credential.
This enables multi-tenant stdio setups where developers pass their own key.

- **Anonymous** — `envia_track_package`. Works with no API key and no OAuth
  token. Envia `POST /ship/generaltrack` is public.
- **Public catalog** — `envia_validate_address`, `envia_list_carriers`,
  `envia_list_additional_services`, `envia_quote_shipment`,
  `envia_get_carrier_constraints`,
  `envia_get_additional_service_prices`, `envia_classify_hscode`,
  `envia_get_branches_catalog`, `envia_find_drop_off`,
  `envia_ai_address_requirements`. Callable without user login; the server
  uses `ENVIA_API_KEY` against Envia catalog APIs that require auth.
  Quote, additional-services, and address-validation replies include a
  disclaimer when no user auth is sent: availability and pricing may vary,
  so callers should sign in to get their assigned rates.
- **Authenticated** — labels, orders, pickups, history, and other
  account-specific tools. HTTP callers must send a user OAuth token.

Developer guide: [documentation/tool-access.md](documentation/tool-access.md).

### Additional services

Both `envia_quote_shipment` and `envia_create_shipment` support optional additional services such as insurance, cash on delivery, and signature requirements:

- **`additional_services`** — Array of `{ service, amount? }` objects. Use `envia_list_additional_services` to discover available services for a route.
- **`insurance_type`** — Shortcut for insurance: `"envia_insurance"`, `"insurance"` (carrier-native, CO/BR), or `"high_value_protection"`. Only one type allowed per shipment.
- **`cash_on_delivery_amount`** — Automatically adds a `cash_on_delivery` service with the specified collection amount.

The rate response displays which services were applied and warns about any that the carrier silently ignored.

### Address auto-resolution

Both `envia_quote_shipment` and `envia_create_shipment` auto-resolve city, state, and district (colonia) from postal codes using the Envia geocodes API. Colombia DANE codes are also translated automatically. Provide explicit values only when you need to override.

For **MX addresses**, the district (colonia/neighborhood) is particularly important — some carriers validate availability at this level. The tool auto-resolves it from the postal code's first suburb, but you can provide `origin_district` / `destination_district` explicitly when the customer knows their specific colonia.

### envia_create_shipment — dual mode

- **Manual mode** — Provide addresses, package details, carrier, and service directly. For international shipments, an `items` array with customs data (quantity, price, HS code) is required.
- **Ecommerce mode** — Pass an `order_identifier` and the tool fetches the order, extracts addresses/packages/carrier, resolves print settings, and generates the label in a single step.

#### Dynamic address validation

Before creating any label, `envia_create_shipment` validates both origin and destination addresses against the country's generic-form rules (fetched from the Envia API). Each country defines which address fields are required — for example, BR requires `identificationNumber` (CPF/CNPJ), while other countries may require `district` or `reference`. Missing fields are reported with the exact tool parameter name to provide.

The `envia_validate_address` tool also surfaces these required fields, so agents can proactively discover what's needed before calling `envia_create_shipment`.

#### Brazil DCe pre-authorization

For BR-to-BR domestic shipments, Brazilian regulations require a Declaracao de Conteudo Eletronica (DCe) authorization from SEFAZ before labels can be generated. `envia_create_shipment` handles this automatically:

1. Validates that `items` are provided with `productCode` (NCM code) for each item
2. Validates that both origin and destination have `identificationNumber` (CPF or CNPJ)
3. Calls the DCe authorization endpoint to obtain SEFAZ approval
4. Injects the resulting `xmlData` into the package payload

If you already have DCe authorization data (e.g., from an external system), pass it via the `xml_data` parameter to skip auto-authorization.

### Country-specific address handling

For MX and BR addresses, the exterior number (`number`) is sent as a separate field — provide `origin_number` / `destination_number` explicitly. For all other countries, the number is part of the `street` field and `number` is left empty. This is handled automatically by the address builders.

## Example conversations

### Domestic shipment (Mexico)

```
You: Ship a 2kg box (30x20x15cm) from postal code 64000 in Monterrey
     to 03100 in Mexico City. Compare DHL and Estafeta rates.

AI:  [validates both postal codes with envia_validate_address]
     [fetches rates with envia_quote_shipment for dhl,estafeta]

     Here are your options:
       DHL Economy:    $185.20 MXN — 3-5 business days
       Estafeta Express: $210.00 MXN — 1-2 business days

     Would you like me to create a label with one of these?

You: Yes, go with DHL Economy.

AI:  [creates label with envia_create_shipment]

     Label created!
       Tracking: 7520610403
       Label PDF: https://...
       Price: $185.20 MXN
```

### International shipment

```
You: Ship a leather handbag worth $299 USD from Monterrey (66612)
     to McAllen TX (78572) via DHL International Express.

AI:  [classifies HS code with envia_classify_hscode → 4202.21]
     [creates label with envia_create_shipment, including items array]

     Label created!
       Tracking: 1234567890
       Label PDF: https://...
       Carrier: DHL / int_express
```

### Shipment with insurance and COD

```
You: Quote a 3kg package from Bogota DC to Medellin ANT with Envia insurance
     for $500,000 COP and collect $200,000 cash on delivery.

AI:  [lists services with envia_list_additional_services for CO]
     [fetches rates with envia_quote_shipment, insurance_type="envia_insurance",
      declared_value=500000, cash_on_delivery_amount=200000]

     Found 4 rates:
       Servientrega / express: $18,500 COP — 1-2 days
         Base: $12,000 | Insurance: $2,500 | COD commission: $4,000
       Coordinadora / standard: $15,200 COP — 2-3 days
         Base: $10,200 | Insurance: $2,000 | COD commission: $3,000
         ⚠ Requested service(s) not applied: envia_insurance
       ...
```

### Brazil domestic (DCe)

```
You: Ship a Smart TV AIWA 32" worth R$800 from São Paulo (01310-100)
     to Rio de Janeiro (20040-020) via Correios SEDEX.
     Sender CPF: 123.456.789-09, recipient CPF: 987.654.321-00.

AI:  [validates addresses with envia_validate_address — confirms BR
      requires identificationNumber, address fields complete]
     [creates label with envia_create_shipment, including items with
      productCode "8528.72.00" and both identification numbers]

     DCe authorized by SEFAZ!
     Label created!
       Tracking: BR123456789
       Label PDF: https://...
       Carrier: correios / sedex
       DCe Key: 35260412345678900199...
```

### Ecommerce order (one-step)

```
You: Create a label for order #1062.

AI:  [fetches order with envia_create_shipment(order_identifier="1062")]

     Label created!
       Tracking: 9876543210
       Label PDF: https://...
       Carrier: fedex / ground
```

## Architecture

```
src/
├── index.ts               # Entry point — transport selection (stdio / HTTP)
├── config.ts              # Environment configuration (request apiKey + serverApiKey)
├── auth/                  # OAuth provider, optional Bearer, public-catalog access
│   ├── provider.ts        #   Queries OAuth proxy
│   ├── optional-bearer.ts #   Skip Bearer verification when the header is absent
│   └── tool-access.ts     #   asPublicCatalogTool + resolvePublicCatalogClient
├── builders/              # Domain-specific payload constructors
│   ├── address.ts         #   Address objects for rate and generate APIs
│   ├── package.ts         #   Package objects with items and additional services
│   ├── additional-service.ts  # Merge insurance, COD, and explicit services
│   └── ecommerce.ts       #   Ecommerce metadata section
├── services/              # Business logic and API orchestration
│   ├── ecommerce-order.ts #   Fetch and transform V4 orders
│   ├── carrier.ts         #   Carrier list fetching
│   ├── additional-service.ts  # Query available additional services
│   ├── dce.ts             #   BR DCe authorization with SEFAZ
│   └── generic-form.ts    #   Country-specific address field validation
├── tools/                 # MCP tool registrations (one file per tool)
├── types/                 # TypeScript interfaces
│   ├── carriers-api.ts    #   Carriers API payload types (source of truth)
│   └── ecommerce-order.ts #   V4 order response types
├── utils/                 # Shared utilities
│   ├── api-client.ts      #   HTTP client with auth, retries, and resolveClient
│   ├── address-resolver.ts#   Geocoding and DANE code resolution
│   ├── print-settings.ts  #   Carrier print format/size lookup
│   ├── mcp-response.ts    #   MCP text response helper
│   ├── schemas.ts         #   Shared Zod schemas (country, carrier, api_key)
│   └── validators.ts      #   Input validation helpers
├── resources/             # MCP resources (API docs)
└── chat/                  # Browser chat UI for HTTP mode
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENVIA_API_KEY` | stdio: yes; HTTP catalogs: yes; tracking-only: no | — | Default Envia JWT. Catalog tools inherit it on anonymous HTTP. Authenticated HTTP tools never inherit it. |
| `ENVIA_ENVIRONMENT` | No | `sandbox` | `sandbox` or `production` |
| `MCP_TRANSPORT` | No | `http` | `http` or `stdio` |
| `PORT` | No | `3000` | HTTP server port (http mode only) |
| `HOST` | No | `127.0.0.1` | HTTP bind address (http mode only) |

## Development

```bash
git clone https://github.com/envia-ep/envia-mcp-server.git
cd envia-mcp-server
npm install
npm run build
npm test
```

## License

MIT
