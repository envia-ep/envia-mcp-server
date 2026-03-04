# @envia/envia-mcp

[![npm version](https://img.shields.io/npm/v/@envia/envia-mcp.svg)](https://www.npmjs.com/package/@envia/envia-mcp)
[![CI](https://github.com/envia-ep/envia-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/envia-ep/envia-mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/node/v/@envia/envia-mcp.svg)](https://nodejs.org)

MCP server for [Envia](https://envia.com) shipping APIs. Quote rates, create labels, track packages, schedule pickups, and more — directly from your AI assistant.

## Quick start

```bash
# Run with npx (no install needed)
npx @envia/envia-mcp
```

Set your API key as an environment variable:

```bash
export ENVIA_API_KEY="your_jwt_token_here"

# Optional: use production (default is sandbox)
# export ENVIA_ENVIRONMENT="production"
```

Get your API key:
- **Sandbox:** https://app.envia.com → Settings → API Keys
- **Production:** https://app-production.envia.com → Settings → API Keys

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

## Available tools

| Tool | Description |
|------|-------------|
| `envia_validate_address` | Validate postal codes and look up cities |
| `envia_list_carriers` | List available carriers and services for a country |
| `envia_get_shipping_rates` | Compare rates across carriers for a route |
| `envia_create_label` | Purchase a shipping label (charges balance) |
| `envia_track_package` | Track one or more shipments |
| `envia_cancel_shipment` | Void a label and reclaim balance |
| `envia_schedule_pickup` | Schedule carrier pickup |
| `envia_get_shipment_history` | List shipments by month |
| `envia_classify_hscode` | Classify product HS code for customs |
| `envia_create_commercial_invoice` | Generate customs invoice PDF |

## Example conversations

### Domestic shipment (Mexico)

```
You: Ship a 2kg box (30x20x15cm) from postal code 64000 in Monterrey
     to 03100 in Mexico City. Compare DHL and Estafeta rates.

AI:  [validates both postal codes with envia_validate_address]
     [fetches rates with envia_get_shipping_rates for dhl,estafeta]

     Here are your options:
       DHL Economy:    $185.20 MXN — 3-5 business days
       Estafeta Express: $210.00 MXN — 1-2 business days

     Would you like me to create a label with one of these?

You: Yes, go with DHL Economy.

AI:  [creates label with envia_create_label]

     Label created!
       Tracking: 7520610403
       Label PDF: https://...
       Price: $185.20 MXN
```

### International shipment

```
You: I need to ship handmade ceramic mugs from Mexico to the US.
     What HS code should I use?

AI:  [classifies with envia_classify_hscode]

     Recommended HS code: 6912.00 — Ceramic tableware
     This code is required for customs when creating the label.
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENVIA_API_KEY` | Yes | — | Your Envia JWT token |
| `ENVIA_ENVIRONMENT` | No | `sandbox` | `sandbox` or `production` |

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
