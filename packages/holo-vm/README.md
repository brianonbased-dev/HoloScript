# @holoscript/holo-vm

**HOLO VM** — HoloScript's native bytecode execution engine for spatial computing.

Compile `.holo` / `.hsplus` / `.hs` → `.holob` bytecode → run anywhere.

## Quick Start

```ts
import { HoloBytecodeBuilder, HoloVM, GeometryType } from '@holoscript/holo-vm';

const builder = new HoloBytecodeBuilder();
builder.addEntity('MyCube', 0);

const main = builder.addFunction('main');
main.setGeometry(1, GeometryType.Cube)
    .transform(1, 0, 2, -5)
    .halt();

const vm = new HoloVM();
vm.load(builder.build());
const result = vm.tick(16.67);
// result.entityCount = 1, result.status = 'HALTED'
```

## Architecture

- **ECS World** — Entity/Component storage with archetype queries
- **Stack VM** — Operand stack + registers + call stack
- **8 Opcode Families** — Entity, Spatial, Physics, Rendering, Trait, I/O, Control, Agent Bridge
- **`.holob` bytecode** — Compact binary format with string/asset/trait/code/event sections
- **90fps tick loop** — Designed for VR render loops with YIELD support
- **Double-buffered** — Dirty-flag system for minimal render updates

## Scripts

```bash
npm run test    # Run tests
npm run build   # Build to dist/
npm run dev     # Watch mode
```
