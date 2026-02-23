# HoloScript Security Hardening Guide

**Version**: 3.1  
**Classification**: Internal | Production Security  
**Last Updated**: February 12, 2026

---

## Executive Summary

This guide addresses critical security gaps identified in the uAA2++ research audit:
- PartnerSDK uses placeholder hash functions ❌
- Missing input validation framework ⚠️
- No rate limiting on API endpoints ⚠️
- Limited permission/authorization checks ⚠️

**Target**: SecurityAudit Passing + OWASP Top 10 Compliance by v3.1 release

---

## 1. Cryptographic Hardening

### ❌ Current Issues

**File**: `packages/core/src/partner/PartnerSDKTrait.ts`

```typescript
// VULNERABLE - DO NOT USE
function hashToken(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = (hash << 5) - hash + char;
  }
  return hash.toString(16);
}
```

**Issues**:
- ❌ Not cryptographically secure
- ❌ Collisions possible
- ❌ Reversible in many cases
- ❌ No salt/pepper

### ✅ Solution: Use standard libraries

```typescript
import * as crypto from 'crypto';

/**
 * Secure token hashing with PBKDF2
 */
export function secureHashToken(token: string): string {
  const salt = crypto.randomBytes(32);
  const hash = crypto.pbkdf2Sync(
    token,
    salt,
    100000, // iterations
    48, // keyLength
    'sha256'
  );
  return Buffer.concat([salt, hash]).toString('base64');
}

/**
 * Verify token against hash
 */
export function verifyToken(token: string, hash: string): boolean {
  const buffer = Buffer.from(hash, 'base64');
  const salt = buffer.slice(0, 32);
  const storedHash = buffer.slice(32);
  
  const computed = crypto.pbkdf2Sync(
    token,
    salt,
    100000,
    48,
    'sha256'
  );
  
  return crypto.timingSafeEqual(computed, storedHash);
}
```

**Implementation**:
```bash
# File to create
packages/core/src/security/CryptoUtils.ts

# Update dependencies
npm install --save-exact crypto-js
```

---

## 2. Input Validation Framework

### ❌ Current Issues

Missing centralized validation allows:
- SQL injection (if using databases)
- XSS attacks (if rendering untrusted content)
- Type confusion attacks
- Buffer overflows

### ✅ Solution: Zod validation schema

```typescript
import { z } from 'zod';

// Define schemas for all inputs
export const AgentActionSchema = z.object({
  agentId: z.string().uuid(),
  actionType: z.enum(['spawn', 'move', 'delete', 'modify']),
  parameters: z.record(z.unknown()).superRefine((obj, ctx) => {
    // Custom validation
    if (obj.position && !Array.isArray(obj.position)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'position must be array [x, y, z]',
      });
    }
  }),
  confidence: z.number().min(0).max(1),
});

export type AgentAction = z.infer<typeof AgentActionSchema>;

/**
 * Safe input validation
 */
export function validateAgentAction(input: unknown): AgentAction {
  return AgentActionSchema.parse(input);
}

// With error handling
export function tryValidateAgentAction(input: unknown): AgentAction | null {
  try {
    return AgentActionSchema.parse(input);
  } catch (error) {
    console.error('Validation failed:', error);
    return null;
  }
}
```

**Installation**:
```bash
npm install --save zod
```

**Usage**:
```typescript
// In HITLManager
const validatedAction = validateAgentAction(input);
// ...rest of logic
```

---

## 3. Rate Limiting

### ❌ Current Issues

No protection against:
- Brute force attacks
- DDoS attacks
- API abuse

### ✅ Solution: Rate limiter middleware

```typescript
/**
 * Token-bucket rate limiter
 * File: packages/core/src/security/RateLimiter.ts
 */

export interface RateLimiterConfig {
  tokens: number; // Tokens per window
  windowMs: number; // Time window in ms
  keyGenerator: (req: any) => string; // Extract unique ID
}

export class RateLimiter {
  private buckets = new Map<string, { tokens: number; refillAt: number }>();
  private config: Required<RateLimiterConfig>;

  constructor(config: RateLimiterConfig) {
    this.config = {
      ...config,
    };
  }

  /**
   * Check if request allowed
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.refillAt) {
      // Create or refill bucket
      bucket = {
        tokens: this.config.tokens,
        refillAt: now + this.config.windowMs,
      };
    }

    if (bucket.tokens > 0) {
      bucket.tokens--;
      this.buckets.set(key, bucket);
      return true;
    }

    return false;
  }

  /**
   * Get remaining tokens
   */
  getRemainingTokens(key: string): number {
    const bucket = this.buckets.get(key);
    return bucket?.tokens ?? this.config.tokens;
  }
}

// Usage
const limiter = new RateLimiter({
  tokens: 100,
  windowMs: 60000, // 1 minute
  keyGenerator: (req) => req.userId,
});

// Check before API call
if (!limiter.isAllowed(userId)) {
  throw new Error('Rate limit exceeded');
}
```

---

## 4. Authorization & Permission Framework

### ❌ Current Issues

Missing:
- Role-based access control (RBAC)
- Fine-grained permissions
- Audit logging

### ✅ Solution: RBAC implementation

