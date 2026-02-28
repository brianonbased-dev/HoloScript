# HoloScript Compiler Agent Identity Integration

**Version**: 1.0.0
**Status**: Production Ready
**Last Updated**: 2026-02-27

---

## Overview

All HoloScript compilers now enforce agent identity verification through Role-Based Access Control (RBAC). This ensures that only authorized agents can:

- Read HoloComposition AST
- Generate platform-specific code
- Write to restricted output paths

## Quick Start

### Basic Usage

```typescript
import { UnityCompiler } from '@holoscript/core/compiler/UnityCompiler';
import { createTestCompilerToken } from '@holoscript/core/compiler/CompilerBase';

// 1. Create a valid agent token
const agentToken = createTestCompilerToken();

// 2. Compile with token
const compiler = new UnityCompiler();
const csharpCode = compiler.compile(composition, agentToken);
```

### Production Usage

```typescript
import { UnrealCompiler } from '@holoscript/core/compiler/UnrealCompiler';
import { getTokenIssuer } from '@holoscript/core/compiler/identity';
import { AgentRole, WorkflowStep } from '@holoscript/core/compiler/identity';

// 1. Issue token for code generation
const issuer = getTokenIssuer();
const token = issuer.issueToken({
  agentRole: AgentRole.CODE_GENERATOR,
  workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
  targetPlatform: 'unreal',
  scope: 'packages/games',
});

// 2. Compile with token and output path
const compiler = new UnrealCompiler();
const { headerFile, sourceFile } = compiler.compile(
  composition,
  token,
  'packages/games/dist/unreal/GeneratedScene.h'
);
```

---

## Compiler API Changes (Breaking)

### Before (v0.x)

```typescript
compiler.compile(composition: HoloComposition): string
```

### After (v1.0+)

```typescript
compiler.compile(
  composition: HoloComposition,
  agentToken: string,
  outputPath?: string
): string | Record<string, string>
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `composition` | `HoloComposition` | Yes | HoloScript AST to compile |
| `agentToken` | `string` | Yes | JWT token proving agent identity |
| `outputPath` | `string` | No | Output file path for scope validation |

### Return Value

- **Single-file compilers** (Unity, Godot, Babylon, WebGPU): Return `string`
- **Multi-file compilers** (Unreal): Return `Record<string, string>`

---

## Supported Compilers

All 26 HoloScript compilers now require agent tokens:

### Game Engines
- **UnityCompiler** - C# MonoBehaviour scripts
- **UnrealCompiler** - C++ AActor classes + Blueprint JSON
- **GodotCompiler** - GDScript scene files

### Web Renderers
- **BabylonCompiler** - Babylon.js TypeScript
- **WebGPUCompiler** - WebGPU + WGSL shaders
- **R3FCompiler** - React Three Fiber JSX
- **PlayCanvasCompiler** - PlayCanvas JS

### Mobile/AR
- **AndroidCompiler** - Android OpenGL ES
- **IOSCompiler** - iOS Metal
- **VisionOSCompiler** - visionOS RealityKit
- **AndroidXRCompiler** - ARCore
- **OpenXRCompiler** - OpenXR cross-platform
- **ARCompiler** - WebXR AR

### VR/Social
- **VRChatCompiler** - VRChat UDON
- **VRRCompiler** - VR Rhythm game format

### Data Formats
- **SDFCompiler** - Signed Distance Fields
- **URDFCompiler** - Unified Robot Description Format
- **DTDLCompiler** - Digital Twins Definition Language
- **USDPhysicsCompiler** - USD Physics schema
- **SCMCompiler** - Supply Chain Management

### Compilation Infrastructure
- **WASMCompiler** - WebAssembly compilation
- **IncrementalCompiler** - Incremental compilation
- **MultiLayerCompiler** - Multi-layer scene compilation

---

## Error Handling

### Common Errors

#### 1. Unauthorized AST Access

```typescript
try {
  const code = compiler.compile(composition, invalidToken);
} catch (error) {
  if (error instanceof UnauthorizedCompilerAccessError) {
    console.error(`[${error.compilerName}] ${error.message}`);
    // Output:
    // [UnityCompiler] Unauthorized AST access: Token verification failed: expired
    // Agent Role: code_generator
    // Required Permission: read_ast
  }
}
```

#### 2. Missing Code Generation Permission

```typescript
const syntaxAnalyzerToken = issuer.issueToken({
  agentRole: AgentRole.SYNTAX_ANALYZER, // Wrong role!
  workflowStep: WorkflowStep.BUILD_AST,
  targetPlatform: 'unity',
});

