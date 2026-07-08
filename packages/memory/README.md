# @holoscript/memory

Consumable client for a **shared sovereign agent-memory substrate**.

Every agent family (Claude / Cursor / Gemini / Copilot / edge agents) installs this
one package and reads/writes the **same identity-keyed memory** on a source-of-truth
Postgres **you own** — the de-silo as a package, with no bespoke endpoint service to
run. You bring the Postgres and inject a scoped credential from your own vault/env;
this package never embeds a host, port, or secret.

```bash
npm install @holoscript/memory
```

## Usage

Point the client at your own Postgres. Read connection details from your
environment — the package ships no defaults for host/port/password.

```ts
import { SovereignMemoryStore } from '@holoscript/memory';

const memory = new SovereignMemoryStore({
  host: process.env.MEMORY_PGHOST,          // your Postgres host
  port: Number(process.env.MEMORY_PGPORT ?? 5432),
  database: process.env.MEMORY_PGDATABASE,  // e.g. 'knowledge'
  user: process.env.MEMORY_PGUSER,          // a scoped, least-privilege role
  password: process.env.MEMORY_PGPASSWORD,  // injected from your vault
  workspaceId: process.env.MEMORY_WORKSPACE, // optional scope tag (default 'default')
});

// Any family writes identity-keyed memory (author + uAA2 section + tags)
await memory.store({ authorAgent: 'gemini1', section: 'D', tags: ['fleet'], content: '…' });

// Any family recalls across ALL families in the current workspace
const all = await memory.recall('fleet');                // cross-family, workspace-scoped
const dirs = await memory.recall('fleet', { section: 'D' }); // section-filtered
```

## Agent profiles

Edge and fleet agents can store their runtime profile as ordinary memory data.
This keeps HoloScript agents, Claude/Codex seats, and owned-metal workers on the
same memory substrate without baking any operator's node into the package.

```ts
import {
  buildAgentMemoryProfile,
  memoryEntryFromAgentProfile,
} from '@holoscript/memory';

const profile = buildAgentMemoryProfile({
  agentId: process.env.HOLOSCRIPT_AGENT_HANDLE ?? 'edge-agent',
  family: 'holoscript',
  workspaceId: process.env.MEMORY_WORKSPACE,
  nodeProfile: process.env.HOLOSCRIPT_AGENT_NODE_PROFILE, // e.g. 'jetson-reference'
  mcpUrl: process.env.HOLOSCRIPT_AGENT_MCP_URL,
  tags: ['owned-metal'],
});

await memory.store(memoryEntryFromAgentProfile(profile));
```

Jetson is only a reference profile. Callers supply their own MCP URL, storage
roots, model host, Postgres, wallet/bearer secret provider, and workspace id.
The package stores the profile; it does not assume a LAN IP, NVMe path,
Postgres container, or vault layout.

## Required schema

The client expects a `memory_entries` table. Create it once in your database:

```sql
CREATE TABLE IF NOT EXISTS memory_entries (
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
CREATE INDEX IF NOT EXISTS memory_entries_author_idx  ON memory_entries (author_agent);
CREATE INDEX IF NOT EXISTS memory_entries_section_idx ON memory_entries (section);
```

Optional: add a `pgvector` `embedding vector(N)` column + HNSW index if you layer
semantic search on top (populate it with your own encoder; this client uses
keyword `ILIKE` recall and does not require it).

## API

- `new SovereignMemoryStore(config)` — `config` is a node-postgres `PoolConfig`
  plus optional `workspaceId` (default `'default'`).
- `store(input)` → `Promise<string>` — upsert an identity-keyed entry; returns its id.
- `recall(query, options?)` → `Promise<MemoryEntry[]>` — cross-family recall
  within the configured workspace, optional `{ section, authorAgent, limit }`.
- `forget(id)` / `close()` — deletion is scoped to the configured workspace.
- `buildAgentMemoryProfile(input)` and `memoryEntryFromAgentProfile(profile)` for
  portable agent runtime profile memory.

All queries are parameterized (injection-safe). Cloud / non-LAN seats that cannot
reach the Postgres directly should use a separate orchestrator/API fallback.

## Support

`v0-preview` — the API surface above is stable for the documented single-table
contract; the schema may gain optional columns before `v1`. MIT licensed.
