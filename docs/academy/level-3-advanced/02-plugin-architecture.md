# 3.2 Plugin Architecture

Extend HoloScript with custom plugins — new compilers, traits, and runtime modules.

## What are Plugins?

Plugins are packages that add new capabilities to HoloScript:

- **Trait plugins** — new `@decorators` for objects
- **Compiler plugins** — new export targets (e.g., compile to a new platform)
- **Runtime plugins** — new object types, built-in functions
- **Editor plugins** — LSP extensions, visual editor nodes

## Plugin Package Structure

```
@myorg/holoscript-plugin-physics-advanced/
├── src/
│   ├── index.ts           # Plugin entry point
│   ├── traits/
│   │   ├── softbody.ts
│   │   └── fluid.ts
│   ├── compiler/
│   │   └── PhysicsExporter.ts
│   └── runtime/
│       └── FluidSimulator.ts
├── package.json
└── README.md
```

## Plugin Entry Point

```typescript
// src/index.ts
import type { HoloScriptPlugin } from '@holoscript/core';
import { SoftBodyTrait } from './traits/softbody.js';
import { FluidTrait } from './traits/fluid.js';
import { PhysicsExporter } from './compiler/PhysicsExporter.js';

const plugin: HoloScriptPlugin = {
  name: '@myorg/holoscript-plugin-physics-advanced',
  version: '1.0.0',

  traits: [SoftBodyTrait, FluidTrait],
  compilers: [PhysicsExporter],

  onLoad(context) {
    context.logger.info('Advanced Physics Plugin loaded');
  },
};

export default plugin;
```

## Creating a Custom Trait

```typescript
// src/traits/softbody.ts
import type { TraitDefinition, HoloComposition } from '@holoscript/core';

export const SoftBodyTrait: TraitDefinition = {
  name: 'softbody',
  description: 'Soft-body physics simulation',
  category: 'physics',

  properties: {
    stiffness:   { type: 'float', default: 0.5, min: 0.0, max: 1.0 },
    damping:     { type: 'float', default: 0.1 },
    mass:        { type: 'float', default: 1.0 },
    resolution:  { type: 'integer', default: 8, min: 4, max: 32 },
  },

  validate(obj, errors) {
    if (obj.traits.includes('rigid_body')) {
      errors.push({
        message: '@softbody and @rigid_body cannot be combined',
        severity: 'error',
      });
    }
  },

  compile(obj, target) {
    return {
      type: 'softbody',
      stiffness: obj.properties.stiffness ?? 0.5,
      damping: obj.properties.damping ?? 0.1,
      mass: obj.properties.mass ?? 1.0,
    };
  },
};
```

## Creating a Compiler Plugin

```typescript
// src/compiler/PhysicsExporter.ts
import type { CompilerPlugin, HoloComposition } from '@holoscript/core';

export class PhysicsExporter implements CompilerPlugin {
  readonly target = 'physx-json';
  readonly version = '1.0.0';

  compile(composition: HoloComposition): string {
    const objects = composition.objects.map(obj => ({
      id: obj.name,
      type: obj.type,
      physics: this.extractPhysicsData(obj),
    }));

    return JSON.stringify({ scene: objects }, null, 2);
  }

  private extractPhysicsData(obj: HoloComposition['objects'][0]) {
    const traits = obj.traits ?? [];
    return {
      isSoftBody: traits.includes('softbody'),
      isFluid:    traits.includes('fluid'),
      mass:       obj.properties?.mass ?? 1.0,
      stiffness:  obj.properties?.stiffness ?? 0.5,
    };
  }
}
```

## Registering a Plugin

### Via `holoscript.config.ts`

```typescript
// holoscript.config.ts
import physicsPlugin from '@myorg/holoscript-plugin-physics-advanced';

export default {
  plugins: [physicsPlugin],
};
```

### Via CLI

```bash
holoscript plugin add @myorg/holoscript-plugin-physics-advanced
```

### In HoloScript source

```holoscript
// .holoscript/workspace.json
{
  "plugins": [
    "@myorg/holoscript-plugin-physics-advanced"
  ]
}
```

## Plugin Hooks

```typescript
const plugin: HoloScriptPlugin = {
  // ...

  hooks: {
    // Before parsing
    beforeParse(source: string) {
      return source.replace(/SOFT /g, '@softbody ');
    },

    // After AST is built
    afterParse(ast) {
      // Transform or validate AST
      return ast;
    },

    // Before code generation
    beforeCompile(composition) {
      // Add implicit traits, resolve references
      return composition;
    },

    // After code generation
    afterCompile(output, target) {
      // Post-process output
      return output;
    },
  },
};
```

## Testing Your Plugin

```typescript
// src/__tests__/softbody.test.ts
import { describe, it, expect } from 'vitest';
import { createTestComposition } from '@holoscript/core/testing';
import { SoftBodyTrait } from '../traits/softbody.js';

describe('SoftBodyTrait', () => {
  it('validates incompatibility with rigid_body', () => {
    const errors: string[] = [];
    const obj = createTestComposition({
      traits: ['softbody', 'rigid_body'],
    });

    SoftBodyTrait.validate?.(obj.objects[0], errors);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/cannot be combined/);
  });

  it('compiles with default stiffness', () => {
    const obj = createTestComposition({ traits: ['softbody'] });
    const result = SoftBodyTrait.compile?.(obj.objects[0], 'unity');
    expect(result.stiffness).toBe(0.5);
  });
});
```

## Publishing Your Plugin

```bash
# Ensure it works
pnpm test && pnpm build

# Publish to npm / HoloHub
npm publish --access public
holoscript publish --registry holohub
```

## Plugin Conventions

| Convention | Example |
|-----------|---------|
| Package name | `holoscript-plugin-<name>` or `@scope/holoscript-plugin-<name>` |
| Trait names | `lowercase_snake_case` |
| Compiler targets | `platform-format` (e.g., `unity-urp`, `unreal-5`) |
| Version | Semver, follow core's major version |

## Security Considerations

- Plugins run in the Node.js process — only install from trusted sources
- Use `@holoscript/security-sandbox` to run untrusted plugin code safely
- Plugin trait names must not conflict with built-in traits (checked at load time)
- Never store secrets in plugin code — use environment variables

## Exercise

Build a plugin that adds a `@glow` trait:

1. Define `GlowTrait` with `color`, `intensity`, and `pulse_rate` properties
2. Add validation to ensure `intensity` is between 0–10
3. Add a compiler function that outputs Unity's bloom effect settings
4. Write tests for validation and compilation
5. Register the plugin and use `@glow` in a HoloScript composition
