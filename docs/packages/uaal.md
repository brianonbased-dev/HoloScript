# UAAL

**Universal Autonomous Agent Language VM for stack-based bytecode execution.**

## Overview

`@holoscript/uaal` is the execution engine for the uAA2++ protocol and related agent workflows, designed to run cognitive cycles in a deterministic virtual-machine style environment.

## Installation

```bash
npm install @holoscript/uaal
```

## Use When

- You need a VM for autonomous agent execution.
- You want protocol-driven cognitive cycles separated from scene runtime code.
- You are building agent systems that need bytecode-style execution.

## Key Capabilities

- Stack-based virtual machine for agent logic.
- Foundation for uAA2++ protocol execution.
- Designed to pair with scene runtimes through bridge packages.
- Importable semantic gates through `@holoscript/uaal/semantic` for false-belief, telos, and containment recoverability checks.

## Semantic Harness

Use the semantic subpath when an agent needs to test whether uAAL v2 structure carries meaning instead of only replaying labels:

```ts
import { benchmarkContainment, benchmarkTelos, benchmarkTheoryOfMind } from '@holoscript/uaal/semantic';
```

The public package exports the pure recovery and benchmark functions. Corpus synthesis, harvest notes, receipts, and founder research state stay in the private ecosystem workspace.

## See Also

- [Agent Protocol](./agent-protocol.md)
- [VM Bridge](./vm-bridge.md)
- [Holo VM](./holo-vm.md)
