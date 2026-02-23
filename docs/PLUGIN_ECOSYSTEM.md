# Plugin Ecosystem Architecture

**Research Topic**: WASM-based Plugin System with Versioning
**Date**: 2026-02-12
**Status**: Design Ready for Implementation

---

## Executive Summary

HoloScript's marketplace infrastructure (`marketplace-api`, `marketplace-web`, `registry`) is ready for a **WASM-based plugin system**. This guide provides the architecture for third-party extensions with security, versioning, and API compatibility.

**Key Technology**: **Extism** (WebAssembly plugin framework)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│ HoloScript Plugin Ecosystem                              │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Plugin Registry                                         │
│  (plugins.holoscript.net)                                │
│      │                                                   │
│      ├─ @holoscript/optimizer-webgpu@1.0.0 (official)   │
│      ├─ @community/lint-vr-practices@2.1.0              │
│      └─ @vendor/custom-codegen@0.5.0                    │
│                                                          │
│                    ↓ WASM Plugins                        │
│                                                          │
│  HoloScript Compiler Host                                │
│  ┌────────────────────────────────────────────┐         │
│  │ Plugin Manager (Extism)                    │         │
│  │ - Load .wasm plugins                       │         │
│  │ - Sandbox execution                        │         │
│  │ - Version compatibility check              │         │
│  │ - API surface control                      │         │
│  └────────────────────────────────────────────┘         │
│                    ↓                                     │
│  Compilation Pipeline                                    │
│  [Parse] → [Transform (plugins)] → [Codegen]            │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Decision: WASM vs Native Plugins

| Aspect               | WASM Plugins                 | Native Plugins              |
| -------------------- | ---------------------------- | --------------------------- |
| Security             | ✅ Sandboxed, memory-safe    | ❌ Full system access       |
| Performance          | ⚠️ ~95% of native            | ✅ 100% native speed        |
| Distribution         | ✅ Universal binary          | ❌ Per-platform builds      |
| Versioning           | ✅ Easy compatibility checks | ⚠️ ABI compatibility hell   |
| Developer Experience | ✅ Write in Rust/C/Go/Zig    | ⚠️ Platform-specific builds |

**Decision**: **WASM plugins with Extism** (security + portability > 5% perf hit)

---

## Plugin Types

### 1. **Optimizer Plugins**

Optimize compiled output for specific targets.

**Example**: `@holoscript/optimizer-webgpu`

```rust
// plugins/optimizer-webgpu/src/lib.rs
use extism_pdk::*;
use serde::{Serialize, Deserialize};

#[derive(Deserialize)]
struct ASTNode {
    node_type: String,
    children: Vec<ASTNode>,
}

#[derive(Serialize)]
struct OptimizedAST {
    nodes: Vec<ASTNode>,
    optimizations_applied: Vec<String>,
}

#[plugin_fn]
pub fn optimize(ast_json: String) -> FnResult<String> {
    let ast: ASTNode = serde_json::from_str(&ast_json)?;

    let mut optimizations = vec![];

    // WebGPU-specific optimization: Batch draw calls
    let optimized = batch_draw_calls(ast, &mut optimizations);

    let result = OptimizedAST {
        nodes: optimized.children,
        optimizations_applied: optimizations,
    };

    Ok(serde_json::to_string(&result)?)
}

fn batch_draw_calls(ast: ASTNode, optimizations: &mut Vec<String>) -> ASTNode {
    // Implementation: Merge adjacent render nodes
    optimizations.push("batched_draw_calls".to_string());
    ast
}
```

### 2. **Linter Plugins**

Custom linting rules for domain-specific checks.

**Example**: `@community/lint-vr-practices`

