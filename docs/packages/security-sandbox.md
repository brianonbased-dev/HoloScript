# Security Sandbox

**Isolated execution environment for untrusted HoloScript code.** Uses vm2-based sandboxing with resource limits, capability restrictions, and security auditing.

## Overview

The Security Sandbox runs user-generated code safely without access to host system resources, file system, or sensitive environment variables.

## Installation

```bash
npm install @holoscript/security-sandbox
```

## Quick Start

```typescript
import { Sandbox } from '@holoscript/security-sandbox';

const sandbox = new Sandbox({
  timeout: 5000, // 5 second execution limit
  memory: 128 * 1024 * 1024, // 128 MB limit
});

// Execute untrusted code
const result = await sandbox.run(`
  return {
    sum: 1 + 2 + 3,
    message: 'Hello from sandbox!'
  };
`);

console.log(result.output); // { sum: 6, message: 'Hello from sandbox!' }
console.log(result.executionTime); // ms
console.log(result.safe); // true (no violations)
```

## Execution Context

### Pass Data In

```typescript
const result = await sandbox.run(
  `
  return {
    doubled: input.value * 2,
    name: input.name.toUpperCase()
  };
`,
  {
    input: {
      value: 42,
      name: 'alice',
    },
  }
);

console.log(result.output); // { doubled: 84, name: 'ALICE' }
```

### Resource Limits

```typescript
const sandbox = new Sandbox({
  timeout: 5000, // Max execution time
  memory: 256 * 1024 * 1024, // Max memory
  cpuTicks: 100000, // Instruction limit
  maxArrayLength: 10000, // Array size limit
  maxStringLength: 1000000, // String size limit
});
```

### Capability Restrictions

```typescript
const sandbox = new Sandbox({
  allowedGlobals: [
    'Math',
    'JSON',
    'Array',
    'String',
    'Object',
    // No: fs, require, process, child_process, etc.
  ],
  deniedPatterns: [
    'eval', // Block eval
    'Function', // Block Function constructor
    '__proto__', // Block prototype pollution
    'constructor', // Block constructor access
  ],
});
```

## Safety Verification

```typescript
const result = await sandbox.run(userCode);

if (!result.safe) {
  console.error('Code violated security policy');
  console.log(result.violations); // What was attempted
  console.log(result.securityGrade); // A-F rating
}

// A = No access attempts
// B = Attempted benign access
// C = Challenged access (blocked)
// D = Multiple violations
// F = Critical violations
```

## Audit Logging

```typescript
const sandbox = new Sandbox({
  audit: true, // Log all operations
});

const result = await sandbox.run(userCode);

console.log(result.auditLog); // Array of all operations attempted
// [
//   { operation: 'global_access', name: 'Math' },
//   { operation: 'function_call', name: 'Math.random' },
//   { operation: 'array_access', index: 0 },
//   { operation: 'blocked', reason: 'fs not in allowedGlobals' }
// ]
```

## Error Handling

```typescript
try {
  const result = await sandbox.run(untrustedCode);

  if (result.safe) {
    console.log('Output:', result.output);
  } else {
    console.error('Unsafe code detected:', result.violations);
  }
} catch (error) {
  if (error.code === 'TIMEOUT') {
    console.error('Code execution exceeded timeout');
  } else if (error.code === 'MEMORY_EXCEEDED') {
    console.error('Code used too much memory');
  } else if (error.code === 'SYNTAX_ERROR') {
    console.error('Invalid code:', error.message);
  }
}
```

## Advanced: Custom Sandbox

```typescript
import { createSandbox } from '@holoscript/security-sandbox';

const customSandbox = createSandbox({
  // Core limits
  timeout: 10000,
  memory: 512 * 1024 * 1024, // 512 MB

  // Allowed APIs
  allowedGlobals: ['Math', 'JSON', 'Array', 'String', 'Object', 'Date'],
  allowedModules: [], // No require()

  // Security
  preventEval: true,
  preventFunctionConstructor: true,
  preventPrototypeAccess: true,

  // Auditing
  audit: true,
  auditHooks: {
    onGlobalAccess: (name) => console.log(`Accessed ${name}`),
    onFunctionCall: (fn) => console.log(`Called ${fn.name}`),
    onPropertyAccess: (obj, prop) => console.log(`Accessed ${obj}.${prop}`),
  },
});
```

## Testing Code Safety

```typescript
const tests = [
  {
    name: 'Safe arithmetic',
    code: 'return 2 + 2;',
    expectedSafe: true,
  },
  {
    name: 'Attempt file read',
    code: 'return require("fs").readFileSync("/etc/passwd");',
    expectedSafe: false,
  },
  {
    name: 'Complex algorithm',
    code: `
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += i;
      return sum;
    `,
    expectedSafe: true,
  },
];

for (const test of tests) {
  const result = await customSandbox.run(test.code);
  console.log(test.name, result.safe === test.expectedSafe ? '✓' : '✗');
}
```

## Integration with HoloScript

```typescript
import { Sandbox } from '@holoscript/security-sandbox';
import { parse } from '@holoscript/core';

// Parse HoloScript composition
const holo = parse(`
  composition "Game" {
    template "Gameplay" {
      action calculateScore(multiplier) {
        // User-provided logic
        return this.baseScore * multiplier;
      }
    }
  }
`);

// Execute action in sandbox
const sandbox = new Sandbox();
const result = await sandbox.run(
  `
  return calculateScore(2.5);
`,
  {
    calculateScore: (mult) => 100 * mult,
    baseScore: 100,
  }
);
```

## Environment Variables

```bash
# Sandbox limits
SANDBOX_TIMEOUT=5000
SANDBOX_MEMORY=268435456  # 256 MB in bytes
SANDBOX_CPU_TICKS=100000

# Security
SANDBOX_PREVENT_EVAL=true
SANDBOX_PREVENT_ACCESS=true

# Auditing
SANDBOX_AUDIT=true
SANDBOX_AUDIT_VERBOSE=false
```

## Performance

- **Overhead**: ~1-5ms per execution
- **Memory**: ~2-5MB per sandbox instance
- **Max concurrency**: Limited by system resources

Use connection pooling for high-throughput scenarios:

```typescript
import { SandboxPool } from '@holoscript/security-sandbox';

const pool = new SandboxPool({
  size: 10, // 10 sandboxes
  timeout: 5000,
});

// Distribute work across pool
const promises = userCodes.map((code) => pool.run(code));
const results = await Promise.all(promises);
```

## Best Practices

1. **Always validate before sandboxing** — Catch syntax errors early
2. **Set reasonable timeouts** — 5 seconds for typical code, 30s max
3. **Monitor resource usage** — Alert on high memory/CPU consumption
4. **Audit all executions** — Log for security analysis
5. **Use capability allowlists** — Deny by default, allow specific APIs
6. **Test edge cases** — See what happens at limits
7. **Update vm2 regularly** — Security patches are critical

## See Also

- [Auth](../packages/auth.md) — User authentication before sandbox execution
- [AI Validator](../packages/ai-validator.md) — Detect hallucinations in generated code before sandboxing
- [Partner SDK](../packages/partner-sdk.md) — Safe webhook execution
