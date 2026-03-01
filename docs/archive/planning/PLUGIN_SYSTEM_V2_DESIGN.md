# HoloScript Plugin System v2 Design

## Overview

The HoloScript Plugin System v2 provides a unified API for extending HoloScript across all layers: parsing, compilation, runtime, and tooling. It enables developers, AI agents, and platform vendors to add custom functionality without modifying core packages.

## Design Goals

1. **Universal Extension Points** - Plugins can hook into parser, compiler, runtime, LSP, and MCP
2. **Type Safety** - Full TypeScript support with plugin contracts
3. **Hot Reload** - Development-time plugin reload without restart
4. **Sandboxed Execution** - Plugins run in isolated contexts for security
5. **AI-Friendly** - Plugins can be discovered and invoked by AI agents via MCP

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Plugin Registry                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Parser   │ │ Compiler │ │ Runtime  │ │ Tooling  │       │
│  │ Plugins  │ │ Plugins  │ │ Plugins  │ │ Plugins  │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
└───────┼────────────┼────────────┼────────────┼──────────────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
   │ Parser  │  │Compiler │  │ Runtime │  │LSP/MCP  │
   │  Core   │  │  Core   │  │  Core   │  │  Core   │
   └─────────┘  └─────────┘  └─────────┘  └─────────┘
```

## Plugin Types

### 1. Parser Plugins

Extend HoloScript syntax with custom constructs.

```typescript
interface ParserPlugin {
  name: string;
  version: string;

  // Custom syntax rules
  customTokens?: TokenDefinition[];
  customGrammar?: GrammarRule[];

  // AST transformation
  transformAST?(ast: HoloScriptAST): HoloScriptAST;

  // Validation hooks
  validate?(node: ASTNode, context: ValidationContext): Diagnostic[];
}
```

**Example: Custom Trait Plugin**

```typescript
export const PhysicsTraitPlugin: ParserPlugin = {
  name: '@holoscript/physics-traits',
  version: '1.0.0',

  customTokens: [
    { name: 'soft_body', pattern: /@soft_body/ },
    { name: 'fluid', pattern: /@fluid/ },
    { name: 'cloth', pattern: /@cloth/ },
  ],

  validate(node, context) {
    if (node.type === 'trait' && node.name === 'soft_body') {
      if (!node.parent?.properties?.mass) {
        return [{ message: '@soft_body requires mass property', severity: 'error' }];
      }
    }
    return [];
  },
};
```

### 2. Compiler Plugins

Generate custom output for new platforms.

```typescript
interface CompilerPlugin {
  name: string;
  version: string;
  targetPlatform: string;

  // Compilation entry point
  compile(ast: HoloScriptAST, options: CompilerOptions): CompileResult;

  // Pre/post processing hooks
  preCompile?(ast: HoloScriptAST): HoloScriptAST;
  postCompile?(result: CompileResult): CompileResult;

  // Asset processing
  processAsset?(asset: Asset, type: string): ProcessedAsset;
}
```

**Example: WebGPU Compiler Plugin**

```typescript
export const WebGPUCompilerPlugin: CompilerPlugin = {
  name: '@holoscript/webgpu-compiler',
  version: '1.0.0',
  targetPlatform: 'webgpu',

  compile(ast, options) {
    // Generate WebGPU shaders and scene graph
    const wgsl = generateWGSL(ast);
    const sceneGraph = generateSceneGraph(ast);

    return {
      success: true,
      output: { wgsl, sceneGraph },
      artifacts: ['shaders.wgsl', 'scene.json'],
    };
  },
};
```

### 3. Runtime Plugins

Add runtime behaviors and integrations.

```typescript
interface RuntimePlugin {
  name: string;
  version: string;

  // Lifecycle hooks
  onInitialize?(runtime: HoloScriptRuntime): void | Promise<void>;
  onShutdown?(runtime: HoloScriptRuntime): void | Promise<void>;

  // Object lifecycle
  onObjectCreated?(object: HoloObject, context: RuntimeContext): void;
  onObjectDestroyed?(object: HoloObject, context: RuntimeContext): void;

  // Event handling
  onEvent?(event: RuntimeEvent, context: RuntimeContext): void;

  // Custom trait implementations
  traitImplementations?: Record<string, TraitImplementation>;

