# @holoscript/holo-vm

**HOLO VM** — HoloScript's sovereign bytecode execution engine for semantic systems programs.

Compile `.holo` / `.hsplus` / `.hs` programs → `.holob` bytecode → execute them in an owned VM.

## Installation

```bash
npm install @holoscript/holo-vm
```

## Quick Start

```ts
import { HoloBytecodeBuilder, HoloVM, GeometryType } from '@holoscript/holo-vm';

const builder = new HoloBytecodeBuilder();
builder.addEntity('MyCube', 0);

const main = builder.addFunction('main');
main.setGeometry(1, GeometryType.Cube).transform(1, 0, 2, -5).halt();

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

## Package boundary & release posture

`@holoscript/holo-vm` targets external and public consumers — operators, founders, and agent-framework integrators embedding a spatial-computing bytecode VM into their own runtime. It ships the ECS world, stack VM, opcode families, and `.holob` bytecode format only; it does not ship a renderer, a network client, or founder-local paths.

Bring your own host loop: you own the tick cadence, the `.holob` bytecode you load (compiled from your own `.holo`/`.hsplus`/`.hs` sources via `@holoscript/core`), and any I/O bridge you wire through the Agent Bridge opcode family. Configuration is caller-provided — there is no environment-variable or file-path default baked in.

Package boundary: this package executes bytecode only. It does not ship a compiler, a physics engine beyond its own opcode handlers, or any private-workspace default — anything outside VM execution is a caller-owned adapter.

Release posture: v0-preview. Known limitations — the opcode set and `.holob` binary format are still evolving alongside `@holoscript/core`, so bytecode compiled against one version may not be forward-compatible; pin exact versions and validate via `npm run test` before upgrading. There is no in-VM rollback — snapshot/restore of world state is a caller-owned responsibility.

## License

MIT License - See [LICENSE](./LICENSE) for details.