```typescript
// plugins/lint-vr-practices/src/index.ts
import { definePlugin, ASTNode, LintRule } from '@holoscript/plugin-api';

export default definePlugin({
  name: '@community/lint-vr-practices',
  version: '2.1.0',
  compatibleCompiler: '^3.0.0',

  lintRules: [
    {
      name: 'no-tiny-text',
      message: 'Text size too small for VR (minimum 0.02 units)',
      check(node: ASTNode): boolean {
        if (node.type === 'Text' && node.properties.size < 0.02) {
          return false; // Lint error
        }
        return true;
      },
    },
    {
      name: 'prefer-baked-lighting',
      message: 'Use baked lighting for static objects (better VR performance)',
      check(node: ASTNode): boolean {
        if (node.traits.includes('static') && !node.properties.lighting?.baked) {
          return false;
        }
        return true;
      },
    },
  ],
});
```

### 3. **Code Generator Plugins**

Custom target backends (e.g., proprietary engines).

**Example**: `@vendor/custom-codegen`

```rust
// plugins/custom-codegen/src/lib.rs
#[plugin_fn]
pub fn generate(ast_json: String, target: String) -> FnResult<String> {
    let ast: ASTNode = serde_json::from_str(&ast_json)?;

    let code = match target.as_str() {
        "proprietary-engine-x" => codegen_engine_x(&ast),
        "custom-vr-platform" => codegen_vr_platform(&ast),
        _ => return Err(Error::msg("Unsupported target")),
    };

    Ok(code)
}
```

---

## Plugin API Definition (XTP Schema)

### Plugin Contract

```yaml
# plugins/api/holoscript-plugin.xtp.yaml
openapi: 3.1.0
info:
  title: HoloScript Plugin API
  version: 3.0.0

components:
  schemas:
    ASTNode:
      type: object
      properties:
        node_type:
          type: string
        position:
          $ref: '#/components/schemas/Position'
        children:
          type: array
          items:
            $ref: '#/components/schemas/ASTNode'

    Position:
      type: object
      properties:
        line:
          type: integer
        column:
          type: integer

    CompilerContext:
      type: object
      properties:
        version:
          type: string
        target:
          type: string
        options:
          type: object

paths:
  /optimize:
    post:
      summary: Optimize AST
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ASTNode'
      responses:
        '200':
          description: Optimized AST
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ASTNode'

  /lint:
    post:
      summary: Lint AST
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ASTNode'
      responses:
        '200':
          description: Lint results
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/LintError'
```

**Generate Bindings**:

```bash
xtp plugin init --schema holoscript-plugin.xtp.yaml --language rust
# Generates Rust types + Extism bindings automatically
```

---

## Plugin Manager Implementation

### Host Code (HoloScript Compiler)

```typescript
// packages/core/src/plugin-manager.ts
import { Plugin, CallOptions } from '@extism/extism';
import semver from 'semver';

interface PluginManifest {
  name: string;
  version: string;
  compatibleCompiler: string; // Semver range
  wasmPath: string;
}

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();

  async loadPlugin(manifest: PluginManifest): Promise<void> {
    // Check version compatibility
    if (!semver.satisfies('3.0.0', manifest.compatibleCompiler)) {
      throw new Error(
        `Plugin ${manifest.name} requires compiler ${manifest.compatibleCompiler}, but we have 3.0.0`
      );
    }

    // Load WASM module with Extism
    const plugin = new Plugin(manifest.wasmPath, {
      useWasi: true,
      allowedPaths: {}, // No file system access
      allowedHosts: [], // No network access
    });

    this.plugins.set(manifest.name, plugin);
    console.log(`[Plugin] Loaded ${manifest.name}@${manifest.version}`);
  }

  async callPlugin(name: string, functionName: string, input: any): Promise<any> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not loaded`);
    }

    const inputJson = JSON.stringify(input);
    const outputJson = await plugin.call(functionName, inputJson);

    return JSON.parse(outputJson.text());
  }

  async optimize(ast: ASTNode): Promise<ASTNode> {
    // Call all optimizer plugins in sequence
    let optimized = ast;

    for (const [name, plugin] of this.plugins) {
      if (name.includes('optimizer')) {
        optimized = await this.callPlugin(name, 'optimize', optimized);
      }
    }

    return optimized;
  }
}
```

---

## Version Compatibility Matrix

### Compiler vs Plugin Versions

```
Compiler 3.0.0 → Plugins ^2.0.0 || ^3.0.0 (compatible)
Compiler 3.1.0 → Plugins ^2.0.0 || ^3.0.0 (compatible)
Compiler 4.0.0 → Plugins ^4.0.0 only (breaking changes)
```

### Compatibility Check

```typescript
function checkCompatibility(compilerVersion: string, pluginRange: string): boolean {
  return semver.satisfies(compilerVersion, pluginRange);
}

