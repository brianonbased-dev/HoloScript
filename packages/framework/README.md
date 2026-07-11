# @holoscript/framework

The HoloScript agent/app framework — where agents **remember, learn, and earn**.
It gives an application the building blocks for knowledge-compounding, multi-agent
orchestration: composable **traits**, a **knowledge store** (local-first with
optional remote federation), and a **self-improvement** scanner that mines a
codebase and knowledge base for improvement work.

```bash
npm install @holoscript/framework
```

## What's in the box

- **Knowledge store** — local in-memory store (optional JSON persistence) with an
  opt-in remote federation path (publish / search / semantic search / sync).
- **Self-improve** — an absorb scanner that queries a knowledge store and scans
  local sources for improvement tasks.
- **Traits / agents / economy / swarm / board** — subpath exports for composing
  agent behavior, coordination, and knowledge-marketplace primitives.

## Usage

Everything network-facing is **caller-configured**. The knowledge store is fully
functional offline; remote federation only activates when you supply a URL and
key from your own environment.

```ts
import { KnowledgeStore } from '@holoscript/framework';

const store = new KnowledgeStore({
  persist: false,
  // Remote federation is OPT-IN — omit these to stay fully local.
  remoteUrl: process.env.HOLOMESH_ORCHESTRATOR_URL, // your orchestrator endpoint
  remoteApiKey: process.env.HOLOSCRIPT_API_KEY, // injected from your vault/env
});

// Local-first: works with no remote configured.
store.publish(
  { type: 'wisdom', content: 'Always use strict TypeScript', domain: 'compilation', confidence: 0.9, source: 'agent-a' },
  'agent-a'
);

// Remote calls are workspace-scoped. Set HOLOMESH_WORKSPACE to your own scope;
// otherwise the neutral 'default' workspace is used.
const hits = await store.semanticSearch('typescript');
```

## Configuration

| Env var | Purpose | Default when unset |
|---|---|---|
| `HOLOMESH_WORKSPACE` | Workspace scope tag sent with remote knowledge calls | `'default'` |
| `HOLOSCRIPT_API_KEY` | Auth key for the remote orchestrator (self-improve scanner) | none (remote calls no-op) |

The remote URL and key are passed in through `KnowledgeConfig` / `AbsorbScanConfig`
or read from your environment — the package ships **no** default host, key, or
private workspace.

## Package boundary & release posture

This is a **v0-preview** consumer package: the HoloScript agent/app framework
(traits, knowledge store, self-improve). It is for **external users, founder
reviewers, and agent operators** building on top of the framework — not an
internal script.

Config is **caller-owned / bring-your-own**: you supply the remote orchestrator
URL, API key, and workspace scope via your own env / vault. The package does
**not** default consumers into any private workspace — remote knowledge calls are
scoped by `HOLOMESH_WORKSPACE`, and when it is unset the neutral `'default'`
workspace is used, **not** the maintainer's workspace. Nothing here is the
package default: no host, key, path, or private state ships baked in.

**Known limitations:** the knowledge store's remote federation targets a
knowledge-store HTTP contract (`/knowledge/query`, `/knowledge/sync`) that *you*
provide or point at; with no remote configured the store runs local-only and
remote-dependent methods degrade gracefully to empty/no-op results. The
self-improve scanner reports improvement tasks — it does not apply changes.
Interfaces may change before the v1 release. MIT licensed.