  // Custom functions available in HoloScript
  globalFunctions?: Record<string, GlobalFunction>;
}
```

**Example: Analytics Plugin**

```typescript
export const AnalyticsPlugin: RuntimePlugin = {
  name: '@holoscript/analytics',
  version: '1.0.0',

  onInitialize(runtime) {
    console.log('[Analytics] Initialized');
    this.startTime = Date.now();
  },

  onEvent(event, context) {
    if (event.type === 'grab' || event.type === 'click') {
      trackInteraction({
        object: event.target.name,
        action: event.type,
        timestamp: Date.now(),
      });
    }
  },

  globalFunctions: {
    'analytics.track': (eventName, data) => {
      trackCustomEvent(eventName, data);
    },
    'analytics.identify': (userId) => {
      identifyUser(userId);
    },
  },
};
```

### 4. Tooling Plugins

Extend LSP, CLI, and MCP functionality.

```typescript
interface ToolingPlugin {
  name: string;
  version: string;

  // LSP extensions
  lsp?: {
    completionProviders?: CompletionProvider[];
    diagnosticProviders?: DiagnosticProvider[];
    codeActionProviders?: CodeActionProvider[];
    customCommands?: LSPCommand[];
  };

  // CLI extensions
  cli?: {
    commands?: CLICommand[];
    flags?: CLIFlag[];
  };

  // MCP tool extensions
  mcp?: {
    tools?: MCPTool[];
    resources?: MCPResource[];
  };
}
```

**Example: Linting Plugin**

```typescript
export const LintingPlugin: ToolingPlugin = {
  name: '@holoscript/extra-lints',
  version: '1.0.0',

  lsp: {
    diagnosticProviders: [
      {
        name: 'performance-hints',
        provide(document) {
          const diagnostics = [];
          // Check for expensive patterns
          if (document.text.includes('physics: { type: "dynamic"')) {
            diagnostics.push({
              message: 'Consider using kinematic physics for static objects',
              severity: 'hint',
            });
          }
          return diagnostics;
        },
      },
    ],
  },

  cli: {
    commands: [
      {
        name: 'lint',
        description: 'Run HoloScript linter',
        action: async (args) => {
          const files = await glob(args.pattern || '**/*.holo');
          return lintFiles(files);
        },
      },
    ],
  },
};
```

## Plugin Discovery

### NPM Package Convention

Plugins are discoverable via npm package naming:

```
@holoscript/plugin-*        # Official plugins
holoscript-plugin-*         # Community plugins
@company/holoscript-plugin-* # Organization plugins
```

### Configuration

Plugins are configured in `holoscript.config.json`:

```json
{
  "plugins": [
    "@holoscript/plugin-physics",
    "@holoscript/plugin-analytics",
    ["holoscript-plugin-custom", { "option": "value" }]
  ],
  "pluginSettings": {
    "@holoscript/plugin-analytics": {
      "trackingId": "UA-XXXXX-Y",
      "sampleRate": 0.1
    }
  }
}
```

### Programmatic Registration

```typescript
import { PluginRegistry } from '@holoscript/core';
import { AnalyticsPlugin } from '@holoscript/plugin-analytics';

const registry = new PluginRegistry();
registry.register(AnalyticsPlugin, { trackingId: 'UA-XXXXX-Y' });
```

## Plugin Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│                        Plugin Lifecycle                           │
│                                                                   │
│   ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐   │
│   │ Discover│ ──► │ Validate│ ──► │ Register│ ──► │ Activate│   │
│   └─────────┘     └─────────┘     └─────────┘     └─────────┘   │
│                                                         │        │
│                                                         ▼        │
│   ┌─────────┐     ┌─────────┐                   ┌─────────┐     │
│   │ Cleanup │ ◄── │Deactivate│ ◄───────────────│  Active  │     │
│   └─────────┘     └─────────┘                   └─────────┘     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### Lifecycle Hooks

```typescript
interface PluginLifecycle {
  // Called when plugin is discovered
  onDiscover?(): Promise<PluginMetadata>;

  // Called to validate plugin compatibility
  onValidate?(context: ValidationContext): Promise<boolean>;

  // Called when plugin is registered
  onRegister?(registry: PluginRegistry): void;

  // Called when plugin is activated
  onActivate?(context: PluginContext): Promise<void>;

  // Called when plugin is deactivated
  onDeactivate?(context: PluginContext): Promise<void>;

  // Called when plugin is unregistered
  onCleanup?(): Promise<void>;
}
```

## Security Model

### Sandboxed Execution

Plugins run in isolated contexts:

```typescript
interface PluginSandbox {
  // Allowed APIs
  allowedAPIs: string[];

  // Resource limits
  maxMemory: number; // MB
  maxCPU: number; // percentage
  maxExecutionTime: number; // ms

  // Network access
  allowedHosts: string[];
  denyNetworkAccess: boolean;

