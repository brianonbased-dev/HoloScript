# Contributing a New Compiler Target

> How to add a new platform compiler to HoloScript.

## Overview

HoloScript compiles to 18+ targets. Each compiler transforms the parsed AST into platform-specific code. This guide walks through adding a new one.

## Architecture

```text
Parsed AST (HoloComposition / HoloScriptAST)
    │
    ▼
┌──────────────────────────────────┐
│  CrossRealityTraitRegistry       │
│  (maps traits → platform code)   │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│  YourCompiler.compile(ast)       │
│  ├── Walk AST nodes              │
│  ├── Map traits → platform API   │
│  ├── Generate output code        │
│  └── Return compiled output      │
└──────────────────────────────────┘
```

## Step 1: Create the Compiler Class

Create `packages/core/src/compiler/YourPlatformCompiler.ts`:

```typescript
import type { HoloComposition } from '../composition/CompositionParser';

export class YourPlatformCompiler {
  compile(composition: HoloComposition): string {
    let output = '';

    // Walk composition objects
    for (const obj of composition.objects) {
      output += this.compileObject(obj);
    }

    return output;
  }

  private compileObject(obj: CompositionObject): string {
    let code = `// Object: ${obj.name}\n`;

    // Map each trait to platform-specific code
    for (const trait of obj.traits) {
      code += this.compileTrait(trait);
    }

    return code;
  }

  private compileTrait(trait: Trait): string {
    switch (trait.name) {
      case 'physics':
        return `addRigidbody(${JSON.stringify(trait.params)});\n`;
      case 'grabbable':
        return `makeGrabbable();\n`;
      default:
        return `// Unsupported trait: ${trait.name}\n`;
    }
  }
}
```

## Step 2: Register in CompilerBridge

Add your compiler to `packages/core/src/compiler/CompilerBridge.ts`:

```typescript
import { YourPlatformCompiler } from './YourPlatformCompiler';

// In the target registry:
case 'your-platform':
  return new YourPlatformCompiler();
```

## Step 3: Update TraitSupportMatrix

Register supported traits in `packages/core/src/traits/TraitSupportMatrix.ts`:

```typescript
// Add your platform to the support matrix
{
  platform: 'your-platform',
  supported: ['physics', 'grabbable', 'audio', 'visual'],
  partial: ['networking'],
  unsupported: ['vrchat-specific'],
}
```

## Step 4: Add CLI Support

Update `packages/cli/src/args.ts` to include your target:

```typescript
// In the --target choices:
choices: [...existing, 'your-platform'],
```

## Step 5: Write Tests

Create `packages/core/src/compiler/__tests__/YourPlatformCompiler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { YourPlatformCompiler } from '../YourPlatformCompiler';

describe('YourPlatformCompiler', () => {
  const compiler = new YourPlatformCompiler();

  it('compiles a basic scene', () => {
    const output = compiler.compile(testComposition);
    expect(output).toContain('addRigidbody');
  });

  it('handles unsupported traits gracefully', () => {
    const output = compiler.compile(compositionWithUnknownTrait);
    expect(output).toContain('// Unsupported trait');
  });
});
```

## Step 6: Add Documentation

Create `docs/compilers/your-platform.md`:

```markdown
# Your Platform Compiler

## Usage

holoscript compile scene.holo --target your-platform

## Supported Traits

...

## Output Format

...
```

## Existing Compilers (Reference)

| Compiler           | File                               | Good Example For                  |
| ------------------ | ---------------------------------- | --------------------------------- |
| `UnrealCompiler`   | `src/compiler/UnrealCompiler.ts`   | C++ output, complex trait mapping |
| `VisionOSCompiler` | `src/compiler/VisionOSCompiler.ts` | Swift/native platform             |
| `WebGPUCompiler`   | `src/compiler/WebGPUCompiler.ts`   | Shader compilation                |
| `CompilerBridge`   | `src/compiler/CompilerBridge.ts`   | R3F/web output, simplest example  |
| `URDFCompiler`     | `src/compiler/urdf/`               | XML output, domain-specific       |

## Checklist

- [ ] Compiler class in `src/compiler/`
- [ ] Registered in `CompilerBridge`
- [ ] Traits mapped in `TraitSupportMatrix`
- [ ] CLI `--target` option added
- [ ] Tests with at least 5 trait roundtrips
- [ ] Docs page in `docs/compilers/`
- [ ] Entry in `packages/core/README.md` compiler table
