# @holoscript/marketplace-api

Public library and service entrypoints for HoloScript trait, plugin, and skill
marketplaces. External founders, agents, and service operators can use the
in-memory adapters directly or provide their own database, cache, payment, and
deployment integrations.

## Install

```bash
npm install @holoscript/marketplace-api
```

## Library

```js
import { InMemoryTraitDatabase, TraitRegistry } from '@holoscript/marketplace-api';

const registry = new TraitRegistry(new InMemoryTraitDatabase());
```

Importing the package does not start a listener, connect to PostgreSQL, or load
credentials. Callers own all storage, cache, payment, HoloKey, and receipt
verification policy.

## Service

```bash
PORT=3000 node node_modules/@holoscript/marketplace-api/dist/server.js
```

The service uses in-memory adapters unless the caller supplies supported
environment variables such as `DATABASE_URL`. Validate a running instance with
`GET /api/v1/health`; deployment receipts remain operator-owned.

## Validation

Package maintainers run `pnpm run build`, `pnpm run test`, the public tarball
gate, and an isolated registry install before release. The npm package does not
ship founder-local paths, private credentials, or deployment defaults.

## Release Boundary

This is a `v0-preview` contract. Library exports and explicit service startup
are supported. Production durability, payment settlement, rollback, abuse
operations, and data recovery depend on caller-provided adapters and are not
certified by an npm import.

## License

MIT