  // File system access
  allowedPaths: string[];
  denyFileAccess: boolean;
}
```

### Permission System

```typescript
// Plugin manifest declares required permissions
{
  "name": "@holoscript/plugin-analytics",
  "permissions": [
    "network:https://analytics.example.com",
    "storage:local",
    "runtime:events"
  ]
}
```

### Trust Levels

```
┌─────────────────────────────────────────────────────────────┐
│ Trust Level │ Permissions                                   │
├─────────────┼───────────────────────────────────────────────┤
│ Core        │ Full access (built-in plugins only)           │
│ Trusted     │ All permissions (signed by HoloScript team)   │
│ Verified    │ Reviewed permissions (community verified)     │
│ Community   │ Limited permissions (sandboxed)               │
│ Local       │ User-defined permissions                      │
└─────────────────────────────────────────────────────────────┘
```

## Plugin API

### Core Plugin Interface

```typescript
import { Plugin, PluginContext, PluginMetadata } from '@holoscript/plugin-api';

export interface Plugin<TOptions = unknown> {
  // Metadata
  readonly metadata: PluginMetadata;

  // Configuration
  configure?(options: TOptions): void;

  // Lifecycle
  activate?(context: PluginContext): Promise<void>;
  deactivate?(): Promise<void>;

  // Extension points (pick relevant ones)
  parser?: ParserPlugin;
  compiler?: CompilerPlugin;
  runtime?: RuntimePlugin;
  tooling?: ToolingPlugin;
}

export interface PluginMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  repository?: string;
  keywords?: string[];
  engines?: { holoscript: string };
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface PluginContext {
  // Plugin info
  plugin: PluginMetadata;
  options: unknown;

  // Core services
  logger: Logger;
  config: ConfigService;
  storage: StorageService;

  // Extension APIs
  parser: ParserExtensionAPI;
  compiler: CompilerExtensionAPI;
  runtime: RuntimeExtensionAPI;
  tooling: ToolingExtensionAPI;
}
```

### Extension APIs

```typescript
// Parser Extension API
interface ParserExtensionAPI {
  registerToken(definition: TokenDefinition): void;
  registerGrammar(rule: GrammarRule): void;
  registerTransform(transform: ASTTransform): void;
  registerValidator(validator: Validator): void;
}

// Compiler Extension API
interface CompilerExtensionAPI {
  registerTarget(target: CompilerTarget): void;
  registerOptimization(optimization: Optimization): void;
  registerAssetProcessor(processor: AssetProcessor): void;
}

// Runtime Extension API
interface RuntimeExtensionAPI {
  registerTrait(name: string, implementation: TraitImplementation): void;
  registerGlobalFunction(name: string, fn: GlobalFunction): void;
  registerEventHandler(event: string, handler: EventHandler): void;
  registerComponent(name: string, component: ComponentDefinition): void;
}

// Tooling Extension API
interface ToolingExtensionAPI {
  registerLSPProvider(provider: LSPProvider): void;
  registerCLICommand(command: CLICommand): void;
  registerMCPTool(tool: MCPTool): void;
  registerMCPResource(resource: MCPResource): void;
}
```

## Creating a Plugin

### Minimal Plugin

```typescript
// my-plugin/src/index.ts
import { Plugin } from '@holoscript/plugin-api';

export default {
  metadata: {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'My first HoloScript plugin',
  },

  async activate(context) {
    context.logger.info('My plugin activated!');

    // Register a custom trait
    context.runtime.registerTrait('my_trait', {
      onAttach(object) {
        object.myTraitData = { initialized: true };
      },
      onUpdate(object, dt) {
        // Custom update logic
      },
    });
  },

  async deactivate() {
    console.log('My plugin deactivated');
  },
} satisfies Plugin;
```

### Full-Featured Plugin

```typescript
// physics-plugin/src/index.ts
import { Plugin, PluginContext } from '@holoscript/plugin-api';

interface PhysicsPluginOptions {
  gravity: [number, number, number];
  solver: 'ode' | 'bullet' | 'physx';
  substeps: number;
}

