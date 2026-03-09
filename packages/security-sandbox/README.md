# @holoscript/security-sandbox

VM-based sandbox for secure HoloScript execution. Protects against malicious AI-generated code and provides comprehensive security controls.

## Features

- ✅ **Isolated VM Execution** - No access to filesystem, network, or host process
- ✅ **Parser Validation** - Syntax validation before execution
- ✅ **Resource Limits** - Configurable timeout and memory limits
- ✅ **Audit Logging** - Complete execution audit trail
- ✅ **Source Tracking** - Differentiate between AI-generated, user, and trusted code
- ✅ **80%+ Test Coverage** - Production-ready with comprehensive tests

## Installation

```bash
pnpm add @holoscript/security-sandbox
```

## Quick Start

```typescript
import { HoloScriptSandbox } from '@holoscript/security-sandbox';

const sandbox = new HoloScriptSandbox({
  timeout: 3000, // 3 second max execution time
  memoryLimit: 64, // 64 MB memory limit
  enableLogging: true, // Enable audit logging
});

// Execute AI-generated code safely
const result = await sandbox.executeHoloScript(aiGeneratedCode, {
  source: 'ai-generated',
});

if (result.success) {
  console.log('Executed safely:', result.data);
  console.log('Execution time:', result.metadata.executionTime, 'ms');
} else {
  console.error('Rejected:', result.error);
}
```

## API Reference

### `HoloScriptSandbox`

Main sandbox class for executing HoloScript code.

#### Constructor Options

```typescript
interface SandboxOptions {
  timeout?: number; // Max execution time (ms), default: 5000
  allowedModules?: string[]; // Allowed Node.js modules, default: []
  sandbox?: Record<string, unknown>; // Custom global variables
  enableLogging?: boolean; // Enable audit logging, default: true
  memoryLimit?: number; // Memory limit (MB), default: 128
}
```

#### Methods

##### `executeHoloScript<T>(code: string, meta?: { source: 'ai-generated' | 'user' | 'trusted' }): Promise<SandboxResult<T>>`

Executes HoloScript code in the sandbox.

```typescript
const result = await sandbox.executeHoloScript(
  `
  cube {
    @color(red)
    @position(0, 1, 0)
  }
`,
  { source: 'user' }
);
```

##### `getAuditLogs(filter?: AuditFilter): SecurityAuditLog[]`

Retrieves security audit logs.

```typescript
// Get all AI-generated code attempts
const aiLogs = sandbox.getAuditLogs({ source: 'ai-generated' });

// Get failed executions in last hour
const recentFailures = sandbox.getAuditLogs({
  startTime: Date.now() - 3600000,
  success: false,
});
```

##### `getSecurityStats(): SecurityStats`

Returns security statistics.

```typescript
const stats = sandbox.getSecurityStats();
console.log('Total executions:', stats.total);
console.log('Rejected:', stats.rejected);
console.log('By source:', stats.bySource);
```

##### `clearAuditLogs(): void`

Clears the audit log history.

### `executeSafely<T>(code: string, options?: SandboxOptions): Promise<SandboxResult<T>>`

Convenience function for one-off executions.

```typescript
import { executeSafely } from '@holoscript/security-sandbox';

const result = await executeSafely(untrustedCode, {
  timeout: 1000,
  source: 'ai-generated',
});
```

## Security Protections

### 1. Syntax Validation

All code is validated against the HoloScript parser before execution:

```typescript
// Invalid syntax is rejected before VM execution
const result = await sandbox.executeHoloScript('cube {{{ invalid');
// result.error.type === 'validation'
```

### 2. Filesystem Isolation

```typescript
// Attempting to access filesystem is blocked
const result = await sandbox.executeHoloScript(`
  const fs = require('fs');
  fs.readFileSync('/etc/passwd');
`);
// result.error.type === 'runtime'
```

### 3. Network Isolation

