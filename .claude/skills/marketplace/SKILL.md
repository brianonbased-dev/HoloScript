---
name: marketplace
description: >
  Agent-facing surface for @holoscript/marketplace-api. Use when publishing,
  searching, purchasing, downloading, installing, or verifying marketplace
  traits, skills, plugins, AST assets, and Hololand x402 economy routes.
argument-hint: "[traits|skills|plugins|ast-assets|hololand|verify] [operation]"
disable-model-invocation: false
allowed-tools: Bash, Read, Grep, WebFetch
context: main
agent: general-purpose
---

# /marketplace - HoloScript Marketplace API

**Command**: $ARGUMENTS

You are the agent surface for `@holoscript/marketplace-api`. Do not rebuild
marketplace, x402, plugin, skill, or AST asset flows ad hoc. Use the shipped
Express routes in `packages/marketplace-api/src/server.ts`.

## Source Files

| Surface | Source | Mounted At |
| --- | --- | --- |
| Traits | `packages/marketplace-api/src/routes.ts` | `/api/v1` |
| Skills | `packages/marketplace-api/src/skillRoutes.ts` | `/api/v1/skills` |
| Plugins | `packages/marketplace-api/src/pluginRoutes.ts` | `/api/v1` |
| Hololand x402 | `packages/marketplace-api/src/hololandRoutes.ts` | `/api/v1` |
| AST assets | `packages/marketplace-api/src/economy/ast-licensing-middleware.ts` | `/api/v1` |
| Server wiring | `packages/marketplace-api/src/server.ts` | root app |

## Environment

Load credentials from the local environment first:

```bash
MARKETPLACE_API_URL="${MARKETPLACE_API_URL:-http://localhost:3000/api/v1}"
MARKETPLACE_AUTH_TOKEN="${MARKETPLACE_AUTH_TOKEN:-}"
```

Server startup:

```bash
pnpm --filter @holoscript/marketplace-api dev
```

Useful server env:

| Variable | Purpose |
| --- | --- |
| `PORT` / `HOST` | Express listen address |
| `CORS_ORIGINS` | Comma-separated browser origins |
| `TRUST_PROXY=true` | Enable proxy trust behind Railway/nginx |
| `DATABASE_URL` | Use Postgres trait registry instead of in-memory registry |
| `MARKETPLACE_AUTH_TOKEN` | Bearer token for protected publish/rate/install/unpublish calls |
| `X-Payment-ID` header | Receipt id for paid skill/plugin downloads |
| `X-PAYMENT` header | Base64 x402 payload for AST asset retrieval |

## Health And Discovery

```bash
curl -s "$MARKETPLACE_API_URL/health"
curl -s "$MARKETPLACE_API_URL/metrics"
curl -s "$MARKETPLACE_API_URL/plugins-health"
curl -s "$MARKETPLACE_API_URL/skills/search?limit=5"
```

## Canonical Routes

| Flow | Mounted route |
| --- | --- |
| Trait search/publish | `/api/v1/traits` |
| Trait download | `/api/v1/traits/<trait-id>/download` |
| User verification read | `/api/v1/users/<user-id>/verification` |
| Verification request | `/api/v1/verification` |
| Skill search | `/api/v1/skills/search` |
| Skill publish | `/api/v1/skills/publish` |
| Skill purchase | `/api/v1/skills/<skill-id>/purchase` |
| Skill download | `/api/v1/skills/<skill-id>/download` |
| Skill install | `/api/v1/skills/<skill-id>/install` |
| Plugin search/publish | `/api/v1/plugins` |
| Plugin purchase | `/api/v1/plugins/<plugin-id>/purchase` |
| Plugin download | `/api/v1/plugins/<plugin-id>/download` |
| Plugin install planning | `/api/v1/plugins/<plugin-id>/install-plan` |
| Plugin provenance verify | `/api/v1/plugins/<plugin-id>/provenance` |
| Plugin signing keys | `/api/v1/keys` |
| Hololand x402 callback | `/api/v1/payments/x402/callback` |
| VRR twin creation | `/api/v1/create-vrr-twin` |
| Quest creation | `/api/v1/create-quest` |
| StoryWeaver mint | `/api/v1/mint-story_weaver-book` |
| Business VRR twin read | `/api/v1/business/<business-id>/vrr-twin` |
| Agent quest read | `/api/v1/agent/<agent-id>/quests` |
| AST asset register/list | `/api/v1/ast-assets` |
| AST asset manifest | `/api/v1/ast-assets/<asset-id>/manifest` |
| AST asset gated source | `/api/v1/ast-assets/<asset-id>` |

