# `@holoscript/agent-managed`

Typed Claude Managed Agents control-plane contracts and lifecycle evidence for
HoloScript.

```bash
pnpm add @holoscript/agent-managed
```

The package is a provider boundary, not a new source of agent identity,
repository truth, memory authority, or GOLD. Anthropic environments and memory
stores are optional external backends. Every lifecycle webhook must be verified
with a signing secret resolved through a caller-supplied HoloKey adapter before
it can produce CAEL and uAAL projections.

External consumers provide caller-owned Anthropic configuration, credentials,
storage, HoloKey resolver, and replay ledger. The package does not ship
founder-local configuration, a private workspace, webhook secrets, or a hosted
Managed Agents environment.

The support boundary is `v0-preview`: typed contracts and deterministic receipt
replay are supported, while live Anthropic provisioning and promotion into a V1
fleet lane remain outside this package.

## Current Managed Agents contracts

The default entry point covers the July 22, 2026 API additions:

- model `effort` on agent configuration;
- optional `version` on updates, with explicit optimistic-concurrency versus
  last-write-wins disposition;
- up to 50 `initial_events` when creating a session;
- thread-scoped `event_deltas[]` for `agent.message` and `agent.thinking`;
- four `environment.*` and three `memory_store.*` lifecycle webhooks.

```ts
import {
  buildManagedAgentSessionCreateInput,
  buildManagedAgentThreadStreamRequest,
} from '@holoscript/agent-managed';

const session = buildManagedAgentSessionCreateInput({
  agent: 'agent_123',
  environment_id: 'env_123',
  initial_events: [
    {
      type: 'user.message',
      content: [{ type: 'text', text: 'Inspect the repository.' }],
    },
  ],
});

const threadStream = buildManagedAgentThreadStreamRequest({
  sessionId: 'session_123',
  threadId: 'thread_123',
  eventDeltas: ['agent.message'],
});
```

## Signed lifecycle receipts

```ts
import { verifyAnthropicLifecycleWebhook } from '@holoscript/agent-managed';

const receipt = await verifyAnthropicLifecycleWebhook({
  body: rawRequestBody,
  headers: requestHeaders,
  secretRef: {
    provider: 'holokey',
    keyId: 'anthropic-managed-agents-webhook',
  },
  resolveSecret: (reference) => holoKey.resolveWebhookSecret(reference),
  replayGuard: receiptLedger,
});
```

The verifier uses Anthropic's Standard Webhooks signature format and rejects
missing headers, invalid signatures, deliveries outside the five-minute
freshness window, expired HoloKey resolutions, mismatched event IDs, unsupported
event types, and replay-ledger duplicates or conflicts.

Receipts carry deterministic:

- `cael.external-agent-lifecycle.v1` evidence;
- `uaal.external-lifecycle-receipt.v1` operation and replay evidence;
- body, signature-header, HoloKey-reference, evidence, and receipt hashes;
- a delivery-independent event hash so signed retries deduplicate without
  conflating a changed payload under the same event ID;
- a hard authority boundary: external memory is not source-of-truth, GOLD, or a
  direct memory-promotion path.

Use `verifyManagedAgentLifecycleReceipt()` or
`replayManagedAgentLifecycleReceipt()` to reproduce the projection and check
integrity without retaining the webhook secret.

## Existing execution adapter

The established quarantine-first `ClaudeManagedAgentAdapter` remains canonical
in `@holoscript/core/self-improvement`. Import it directly; this package does
not copy it or make the lifecycle verifier depend on the full core runtime:

```ts
import { ClaudeManagedAgentAdapter } from '@holoscript/core/self-improvement';
```
