# Holo VM

Package: @holoscript/holo-vm

Native bytecode execution engine for HoloScript workloads.

## Main Exports

- HoloBytecodeBuilder, HoloFunctionBuilder
- HoloVM, ECSWorld, VMStatus
- HoloOpCode and opcode metadata helpers
- Bytecode schema constants and types

## What It Solves

- Build and run .holob bytecode across runtime targets.
- Execute deterministic VM ticks for simulation and scene logic.
- Represent entity/component operations through compact opcodes.

## Typical Usage

```ts
import { HoloBytecodeBuilder, HoloVM, GeometryType } from '@holoscript/holo-vm';

const builder = new HoloBytecodeBuilder();
const main = builder.addFunction('main');
main.spawn(0, 'Cube').setGeometry(1, GeometryType.Cube).transform(1, 0, 1, -5).halt();
builder.addEntity('Cube', 0);

const vm = new HoloVM();
vm.load(builder.build());
const frame = vm.tick(16.67);
console.log(frame.status);
```