## Trait Flows

Search:

```bash
curl -s "$MARKETPLACE_API_URL/traits?q=physics&platform=web&verified=true&limit=10"
curl -s "$MARKETPLACE_API_URL/traits/popular?limit=10"
curl -s "$MARKETPLACE_API_URL/traits/recent?limit=10"
```

Publish requires `Authorization: Bearer <token>`:

```bash
curl -s -X POST "$MARKETPLACE_API_URL/traits" \
  -H "Authorization: Bearer $MARKETPLACE_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "demo_trait",
    "version": "1.0.0",
    "description": "Reusable trait published through the marketplace API.",
    "license": "MIT",
    "keywords": ["demo"],
    "platforms": ["web"],
    "category": "utility",
    "source": "trait demo_trait { }"
  }'
```

Download and stats:

```bash
curl -s "$MARKETPLACE_API_URL/traits/<trait-id>/download?version=1.0.0"
curl -s "$MARKETPLACE_API_URL/traits/<trait-id>/stats"
```

Verify a creator:

```bash
curl -s "$MARKETPLACE_API_URL/users/<user-id>/verification"
curl -s -X POST "$MARKETPLACE_API_URL/verification" \
  -H "Authorization: Bearer $MARKETPLACE_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"email","value":"creator@example.com"}'
```

## Skill Marketplace Flows

Search and inspect:

```bash
curl -s "$MARKETPLACE_API_URL/skills/search?q=workflow&pricing=free&limit=10"
curl -s "$MARKETPLACE_API_URL/skills/categories"
curl -s "$MARKETPLACE_API_URL/skills/<skill-id>"
```

Publish:

```bash
curl -s -X POST "$MARKETPLACE_API_URL/skills/publish" \
  -H "Authorization: Bearer $MARKETPLACE_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d @skill-package.json
```

Purchase and download paid skills:

```bash
curl -i -X POST "$MARKETPLACE_API_URL/skills/<skill-id>/purchase" \
  -H "Authorization: Bearer $MARKETPLACE_AUTH_TOKEN"

curl -s "$MARKETPLACE_API_URL/skills/<skill-id>/download" \
  -H "Authorization: Bearer $MARKETPLACE_AUTH_TOKEN" \
  -H "X-Payment-ID: <x402-receipt-id>"
```

Install and verify:

```bash
curl -s -X POST "$MARKETPLACE_API_URL/skills/<skill-id>/install" \
  -H "Authorization: Bearer $MARKETPLACE_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workspacePath":"C:/path/to/workspace"}'

curl -s -X POST "$MARKETPLACE_API_URL/skills/<skill-id>/test" \
  -H "Authorization: Bearer $MARKETPLACE_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Run the skill smoke prompt"}'
```

## Plugin Marketplace Flows

Search and inspect:

```bash
curl -s "$MARKETPLACE_API_URL/plugins?q=renderer&signed=true&limit=10"
curl -s "$MARKETPLACE_API_URL/plugins/<plugin-id>"
curl -s "$MARKETPLACE_API_URL/plugins/<plugin-id>/versions"
curl -s "$MARKETPLACE_API_URL/plugins/<plugin-id>/provenance"
```

Publish:

