# @holoscript/agent-runtime

AI-first second-brain runtime contract helpers for Claude, Codex, HoloScript
edge agents, and sibling agent-family seats. The package core is
public-consumable: callers bring their own config files, memory path policy,
store probes, GOLD-compatible authority reader, MCP route, node profile,
telemetry, and secret provider. Founder-local paths are adapter inputs, not
package requirements.

The canonical source is the public HoloScript monorepo. The package does not
require access to a private integration repository.

## Install

```bash
npm install @holoscript/agent-runtime
```

Install `@holoscript/memory` alongside it when the runtime should read and write
directly to an operator-owned Postgres memory store:

```bash
npm install @holoscript/agent-runtime @holoscript/memory
```

Install the unified provider package and the provider SDKs you use when model
planning should flow through native tool calls:

```bash
npm install @holoscript/agent-runtime @holoscript/llm-provider openai @anthropic-ai/sdk
```

## Executable Second-Brain Runtime

`createSecondBrainRuntime` is the provider-neutral execution contract. Claude,
Codex, a HoloScript agent on owned metal, or a cloud agent supplies the same
adapter set. Provider and hardware lineage are profile metadata, not branching
runtime implementations.

```js
import { createSecondBrainRuntime } from '@holoscript/agent-runtime';
import { SovereignMemoryStore } from '@holoscript/memory';

const memory = new SovereignMemoryStore(operatorOwnedPostgresConfig);

const runtime = createSecondBrainRuntime({
  profile: {
    agentId: 'my-agent',
    family: 'openai', // anthropic, holoscript, other, and future families work too
    surface: 'codex',
    nodeProfile: 'operator-supplied',
  },
  adapters: {
    memory,
    knowledge: myKnowledgeAdapter, // search + publish
    planner: myModelPlanner, // plan
    authority: myPolicyAdapter, // authorize
    executor: myToolExecutor, // execute
    verifier: myEvidenceVerifier, // verify
    telemetry: myTelemetrySink, // emit
    receipts: myCallerOwnedReceiptSink, // write
    recovery: myRecoveryPolicy, // recover
    nextWork: myImprovementFarmer, // farm
  },
  limits: { maxActions: 8, maxTurns: 4 },
});

const turn = await runtime.runTurn({ intent: 'Verify the public package release' });
const loop = await runtime.runLoop({ initialIntent: 'Improve the next safe package gap' });
```

Every turn follows a bounded sequence:

```text
intent -> memory/knowledge recall -> plan -> authority -> act -> verify ->
remember -> publish knowledge -> farm next work -> receipt
```

The returned receipt contains a redacted `decisionNetwork` with typed nodes,
edges, authorization decisions, verification evidence, stop reasons, recovery,
and next work. It is an inspectable decision summary for humans and agents, not
a hidden chain-of-thought transcript. Raw action input and result bodies are not
copied into receipts, and secret-shaped keys and values are redacted.

Required adapters are `memory.recall/store`, `planner.plan`,
`authority.authorize`, `executor.execute`, `verifier.verify`, and
`receipts.write`. Knowledge, telemetry, recovery, and next-work adapters are
optional for a single turn and reported as capabilities. A lights-out loop
should provide all of them. The runtime never silently exceeds its configured
action or turn limits and stops on denied authority, failed verification,
failed continuity writes, aborted signals, or exhausted bounds.

## Provider-Native Planning

`createProviderPlannerAdapter` turns any provider with the shared
`complete(request, model)` contract into a bounded runtime planner. It requires
one native `submit_agent_plan` tool call, an explicit caller-owned action
allow-list, and grounded memory/knowledge citations when requested. It does not
read API keys, authorize actions, execute tools, or copy raw prompts, responses,
request IDs, or headers into receipts.

```js
import {
  createProviderPlannerAdapter,
  createSecondBrainRuntime,
} from '@holoscript/agent-runtime';
import { createOpenAIProvider } from '@holoscript/llm-provider';

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  defaultModel: 'caller-selected-model',
  timeoutMs: 60_000,
  maxRetries: 0,
  reasoningEffort: 'none',
  parallelToolCalls: false,
  store: false,
});

const planner = createProviderPlannerAdapter({
  provider,
  model: 'caller-selected-model',
  allowedActionTypes: ['inspect_public_package'],
  allowedRiskLevels: ['read-only'],
  maxActions: 1,
  maxTokens: 800,
  timeoutMs: 60_000,
  contextPolicy: {
    includeMemoryContent: true, // opt in only for memory safe to send to this provider
    includeMemoryMetadata: false, // IDs are opaque citation handles by default
    includeKnowledgeContent: false,
    includeProfileMetadata: false,
  },
  requireMemoryCitation: true,
});

const runtime = createSecondBrainRuntime({
  profile: { agentId: 'outside-consumer', family: 'openai', surface: 'agent' },
  adapters: {
    memory: callerOwnedMemory,
    planner,
    authority: callerOwnedAuthority,
    executor: callerOwnedTools,
    verifier: callerOwnedVerifier,
    receipts: callerOwnedReceiptSink,
  },
});
```