compiler.compile(composition, syntaxAnalyzerToken);
// Throws: UnauthorizedCompilerAccessError
// Reason: Missing required permission: write_code
```

#### 3. Scope Violation

```typescript
const token = issuer.issueToken({
  agentRole: AgentRole.CODE_GENERATOR,
  workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
  targetPlatform: 'unity',
  scope: 'packages/core', // Restricted to packages/core
});

compiler.compile(
  composition,
  token,
  'packages/games/dist/Scene.cs' // Outside scope!
);
// Throws: UnauthorizedCompilerAccessError
// Reason: Resource path 'packages/games/dist/Scene.cs' is outside agent scope: packages/core
```

---

## Migration Guide

### Step 1: Update Compiler Calls

**Old Code**:
```typescript
const compiler = new BabylonCompiler();
const jsCode = compiler.compile(composition);
```

**New Code**:
```typescript
import { createTestCompilerToken } from '@holoscript/core/compiler/CompilerBase';

const compiler = new BabylonCompiler();
const token = createTestCompilerToken(); // Development only
const jsCode = compiler.compile(composition, token);
```

### Step 2: Replace Test Tokens with Production Tokens

**Development**:
```typescript
const token = createTestCompilerToken();
```

**Production**:
```typescript
import { getTokenIssuer, AgentRole, WorkflowStep } from '@holoscript/core/compiler/identity';

const issuer = getTokenIssuer();
const token = issuer.issueToken({
  agentRole: AgentRole.CODE_GENERATOR,
  workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
  targetPlatform: 'babylon',
  ttl: 24 * 60 * 60, // 24 hours
});
```

### Step 3: Update Tests

**Before**:
```typescript
it('should compile to Unity C#', () => {
  const compiler = new UnityCompiler();
  const code = compiler.compile(testComposition);
  expect(code).toContain('MonoBehaviour');
});
```

**After**:
```typescript
import { createTestCompilerToken } from '@holoscript/core/compiler/CompilerBase';

let testToken: string;

beforeEach(() => {
  testToken = createTestCompilerToken();
});

it('should compile to Unity C#', () => {
  const compiler = new UnityCompiler();
  const code = compiler.compile(testComposition, testToken);
  expect(code).toContain('MonoBehaviour');
});
```

---

## Advanced Usage

### Custom RBAC Configuration

```typescript
import { getRBAC } from '@holoscript/core/compiler/identity';

const rbac = getRBAC();

// Restrict code generator to specific package
rbac.setScopeRestriction(
  AgentRole.CODE_GENERATOR,
  ['packages/core', 'packages/std']
);
```

### Manual Permission Checks

```typescript
import { getRBAC, ResourceType } from '@holoscript/core/compiler/identity';

const rbac = getRBAC();

// Check if agent can read source file
const decision = rbac.canReadSource(token, 'src/scene.holo');
if (!decision.allowed) {
  console.error(`Access denied: ${decision.reason}`);
}

// Check if agent can generate code
const codeGenDecision = rbac.canGenerateCode(token);
if (codeGenDecision.allowed) {
  // Proceed with compilation
}
```

### Implementing Custom Compilers

```typescript
import { CompilerBase } from '@holoscript/core/compiler/CompilerBase';
import type { HoloComposition } from '@holoscript/core/parser/HoloCompositionTypes';

export class CustomCompiler extends CompilerBase {
  protected readonly compilerName = 'CustomCompiler';

  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    // Step 1: Validate permissions
    this.validateCompilerAccess(agentToken, outputPath);

    // Step 2: Compile (permissions verified)
    const code = this.generateCode(composition);

    return code;
  }

  private generateCode(composition: HoloComposition): string {
    // Your compilation logic here
    return '// Generated code';
  }
}
```

---

## Security Best Practices

### 1. Never Hardcode Tokens

Bad:
```typescript
const token = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...';
compiler.compile(composition, token);
```

Good:
```typescript
const token = process.env.HOLOSCRIPT_AGENT_TOKEN || createTestCompilerToken();
compiler.compile(composition, token);
```

### 2. Scope Tokens to Minimum Necessary

```typescript
// Bad: Unrestricted access
const token = issuer.issueToken({
  agentRole: AgentRole.ORCHESTRATOR, // Too broad!
  workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
  targetPlatform: 'unity',
  // No scope restriction
});

// Good: Scoped to specific package
const token = issuer.issueToken({
  agentRole: AgentRole.CODE_GENERATOR,
  workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
  targetPlatform: 'unity',
  scope: 'packages/games/my-game', // Minimal scope
});
```

### 3. Rotate Tokens Regularly

```typescript
// In CI/CD pipeline:
const token = issuer.issueToken({
  agentRole: AgentRole.CODE_GENERATOR,
  workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
  targetPlatform: 'unity',
  ttl: 1 * 60 * 60, // 1 hour (short-lived for CI)
});
```

### 4. Handle Token Expiration

```typescript
import { UnauthorizedCompilerAccessError } from '@holoscript/core/compiler/CompilerBase';

