# Agent Identity Framework - Quick Start Guide

**5-Minute Integration Guide** for HoloScript Compiler Agent Identity

---

## Installation

Already included in `@holoscript/core` (v3.43.0+). No additional dependencies needed.

```typescript
import {
  AgentRole,
  AgentPermission,
  WorkflowStep,
  getTokenIssuer,
  getRBAC,
  getKeystore,
} from '@holoscript/core/compiler/identity';
```

---

## 1. Basic Usage: Issue and Verify Token

### Issue Token for Syntax Analyzer

```typescript
import {
  AgentRole,
  WorkflowStep,
  AgentConfig,
  generateAgentKeyPair,
  getTokenIssuer,
} from '@holoscript/core/compiler/identity';

// Step 1: Configure agent
const config: AgentConfig = {
  role: AgentRole.SYNTAX_ANALYZER,
  name: 'syntax-analyzer-v1',
  version: '1.0.0',
  scope: 'packages/core', // Optional: restrict to package
};

// Step 2: Generate PoP key pair
const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);

// Step 3: Issue token
const issuer = getTokenIssuer();
const token = await issuer.issueToken({
  agentConfig: config,
  workflowStep: WorkflowStep.PARSE_TOKENS,
  workflowId: 'compile-session-123',
  initiatedBy: AgentRole.ORCHESTRATOR,
  keyPair,
});

console.log('✓ Token issued:', token.substring(0, 50) + '...');
```

### Verify Token

```typescript
const result = issuer.verifyToken(token);

if (result.valid) {
  console.log('✓ Token valid');
  console.log('  Agent role:', result.payload.agent_role);
  console.log('  Workflow step:', result.payload.intent.workflow_step);
} else {
  console.error('✗ Token invalid:', result.error);
}
```

---

## 2. RBAC: Check Permissions Before Operations

### Protect File Access

```typescript
import { getRBAC, ResourceType } from '@holoscript/core/compiler/identity';

const rbac = getRBAC();

// Before reading source file
const decision = rbac.checkAccess({
  token: agentToken,
  resourceType: ResourceType.SOURCE_FILE,
  operation: 'read',
  resourcePath: 'packages/core/src/parser/Parser.ts',
});

if (!decision.allowed) {
  throw new Error(`Access denied: ${decision.reason}`);
}

// Safe to read file
const source = await fs.readFile('packages/core/src/parser/Parser.ts', 'utf8');
```

### Protect AST Modification

```typescript
// Before modifying AST
const decision = rbac.canModifyAST(token, WorkflowStep.APPLY_TRANSFORMS);

if (!decision.allowed) {
  throw new Error(`Cannot modify AST: ${decision.reason}`);
}

// Safe to transform
const optimizedAST = applyOptimizations(ast);
```

---

## 3. Compiler Integration Example

### Unity Compiler with Agent Identity

```typescript
// packages/core/src/compiler/UnityCompiler.ts
import { getRBAC, ResourceType, AgentPermission } from './identity';

export class UnityCompiler {
  compile(ast: AST, agentToken: string, outputPath: string): string {
    const rbac = getRBAC();

    // Check read permission for AST
    const readDecision = rbac.checkAccess({
      token: agentToken,
      resourceType: ResourceType.AST,
      operation: 'read',
    });

    if (!readDecision.allowed) {
      throw new Error(`Cannot read AST: ${readDecision.reason}`);
    }

    // Generate C# code
    const csharpCode = this.generateCSharp(ast);

    // Check write permission for output
    const writeDecision = rbac.checkAccess({
      token: agentToken,
      resourceType: ResourceType.OUTPUT,
      operation: 'write',
      resourcePath: outputPath,
    });

    if (!writeDecision.allowed) {
      throw new Error(`Cannot write output: ${writeDecision.reason}`);
    }

    // Safe to write
    return csharpCode;
  }

  private generateCSharp(ast: AST): string {
    // ... existing implementation
  }
}
```

---

## 4. Full Compilation Pipeline

### Orchestrator Coordinates All Agents

