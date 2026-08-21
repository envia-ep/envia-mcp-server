# Mixed-auth tool access

HTTP mode supports three access modes so ChatGPT (and other MCP clients) can
track shipments and browse catalogs without signing in, while account actions
still require the user's OAuth token.

Source of truth for the helpers: `src/auth/tool-access.ts`.

## Access modes

| Mode | User OAuth | `ENVIA_API_KEY` | Envia `Authorization` header | When to use |
|------|------------|-----------------|------------------------------|-------------|
| **Anonymous** | Optional | Not used | Omitted when no user credential | Public Envia endpoints (tracking) |
| **Public catalog** | Optional | Inherited when the user has no credential | Server key, or user token if logged in | Catalogs that Envia still authenticates; quotes, add-ons, and address validation |
| **Authenticated** | Required | Not inherited | User token only | Labels, orders, cancellations |

Unauthenticated HTTP requests **do not** fall back to `ENVIA_API_KEY` for
authenticated tools. That prevents an anonymous caller from creating labels
with the server account.

When a user **is** logged in, catalog tools use the user token (so
company-specific catalogs stay scoped to that account). The server key is only
a fallback for anonymous catalog calls.

## Anonymous: tracking

`envia_track_package` calls Envia `POST /ship/generaltrack`, which is public.

- Advertise `noauth` (and optional `oauth2`) on the tool descriptor.
- Call `resolveClient` **without** `inheritServerApiKey`.
- Do **not** use `resolvePublicCatalogClient`.

HTTP `POST /mcp` accepts requests with no `Authorization` header so clients
can initialize, list tools, and track without OAuth. Invalid Bearer tokens
still receive `401`.

## Public catalog: mark a tool

Catalog endpoints on Envia require a Bearer token even though the MCP tool
should be callable without the end user logging in. Mark those tools in two
places:

1. Wrap the `registerTool` descriptor with `asPublicCatalogTool(...)`.
   ChatGPT then treats the tool as `noauth`.
2. Resolve the client with `resolvePublicCatalogClient(...)`.
   Unauthenticated calls inherit `config.serverApiKey` (`ENVIA_API_KEY`).

```ts
import { asPublicCatalogTool, resolvePublicCatalogClient } from '../auth/tool-access.js';
import { optionalApiKeySchema } from '../utils/schemas.js';

server.registerTool(
    'envia_list_carriers',
    asPublicCatalogTool({
        description: 'List available shipping carriers for a country.',
        annotations: {
            readOnlyHint: true,
            openWorldHint: false,
            destructiveHint: false,
        },
        inputSchema: z.object({
            api_key: optionalApiKeySchema,
            country: countrySchema,
        }),
    }),
    async (args) => {
        const activeClient = resolvePublicCatalogClient(client, args.api_key, config);
        // ...
    },
);
```

Credential precedence for catalog tools:

1. Per-request `api_key` argument
2. User OAuth token on the HTTP request
3. `ENVIA_API_KEY` (`config.serverApiKey`)

## Assigned-rates disclaimer

`envia_quote_shipment`, `envia_list_additional_services`, and
`envia_validate_address` prepend a disclaimer when the request has **no**
user credential and the handler falls back to `ENVIA_API_KEY`. The message
states that service availability and pricing may vary, and it encourages the
caller to sign in (or send an API key) to receive their assigned rates.

Authenticated requests (user OAuth or `api_key`) do not include the
disclaimer. Use `withAnonymousFallbackDisclaimer` from `src/auth/tool-access.ts`.

## Tools already marked

| Tool | Mode |
|------|------|
| `envia_track_package` | Anonymous |
| `envia_list_carriers` | Public catalog |
| `envia_list_additional_services` | Public catalog (disclaimer when unauthenticated) |
| `envia_quote_shipment` | Public catalog (disclaimer when unauthenticated) |
| `envia_get_carrier_constraints` | Public catalog |
| `envia_get_additional_service_prices` | Public catalog |
| `envia_validate_address` | Public catalog (disclaimer when unauthenticated) |
| `envia_classify_hscode` | Public catalog |
| `envia_get_branches_catalog` | Public catalog |
| `envia_find_drop_off` | Public catalog |
| `envia_ai_address_requirements` | Public catalog |

All other tools stay **authenticated**: they need a user OAuth token (HTTP) or
`ENVIA_API_KEY` / `api_key` (stdio). They must keep using `resolveClient`
without `inheritServerApiKey`.

## HTTP vs stdio

- **HTTP:** Bearer auth is optional. Missing `Authorization` is allowed.
  Unauthenticated requests get an empty request `apiKey` and keep
  `serverApiKey` from `ENVIA_API_KEY` for catalog tools only.
- **stdio:** `ENVIA_API_KEY` is still required at startup. Per-request
  `api_key` overrides work as before.

## Related files

- `src/auth/tool-access.ts` — `asPublicCatalogTool`, `resolvePublicCatalogClient`, `withAnonymousFallbackDisclaimer`
- `src/auth/optional-bearer.ts` — skip Bearer verification when the header is absent
- `src/config.ts` — `apiKey` (request) vs `serverApiKey` (`ENVIA_API_KEY`)
- `src/utils/api-client.ts` — `resolveClient(..., { inheritServerApiKey: true })`