try {
  const code = compiler.compile(composition, token, outputPath);
} catch (error) {
  if (error instanceof UnauthorizedCompilerAccessError) {
    if (error.decision.reason?.includes('expired')) {
      // Refresh token
      const newToken = issuer.issueToken({ /* ... */ });
      return compiler.compile(composition, newToken, outputPath);
    }
  }
  throw error;
}
```

---

## Testing

### Unit Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { UnityCompiler } from '@holoscript/core/compiler/UnityCompiler';
import { createTestCompilerToken } from '@holoscript/core/compiler/CompilerBase';

describe('UnityCompiler', () => {
  let compiler: UnityCompiler;
  let testToken: string;

  beforeEach(() => {
    compiler = new UnityCompiler();
    testToken = createTestCompilerToken();
  });

  it('should compile with valid token', () => {
    const code = compiler.compile(testComposition, testToken);
    expect(code).toContain('MonoBehaviour');
  });

  it('should reject invalid token', () => {
    expect(() => {
      compiler.compile(testComposition, 'invalid-token');
    }).toThrow(UnauthorizedCompilerAccessError);
  });
});
```

### Integration Tests

```typescript
import { getTokenIssuer, AgentRole, WorkflowStep } from '@holoscript/core/compiler/identity';

it('should enforce scope restrictions', () => {
  const issuer = getTokenIssuer();
  const token = issuer.issueToken({
    agentRole: AgentRole.CODE_GENERATOR,
    workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
    targetPlatform: 'unity',
    scope: 'packages/core',
  });

  expect(() => {
    compiler.compile(composition, token, 'packages/games/output.cs');
  }).toThrow(/outside agent scope/);
});
```

---

## FAQ

### Q: Do I need to update my existing compilation workflows?

**A**: Yes. All compilation code must now pass a valid `agentToken` parameter. Use `createTestCompilerToken()` for development/testing, and `getTokenIssuer().issueToken()` for production.

### Q: Can I disable RBAC for backwards compatibility?

**A**: No. RBAC is now a core security feature and cannot be disabled. This is intentional to prevent unauthorized compilation.

### Q: How do I get a token in my build scripts?

**A**: Use the token issuer in your build script:

```bash
# build.sh
node -e "
const { getTokenIssuer, AgentRole, WorkflowStep } = require('@holoscript/core/compiler/identity');
const issuer = getTokenIssuer();
const token = issuer.issueToken({
  agentRole: AgentRole.CODE_GENERATOR,
  workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
  targetPlatform: 'unity',
});
console.log(token);
" > .agent-token

holoscript compile --token "$(cat .agent-token)" scene.holo
```

### Q: What happens if my token expires during compilation?

**A**: Compilation will fail with `UnauthorizedCompilerAccessError`. You must issue a new token and retry. For long-running builds, issue tokens with sufficient TTL (e.g., 1 hour).

### Q: Can multiple compilers share the same token?

**A**: Yes, if they all require the same permissions. A `CODE_GENERATOR` token works for all platform compilers (Unity, Unreal, Godot, etc.).

---

## Changelog

### v1.0.0 (2026-02-27)

**BREAKING CHANGES**:
- All compilers now require `agentToken` parameter
- `compile()` signature changed from `compile(composition)` to `compile(composition, agentToken, outputPath?)`
- Unauthorized access throws `UnauthorizedCompilerAccessError`

**Migrated Compilers** (5 core + 21 additional):
- UnityCompiler
- UnrealCompiler
- GodotCompiler
- BabylonCompiler
- WebGPUCompiler
- (+ 21 more)

**New Features**:
- `CompilerBase` abstract class for consistent RBAC enforcement
- `createTestCompilerToken()` utility for testing
- `UnauthorizedCompilerAccessError` with clear error messages
- Scope validation for output paths

**Documentation**:
- COMPILER_INTEGRATION.md (this file)
- Updated AUTONOMOUS_TODOS.md (marked TODO-002 complete)

---

## Support

For issues or questions:

- **Documentation**: See `packages/core/src/compiler/identity/USAGE_EXAMPLES.md`
- **GitHub Issues**: https://github.com/holoscript/holoscript/issues
- **Security**: Report vulnerabilities to security@holoscript.dev

---

**Generated**: 2026-02-27
**Author**: HoloScript Autonomous Administrator
**Repository**: `c:\Users\josep\Documents\GitHub\HoloScript`
