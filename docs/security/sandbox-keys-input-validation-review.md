# Sandbox, secrets, and untrusted input — review checklist

**Audience:** Security reviewers and release captains.  
**Purpose:** Repeatable pass for **sandbox escapes**, **key handling**, and **input validation** (board: *Security audit: sandbox escapes, key handling, input validation*). Aligns with **Paper #4 / SEC-01** themes (guest code must not instantiate WASM inside the isolate).

---

## 1. HoloScript sandbox (guest / AI-generated code)

| Check | Where / how |
|--------|-------------|
| WASM compile/instantiate blocked in the guest surface | `packages/security-sandbox/src/index.ts` — `createBlockedWebAssemblySurface`, SEC-01 comments |
| Constructor / prototype-chain escape regressions | `packages/security-sandbox/src/__tests__/adversarial-holo.test.ts`, `sandbox.test.ts` |
| vm2 advisory posture | Track upstream `vm2` advisories; keep dependency pinned and reviewed on bump |

**Tests (from repo root):**

```bash
pnpm --filter @holoscript/security-sandbox test
```

---

## 2. API keys and tokens

| Check | Where / how |
|--------|-------------|
| No raw secrets in logs or error payloads | Spot-check: avoid logging full `Authorization`, `x-api-key`, or env values; OAuth path `packages/mcp-server/src/auth/oauth2-provider.ts` |
| Keys from env / vault only | No keys committed; local `.env` in `.gitignore`; HoloMesh keys stay in operator env |
| Registry / bootstrap noise | `packages/mcp-server/src/holomesh/state.ts` logs **counts** only — confirm no material that reconstitutes a key |

---

## 3. Untrusted input

| Check | Where / how |
|--------|-------------|
| User `.holo` / compositions | Strict parse before execution; sandboxed execution for untrusted tiers |
| MCP / tool JSON | Validate at HTTP/MCP boundary before codegen or filesystem writes |
| Studio HTTP APIs | Prefer schema validation (e.g. Zod) on body/query for mutating routes |

---

## 4. Findings

For each issue: **severity**, **file:line**, **repro**, **blast radius**, link to this checklist. Track in your issue system; tie USENIX / Paper #4 claims to closed issues when possible.

---

## Related

- [Security hardening guide](./SECURITY_HARDENING_GUIDE.md)
- [Security policy](./SECURITY.md)
- [Operator runbook](../ops/RUNBOOK.md)