```typescript
import {
  AgentRole,
  WorkflowStep,
  getTokenIssuer,
  generateAgentKeyPair,
} from '@holoscript/core/compiler/identity';

async function compileWithAgents(sourceCode: string): Promise<string> {
  const issuer = getTokenIssuer();
  const workflowId = `compile-${Date.now()}`;

  // Step 1: Syntax Analyzer
  const syntaxKeyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);
  const syntaxToken = await issuer.issueToken({
    agentConfig: {
      role: AgentRole.SYNTAX_ANALYZER,
      name: 'syntax-v1',
      version: '1.0.0',
    },
    workflowStep: WorkflowStep.PARSE_TOKENS,
    workflowId,
    initiatedBy: AgentRole.ORCHESTRATOR,
    keyPair: syntaxKeyPair,
  });

  const ast = await syntaxAnalyzer.parse(sourceCode, syntaxToken);

  // Step 2: AST Optimizer
  const optimizerKeyPair = await generateAgentKeyPair(AgentRole.AST_OPTIMIZER);
  const optimizerToken = await issuer.issueToken({
    agentConfig: {
      role: AgentRole.AST_OPTIMIZER,
      name: 'optimizer-v1',
      version: '1.0.0',
    },
    workflowStep: WorkflowStep.APPLY_TRANSFORMS,
    workflowId,
    initiatedBy: AgentRole.ORCHESTRATOR,
    delegationChain: [AgentRole.ORCHESTRATOR, AgentRole.SYNTAX_ANALYZER],
    keyPair: optimizerKeyPair,
  });

  const optimizedAST = await astOptimizer.optimize(ast, optimizerToken);

  // Step 3: Code Generator
  const codegenKeyPair = await generateAgentKeyPair(AgentRole.CODE_GENERATOR);
  const codegenToken = await issuer.issueToken({
    agentConfig: {
      role: AgentRole.CODE_GENERATOR,
      name: 'codegen-v1',
      version: '1.0.0',
    },
    workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
    workflowId,
    initiatedBy: AgentRole.ORCHESTRATOR,
    delegationChain: [AgentRole.ORCHESTRATOR, AgentRole.SYNTAX_ANALYZER, AgentRole.AST_OPTIMIZER],
    keyPair: codegenKeyPair,
  });

  const code = await codeGenerator.generate(optimizedAST, codegenToken);

  // Step 4: Exporter
  const exporterKeyPair = await generateAgentKeyPair(AgentRole.EXPORTER);
  const exporterToken = await issuer.issueToken({
    agentConfig: {
      role: AgentRole.EXPORTER,
      name: 'exporter-v1',
      version: '1.0.0',
    },
    workflowStep: WorkflowStep.SERIALIZE,
    workflowId,
    initiatedBy: AgentRole.ORCHESTRATOR,
    delegationChain: [
      AgentRole.ORCHESTRATOR,
      AgentRole.SYNTAX_ANALYZER,
      AgentRole.AST_OPTIMIZER,
      AgentRole.CODE_GENERATOR,
    ],
    keyPair: exporterKeyPair,
  });

  const output = await exporter.export(code, exporterToken, './dist/output.cs');

  return output;
}
```

---

## 5. Environment Setup

### Production Environment Variables

```bash
# .env.production
AGENT_JWT_SECRET=your-secret-key-min-32-chars-please-change-me
AGENT_KEYSTORE_MASTER_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
STRICT_WORKFLOW_VALIDATION=true
NODE_ENV=production
```

### Generate Master Key

```bash
# Generate 256-bit hex key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 6. Testing

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest';
import {
  AgentRole,
  WorkflowStep,
  getTokenIssuer,
  generateAgentKeyPair,
  resetTokenIssuer,
} from '@holoscript/core/compiler/identity';

describe('Agent Identity Integration', () => {
  it('should issue and verify token for syntax analyzer', async () => {
    const issuer = getTokenIssuer();
    const keyPair = await generateAgentKeyPair(AgentRole.SYNTAX_ANALYZER);

    const token = await issuer.issueToken({
      agentConfig: {
        role: AgentRole.SYNTAX_ANALYZER,
        name: 'syntax-test',
        version: '1.0.0',
      },
      workflowStep: WorkflowStep.PARSE_TOKENS,
      workflowId: 'test-123',
      initiatedBy: AgentRole.ORCHESTRATOR,
      keyPair,
    });

    const result = issuer.verifyToken(token);

    expect(result.valid).toBe(true);
    expect(result.payload?.agent_role).toBe(AgentRole.SYNTAX_ANALYZER);
  });

  afterEach(() => {
    resetTokenIssuer(); // Clear workflow state between tests
  });
});
```

---

## 7. Common Patterns

### Pattern: Scope Restriction by Package

```typescript
// Restrict exporter to only write to 'dist/' directory
const exporterConfig: AgentConfig = {
  role: AgentRole.EXPORTER,
  name: 'exporter-unity',
  version: '1.0.0',
  scope: 'dist/unity', // Can only write to this path
};

// RBAC will reject writes outside scope
rbac.canExport(token, 'dist/unreal/output.cpp'); // ✗ denied
rbac.canExport(token, 'dist/unity/Player.cs'); // ✓ allowed
```

