# Agent Proof-of-Possession (PoP) Usage Examples

This document demonstrates how to use the HTTP Message Signatures implementation for agent request signing.

## Table of Contents

1. [Client-Side: Signing Requests](#client-side-signing-requests)
2. [Server-Side: Verifying Signatures](#server-side-verifying-signatures)
3. [Complete End-to-End Example](#complete-end-to-end-example)
4. [Testing PoP Implementation](#testing-pop-implementation)

---

## Client-Side: Signing Requests

### 1. Generate Agent Credentials

```typescript
import {
  AgentRole,
  AgentConfig,
  generateAgentKeyPair,
  getTokenIssuer,
} from '@holoscript/core/compiler/identity';

// Generate key pair for agent
const keyPair = await generateAgentKeyPair(AgentRole.CODE_GENERATOR);

// Configure agent
const agentConfig: AgentConfig = {
  role: AgentRole.CODE_GENERATOR,
  name: 'unity-codegen-v1',
  version: '1.0.0',
};

// Issue JWT token
const tokenIssuer = getTokenIssuer();
const token = await tokenIssuer.issueToken({
  agentConfig,
  workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
  workflowId: 'compile-unity-project-123',
  initiatedBy: AgentRole.ORCHESTRATOR,
  keyPair,
});
```

### 2. Sign HTTP Request

```typescript
import {
  signRequest,
  calculateContentDigest,
  formatSignatureHeaders,
  SignatureComponents,
} from '@holoscript/core/compiler/identity';

// Prepare request
const method = 'POST';
const targetUri = '/api/compile';
const requestBody = JSON.stringify({ code: 'holoscript code...' });

// Create signature components
const components: SignatureComponents = {
  '@method': method,
  '@target-uri': targetUri,
  '@request-timestamp': 0, // Will be set by signRequest
  '@nonce': '', // Will be set by signRequest
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
  'content-digest': calculateContentDigest(requestBody),
};

// Sign request
const httpSignature = signRequest(components, keyPair);

// Format headers
const signatureHeaders = formatSignatureHeaders(httpSignature);

// Make HTTP request with signature
const response = await fetch('https://api.holoscript.dev/api/compile', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Content-Digest': calculateContentDigest(requestBody),
    Signature: signatureHeaders.Signature,
    'Signature-Input': signatureHeaders['Signature-Input'],
  },
  body: requestBody,
});
```

---

## Server-Side: Verifying Signatures

### 1. Express Middleware Setup

```typescript
import express from 'express';
import { createPopMiddleware, AgentPermission } from '@holoscript/core/compiler/identity';

const app = express();
app.use(express.json());

// Apply PoP middleware globally
app.use(
  createPopMiddleware({
    allowLegacy: false, // Require signatures (no backward compatibility)
    excludePaths: ['/health', '/metrics'], // Public endpoints
  })
);

// Protected endpoint
app.post('/api/compile', async (req, res) => {
  // req.agent is populated by middleware
  console.log(`Compilation requested by: ${req.agent.agent_role}`);
  console.log(`Workflow ID: ${req.agent.intent.workflow_id}`);

  // Perform compilation
  const result = await compile(req.body.code);
  res.json(result);
});
```

### 2. Permission-Based Authorization

```typescript
import { requirePermission, AgentPermission } from '@holoscript/core/compiler/identity';

// Require specific permission for endpoint
app.post(
  '/api/optimize',
  createPopMiddleware(),
  requirePermission(AgentPermission.TRANSFORM_AST),
  async (req, res) => {
    // Only agents with TRANSFORM_AST permission can access
    const optimized = await optimizeAST(req.body.ast);
    res.json(optimized);
  }
);
```

### 3. Workflow Step Validation

```typescript
import { requireWorkflowStep, WorkflowStep } from '@holoscript/core/compiler/identity';

// Require specific workflow step
app.post(
  '/api/export',
  createPopMiddleware(),
  requireWorkflowStep(WorkflowStep.SERIALIZE),
  async (req, res) => {
    // Only agents in SERIALIZE step can export
    const exported = await exportToUnity(req.body.code);
    res.json(exported);
  }
);
```

---

## Complete End-to-End Example

### Client Code

```typescript
import {
  AgentRole,
  AgentConfig,
  WorkflowStep,
  generateAgentKeyPair,
  getTokenIssuer,
  signRequest,
  calculateContentDigest,
  formatSignatureHeaders,
} from '@holoscript/core/compiler/identity';

async function compileWithPoP() {
  // 1. Setup agent identity
  const keyPair = await generateAgentKeyPair(AgentRole.CODE_GENERATOR);
  const agentConfig: AgentConfig = {
    role: AgentRole.CODE_GENERATOR,
    name: 'unity-codegen',
    version: '1.0.0',
  };

  const tokenIssuer = getTokenIssuer();
  const token = await tokenIssuer.issueToken({
    agentConfig,
    workflowStep: WorkflowStep.GENERATE_ASSEMBLY,
    workflowId: 'compile-123',
    initiatedBy: AgentRole.ORCHESTRATOR,
    keyPair,
  });

  // 2. Prepare request
  const requestBody = JSON.stringify({
    code: 'holoscript { scene MainScene { ... } }',
    target: 'unity',
  });

  // 3. Sign request
  const components = {
    '@method': 'POST',
    '@target-uri': '/api/compile',
    '@request-timestamp': 0,
    '@nonce': '',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'content-digest': calculateContentDigest(requestBody),
  };

  const httpSignature = signRequest(components, keyPair);
  const signatureHeaders = formatSignatureHeaders(httpSignature);

  // 4. Make request
  const response = await fetch('http://localhost:3000/api/compile', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Digest': components['content-digest']!,
      Signature: signatureHeaders.Signature,
      'Signature-Input': signatureHeaders['Signature-Input'],
    },
    body: requestBody,
  });

  const result = await response.json();
  console.log('Compilation result:', result);
}

compileWithPoP().catch(console.error);
```

### Server Code

```typescript
import express from 'express';
import { createPopMiddleware } from '@holoscript/core/compiler/identity';

const app = express();
app.use(express.json());

// Enable PoP verification
app.use(
  createPopMiddleware({
    allowLegacy: false,
    excludePaths: ['/health'],
    onError: (error, req, res) => {
      console.error('PoP verification error:', error);
      res.status(500).json({ error: 'Internal server error' });
    },
  })
);

app.post('/api/compile', async (req, res) => {
  try {
    // Agent identity verified by middleware
    console.log(`Agent: ${req.agent.agent_role}`);
    console.log(`Workflow: ${req.agent.intent.workflow_id}`);

    // Perform compilation
    const compiled = await performCompilation(req.body);
    res.json({ success: true, result: compiled });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Server listening on port 3000 with PoP enabled');
});
```

---

## Testing PoP Implementation

### Test Signature Generation

```typescript
import { describe, it, expect } from 'vitest';
import {
  signRequest,
  verifySignature,
  constructSignatureBase,
} from '@holoscript/core/compiler/identity';

describe('PoP Signature Flow', () => {
  it('should sign and verify request', async () => {
    // Generate key pair
    const keyPair = await generateAgentKeyPair(AgentRole.CODE_GENERATOR);

    // Create components
    const components = {
      '@method': 'POST',
      '@target-uri': '/api/compile',
      '@request-timestamp': 0,
      '@nonce': '',
    };

    // Sign
    const httpSignature = signRequest(components, keyPair);

    // Reconstruct for verification
    const enrichedComponents = {
      ...components,
      '@request-timestamp': httpSignature.metadata.created,
      '@nonce': httpSignature.metadata.nonce,
    };

    const signatureBase = constructSignatureBase(enrichedComponents, httpSignature.metadata);

    // Verify
    const result = verifySignature(
      signatureBase,
      httpSignature.signature,
      keyPair.publicKey,
      httpSignature.metadata
    );

    expect(result.valid).toBe(true);
  });
});
```

### Test Replay Attack Prevention

```typescript
it('should prevent replay attacks', async () => {
  const keyPair = await generateAgentKeyPair(AgentRole.CODE_GENERATOR);
  const nonce = generateNonce();

  const components = {
    '@method': 'POST',
    '@target-uri': '/api/test',
    '@request-timestamp': 0,
    '@nonce': '',
  };

  const httpSignature = signRequest(components, keyPair, nonce);

  const enrichedComponents = {
    ...components,
    '@request-timestamp': httpSignature.metadata.created,
    '@nonce': httpSignature.metadata.nonce,
  };

  const signatureBase = constructSignatureBase(enrichedComponents, httpSignature.metadata);

  // First verification succeeds
  const result1 = verifySignature(
    signatureBase,
    httpSignature.signature,
    keyPair.publicKey,
    httpSignature.metadata
  );
  expect(result1.valid).toBe(true);

  // Second verification with same nonce fails (replay attack)
  const result2 = verifySignature(
    signatureBase,
    httpSignature.signature,
    keyPair.publicKey,
    httpSignature.metadata
  );
  expect(result2.valid).toBe(false);
  expect(result2.errorCode).toBe('REPLAY_ATTACK');
});
```

---

## Security Best Practices

1. **Always include Content-Digest** for POST/PUT requests to prevent body tampering
2. **Rotate keys every 24 hours** to limit exposure window
3. **Use HTTPS** - PoP protects token binding, but HTTPS protects transport
4. **Monitor nonce cache size** - implement cleanup for production deployments
5. **Set short token lifetimes** (24 hours max) to reduce replay window
6. **Enable strict workflow validation** to prevent out-of-sequence operations

---

## Troubleshooting

### Common Errors

**MISSING_SIGNATURE**: Request missing Signature or Signature-Input headers

- Solution: Ensure client calls `formatSignatureHeaders()` and includes headers

**INVALID_SIGNATURE**: Signature verification failed

- Solution: Check that public key in token matches signing private key

**REPLAY_ATTACK**: Nonce already used

- Solution: Generate fresh nonce for each request (automatic in `signRequest()`)

**EXPIRED**: Request too old or timestamp in future

- Solution: Ensure client and server clocks are synchronized (NTP)

### Debug Logging

Enable detailed logging:

```typescript
const middleware = createPopMiddleware({
  allowLegacy: false,
  onError: (error, req, res) => {
    console.error('[PoP Debug]', {
      error: error.message,
      headers: req.headers,
      path: req.path,
    });
  },
});
```

---

For more details, see:

- [RFC 9440: HTTP Message Signatures](https://datatracker.ietf.org/doc/html/rfc9440)
- [Agentic JWT Specification](https://datatracker.ietf.org/doc/html/draft-goswami-agentic-jwt-00)