Planner metadata in the turn receipt includes a frozen prompt-template hash,
exact serializable request/context hashes, requested and provider-reported
identity, native-tool-call status,
token use, elapsed-time and output bounds, supplied/cited memory IDs, and an
action-structure hash. Provider request IDs are hashed. This is external
instrumentation for separating retrieval, generation, and durable memory; it is
not chain-of-thought disclosure.

Only the documented planner telemetry fields are admitted to receipts; arbitrary
planner and action metadata values are omitted. Each stored turn includes the
redacted prompt/request/grounding evidence and a SHA-256 hash of the exact memory
content written by the caller adapter.

Memory and knowledge IDs are represented to the provider as per-request opaque
citation handles. Author, section, type, domain, and tags are also omitted unless
the caller explicitly opts into their metadata policies. Required citations fail
closed when retrieval returns no entries.

The adapter's timer and abort signal bound when the planner rejects. The signal
is forwarded as the third `provider.complete` argument; bundled
`@holoscript/llm-provider` adapters propagate it to OpenAI Responses, Chat
Completions, OpenRouter, and Anthropic streaming transports. Another provider
implementation can be supplied when it honors the same completion shape.

This package owns the common hook contract for:

- memory and store processing: surface pin, memory ceiling check, knowledge sync,
  and WPG extraction;
- context injection: mode injection and GOLD context nudges;
- Codex-specific startup parity: the Codex session-start hook on top of the
  shared Claude/Codex substrate.
- sovereign package-backed memory: optional `@holoscript/memory` configuration,
  direct SoT status, and fallback posture.
- HoloScript edge-agent profiles: optional `@holoscript/holoscript-agent`
  identity, brain, node, MCP, supervisor, and memory posture.
- AI-first runtime status: first-class intent, memory, knowledge, tools,
  decisions, telemetry, receipts, recovery, next actions, second-brain
  continuity, bounded autonomy, and self-improvement farming.
- sovereign seed prompts: top-bun questions and a prompt scaffold for creating a
  caller-owned HoloRepo DB, KS, and GOLD-compatible authority lane.

Callers provide repo-specific readers for project memory, store readiness, and
GOLD intake. The package returns a redacted startup contract suitable for Codex
briefings, Claude parity checks, HoloRepo bootstrap reports, public package
health checks, and future runtime adapters.

```js
import { buildAgentRuntimeContractStatus } from '@holoscript/agent-runtime';

const status = buildAgentRuntimeContractStatus({
  repoRoot,
  env: process.env,
  projectMemoryEnvKeys,
  projectMemoryFileEnvKeys,
  projectMemoryFileCandidates,
  resolveProjectMemoryFile,
  readEcosystemIntegrationStatus,
  goldDriveIntakeStatus,
});
```

The returned status intentionally reports key presence, hook readiness, memory
paths, and GOLD index metadata without emitting secret values.

The `aiFirstRuntime` field answers whether the caller supplied enough adapters
for the runtime to behave like an AI-native second brain instead of a shell
around a chat transcript:

```js
console.log(status.aiFirstRuntime.resources.map((resource) => [resource.id, resource.ready]));
console.log(status.aiFirstRuntime.autonomy.loop);
```

The package does not make autonomy unbounded. It reports stop conditions for
missing authority, destructive or paid operation verifiers, stale telemetry,
failed validation, custody boundaries, and required operator review.

## Sovereign Seed Prompt

Use the seed helper when an outside framework, founder operator, or sibling agent
needs to start from canon without copying founder state. The helper returns
machine-readable questions plus a prompt that tells the agent to build its own
HoloRepo config, DB proof, KS proof, and GOLD-compatible authority bundle through
public packages.

```js
import { buildSovereignSeedPrompt } from '@holoscript/agent-runtime';

const seed = buildSovereignSeedPrompt({
  productName: 'external agent framework',
  masterCanonLabel: 'operator-provided canon capsule',
});

console.log(seed.prompt);
```

The top-bun questions it carries:

| Question ID                | Gate                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `served-audience`          | Name the founder, agent, outside-human, and outside-agent outcome.                                                       |
| `sovereign-novelty`        | Show the owned-storage/proof move and what is novel versus the base workflow.                                            |
| `public-consumption`       | Name the npm, PyPI, MCP, HoloRepo, or cloud rail a cold consumer can use.                                                |
| `db-ks-gold`               | Build caller-owned DB, KS, and GOLD-compatible authority instead of copying founder state.                               |
| `human-agent-fit`          | Provide a human runbook plus an agent-operable JSON/CLI path.                                                            |
| `ai-first-runtime`         | Model intent, memory, knowledge, tools, decisions, telemetry, receipts, recovery, and next actions as runtime resources. |
| `second-brain-continuity`  | Prove durable memory, KS/DB, authority, and handoff continuity across sessions, devices, and agent families.             |
| `autonomous-loop-control`  | Prove bounded plan-act-verify-remember-coordinate-recover-improve operation with stop conditions.                        |
| `self-improvement-farming` | Turn outcomes, failures, telemetry, benchmarks, and package readbacks into the next improvement.                         |
| `self-improvement`         | Name the receipt, benchmark, package gate, or HoloRepo admission that feeds the next pass.                               |