```typescript
/**
 * File: packages/core/src/security/AuthorizationManager.ts
 */

export enum Role {
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  USER = 'user',
  GUEST = 'guest',
}

export enum Permission {
  CREATE_AGENT = 'create_agent',
  DELETE_AGENT = 'delete_agent',
  MODIFY_SCENE = 'modify_scene',
  EXECUTE_ACTION = 'execute_action',
  APPROVE_HITL = 'approve_hitl',
  VIEW_AUDIT_LOG = 'view_audit_log',
}

const rolePermissions: Record<Role, Permission[]> = {
  [Role.ADMIN]: [
    Permission.CREATE_AGENT,
    Permission.DELETE_AGENT,
    Permission.MODIFY_SCENE,
    Permission.EXECUTE_ACTION,
    Permission.APPROVE_HITL,
    Permission.VIEW_AUDIT_LOG,
  ],
  [Role.MODERATOR]: [
    Permission.MODIFY_SCENE,
    Permission.EXECUTE_ACTION,
    Permission.APPROVE_HITL,
  ],
  [Role.USER]: [Permission.EXECUTE_ACTION],
  [Role.GUEST]: [],
};

export class AuthorizationManager {
  /**
   * Check if user has permission
   */
  static hasPermission(userRole: Role, permission: Permission): boolean {
    return rolePermissions[userRole].includes(permission);
  }

  /**
   * Enforce permission check
   */
  static requirePermission(userRole: Role, permission: Permission): void {
    if (!this.hasPermission(userRole, permission)) {
      throw new Error(
        `Permission denied: ${userRole} cannot ${permission}`
      );
    }
  }

  /**
   * Audit log
   */
  static auditAction(
    userId: string,
    action: string,
    resource: string,
    allowed: boolean
  ): void {
    console.log(
      `[AUDIT] user=${userId}, action=${action}, resource=${resource}, allowed=${allowed}`
    );
    // Write to persistent audit log
  }
}

// Usage
try {
  AuthorizationManager.requirePermission(userRole, Permission.DELETE_AGENT);
  // Execute action
  AuthorizationManager.auditAction(userId, 'delete_agent', agentId, true);
} catch (error) {
  AuthorizationManager.auditAction(userId, 'delete_agent', agentId, false);
  throw error;
}
```

---

## 5. Secure Dependencies

### Audit tools

```bash
# Check for vulnerabilities
npm audit

# Fix automatically
npm audit fix

# Create lock file
npm ci

# Check specific package
npm audit --package=zod
```

### Add to CI/CD

```yaml
# .github/workflows/security.yml
name: Security Audit

on: [push, pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      
      - name: Run npm audit
        run: npm audit --audit-level=moderate
      
      - name: Run npm outdated check
        run: npm outdated || true
```

---

## 6. Secrets Management

### ❌ Problems

```typescript
// NEVER DO THIS
const API_KEY = 'sk-1234567890abcdef';
export const config = { apiKey: API_KEY };
```

### ✅ Solution: Environment variables

```bash
# .env (never commit)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=ant-...
WEBHOOK_SECRET=...

# .env.example (commit this)
OPENAI_API_KEY=sk_placeholder_change_me
ANTHROPIC_API_KEY=ant_placeholder_change_me
WEBHOOK_SECRET=change_me
```

```typescript
// Load from environment
export const config = {
  openaiKey: process.env.OPENAI_API_KEY,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
} as const;

if (!config.openaiKey) {
  throw new Error('OPENAI_API_KEY not set');
}
```

---

## 7. Data Protection

### Encryption at rest

```typescript
import * as crypto from 'crypto';

// For sensitive data in storage
export function encryptSensitiveData(
  data: string,
  masterKey: Buffer
): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(data, 'utf-8'),
    cipher.final(),
  ]);
  
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptSensitiveData(
  encryptedData: string,
  masterKey: Buffer
): string {
  const buffer = Buffer.from(encryptedData, 'base64');
  const iv = buffer.slice(0, 16);
  const tag = buffer.slice(16, 32);
  const cipher = buffer.slice(32);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAuthTag(tag);
  
  return decipher.update(cipher, undefined, 'utf8') + decipher.final('utf8');
}
```

---

## Implementation Checklist

- [ ] Replace placeholder crypto functions
- [ ] Add Zod validation schemas for all inputs
- [ ] Implement RateLimiter
- [ ] Add AuthorizationManager
- [ ] Create audit logging system
- [ ] Set up environment variable system
- [ ] Add security headers middleware
- [ ] Configure CORS properly
- [ ] Add request signing for APIs
- [ ] Set up security scanning in CI/CD

---

## Testing Security

```bash
# OWASP dependency check
npm install --save-dev audit-ci
npx audit-ci --moderate

# Test injection vulnerabilities
npm install --save-dev snyk
npx snyk test

# Check for secrets
npm install --save-dev detect-secrets
```

---

## Resources

- **OWASP Top 10**: https://owasp.org/www-project-top-ten/
- **npm security**: https://docs.npmjs.com/packages-and-modules/securing-npm
- **Node.js crypto**: https://nodejs.org/api/crypto.html
- **Zod validation**: https://zod.dev

---

## Review Schedule

- Weekly: Dependency updates
- Monthly: Security audit
- Quarterly: Penetration testing
- Annually: Third-party security review

---

**Status**: 🟡 READY TO IMPLEMENT  
**Effort**: 2-3 weeks  
**Priority**: HIGH (blocks v3.1 release)
