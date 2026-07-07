# @holoscript/uaal

**uAAL** — Universal Autonomous Agent Language Virtual Machine.  
Stack-based bytecode execution engine for the **uAA2++ 7-Phase Protocol**.

## Quick Start

```ts
import { UAALVirtualMachine, UAALCompiler, UAALOpCode } from '@holoscript/uaal';

const vm = new UAALVirtualMachine();
const compiler = new UAALCompiler();

// Build a full 7-phase cognitive cycle
const bytecode = compiler.buildFullCycle('Analyze the market data');
const result = await vm.execute(bytecode);
// result.taskStatus === 'HALTED'
```

## Custom Handlers

The `registerHandler()` API is the extension point. Your private services inject logic without modifying the VM core:

```ts
vm.registerHandler(UAALOpCode.OP_INVOKE_LLM, async (proxy, operands) => {
  const result = await myLLMService.call(operands[0] as string);
  proxy.push(result);
});
```

## Semantic Harness

`@holoscript/uaal/semantic` exposes the pure structural gates used by the uAAL v2 corpus work. Agents can consume these functions without the private corpus generator or receipt CLI:

```ts
import {
  benchmarkAffordance,
  benchmarkComposition,
  benchmarkCounterfactual,
  benchmarkTheoryOfMind,
  recoverFalseBelief,
} from '@holoscript/uaal/semantic';

const recovery = recoverFalseBelief(ir);
const gate = benchmarkTheoryOfMind([{ completion: JSON.stringify(ir), metadata }]);
// gate.pass === true when belief, perspective, causal, and falsification checks hold
```

The harness covers theory-of-mind false belief, beneficiary reachability/telos, agent-relative containment/occlusion, body-relative affordance, temporal stale-vs-error separation, deontic force, commitment discharge, counterfactual necessity, per-modality sensory access, and a world-composition capstone that verifies the verticals compose in one IR.

## 7-Phase Protocol

| Phase       | OpCode | Purpose                                                           |
| ----------- | ------ | ----------------------------------------------------------------- |
| 0. INTAKE   | `0x10` | Gather data and context                                           |
| 1. REFLECT  | `0x11` | Analyze and understand                                            |
| 2. EXECUTE  | `0x14` | Take action                                                       |
| 3. COMPRESS | `0x12` | Store knowledge efficiently                                       |
| 4. DREAMING | `0x15` | Validate and re-evaluate compressed knowledge (`REINTAKE` opcode) |
| 5. GROW     | `0x16` | Learn patterns, wisdom, gotchas                                   |
| 6. EVOLVE   | `0x17` | Adapt and optimize                                                |

## Scripts

```bash
npm run test    # Run tests
npm run build   # Build to dist/
npm run dev     # Watch mode
```
