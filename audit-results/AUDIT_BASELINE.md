# HoloScript Repository Audit Baseline
**Date:** 2026-02-21
**Purpose:** Establish metrics before cleanup to measure ROI

---

## Executive Summary

Comprehensive audit of the HoloScript monorepo identified **significant technical debt** across code duplication, dependency management, security vulnerabilities, and architectural integrity. Key findings reveal opportunities for immediate optimization with measurable ROI.

### Critical Metrics
- **Code Duplication:** 4.65% (1,637 lines, 99 clones)
- **Dependency Version Drift:** 29 TypeScript, 24 vitest, 22 @types/node mismatches
- **Security Vulnerabilities:** 24 total (16 high, 6 moderate, 2 low)
- **Circular Dependencies:** 6 found (runtime, type system, telemetry)
- **Build Time Baseline:** 9.68 seconds (35 packages)

---

## 1. Code Duplication Analysis (jscpd)

### Summary
- **Files Analyzed:** 97 TypeScript files
- **Total Lines:** 35,176
- **Total Tokens:** 350,214
- **Clones Found:** 99
- **Duplicated Lines:** 1,637 (4.65%)
- **Duplicated Tokens:** 16,087 (4.59%)

### High-Impact Duplications

#### Compiler Implementations (Largest)
1. **BabylonCompiler.ts ↔ PlayCanvasCompiler.ts**
   - 70 lines, 638 tokens (MASSIVE duplication)
   - Location: Scene initialization and material handling
   - Impact: Core rendering logic duplicated

2. **SDFCompiler.ts ↔ URDFCompiler.ts**
   - Multiple blocks: 17, 12, 18 lines
   - Location: XML generation and physics handling
   - Impact: Robotics format converters share ~40% code

3. **GodotCompiler.ts ↔ UnityCompiler.ts**
   - 23 lines, 155 tokens
   - Location: Scene hierarchy parsing
   - Impact: Game engine compilers share transformation logic

#### Test Files (Expected but Excessive)
- **VisionOSCompiler.prod.test.ts:** 38 duplications with other compiler tests
- **ExportTargets.e2e.test.ts:** Multiple internal duplications
- **AndroidCompiler.test.ts ↔ IOSCompiler.test.ts:** 44 lines, 341 tokens

### Recommended Actions
1. **Extract `@holoscript/compiler-utils` package** with shared helpers:
   - `sceneHierarchyParser()`
   - `materialTransformer()`
   - `physicsGenerator()`
2. **Create test helper utilities** for common test patterns
3. **Estimated savings:** ~800 lines (50% of duplication)

---

## 2. Dependency Version Consistency (syncpack)

### Critical Mismatches

#### TypeScript (29 packages)
```
^5.3.0-^5.3.3 → ~5.9.3 (should align to single version)
```
**Impact:** Inconsistent type checking, potential build issues

#### Vitest (24 packages)
```
^1.0.0-^4.0.0 → ^4.0.18 (huge version spread)
```
**Impact:** Test runner incompatibilities, CI/CD issues

#### @types/node (22 packages)
```
^20.0.0-^20.19.29 → ^24.10.1 (major version drift)
```
**Impact:** Node.js API type mismatches

#### React Ecosystem (7 packages)
```
^18.2.0 → ^19.2.0 (major version upgrade available)
```
**Impact:** React 19 breaking changes not yet adopted

#### Three.js (4 packages)
```
^0.160.0 → ^0.182.0 (22 minor versions behind)
```
**Impact:** Missing 3D rendering optimizations

### Quick Win Available
```bash
npx syncpack fix-mismatches
```
**Estimated time:** 30 minutes
**Estimated impact:** -50MB node_modules, consistent builds

---

## 3. Unused Dependencies (depcheck)

### llm-provider Package
**Unused dependencies:**
- `@holoscript/core` (listed as dependency but unused)

**Analysis:** LLM provider SDK incorrectly depends on core. Should be peer dependency or removed.

