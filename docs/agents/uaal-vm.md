# UAAL VM

**Package**: `@holoscript/uaal`

The **Universal Autonomous Agent Language (UAAL) VM** is HoloScript's bytecode execution runtime for autonomous agents. It provides a sandboxed, deterministic environment for agent behavior programs — enabling hot-reload, reproducible replays, cross-platform deployment, and tamper-evident execution logging.

---

## Architecture

```
HoloScript Source (.hs / .hsplus)
         │
         ▼
    uAA2++ Compiler
         │
         ▼
    UAAL Bytecode (.uaal)
         │
    ┌────┴────────────────────────────┐
    ▼                                 ▼
UAAL VM (Node.js / WASM)      UAAL VM (Edge / IoT)
    │                                 │
    ▼                                 ▼
Spatial Scene                 Neuromorphic Hardware
```

---

## UAAL Bytecode Format

UAAL is a stack-based bytecode format optimised for spatial agent programs. A compiled agent typically contains:

| Section          | Purpose                                           |
| ---------------- | ------------------------------------------------- |
| `header`         | Agent ID, version, capabilities, protocol version |
| `perception`     | Bytecode for the Perceive phase                   |
| `reasoning`      | Bytecode for the Reason phase                     |
| `actions`        | Bytecode for Execute phase action handlers        |
| `state_schema`   | Typed state layout for CRDT synchronisation       |
| `event_handlers` | Spatial event subscriptions                       |

Example header (binary represented as structured YAML for readability):

```yaml
magic: UAAL
version: 2
agent_id: patrol-agent-42
capabilities: [pathfinding, spatial_audio, llm_reasoning]
lifecycle: seven-phase
crdt_schema: v3
```

---

## VM API

### Create and Run a VM Instance

```ts
import { UAALVirtualMachine } from '@holoscript/uaal';

const vm = new UAALVirtualMachine({
  maxMemory: '64mb',
  maxCycles: 1_000_000,
  sandbox: true, // isolate from host filesystem
  deterministic: true, // enables replay
});

// Load compiled bytecode
await vm.load('./agents/patrol-agent.uaal');

// Attach to a scene
vm.attachScene(scene);

// Start the agent lifecycle
await vm.start();
```

### Hot-Reload

```ts
// Watch for bytecode changes and reload without restarting the scene
vm.watch('./agents/patrol-agent.uaal', {
  strategy: 'state-preserving', // migrate current state to new version
});
```

### Replay

```ts
// Record execution
const recording = await vm.record({ duration: 60_000 });

// Deterministic replay — bit-exact on same bytecode
await vm.replay(recording, { speed: 2.0 });
```

### Tamper-Evident Execution Log

```ts
// Get a cryptographic log of agent actions
const log = await vm.exportLog();
console.log(log.hash); // SHA-256 of execution trace
console.log(log.entries); // timestamped action records
```

---

## Compiling to UAAL Bytecode

```bash
# Compile a single agent
holo compile my-agent.hsplus --target uaal --out ./agents/

# Compile all agents in a directory
holo compile agents/ --target uaal --out ./dist/agents/

# Bundle with runtime (for edge deployment)
holo compile my-agent.hsplus --target uaal --bundle-runtime --out ./edge/
```

---

## Edge & IoT Deployment

UAAL VM ships as a WebAssembly module for environments without Node.js:

```ts
// Browser / Edge
import { UAALVirtualMachine } from '@holoscript/uaal/wasm';

const vm = new UAALVirtualMachine({ mode: 'wasm' });
await vm.load(bytecodeArrayBuffer);
await vm.start();
```

For neuromorphic hardware targets, the UAAL compiler emits NIR (Neuromorphic Intermediate Representation) which the [Neuromorphic Compiler](../compilers/neuromorphic) maps to Loihi2 or SpiNNaker:

```bash
holo compile snn-agent.hs --target neuromorphic --platform loihi2
```

---

## Sandbox Security

The UAAL VM runs agents in a strict sandbox:

- **No filesystem access** by default (explicit allow-list required)
- **No network access** unless `@networked` trait is declared
- **Memory limit** enforced per-agent
- **Cycle budget** prevents infinite loops
- **Capability gating** — agents can only use declared capabilities

```ts
const vm = new UAALVirtualMachine({
  sandbox: {
    filesystem: false,
    network: false,
    allowedCapabilities: ['pathfinding', 'spatial_audio'],
  },
  limits: {
    memory: '32mb',
    cycles: 500_000,
    wallTime: 5_000, // ms
  },
});
```

---

## State Synchronisation (CRDT)

Agent state is synchronised via `@holoscript/crdt` — conflict-free replicated data types suitable for distributed spatial scenes:

```ts
import { UAALVirtualMachine } from '@holoscript/uaal';
import { SpatialCRDT } from '@holoscript/crdt';

const crdt = new SpatialCRDT({ transport: 'websocket' });

const vm = new UAALVirtualMachine({
  stateSync: crdt, // agent state auto-syncs across replicas
});
```

---

## Installation

```bash
pnpm add @holoscript/uaal
```

```ts
import { UAALVirtualMachine } from '@holoscript/uaal';
```

---

## Related

- [Agent Framework Overview](./index)
- [uAA2++ Protocol](./uaa2-protocol)
- [Neuromorphic Compiler](../compilers/neuromorphic)
- [WASM Compiler](../compilers/wasm)
