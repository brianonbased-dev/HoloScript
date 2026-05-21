# Audit Validation Report & Actionable Roadmap
**Generated:** 2026-03-22  
**Status:** 🔴 **PARTIALLY STALE** — security claims materially understated current risk

---

## 1. VALIDATION SUMMARY

### ✅ Verified Claims (Fixes Applied Successfully)
| Finding | Claim | Status | Evidence |
|---------|-------|--------|----------|
| **Remove wagmi** | Removed from core package | ✅ VALID | Only in comment, zero imports in /src |
| **Add zod** | Added to core dependencies | ✅ VALID | packages/core/package.json line 147: `"zod": "^3.24.0"` |
| **Upgrade puppeteer** | Bumped to ^23.0.0 | ✅ VALID | packages/core/package.json line 168 (peerDep) |
| **Dependency alignment** | TypeScript & vitest synchronized | ✅ VALID | pnpm-lock.yaml shows aligned versions (^5.9.3, ^4.0.18) |
| **Code deduplication** | Compiler utilities extracted | ⚠️ PARTIAL | No @holoscript/compiler-utils package yet |
| **Security fixes** | Puppeteer/Next.js upgrades | ⚠️ PARTIAL | Puppeteer ✅, but live audit still shows 21+ high/critical findings |

### ⚠️ Stale/Needs Verification Claims
| Finding | Claim | Current Status | Action Required |
|---------|-------|-----------------|-----------------|
| **Circular dependencies** | 6 cycles fixed via refactoring | ❓ UNKNOWN | Need to run madge/cycle detection |
| **Build time baseline** | 9.68s recorded | ❓ UNKNOWN | Need current benchmark |
| **Security audit results** | 24→15 vulnerabilities (37.5% reduction) | 🔴 FALSE | Live audit shows 21+ distinct high/critical findings still active |
| **Test suite** | All tests passing after upgrades | 🟡 PARTIAL | Studio typecheck failing (missing imports) |

---

## 2. CURRENT BLOCKERS FOUND

### 🔴 P0: Studio Typecheck Failure
**Issue:** `packages/studio` fails on `tsc --noEmit`

**Evidence from daemon logs:**
```
packages/studio: ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL @holoscript/studio@0.1.0 typecheck: `tsc --noEmit`
Exit status 2
```

**Root cause:** Cannot find module `@holoscript/core/lib/shaderGraph` & other missing imports

**Impact:** Cannot run full test suite, blocks verification of security fixes

**Fix:** Rebuild packages/core, regenerate exports

---

### 🔴 P1: Remaining Security Vulnerabilities
**Live audit cross-check** shows the previous reduction claim is stale. Current high/critical clusters include:

- `basic-ftp <5.2.0` via puppeteer transitive chain
- `minimatch` across multiple ranges and packages
- `undici` across multiple ranges and packages
- `@modelcontextprotocol/sdk@0.6.1`
- `rollup@4.55.1`
- `flatted@3.3.3`
- `serialize-javascript@6.0.2`
- `socket.io-parser`
- `underscore@1.13.7`
- `@hono/node-server`
- `express-rate-limit@8.2.1`
- `bigint-buffer@1.1.5` with no upstream patch
- `parse-duration@1.1.2`
- `@x402/svm@2.5.0`

**Root-cause clusters** confirmed by the audit cross-reference:

- `ipfs-http-client` pulls in `basic-ftp`, `parse-duration`, and `undici@5.x`
- `eslint@9.39.2` still pulls in vulnerable `minimatch` and `flatted`
- `discord.js` pulls in vulnerable `undici@6.x`
- `@remotion/bundler` pulls in `serialize-javascript@6.0.2`
- `@coinbase/agentkit` pulls in `bigint-buffer` and `@x402/svm`

---

## 3. PR-SIZED ROADMAP (Sequenced)

### **PR #1: Fix Studio Typecheck** (P0 — FIRST)
**Scope:** 1-2 hours  
**Changes:**
1. Rebuild @holoscript/core (`pnpm --filter @holoscript/core build`)
2. Verify exports in packages/core/dist/index.d.ts include shaderGraph
3. Run `pnpm --filter @holoscript/studio typecheck`
4. Commit: "fix: rebuild core exports, resolve studio import errors"

**PR Success Criteria:**
- [ ] Studio typecheck passes
- [ ] Full test suite runs green
- [ ] All exports present in dist/

---

### **PR #2: Complete Security Hardening** (P0 — SECOND)
**Scope:** 2-4 hours  
**Changes:**
1. Replace stale vulnerability count with live audit baseline
2. Upgrade `@modelcontextprotocol/sdk` to `>=1.25.2`
3. Upgrade `rollup` to `>=4.59.0`
4. Upgrade or remove packages pulling `minimatch`, `flatted`, and `undici`
5. Evaluate removal of `ipfs-http-client` if unused
6. Replace dependencies that rely on unpatched `bigint-buffer`
7. Add security audit to CI/CD