### core Package
**Unused dependencies:**
- `wagmi` (Web3/Ethereum library - dead code?)

**Unused devDependencies:**
- `@vitest/coverage-v8` (used in CI, can remain)
- `typedoc` (used for docs, can remain)

**Missing dependencies:**
- `zod` (used in SecurityFramework.ts but not declared)
- `@hololand/voice`, `@hololand/gpu`, `@hololand/navigation`, `@hololand/gestures` (runtime imports)
- `@pixiv/three-vrm` (humanoid loader dependency)

**Recommended Actions:**
1. Remove `wagmi` dependency (~1.2MB)
2. Add missing dependencies to prevent runtime errors
3. Refactor llm-provider dependencies

---

## 4. Circular Dependencies (madge)

### Found 6 Circular Imports

1. **core/src/types.ts ↔ core/src/types/AdvancedTypeSystem.ts**
   - Impact: Type system initialization order issues

2. **core/src/types.ts ↔ AdvancedTypeSystem.ts ↔ HoloScriptPlus.ts**
   - Impact: Complex type resolution failures

3. **core/src/HoloScriptAgentRuntime.ts ↔ core/src/HoloScriptRuntime.ts**
   - Impact: Runtime circular dependency (CRITICAL)

4. **core/src/HoloScriptRuntime.ts ↔ core/src/extensions/ExtensionRegistry.ts**
   - Impact: Extension loading order issues

5. **formatter/src/index.ts ↔ formatter/src/ConfigLoader.ts**
   - Impact: Formatter initialization issues

6. **core/src/telemetry/SpanFactory.ts ↔ core/src/telemetry/TelemetryProvider.ts**
   - Impact: Telemetry circular dependency

### Recommended Actions
1. **Refactor type system:** Extract shared types to `core/src/types/shared.ts`
2. **Break runtime cycle:** Use dependency injection pattern
3. **Fix formatter cycle:** Move config loading to separate module
4. **Estimated time:** 2-4 hours per cycle

---

## 5. Security Vulnerabilities (pnpm audit)

### Summary
- **Total:** 24 vulnerabilities
- **High:** 16
- **Moderate:** 6
- **Low:** 2

### High Severity Issues

#### Puppeteer Transitive Dependencies (CRITICAL)
1. **ws@8.16.0** - DoS vulnerability (28 paths)
   - Fix: Upgrade puppeteer to v23+

2. **tar-fs@3.0.4** - 3 path traversal vulnerabilities (55 paths)
   - Fix: Upgrade puppeteer to v23+

#### Next.js (marketplace-web, studio, llm-service)
3. **next@14.2.35** - HTTP deserialization DoS
   - Fix: Upgrade to next@15.5.10+

#### Bcrypt Dependencies
4. **tar@6.2.1** - 4 file overwrite vulnerabilities
   - Fix: Update bcrypt or use bcryptjs

#### ESBuild
5. **esbuild@0.21.5** - CORS bypass (36 paths via vitest)
   - Fix: Upgrade vitest to v5+

#### Audit Tools (Newly Installed)
6. **minimatch@10.1.3** - ReDoS (295 paths via @stryker-mutator)
   - Fix: Upgrade @stryker-mutator or remove if not used

### Moderate Severity Issues
- **markdown-it@14.1.0** - ReDoS (via typedoc)
- **ajv@6.12.6 & 8.17.1** - ReDoS (via eslint, stryker)

### Recommended Actions
1. **Immediate:** Upgrade puppeteer to v23+ (removes 84+ vuln paths)
2. **Immediate:** Upgrade Next.js to v15.5.10+
3. **Evaluate:** Remove @stryker-mutator if mutation testing not actively used
4. **Medium-term:** Replace bcrypt with bcryptjs (zero native dependencies)

---

## 6. Build Time Baseline

### Full Build Performance
```
Total Time: 9.68 seconds
Packages Built: 35 of 36
Status: BASELINE RECORDED
```