// Example
checkCompatibility('3.0.0', '^3.0.0'); // true
checkCompatibility('3.0.0', '^4.0.0'); // false
```

---

## Plugin Registry API

### Publish Plugin

```bash
# CLI tool
holoscript plugin publish \
  --name @holoscript/optimizer-webgpu \
  --version 1.0.0 \
  --wasm dist/optimizer.wasm \
  --manifest plugin.json
```

### Install Plugin

```bash
holoscript plugin install @holoscript/optimizer-webgpu
# Downloads from plugins.holoscript.net
# Stores in ~/.holoscript/plugins/
```

### Plugin Configuration

```toml
# holoscript.toml
[plugins]
enabled = [
  "@holoscript/optimizer-webgpu@^1.0.0",
  "@community/lint-vr-practices@^2.0.0",
]

[plugins.config]
"@holoscript/optimizer-webgpu" = { aggressiveness = "high" }
```

---

## Security Considerations

### 1. WASM Sandbox Limits

```typescript
const plugin = new Plugin(wasmPath, {
  useWasi: true,
  allowedPaths: {}, // No file system
  allowedHosts: [], // No network
  memory: { maximum: 50 }, // 50 MB max
  timeout: 5000, // 5 second timeout
});
```

### 2. Code Signing (Future)

```bash
# Plugin author signs WASM with private key
holoscript plugin sign optimizer.wasm --key private.pem

# Registry verifies signature
holoscript plugin verify optimizer.wasm --pubkey author-public.pem
```

### 3. Audit Trail

```typescript
// Log all plugin calls
pluginManager.on('call', (event) => {
  console.log({
    plugin: event.pluginName,
    function: event.functionName,
    inputSize: event.inputSize,
    duration: event.duration,
    timestamp: Date.now(),
  });
});
```

---

## Marketplace Integration

### Plugin Discovery UI

```
plugins.holoscript.net
├── Featured
│   ├── @holoscript/optimizer-webgpu (Official)
│   ├── @holoscript/lint-accessibility (Official)
│   └── @community/vr-best-practices (Community)
│
├── Categories
│   ├── Optimizers (12 plugins)
│   ├── Linters (8 plugins)
│   ├── Code Generators (5 plugins)
│   └── Formatters (3 plugins)
│
└── Search
    └── "webgpu optimizer" → 3 results
```

### Revenue Sharing

| Plugin Type         | Revenue Split               | Example            |
| ------------------- | --------------------------- | ------------------ |
| Free OSS            | N/A                         | 0% (donation link) |
| Paid ($5-50)        | 70% author / 30% HoloScript | $10 → $7 author    |
| Enterprise (custom) | Negotiated                  | Custom contract    |

---

## Future Enhancements

1. **Plugin Hot Reload** (development mode)
2. **Plugin Analytics** (usage metrics per plugin)
3. **AI-Powered Plugin Suggestions** (based on codebase)
4. **Plugin Marketplace Reviews** (star ratings, comments)

---

## References

- [Extism Documentation](https://extism.org/)
- [XTP Bindgen](https://github.com/dylibso/xtp-bindgen)
- [WebAssembly Component Model](https://eunomia.dev/blog/2025/02/16/wasi-and-the-webassembly-component-model-current-status/)

---

**Last Updated**: 2026-02-12
**Status**: ✅ Design Complete - Ready for Implementation
**Marketplace Infrastructure**: Already exists (marketplace-api, marketplace-web, registry)
