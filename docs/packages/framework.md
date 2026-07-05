# @holoscript/framework

`@holoscript/framework` is the agent framework package for memory, learning,
economy, board, behavior, swarm, skills, negotiation, and training surfaces. It
is the canonical replacement path for older broad agent packages such as
`@holoscript/intelligence`.

## Install

```bash
npm install @holoscript/framework
```

## Exports

The package exposes the root entrypoint plus focused subpaths:

- `@holoscript/framework/agents`
- `@holoscript/framework/ai`
- `@holoscript/framework/behavior`
- `@holoscript/framework/board`
- `@holoscript/framework/economy`
- `@holoscript/framework/learning`
- `@holoscript/framework/negotiation`
- `@holoscript/framework/skills`
- `@holoscript/framework/swarm`
- `@holoscript/framework/training`

## Canonical Role

`@holoscript/framework` is in the next cognition wave. It is public and
strategic, but it is not yet part of the v1 fleet install lane. Promote it only
after cold-install and package-consumption checks prove it is safe for laptop,
Jetson, and Vast consumers.

## Related Packages

- `@holoscript/agent-protocol` provides type-only uAA2++ protocol contracts.
- `@holoscript/uaal` provides the VM for deterministic cognitive execution.
- `@holoscript/holoscript-agent` runs brain-mounted agents against HoloMesh.
- `@holoscript/memory` provides the direct shared-memory client.