```bash
curl -s -X POST "$MARKETPLACE_API_URL/plugins" \
  -H "Authorization: Bearer $MARKETPLACE_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d @plugin-package.json
```

Purchase, download, and install-plan:

```bash
curl -i -X POST "$MARKETPLACE_API_URL/plugins/<plugin-id>/purchase"

curl -s "$MARKETPLACE_API_URL/plugins/<plugin-id>/download?version=1.0.0" \
  -H "X-Payment-ID: <x402-receipt-id>"

curl -s -X POST "$MARKETPLACE_API_URL/plugins/<plugin-id>/install-plan" \
  -H "Content-Type: application/json" \
  -d '{"targetStudioVersion":"7.0.0","targetPlatform":"web","installDependencies":true}'
```

Verify signing keys and reputation:

```bash
curl -s -X POST "$MARKETPLACE_API_URL/keys" \
  -H "Authorization: Bearer $MARKETPLACE_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"publicKey":"<ed25519-or-rsa-public-key>","label":"creator laptop"}'

curl -s "$MARKETPLACE_API_URL/authors/<author-id>"
```

## Hololand x402 Flows

Callback endpoint used by facilitators:

```bash
curl -s -X POST "$MARKETPLACE_API_URL/payments/x402/callback" \
  -H "Content-Type: application/json" \
  -d @x402-callback.json
```

Protected creation routes return 402 until a valid x402 payment is attached:

```bash
curl -i -X POST "$MARKETPLACE_API_URL/create-vrr-twin" \
  -H "Content-Type: application/json" \
  -d '{"business_id":"biz_123","geo_location":"33.4484,-112.0740","inventory_api":"https://example.com/inventory"}'

curl -i -X POST "$MARKETPLACE_API_URL/create-quest" \
  -H "Content-Type: application/json" \
  -d '{"business_id":"biz_123","narrative":"Guide visitors through the venue."}'

curl -i -X POST "$MARKETPLACE_API_URL/mint-story_weaver-book" \
  -H "Content-Type: application/json" \
  -d '{"world_id":"world_123"}'
```

Read-side routes:

```bash
curl -s "$MARKETPLACE_API_URL/business/<business-id>/vrr-twin"
curl -s "$MARKETPLACE_API_URL/agent/<agent-id>/quests"
```

## AST Asset x402 Flows

Register and list:

```bash
curl -s -X POST "$MARKETPLACE_API_URL/ast-assets" \
  -H "Content-Type: application/json" \
  -d '{"source":"object demo { }","author":"agent","assetId":"demo-asset"}'

curl -s "$MARKETPLACE_API_URL/ast-assets"
curl -s "$MARKETPLACE_API_URL/ast-assets/<asset-id>/manifest"
```

Retrieve gated source:

```bash
curl -i "$MARKETPLACE_API_URL/ast-assets/<asset-id>"
curl -s "$MARKETPLACE_API_URL/ast-assets/<asset-id>" \
  -H "X-PAYMENT: <base64-x402-payload>"
```

## Agent Rules

- Read the relevant route file before claiming a route does or does not exist.
- Use `Authorization: Bearer $MARKETPLACE_AUTH_TOKEN` for protected publish,
  rate, install, key, unpublish, and verification calls.
- Treat `402` as an expected x402 challenge, not a server failure.
- Preserve `WWW-Authenticate`, `X-PAYMENT`, `X-PAYMENT-RESPONSE`, and
  `X-Payment-ID` headers in payment flows.
- For local smoke tests, prefer in-memory services through `createApp()` unless
  the task explicitly requires Postgres/Railway validation.

## Smoke Verification

Run this after editing the skill or marketplace route surface:

```bash
pnpm verify:claude-plugin-skills
pnpm verify:marketplace-skill
pnpm --filter @holoscript/marketplace-api exec vitest run src/__tests__/server-startup.test.ts src/__tests__/SkillMarketplacePayment.test.ts src/__tests__/PluginMarketplace.test.ts
```
