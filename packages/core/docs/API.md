# HoloScript Core API Reference

## Parser

```typescript
import { HoloScriptPlusParser } from '@holoscript/core';
const parser = new HoloScriptPlusParser();
const result = parser.parse(source); // { success, ast, errors }
```

## Compilers

### R3FCompiler

```typescript
import { R3FCompiler } from '@holoscript/core';
const compiler = new R3FCompiler({ typescript: true });
const jsx = compiler.compile(composition);
```

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

1,800+ traits organized across 74 category files in `src/traits/constants/`.

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
