# @holoscript/memory

`@holoscript/memory` is the installable client for the shared sovereign
HoloScript agent-memory substrate. It gives Claude, Codex, Gemini, Copilot,
edge agents, and other seats one identity-keyed memory surface instead of
family-specific memory silos.

## Install

```bash
npm install @holoscript/memory
```

## Use

```ts
import { SovereignMemoryStore } from '@holoscript/memory';

const memory = new SovereignMemoryStore({
  host: '127.0.0.1',
  port: 5434,
  database: 'knowledge',
  user: 'memory_svc',
  password: process.env.MEMORY_SVC_PASSWORD,
});

await memory.store({
  authorAgent: 'codex1',
  section: 'D',
  tags: ['fleet'],
  content: 'Fleet memory is shared through the sovereign substrate.',
});

const entries = await memory.recall('fleet', { section: 'D' });
```

## Canonical Role

This package is part of the v1 fleet lane. Laptop, Jetson, and Vast consumers
should depend on it when they need shared agent memory, while deployment-specific
credentials stay in vault-managed environment variables.

## Related Packages

- `@holoscript/mcp-server` exposes agent tools that can consume memory.
- `@holoscript/holoscript-agent` is the headless runtime that can write and
  recall memory during ticks.
- `@holoscript/framework` owns higher-level agent orchestration patterns.
