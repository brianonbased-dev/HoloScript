# @holoscript/config

Centralized configuration for the HoloScript platform — service endpoints, server-only auth helpers, and startup environment validation in one place, so nothing hardcodes a URL or reads `process.env` ad hoc.

## Installation

```bash
npm install @holoscript/config
```

## Usage

```ts
import { ENDPOINTS, getMcpApiKey, mcpAuthHeaders, requireConfig } from '@holoscript/config';

// Fail fast at startup if required env vars are missing
requireConfig(['HOLOSCRIPT_API_KEY'], 'my-service');

// Read a caller-configured endpoint (falls back to the public default)
const res = await fetch(`${ENDPOINTS.HOLOSCRIPT_MCP}/health`);

// Server-only: authenticated request to the MCP orchestrator
const data = await fetch(`${ENDPOINTS.MCP_ORCHESTRATOR}/knowledge/query`, {
  headers: { ...mcpAuthHeaders(), 'Content-Type': 'application/json' },
  body: JSON.stringify({ search: 'pipeline' }),
});
```

### What's in the package

- `ENDPOINTS` / `getEndpoint()` — named service URLs (MCP orchestrator, HoloScript MCP server, absorb service, Moltbook, HoloMesh), each overridable via an environment variable and falling back to a public default.
- `auth` helpers (`getMcpApiKey`, `getHolomeshKey`, `mcpAuthHeaders`, `getOAuthToken`, `configureConfigSecretResolver`, …) — server-only accessors that read credentials from `process.env` (or an injected `ConfigSecretResolver`, e.g. a HoloKey-backed vault). These throw if called from a browser context, so keys never leave the server.
- `validateConfig()` / `requireConfig()` / `REQUIRED_VARS` — startup validation: check that required environment variables are present and get a structured report, or throw immediately for fail-fast startup.

## Package boundary & release posture

`@holoscript/config` is built for the external operator, founder, and agent-framework audience running their own HoloScript-based service — it does not assume you are pointed at any particular deployment. Every endpoint and credential is caller-owned: you bring your own `.env` file (or a `ConfigSecretResolver` you supply via `configureConfigSecretResolver`), and every URL in `ENDPOINTS` is an environment variable override with a public default, not a founder-owned pin.

This package does not ship founder-local infrastructure. It has no bundled secret store, no private workspace default, and no hardcoded founder credentials — `resolveConfigSecret()` falls through to `@holoscript/secrets-broker` only when you have that package configured, and to plain `process.env` otherwise. Wiring a HoloKey vault or any other custody lane is the caller's integration, outside this package's boundary.

Status: **v0-preview**. `ENDPOINTS`, the auth accessors, and `validateConfig`/`requireConfig` are exercised by consuming services in this repo; known limitations are that the built-in OAuth `client_credentials` flow assumes a single in-process token cache (no multi-tenant token isolation yet) and the default secret resolver's fallback chain is best-effort, not a formal precedence contract. Pin a version for reproducible config behavior; rollback is a plain `npm install @holoscript/config@<version>`.

## License

MIT
