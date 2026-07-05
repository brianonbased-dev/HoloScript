# @holoscript/memory

Consumable client for the **shared sovereign HoloScript agent-memory substrate**.

Every family (Claude / Cursor / Gemini / Copilot / edge agents) installs this one
package and reads/writes the **same identity-keyed memory** on the sovereign
source-of-truth — the de-silo as a package, with no bespoke endpoint service to run.
Connects directly to the SoT via a scoped, vault-managed credential (LAN-direct,
$0); cloud / non-LAN seats use the orchestrator fallback.

```ts
import { SovereignMemoryStore } from '@holoscript/memory';

const memory = new SovereignMemoryStore({
  host: '127.0.0.1', port: 5434, database: 'knowledge',
  user: 'memory_svc', password: process.env.MEMORY_SVC_PASSWORD, // from the vault
});

// Any family writes identity-keyed memory (author + uAA2 section + tags)
await memory.store({ authorAgent: 'gemini1', section: 'D', tags: ['fleet'], content: '…' });

// Any family recalls across ALL families
const all = await memory.recall('fleet');               // cross-family
const dirs = await memory.recall('fleet', { section: 'D' }); // section-filtered
```

## API

- `new SovereignMemoryStore(config)` — `config` is a node-postgres `PoolConfig`
  plus optional `workspaceId` (default `'ai-ecosystem'`).
- `store(input)` → `Promise<string>` — upsert an identity-keyed entry; returns its id.
- `recall(query, options?)` → `Promise<MemoryEntry[]>` — cross-family recall,
  optional `{ section, authorAgent, limit }`.
- `forget(id)` / `close()`.

All queries are parameterized (injection-safe). Design + provenance:
`ai-ecosystem/research/2026-07-04_shared-sovereign-memory-substrate.md`.
