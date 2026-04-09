# @envia/envia-mcp

[![npm version](https://img.shields.io/npm/v/@envia/envia-mcp.svg)](https://www.npmjs.com/package/@envia/envia-mcp)
[![CI](https://github.com/envia-ep/envia-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/envia-ep/envia-mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/node/v/@envia/envia-mcp.svg)](https://nodejs.org)

MCP server for [Envia](https://envia.com) shipping APIs. Quote rates, create labels, track packages, schedule pickups, manage ecommerce orders, and more — directly from your AI assistant. Supports per-request API key overrides for multi-tenant setups.

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

| Mode | Description | Use case |
|------|-------------|----------|
| `http` (default) | Streamable HTTP on Express with a browser chat UI at `/` | Web clients, testing via browser |
| `stdio` | JSON-RPC over stdin/stdout | CLI-based hosts (Claude Desktop, Cursor, VS Code) |

```bash
# HTTP mode (default)
npx @envia/envia-mcp

# stdio mode
MCP_TRANSPORT=stdio npx @envia/envia-mcp

# Or use the convenience script
npm run start:stdio
```

## Available tools

| Tool | `api_key` | Description |
|------|-----------|-------------|
| `envia_validate_address` | optional | Validate postal codes and look up cities |
| `envia_list_carriers` | **required** | List available carriers and services for a country |
| `list_additional_services` | **required** | List optional add-ons (insurance, COD, signatures) for a route |
| `quote_shipment` | **required** | Compare rates across carriers with auto-resolved addresses |
| `create_shipment` | **required** | Purchase a shipping label — manual or one-step ecommerce mode |
| `envia_get_ecommerce_order` | **required** | Fetch ecommerce order details and build shipment payloads |
| `envia_track_package` | optional | Track one or more shipments |
| `envia_cancel_shipment` | **required** | Void a label and reclaim balance |
| `envia_schedule_pickup` | **required** | Schedule carrier pickup |
| `envia_get_shipment_history` | **required** | List shipments by month |
| `classify_hscode` | optional | Classify product HS code for customs |
| `envia_create_commercial_invoice` | **required** | Generate customs invoice PDF |

### Authentication

Every tool accepts an `api_key` parameter that overrides the server-level `ENVIA_API_KEY`. This enables multi-tenant setups where different users provide their own credentials per request.

- **Required tools** (9) — `api_key` must be provided. These operate on user-specific data (rates, labels, orders, pickups, history).
- **Optional tools** (3) — `api_key` is optional. `envia_validate_address`, `envia_track_package`, and `classify_hscode` work with the server default but accept an override.

When no override is provided, the server falls back to `ENVIA_API_KEY` from the environment.

### Additional services

Both `quote_shipment` and `create_shipment` support optional additional services such as insurance, cash on delivery, and signature requirements:

- **`additional_services`** — Array of `{ service, amount? }` objects. Use `list_additional_services` to discover available services for a route.
- **`insurance_type`** — Shortcut for insurance: `"envia_insurance"`, `"insurance"` (carrier-native, CO/BR), or `"high_value_protection"`. Only one type allowed per shipment.
- **`cash_on_delivery_amount`** — Automatically adds a `cash_on_delivery` service with the specified collection amount.

The rate response displays which services were applied and warns about any that the carrier silently ignored.

### Address auto-resolution

Both `quote_shipment` and `create_shipment` auto-resolve city, state, and district (colonia) from postal codes using the Envia geocodes API. Colombia DANE codes are also translated automatically. Provide explicit values only when you need to override.

### create_shipment — dual mode

- **Manual mode** — Provide addresses, package details, carrier, and service directly. For international shipments, an `items` array with customs data (quantity, price, HS code) is required.
- **Ecommerce mode** — Pass an `order_identifier` and the tool fetches the order, extracts addresses/packages/carrier, resolves print settings, and generates the label in a single step.

### Country-specific address handling

For MX addresses, the exterior number (`number`) is sent as a separate field. For all other countries, the number is part of the `street` field and `number` is left empty. This is handled automatically by the address builders.

## Example conversations

### Domestic shipment (Mexico)

```
You: Ship a 2kg box (30x20x15cm) from postal code 64000 in Monterrey
     to 03100 in Mexico City. Compare DHL and Estafeta rates.

AI:  [validates both postal codes with envia_validate_address]
     [fetches rates with quote_shipment for dhl,estafeta]

     Here are your options:
       DHL Economy:    $185.20 MXN — 3-5 business days
       Estafeta Express: $210.00 MXN — 1-2 business days

     Would you like me to create a label with one of these?

You: Yes, go with DHL Economy.

AI:  [creates label with create_shipment]

     Label created!
       Tracking: 7520610403
       Label PDF: https://...
       Price: $185.20 MXN
```

### International shipment

```
You: Ship a leather handbag worth $299 USD from Monterrey (66612)
     to McAllen TX (78572) via DHL International Express.

AI:  [classifies HS code with classify_hscode → 4202.21]
     [creates label with create_shipment, including items array]

     Label created!
       Tracking: 1234567890
       Label PDF: https://...
       Carrier: DHL / int_express
```

### Shipment with insurance and COD

```
You: Quote a 3kg package from Bogota DC to Medellin ANT with Envia insurance
     for $500,000 COP and collect $200,000 cash on delivery.

AI:  [lists services with list_additional_services for CO]
     [fetches rates with quote_shipment, insurance_type="envia_insurance",
      declared_value=500000, cash_on_delivery_amount=200000]

     Found 4 rates:
       Servientrega / express: $18,500 COP — 1-2 days
         Base: $12,000 | Insurance: $2,500 | COD commission: $4,000
       Coordinadora / standard: $15,200 COP — 2-3 days
         Base: $10,200 | Insurance: $2,000 | COD commission: $3,000
         ⚠ Requested service(s) not applied: envia_insurance
       ...
```

### Ecommerce order (one-step)

```
You: Create a label for order #1062.

AI:  [fetches order with create_shipment(order_identifier="1062")]

     Label created!
       Tracking: 9876543210
       Label PDF: https://...
       Carrier: fedex / ground
```

## Architecture

```
src/
├── index.ts               # Entry point — transport selection (stdio / HTTP)
├── config.ts              # Environment configuration
├── builders/              # Domain-specific payload constructors
│   ├── address.ts         #   Address objects for rate and generate APIs
│   ├── package.ts         #   Package objects with items and additional services
│   ├── additional-service.ts  # Merge insurance, COD, and explicit services
│   └── ecommerce.ts       #   Ecommerce metadata section
├── services/              # Business logic and API orchestration
│   ├── ecommerce-order.ts #   Fetch and transform V4 orders
│   ├── carrier.ts         #   Carrier list fetching
│   └── additional-service.ts  # Query available additional services
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
| `ENVIA_API_KEY` | Yes | — | Default Envia JWT token (tools can override per-request via `api_key`) |
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