`@holoscript/gold` is named as a future package boundary, not as an install
requirement. Until it is released, consumers create a GOLD-compatible local
authority bundle through caller-owned adapters and migration notes.

## HoloScript Agents

`@holoscript/holoscript-agent` is the headless agent runtime for HoloScript edge
and fleet agents. `agent-runtime` does not run those agents; it describes whether
the caller supplied a complete public profile for one HoloScript agent or a
supervisor config.

```js
import { buildHoloScriptAgentRuntimeProfile } from '@holoscript/agent-runtime';

const profile = buildHoloScriptAgentRuntimeProfile({
  env: {
    HOLOSCRIPT_AGENT_HANDLE: process.env.HOLOSCRIPT_AGENT_HANDLE,
    HOLOSCRIPT_AGENT_BRAIN_PATH: process.env.HOLOSCRIPT_AGENT_BRAIN_PATH,
    HOLOSCRIPT_AGENT_PROVIDER: process.env.HOLOSCRIPT_AGENT_PROVIDER,
    HOLOSCRIPT_AGENT_MODEL: process.env.HOLOSCRIPT_AGENT_MODEL,
    HOLOSCRIPT_AGENT_MCP_URL: process.env.HOLOSCRIPT_AGENT_MCP_URL,
    HOLOSCRIPT_AGENT_READ_ROOTS: process.env.HOLOSCRIPT_AGENT_READ_ROOTS,
    HOLOSCRIPT_AGENT_WRITE_ROOTS: process.env.HOLOSCRIPT_AGENT_WRITE_ROOTS,
    HOLOSCRIPT_AGENT_WALLET_ENV_KEY: 'MY_AGENT_WALLET',
    HOLOSCRIPT_AGENT_BEARER_ENV_KEY: 'MY_AGENT_BEARER',
  },
});
```

Jetson is an owned-metal reference profile, not the package default. Operators
can set `HOLOSCRIPT_AGENT_NODE_PROFILE=jetson-reference` or point
`HOLOSCRIPT_AGENT_SUPERVISOR_CONFIG` at an `agents.json`, but the package never
assumes a Jetson host, LAN IP, NVMe path, Postgres container, model server, or
private vault.

## `@holoscript/memory`

`@holoscript/memory` is an optional peer dependency because some seats only reach
memory through an MCP/orchestrator fallback. `agent-runtime` understands the
package contract without assuming Joseph's Postgres, Jetson, repo path, or vault.
Prefer the public env names from `@holoscript/memory`; HoloScript-specific env
aliases remain adapters for this ecosystem.

```js
import {
  buildSovereignMemoryPackageConfig,
  loadMemoryPackage,
  createSovereignMemoryStore,
} from '@holoscript/agent-runtime';

const config = buildSovereignMemoryPackageConfig({
  env: {
    MEMORY_PGHOST: process.env.MEMORY_PGHOST,
    MEMORY_PGPORT: process.env.MEMORY_PGPORT,
    MEMORY_PGDATABASE: process.env.MEMORY_PGDATABASE,
    MEMORY_PGUSER: process.env.MEMORY_PGUSER,
    MEMORY_PGPASSWORD: process.env.MEMORY_PGPASSWORD,
    MEMORY_WORKSPACE: process.env.MEMORY_WORKSPACE,
  },
});
const loaded = await loadMemoryPackage();

if (loaded.ok && config.directSot.configured) {
  const store = createSovereignMemoryStore({
    memoryModule: loaded.module,
    env: process.env,
  });
  await store.close();
}
```

The bridge never prints `MEMORY_PGPASSWORD` or `MEMORY_SVC_PASSWORD`; it reports
only whether the scoped credential is present. Public consumers should use
`MEMORY_PGPASSWORD`; the `MEMORY_SVC_PASSWORD` alias is kept only for the
HoloScript deployment lane.

## Consumption Rule

When this package grows, add the public contract first:

- named export from `@holoscript/agent-runtime`;
- caller-supplied adapters instead of repo-private imports;
- redacted env/status objects instead of secrets or local paths;
- package-local tests that run from a cold checkout;
- README examples that work for an external operator.

Local Codex/Claude startup scripts and HoloScript Jetson deployment scripts may
import this package from source inside the founder repo, but that is validation
evidence for the package, not the package boundary itself.

## Release Boundary

Release lane: `v0-preview`. Supported behavior is redacted runtime contract
building, public memory-package posture checks, bounded second-brain turn/loop
execution, decision-network receipts, and HoloScript edge-agent profile
description from caller-owned inputs. Known limitations: the package does not
choose a model, grant its own authority, open private repos, own credentials, or
guarantee a specific Jetson, Claude, Codex, or HoloScript deployment. Roll back
by pinning the previous npm version and keeping local startup adapters outside
the public package contract.