```typescript
// Network access is prevented
const result = await sandbox.executeHoloScript(`
  const http = require('http');
  http.get('http://malicious.com');
`);
// result.error.type === 'runtime'
```

### 4. Timeout Protection

```typescript
const sandbox = new HoloScriptSandbox({ timeout: 1000 });

// Infinite loops are terminated
const result = await sandbox.executeHoloScript('while(true) {}');
// result.error.type === 'timeout'
```

## Audit Logging

The sandbox maintains a complete audit trail of all executions:

```typescript
const sandbox = new HoloScriptSandbox({ enableLogging: true });

await sandbox.executeHoloScript(code1, { source: 'ai-generated' });
await sandbox.executeHoloScript(code2, { source: 'user' });

// Retrieve logs
const logs = sandbox.getAuditLogs();
/*
[
  {
    timestamp: 1709251200000,
    source: 'ai-generated',
    action: 'validate',
    success: true,
    codeHash: 'a1b2c3'
  },
  {
    timestamp: 1709251201000,
    source: 'ai-generated',
    action: 'execute',
    success: true,
    codeHash: 'a1b2c3'
  },
  ...
]
*/
```

## Best Practices

### 1. Always Validate AI-Generated Code

```typescript
const result = await sandbox.executeHoloScript(aiOutput, {
  source: 'ai-generated',
});

if (!result.success) {
  // Log rejection for AI fine-tuning
  console.warn('AI generated invalid code:', result.error);
}
```

### 2. Set Appropriate Timeouts

```typescript
// Short timeout for simple operations
const quickSandbox = new HoloScriptSandbox({ timeout: 1000 });

// Longer timeout for complex scenes
const sceneSandbox = new HoloScriptSandbox({ timeout: 10000 });
```

### 3. Monitor Security Stats

```typescript
setInterval(() => {
  const stats = sandbox.getSecurityStats();

  // Alert if rejection rate > 10%
  const rejectionRate = stats.rejected / stats.total;
  if (rejectionRate > 0.1) {
    console.warn('High rejection rate:', rejectionRate);
  }
}, 60000);
```

### 4. Review Audit Logs Regularly

```typescript
// Daily security review
const yesterday = Date.now() - 86400000;
const suspiciousLogs = sandbox.getAuditLogs({
  startTime: yesterday,
  source: 'ai-generated',
  success: false,
});

if (suspiciousLogs.length > threshold) {
  // Alert security team
}
```

## Use Cases

### AI Code Generation

```typescript
const sandbox = new HoloScriptSandbox({
  timeout: 5000,
  enableLogging: true,
});

// Validate AI-generated scene
const aiCode = await anthropic.completions.create({
  model: 'claude-3-opus',
  prompt: 'Generate a HoloScript VR forest scene',
});

const result = await sandbox.executeHoloScript(aiCode, {
  source: 'ai-generated',
});

if (result.success) {
  renderScene(result.data);
} else {
  // Provide feedback to AI
  regenerateWithFeedback(result.error.message);
}
```

### User-Generated Content

```typescript
// Safely execute user-submitted HoloScript
app.post('/execute-scene', async (req, res) => {
  const result = await sandbox.executeHoloScript(req.body.code, {
    source: 'user',
  });

  if (result.success) {
    res.json({ success: true, scene: result.data });
  } else {
    res.status(400).json({ error: result.error.message });
  }
});
```

### MCP Server Integration

```typescript
import { HoloScriptSandbox } from '@holoscript/security-sandbox';

// In MCP tool handler
async function handleGenerateScene(args: any) {
  const sandbox = new HoloScriptSandbox({
    timeout: 3000,
    enableLogging: true,
  });

  const result = await sandbox.executeHoloScript(args.generatedCode, {
    source: 'ai-generated',
  });

  if (!result.success) {
    throw new Error(`Generated code failed validation: ${result.error.message}`);
  }

  return result.data;
}
```

## License

MIT © Brian X Base Team
