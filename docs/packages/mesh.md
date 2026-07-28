# @holoscript/mesh

`@holoscript/mesh` is the network and collaboration runtime package for
HoloScript. It gathers lower-level messaging, collaboration sessions, sync
helpers, consensus utilities, multiplayer primitives, and sovereign mesh state
survivability behind one installable package.

## Install

```bash
npm install @holoscript/mesh
```

## Use

```ts
import { AgentMessaging, CollaborationSession, NetEntitySync } from '@holoscript/mesh';
```

## Package Surface

The root export is the canonical package surface. Subpath exports are available
for package-internal module boundaries, but consumers should prefer root imports
unless they are deliberately depending on a specific subsystem.

| Subsystem       | Purpose                                               |
| --------------- | ----------------------------------------------------- |
| `network`       | Shared network primitives and entity sync             |
| `messaging`     | Agent channels, message schemas, and channel manager  |
| `collaboration` | CRDT-backed document/session collaboration            |
| `consensus`     | Consensus helpers for coordinated state               |
| `social`        | Social graph and coordination utilities               |
| `sovereign`     | Identity and state survivability helpers              |
| `multiplayer`   | Shared multiplayer runtime primitives                 |
| `sync`          | High-frequency sync, quantization, and jitter buffers |

## Strategy Role

This package is a supported runtime module, not a default v1 fleet install.
Use it when a package or service needs lower-level network, messaging,
collaboration, or replicated-state primitives.

Higher-level agent orchestration belongs in `@holoscript/framework` and
`@holoscript/agent-protocol`. Shared memory belongs in `@holoscript/memory`.
Authenticated agent tool dispatch belongs in `@holoscript/mcp-server`.

Promote `@holoscript/mesh` into the laptop, Jetson, and Vast consumption matrix
only when a concrete fleet consumer needs to install mesh directly rather than
receiving it transitively through a higher-level package.

## Validation

```bash
corepack pnpm --filter @holoscript/mesh run build
corepack pnpm --filter @holoscript/mesh run test
corepack pnpm run package:opportunity-map
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
```
