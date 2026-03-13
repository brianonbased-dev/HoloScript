# x402 Payment Middleware — Threat Model

> **Status**: Draft — Issue #75  
> **Components**: `packages/marketplace-api/src/services/x402PaymentService.ts`, transitive deps from `@coinbase/agentkit`

---

## Scope

The x402 payment middleware (`x402PaymentService.requirePayment`) guards API routes with an HTTP 402 challenge / EIP-712 proof-of-payment flow. This document maps the attack surface, rates findings, and lists remediation steps.

---

## 1. Dependency Vulnerabilities (from `pnpm audit`)

| Severity | Package | Advisory | Path | Fix |
|----------|---------|----------|------|-----|
| **HIGH** | `hono` | [GHSA-q5qw-h33p-qvwr](https://github.com/advisories/GHSA-q5qw-h33p-qvwr) — arbitrary file access via encoded slashes in ServeStatic | `mcp-server > @modelcontextprotocol/sdk > @hono/node-server > hono@4.11.7` | `hono >= 4.7.7` — **pnpm override added** |
| **HIGH** | `@hono/node-server` | [GHSA-wc8c-qw6v-h7f6](https://github.com/advisories/GHSA-wc8c-qw6v-h7f6) — authorization bypass via encoded slashes in ServeStatic | Same path | `@hono/node-server >= 1.14.1` — **pnpm override added** |
| **HIGH** | `@x402/svm` | [GHSA-qr2g-p6q7-w82m](https://github.com/advisories/GHSA-qr2g-p6q7-w82m) — x402 SDK Security Advisory | `@coinbase/agentkit > @x402/svm@2.5.0` | Upgrade `@coinbase/agentkit` when a patched release ships; monitor upstream |
| **HIGH** | `glob` | [GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2) — CLI `-c/--cmd` command injection | `marketplace-web > eslint-config-next@14.2.35` (dev dep) | PR #79: upgrade next → ^16.1.6, eslint-config-next → ^16.1.6 |
| **MOD** | `hono` | [GHSA-5pq2-9x2x-5p6w](https://github.com/advisories/GHSA-5pq2-9x2x-5p6w) — Cookie attribute injection via `setCookie()` | x402 transitive | `hono >= 4.12.7` — **pnpm override added** |
| **MOD** | `hono` | [GHSA-v8w9-8mx6-g223](https://github.com/advisories/GHSA-v8w9-8mx6-g223) / [GHSA-p6xx-57qc-3wxr](https://github.com/advisories/GHSA-p6xx-57qc-3wxr) — prototype pollution via `parseBody({dot:true})` | x402 + mcp-server transitive | Same pnpm override |
| **MOD** | `express-rate-limit` | [GHSA-46wh-pxpv-q5gq](https://github.com/advisories/GHSA-46wh-pxpv-q5gq) | `packages/graphql-api > express-rate-limit@8.2.1` | Upgrade to `>= 7.x` in graphql-api |

### Non-Production-Runtime (tooling only)

These affect build/dev tools and do not execute in deployed services:

| Severity | Package | Advisory | Path |
|----------|---------|----------|------|
| CRITICAL | `basic-ftp` | GHSA-5rq4-664w-9x2c — Path Traversal | benchmarks transitive (88 paths) |
| HIGH | `rollup` | GHSA-mw96-cpmx-2vgc — Arbitrary File Write | build tooling |
| HIGH | `serialize-javascript` | GHSA-5c6j-r48x-rmvq — RCE | `packages/video-tutorials > @remotion/bundler` |
| HIGH | `underscore` | GHSA-qpx9-hpmf-5gmw | `packages/vscode-extension > @vscode/vsce` |
| HIGH | `minimatch` | GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74 — ReDoS | vscode-extension, ESLint build tools |
| HIGH | `parse-duration` | GHSA-hcrg-fc28-fcg5 — ReDoS | benchmarks transitive |
| HIGH | `bigint-buffer` | GHSA-3gc7-fjrx-p6mg — Buffer Overflow | `@coinbase/agentkit` transitive |
| MOD | `nanoid` | GHSA-mwcw-c2x4-8c55 | many build tool paths (129) |
| MOD | `undici` | GHSA-g9mf-h72j-4rw9 | many paths (344) |
| MOD | `esbuild` | GHSA-67mh-4wv8-2f99 | old vitest in react-agent-sdk |
| MOD | `ajv` | GHSA-2g4f-4pwh-qvx6 | ESLint tools (134 paths) |
| MOD | `markdown-it` | GHSA-38c4-r59v-3vqw | typedoc |

---

## 2. Missing On-Chain Transaction Verification

**Risk**: HIGH  
**OWASP**: A04:2021 – Insecure Design

### Description

`x402PaymentService` accepts a `txHash` field from the caller but **never verifies it on-chain**. The current code comments acknowledge this: _"In a real production environment, we would ping the RPC to confirm the txHash."_ An attacker can:

1. Generate a valid ECDSA signature (e.g. from a throwaway wallet with zero balance).
2. Present a fabricated `txHash` (any 32-byte hex string) alongside a legitimate-looking `agentWallet`.
3. `verifyMessage` passes (the signature is cryptographically valid).
4. The route proceeds as if payment was made, even though no ETH was transferred.

### Remediation

Before calling `verifyMessage`, verify the transaction on-chain:

```typescript
// 1. Fetch transaction receipt
const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });

// 2. Check it succeeded
if (!receipt || receipt.status !== 'success') {
  res.status(402).json({ error: 'Transaction not confirmed' });
  return;
}

// 3. Check it targets the recipient and transfers >= costInWei
// (inspect receipt.logs for ERC-20 transfers or receipt.value for native ETH)
```

Use the `WalletConnection.getPublicClient()` helper for chain-aware RPC access.

---

## 3. Replay Attack (No Receipt Deduplication)

**Risk**: HIGH  
**OWASP**: A07:2021 – Identification and Authentication Failures

### Description

A valid `{ txHash, signature, agentWallet }` triple can be replayed across any number of requests. Once an agent pays for one asset, it can present the same receipt to unlock any other protected route.

### Remediation

Track processed receipts in a persistent store (Redis preferred for TTL semantics):

```typescript
const RECEIPT_TTL_SECONDS = 86400; // 24h

// After on-chain verification succeeds:
const receiptKey = `x402:receipt:${txHash}`;
const alreadyUsed = await redis.get(receiptKey);
if (alreadyUsed) {
  res.status(402).json({ error: 'Receipt already consumed' });
  return;
}
await redis.setex(receiptKey, RECEIPT_TTL_SECONDS, '1');
```

Alternatively, include a short-lived timestamp in the signed message and reject receipts older than N minutes.

---

## 4. No Rate Limiting on Signature Verification

**Risk**: MEDIUM  
**OWASP**: A05:2021 – Security Misconfiguration

### Description

`verifyMessage` is a CPU-bound ECDSA operation. Without rate limiting, routes using `requirePayment` can be DoS'd by flooding them with crafted receipts, exhausting the event loop.

### Remediation

Apply `express-rate-limit` ahead of the `requirePayment` middleware:

```typescript
import rateLimit from 'express-rate-limit';

const paymentRateLimit = rateLimit({
  windowMs: 60_000,   // 1 minute window
  max: 20,            // 20 payment attempts per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/asset/:id', paymentRateLimit, x402PaymentService.requirePayment(cost, recipient), handler);
```

Note: `express-rate-limit@8.2.1` in `packages/graphql-api` is itself affected by GHSA-46wh-pxpv-q5gq — upgrade to `>= 7.x`.

---

## 5. WorkspaceService — Hardcoded Encryption Key Fallback

**Risk**: HIGH  
**OWASP**: A02:2021 – Cryptographic Failures

**File**: `packages/registry/src/workspace/WorkspaceService.ts`

### Description

`encryptSecret` / `decryptSecret` fall back to `'default-dev-key-32chars!'` when `HOLOSCRIPT_SECRET_KEY` is not set. This key is committed in the source repository, meaning any deployment that omits the environment variable stores all workspace secrets under a publicly known key.

Additionally, the AES-256-CBC key is derived by `Buffer.from(key.padEnd(32).slice(0,32))` — padding with ASCII spaces, not a KDF. Short or low-entropy keys are not strengthened.

### Remediation

1. **Remove the fallback**: replace `|| 'default-dev-key-32chars!'` with a startup assertion:
   ```typescript
   const rawKey = process.env.HOLOSCRIPT_SECRET_KEY;
   if (!rawKey) throw new Error('HOLOSCRIPT_SECRET_KEY environment variable is required');
   ```
2. **Use a KDF** for the raw key material:
   ```typescript
   import { scryptSync, randomBytes } from 'crypto';
   const derivedKey = scryptSync(rawKey, 'holoscript-workspace', 32); // 256-bit key
   ```
3. Store `HOLOSCRIPT_SECRET_KEY` in a secrets manager (AWS Secrets Manager, HashiCorp Vault).

---

## 6. Error Detail Disclosure

**Risk**: LOW  
**OWASP**: A09:2021 – Security Logging and Monitoring Failures

### Description (Fixed)

The original `x402PaymentService` returned `{ error: "...", details: String(err) }` from the catch block, leaking internal stack traces and error messages to callers.

### Resolution

The catch block now logs server-side (`console.error`) and returns only `{ error: "Payment verification failed" }`. **No action required**.

---

## Summary of Remediations

| # | Finding | Severity | Status | Responsible |
|---|---------|----------|--------|-------------|
| 1 | hono/node-server CVEs | HIGH | ✅ pnpm overrides added | dep mgmt |
| 2 | Missing txHash on-chain verification | HIGH | 🔴 Needs implementation | marketplace-api |
| 3 | Receipt replay attack | HIGH | 🔴 Needs implementation | marketplace-api |
| 4 | No rate limiting | MEDIUM | 🟡 SECURITY comment added | marketplace-api |
| 5 | WorkspaceService hardcoded key | HIGH | 🟡 SECURITY comment added | registry |
| 6 | Error detail leak | LOW | ✅ Fixed in x402PaymentService | — |
| 7 | glob CLI injection (GHSA-5j98-mcp5-4vw2) | HIGH | 🟡 PR #79 open (needs lockfile regen) | marketplace-web dep |
| 8 | express-rate-limit CVE | MOD | 🔴 Upgrade graphql-api dep | graphql-api |
| 9 | @x402/svm advisory | HIGH | 🟡 Monitor @coinbase/agentkit upstream | root dep |