export default {
  metadata: {
    name: '@holoscript/physics-advanced',
    version: '2.0.0',
    description: 'Advanced physics simulation for HoloScript',
    engines: { holoscript: '^2.0.0' },
  },

  // Parser extensions
  parser: {
    customTokens: [
      { name: 'soft_body', pattern: /@soft_body/ },
      { name: 'fluid', pattern: /@fluid/ },
    ],
    validate(node, context) {
      // Validate physics properties
      return [];
    },
  },

  // Runtime extensions
  runtime: {
    traitImplementations: {
      soft_body: {
        onAttach(object) {
          initSoftBody(object);
        },
        onUpdate(object, dt) {
          updateSoftBody(object, dt);
        },
      },
    },
    globalFunctions: {
      'physics.raycast': (origin, direction, maxDistance) => {
        return performRaycast(origin, direction, maxDistance);
      },
    },
  },

  // Tooling extensions
  tooling: {
    mcp: {
      tools: [
        {
          name: 'physics_simulate',
          description: 'Run physics simulation on a scene',
          inputSchema: {
            /* JSON Schema */
          },
          handler: async (input) => {
            return simulatePhysics(input);
          },
        },
      ],
    },
  },

  configure(options: PhysicsPluginOptions) {
    this.options = options;
  },

  async activate(context: PluginContext) {
    const options = context.options as PhysicsPluginOptions;
    await initPhysicsEngine(options.solver);
    setGravity(options.gravity);
  },

  async deactivate() {
    await shutdownPhysicsEngine();
  },
} satisfies Plugin<PhysicsPluginOptions>;
```

## Plugin Registry API

```typescript
import { PluginRegistry, PluginStatus } from '@holoscript/core';

// Create registry
const registry = new PluginRegistry({
  autoDiscover: true,
  configPath: './holoscript.config.json',
});

// Register plugins
await registry.register('@holoscript/plugin-analytics');
await registry.register(LocalPlugin, { option: 'value' });

// List plugins
const plugins = registry.list();
// [{ name: '@holoscript/plugin-analytics', status: 'active', version: '1.0.0' }]

// Get plugin
const plugin = registry.get('@holoscript/plugin-analytics');

// Activate/deactivate
await registry.activate('@holoscript/plugin-analytics');
await registry.deactivate('@holoscript/plugin-analytics');

// Unregister
await registry.unregister('@holoscript/plugin-analytics');

// Hot reload (development)
await registry.reload('@holoscript/plugin-analytics');

// Events
registry.on('plugin:registered', (plugin) => {});
registry.on('plugin:activated', (plugin) => {});
registry.on('plugin:error', (plugin, error) => {});
```

## AI Integration

Plugins can expose functionality to AI agents via MCP:

```typescript
// Plugin with MCP tools
export default {
  metadata: { name: 'ai-helper-plugin', version: '1.0.0' },

  tooling: {
    mcp: {
      tools: [
        {
          name: 'generate_physics_object',
          description: 'Generate a physics-enabled object based on description',
          inputSchema: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              physicsType: { type: 'string', enum: ['dynamic', 'static', 'kinematic'] },
            },
            required: ['description'],
          },
          handler: async ({ description, physicsType }) => {
            // AI can call this tool to generate HoloScript code
            return generatePhysicsObject(description, physicsType);
          },
        },
      ],
      resources: [
        {
          uri: 'holoscript://physics/examples',
          name: 'Physics Examples',
          description: 'Example physics configurations',
          mimeType: 'application/json',
          handler: async () => {
            return JSON.stringify(physicsExamples);
          },
        },
      ],
    },
  },
} satisfies Plugin;
```

## Implementation Roadmap

### Phase 1: Core Infrastructure (Sprint 3-4)

- [ ] Plugin interface definitions
- [ ] PluginRegistry implementation
- [ ] Basic lifecycle management
- [ ] Configuration loading

### Phase 2: Extension Points (Sprint 4-5)

- [ ] Parser plugin hooks
- [ ] Compiler plugin hooks
- [ ] Runtime plugin hooks
- [ ] Basic sandboxing

### Phase 3: Tooling Integration (Sprint 5-6)

- [ ] LSP plugin support
- [ ] CLI plugin support
- [ ] MCP tool registration

### Phase 4: Ecosystem (Sprint 6+)

- [ ] Plugin marketplace
- [ ] Signature verification
- [ ] Hot reload support
- [ ] Performance profiling

## Package Structure

```
packages/
  plugin-api/           # Public plugin API types
    src/
      index.ts          # Main exports
      types/            # Interface definitions
      decorators/       # @Plugin, @Hook decorators

  plugin-registry/      # Plugin management
    src/
      registry.ts       # PluginRegistry class
      loader.ts         # Plugin loading
      sandbox.ts        # Sandboxed execution
      validator.ts      # Plugin validation

  plugin-cli/           # CLI for plugin management
    src/
      commands/
        install.ts
        uninstall.ts
        list.ts
        create.ts       # Scaffold new plugin
```

## Related Documents

- [ROADMAP.md](./ROADMAP.md) - Overall project roadmap
- [CONTRIBUTING.md](../CONTRIBUTING.md) - How to contribute plugins
- [docs/MCP_CONFIGURATION.md](./MCP_CONFIGURATION.md) - MCP integration details
