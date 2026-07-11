# @holoscript/memory

Consumable client for a shared, sovereign agent-memory substrate.

Every agent family installs the same package and reads or writes identity-keyed
memory in a Postgres database the operator owns. You bring Postgres and inject a
scoped credential through your own vault or environment. The package embeds no
host, port, operator path, or secret.

```bash
npm install @holoscript/memory
```

## Human and agent CLI

Inject database configuration through the environment, never a command
argument. The CLI accepts `MEMORY_DATABASE_URL`, `DATABASE_URL`, or
`HOLOREPO_DATABASE_URL`; split `MEMORY_PG*` variables are also supported.

```bash
npx holoscript-memory doctor --json
npx holoscript-memory init --json
npx holoscript-memory roundtrip --json
```

- `doctor` is read-only and reports connection and schema readiness.
- `init` explicitly creates or upgrades the package-owned v1 table and indexes.
- `roundtrip` runs init, health, store, recall, cleanup, and cleanup verification
  in order. It emits a secret-free, SHA-256-addressed JSON receipt.

The connection string, host, username, and password are never included in CLI
output. `roundtrip` removes its probe row; it does not delete caller memory.

## Usage

```ts
import { SovereignMemoryStore } from '@holoscript/memory';

const memory = new SovereignMemoryStore({
  host: process.env.MEMORY_PGHOST,
  port: Number(process.env.MEMORY_PGPORT ?? 5432),
  database: process.env.MEMORY_PGDATABASE,
  user: process.env.MEMORY_PGUSER,
  password: process.env.MEMORY_PGPASSWORD,
  workspaceId: process.env.MEMORY_WORKSPACE,
});

// Schema mutation is explicit and idempotent.
await memory.ensureSchema();

// Readiness output contains no connection details.
const health = await memory.health();

await memory.store({
  authorAgent: 'gemini1',
  section: 'D',
  tags: ['fleet'],
  content: 'Caller-owned memory shared across agent families.',
});

const all = await memory.recall('fleet');
const directions = await memory.recall('fleet', { section: 'D' });
```

## Agent profiles

Edge and fleet agents can store runtime profiles as ordinary memory data. This
keeps HoloScript agents, Claude and Codex seats, and owned-metal workers on one
substrate without baking an operator's node into the package.

```ts
import { buildAgentMemoryProfile, memoryEntryFromAgentProfile } from '@holoscript/memory';

const profile = buildAgentMemoryProfile({
  agentId: process.env.HOLOSCRIPT_AGENT_HANDLE ?? 'edge-agent',
  family: 'holoscript',
  workspaceId: process.env.MEMORY_WORKSPACE,
  nodeProfile: process.env.HOLOSCRIPT_AGENT_NODE_PROFILE,
  mcpUrl: process.env.HOLOSCRIPT_AGENT_MCP_URL,
  tags: ['owned-metal'],
});

await memory.store(memoryEntryFromAgentProfile(profile));
```

Jetson is a reference profile, not a package default. Callers supply their own
MCP URL, storage roots, model host, Postgres, secret provider, and workspace ID.

## Required schema

The client expects `public.memory_entries`. Prefer the explicit
`memory.ensureSchema()` or `holoscript-memory init --json` path. Operators that
manage migrations separately can apply the exported
`SOVEREIGN_MEMORY_SCHEMA_SQL` statements themselves:

```sql
CREATE TABLE IF NOT EXISTS public.memory_entries (
  id              varchar PRIMARY KEY,
  workspace_id    varchar     NOT NULL DEFAULT 'default',
  author_agent    varchar     NOT NULL,
  section         varchar(2),
  type            varchar     NOT NULL,
  content         text        NOT NULL,
  tags            text[]      NOT NULL DEFAULT '{}',
  domain          varchar,
  confidence      real        NOT NULL DEFAULT 0.8,
  provenance_hash varchar,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS memory_entries_workspace_created_idx
  ON public.memory_entries (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS memory_entries_workspace_author_idx
  ON public.memory_entries (workspace_id, author_agent);
CREATE INDEX IF NOT EXISTS memory_entries_workspace_section_idx
  ON public.memory_entries (workspace_id, section);
```

Optional: add a `pgvector` embedding column and HNSW index when semantic search
is layered on top. The base client uses parameterized keyword `ILIKE` recall and
does not require pgvector.

## API

- `new SovereignMemoryStore(config)` accepts a node-postgres `PoolConfig` plus
  optional `workspaceId`.
- `ensureSchema()` performs explicit, idempotent v1 bootstrap under a
  transaction-scoped advisory lock.
- `health()` returns redacted table and column readiness.
- `store(input)` upserts an identity-keyed entry and returns its ID.
- `recall(query, options?)` searches across agent families within one workspace.
- `forget(id)` and `close()` delete within scope and close the pool.
- `buildAgentMemoryProfile()` and `memoryEntryFromAgentProfile()` model portable
  agent runtime profiles.
- `resolveSovereignMemoryConfigFromEnv()` resolves caller-owned configuration
  and a redacted status object.
- `runSovereignMemoryRoundTrip()` runs the ordered proof used by the CLI.

All queries are parameterized. Cloud seats that cannot reach Postgres directly
should use a separate caller-owned orchestrator or API adapter.

## Consumption contract

External users, founder reviewers, and agent operators bring their own Postgres,
workspace ID, credentials, vault or environment provider, and fallback API. This
package does not ship founder-local paths, private database state, GOLD intake,
Jetson defaults, or local hardware as mandatory state.

Agent-operable evidence: run `npx holoscript-memory roundtrip --json` against a
caller-owned test workspace, run the public-consumption gate, and attach the
redacted receipt before promoting a memory integration.

## Support

`v0-preview`: the documented single-table API is stable; optional columns may be
added before v1. MIT licensed.