### Pattern: Audit Trail via Delegation Chain

```typescript
const result = issuer.verifyToken(token);

if (result.valid) {
  console.log('Delegation chain:', result.payload.intent.delegation_chain);
  // Output: ['orchestrator', 'syntax_analyzer', 'ast_optimizer', 'code_generator']

  // Audit: If malicious code detected, trace back to code_generator
}
```

### Pattern: Automatic Key Rotation

```typescript
import { getKeystore } from '@holoscript/core/compiler/identity';

const keystore = getKeystore();

// Retrieve credential (auto-rotates if expired)
const credential = await keystore.getCredential(AgentRole.CODE_GENERATOR);

if (credential) {
  console.log('Token expires:', credential.expiresAt);
  console.log('Key ID:', credential.keyPair.kid);
}

// Manual rotation
await keystore.rotateCredential(AgentRole.CODE_GENERATOR);
console.log('✓ Credential rotated');
```

---

## 8. Troubleshooting

### Error: "Token expired"

**Cause**: Token lifetime exceeded 24 hours.
**Solution**: Keystore automatically rotates. If manual token, re-issue:

```typescript
const newToken = await issuer.issueToken({...}); // Fresh token
```

### Error: "Invalid workflow transition"

**Cause**: Tried to skip workflow steps (e.g., PARSE_TOKENS → SERIALIZE).
**Solution**: Follow sequential workflow:

```typescript
// Correct order:
// 1. PARSE_TOKENS
// 2. BUILD_AST
// 3. ANALYZE_AST
// 4. APPLY_TRANSFORMS
// 5. SELECT_INSTRUCTIONS
// 6. GENERATE_ASSEMBLY
// 7. FORMAT_OUTPUT
// 8. SERIALIZE
```

### Error: "Access denied: Missing required permission"

**Cause**: Agent role doesn't have permission for operation.
**Solution**: Check permission matrix:

```typescript
// Syntax analyzer can only:
// - READ source files
// - WRITE AST
// - Cannot WRITE code or output

// Use appropriate agent role for operation
```

---

## 9. Performance Considerations

### Cache Tokens in Memory

```typescript
const tokenCache = new Map<AgentRole, string>();

async function getOrIssueToken(role: AgentRole): Promise<string> {
  const cached = tokenCache.get(role);

  if (cached) {
    const result = issuer.verifyToken(cached);
    if (result.valid) {
      return cached; // Reuse valid token
    }
  }

  // Issue new token
  const keyPair = await generateAgentKeyPair(role);
  const token = await issuer.issueToken({...});

  tokenCache.set(role, token);
  return token;
}
```

### Batch Compilation with Same Token

```typescript
const token = await issuer.issueToken({...});

// Compile multiple files with same token (valid for 24h)
for (const file of files) {
  const ast = await syntaxAnalyzer.parse(file, token);
  // ...
}
```

---

## 10. Migration from Unauthenticated Compilers

### Before (No Identity)

```typescript
const compiler = new UnityCompiler();
const output = compiler.compile(ast); // No access control
```

### After (With Agent Identity)

```typescript
// 1. Issue token
const token = await issuer.issueToken({
  agentConfig: { role: AgentRole.CODE_GENERATOR, name: 'codegen', version: '1.0.0' },
  workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
  workflowId: 'compile-123',
  initiatedBy: AgentRole.ORCHESTRATOR,
  keyPair: await generateAgentKeyPair(AgentRole.CODE_GENERATOR),
});

// 2. Compile with token
const compiler = new UnityCompiler();
const output = compiler.compile(ast, token, './dist/Player.cs'); // Access controlled
```

---

## Next Steps

1. **Read full documentation**: `AGENT_IDENTITY_FRAMEWORK.md`
2. **Review test suite**: `packages/core/src/compiler/identity/__tests__`
3. **Integrate with your compiler**: Add `agentToken` parameter
4. **Set environment variables**: `AGENT_JWT_SECRET`, `AGENT_KEYSTORE_MASTER_KEY`
5. **Run tests**: `pnpm test src/compiler/identity`

---

**Questions?** See `AGENT_IDENTITY_FRAMEWORK.md` for detailed architecture and troubleshooting.

**Generated**: 2026-02-26 by HoloScript Autonomous Administrator
**Repository**: `c:\Users\josep\Documents\GitHub\HoloScript`