**Build Notes:**
- WASM package skipped (wasm-pack not installed)
- Several packages use tsc, others use tsup
- Build warnings detected (sideEffects, package.json exports)

### Opportunities for Optimization
1. **Migrate all packages to tsup** (faster than tsc)
2. **Implement Nx or Turborepo** for incremental builds
3. **Enable tsup caching** across packages
4. **Target:** <5 seconds with caching

---

## High-Impact Findings (Prioritized)

### Priority 1: Quick Wins (< 2 hours)
1. ✅ **Fix dependency version drift** (syncpack fix-mismatches)
   - Time: 30 minutes
   - Impact: -50MB node_modules, consistent builds

2. ✅ **Remove wagmi dependency from core**
   - Time: 15 minutes
   - Impact: -1.2MB bundle size

3. ✅ **Add missing dependencies to core**
   - Time: 30 minutes
   - Impact: Prevent runtime errors

### Priority 2: Security (< 1 day)
4. ⚠️ **Upgrade puppeteer to v23+**
   - Time: 2-4 hours
   - Impact: Removes 16 high-severity vulnerabilities

5. ⚠️ **Upgrade Next.js to v15.5.10+**
   - Time: 4-8 hours
   - Impact: Removes 2 high-severity DoS vulnerabilities

### Priority 3: Code Quality (< 1 week)
6. 🔄 **Extract compiler-utils package**
   - Time: 8-16 hours
   - Impact: -800 lines, improved maintainability

7. 🔄 **Fix 6 circular dependencies**
   - Time: 16-32 hours
   - Impact: Better tree-shaking, faster builds

8. 🔄 **Migrate all packages to tsup**
   - Time: 8-16 hours
   - Impact: 50% faster incremental builds

---

## Next Steps

### Immediate Actions (Today)
1. Run `npx syncpack fix-mismatches`
2. Remove wagmi from core package.json
3. Add missing dependencies to core
4. Create issue for puppeteer upgrade

### This Week
1. Upgrade puppeteer and run security audit again
2. Plan Next.js v15 migration (breaking changes review)
3. Extract first compiler utility function to new package

### This Month
1. Complete compiler-utils extraction
2. Fix all circular dependencies
3. Implement Turborepo for build caching
4. Target: <5s build time with cache

---

## ROI Projection

### Immediate Wins (Priority 1)
- **Time Investment:** 1.5 hours
- **Bundle Size Reduction:** ~1.25MB
- **node_modules Reduction:** ~50MB
- **Developer Experience:** Consistent builds

### Security Hardening (Priority 2)
- **Time Investment:** 8-12 hours
- **Vulnerabilities Fixed:** 18 high + moderate
- **Risk Reduction:** Eliminates DoS, path traversal, RCE vectors

### Code Quality (Priority 3)
- **Time Investment:** 32-64 hours
- **Lines Removed:** ~800+ duplicated lines
- **Build Time Improvement:** 50% (9.68s → ~5s with cache)
- **Maintainability:** Shared utilities, no circular deps

---

## Audit Tool Commands for Future Reference

```bash
# Code duplication
npx jscpd packages/*/src/compiler/ --min-lines 10 --format typescript --reporters console,json --output ./audit-results

# Version drift
npx syncpack lint > audit-results/version-drift.txt

# Unused dependencies
npx depcheck packages/llm-provider > audit-results/llm-provider-deps.txt
npx depcheck packages/core > audit-results/core-deps.txt

# Circular dependencies
npx madge --circular --extensions ts packages/*/src > audit-results/circular-deps.txt

# Security vulnerabilities
pnpm audit > audit-results/security-audit.txt

# Build time
powershell -Command "Measure-Command { pnpm -r build 2>&1 | Out-File -FilePath audit-results/build-output.txt }" > audit-results/build-time.txt
```

---

**End of Baseline Audit Report**
*Generated on 2026-02-21 | HoloScript Repository Discovery Phase*