**PR Success Criteria:**
- [ ] pnpm audit reflects the new live baseline before remediation
- [ ] No high/critical vulnerabilities remain in production or CI paths
- [ ] CI includes automated security check

---

### **PR #3: Extract Compiler Utils Package** (P1)
**Scope:** 8-16 hours  
**Changes:**
1. Create `packages/compiler-utils/` directory structure
2. Extract shared utilities:
   - `sceneHierarchyParser()` (Babylon/PlayCanvas duplication)
   - `materialTransformer()` (rendering logic shared)
   - `physicsGenerator()` (robotics format converters)
3. Update 4-5 compiler packages to use extracted utils
4. Remove duplicate code (~800 lines eliminated)

**PR Success Criteria:**
- [ ] New package has >95% code coverage for utilities
- [ ] All compiler packages import from new utils
- [ ] Duplication score drops from 4.65% to <2%
- [ ] Tests still pass

---

### **PR #4: Fix Circular Dependencies** (P1)
**Scope:** 16-32 hours (split across 2-3 PRs if needed)  
**Required fixes:**
1. **Type system cycle:** Extract types/shared.ts from types.ts ↔ AdvancedTypeSystem.ts
2. **Runtime cycle:** Use dependency injection in HoloScriptRuntime ↔ HoloScriptAgentRuntime
3. **Extension cycle:** Lazy-load ExtensionRegistry in HoloScriptRuntime
4. **Formatter cycle:** Extract ConfigLoader.ts to separate module
5. **Telemetry cycle:** Break SpanFactory ↔ TelemetryProvider dependency

**PR Success Criteria:**
- [ ] madge shows 0 cycles in core package
- [ ] Unit tests updated for DI pattern
- [ ] No tree-shaking impact on bundle size
- [ ] Build time maintained or improved

---

### **PR #5: Migrate All Packages to tsup** (P2)
**Scope:** 8-16 hours  
**Changes:**
1. Standardize all 35 packages to use tsup (currently mixed tsc/tsup)
2. Add tsup caching config
3. Implement Turborepo with caching layer
4. Benchmark new build time vs 9.68s baseline

**PR Success Criteria:**
- [ ] All packages build with tsup
- [ ] Incremental builds <3 seconds (with cache)
- [ ] CI build time reduced by 40%+

---

## 4. P0 IMPLEMENTATION — Studio Import Fix

### Step 1: Identify missing exports

Check what studio is trying to import:
```bash
pnpm --filter @holoscript/studio typecheck 2>&1 | grep "Cannot find module"
```

### Step 2: Rebuild core with proper exports

```bash
pnpm --filter @holoscript/core build
```

### Step 3: Verify shaderGraph export exists

```bash
grep -r "shaderGraph" packages/core/dist/index.d.ts
grep -r "MaterialLibrary" packages/core/dist/index.d.ts
```

### Step 4: If still failing, add missing re-exports

**File:** `packages/core/src/index.ts`  
**Add:**
```typescript
export * from './lib/shaderGraph';
export * from './features/MaterialLibrary';
export * from './lib/sceneGraphS'; // Inferred from error message
```

### Step 5: Rebuild and test

```bash
pnpm --filter @holoscript/core build
pnpm --filter @holoscript/studio typecheck
pnpm test
```

---

## 5. STALE CLAIMS ANALYSIS

### Claims That Need Reverification

1. **"9 vulnerabilities fixed (24→15)"** 
   - Status: FALSE — cross-reference shows 21+ high/critical findings remain
   - Action: replace with a live package-by-package remediation table

2. **"All circular dependencies fixed"**
   - Status: UNCLEAR — config claims 6 cycles still exist
   - Action: Run `pnpm madge --circular --extensions ts,tsx packages/core/src`

3. **"Build time baseline 9.68s"**
   - Status: UNKNOWN — need current benchmark
   - Action: Run `time pnpm build` and record

4. **"Tests all passing after upgrades"**
   - Status: FALSE — studio typecheck failing
   - Action: Fix blockers, re-run full test suite

---

## 6. QUICK VERIFICATION CHECKLIST

Run these commands to validate current state:

```bash
# 1. Check specific vulnerability counts
pnpm audit 2>&1 | grep -E "vulnerabilities|high|moderate"

# 2. Find remaining cycles
pnpm madge --circular --extensions ts,tsx packages/core/src

# 3. Verify wagmi removal
pnpm list wagmi

# 4. Check build time
time pnpm build

# 5. Run full test suite
pnpm test --run

# 6. Verify exports
pnpm --filter @holoscript/core build && grep "shaderGraph" packages/core/dist/index.d.ts
```

---

## Next Action

1. **Implement PR #1** (Studio typecheck fix) — estimated 1-2 hours
2. **Run verification checklist** above
3. **Update this report** when P0 items complete
4. **Proceed with PR #2** (security hardening)

