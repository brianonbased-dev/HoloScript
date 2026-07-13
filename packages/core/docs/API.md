# HoloScript Core API Reference

## Parser

```typescript
import { HoloScriptPlusParser } from '@holoscript/core';
const parser = new HoloScriptPlusParser();
const result = parser.parse(source); // { success, ast, errors }
```

## Compilers

### SceneIRCompiler + R3F TSX Emitter

```typescript
import { SceneIRCompiler, emitSceneIRTsx } from '@holoscript/core/compiler';

const compiler = new SceneIRCompiler();
const sceneIR = compiler.compileComposition(composition, agentToken, 'scene.holo');
const tsx = emitSceneIRTsx(sceneIR, { sourcePath: 'scene.holo' });
```

For agents and tools, prefer `hs compile scene.holo --target r3f -o scene.tsx`
or MCP `compile_to_r3f`. The R3F output is generated from SceneIR and delegates
runtime interpretation to `@holoscript/r3f-renderer`; do not hand-write product
scene `.tsx`.

### VisionOSCompiler

```typescript
import { VisionOSCompiler } from '@holoscript/core';
const compiler = new VisionOSCompiler();
const swift = compiler.compile(composition);
```

### USDZPipeline

```typescript
import { generateUSDA } from '@holoscript/core';
const usda = generateUSDA(composition, { upAxis: 'Y' });
```

### IncrementalCompiler

```typescript
import { IncrementalCompiler } from '@holoscript/core';
const compiler = new IncrementalCompiler();
const result = compiler.compile(ast, compileFunc, { preserveState: true });
```

## Traits

Traits are organized under `src/traits/constants/`. Pull live counts from the
repository instead of copying hardcoded totals into docs.

**Core:** `@physics`, `@grabbable`, `@hoverable`, `@clickable`, `@spatial_audio`
**UI:** `@ui_floating`, `@ui_anchored`, `@ui_hand_menu`, `@ui_billboard`
**Game:** `@collectible`, `@destructible`, `@lootable`, `@quest_item`
**Magic:** `@enchantable`, `@cursed`, `@elemental_fire`, `@telekinetic`
**Nature:** `@growable`, `@bioluminescent`, `@aquatic`, `@metamorphic`

```typescript
// Import all traits
import { VR_TRAITS } from '@holoscript/core';

// Import specific categories
import { GAME_MECHANICS_TRAITS, MAGIC_FANTASY_TRAITS } from '@holoscript/core';
```

## Error Recovery

```typescript
import { ErrorRecovery } from '@holoscript/core';
const recovery = new ErrorRecovery();
const error = recovery.analyzeError(msg, source, line, col);
console.log(recovery.formatError(error));
```

## Training Data

```typescript
import { TrainingDataGenerator } from '@holoscript/core';
const gen = new TrainingDataGenerator();
const examples = gen.generate({ categories: ['geometry'], count: 10 });
```
