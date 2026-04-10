# HoloScript Studio - Vitest Coverage Setup

**Date**: 2026-02-26
**Initial Coverage**: 18.66%
**Target Coverage**: 40%

---

## ✅ Setup Complete

### Packages Installed

- `@vitest/coverage-v8@^1.2.0` - V8 coverage provider
- `@vitest/ui@^1.2.0` - Interactive coverage UI

### Configuration Added

**File**: `vitest.config.ts`

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html', 'lcov'],
  include: ['src/**/*.ts', 'src/**/*.tsx'],
  exclude: [
    'src/**/*.test.ts',
    'src/**/*.spec.ts',
    'src/__tests__/**',
    'src/__mocks__/**',
    'src/test-setup/**',
    'src/app/**/route.ts', // API routes
    '**/node_modules/**',
  ],
  thresholds: {
    lines: 40,
    functions: 40,
    branches: 35,
    statements: 40,
  },
  all: true,
  clean: true,
}
```

### Scripts Added

```json
{
  "test:coverage": "vitest run --coverage",
  "test:coverage:watch": "vitest --coverage",
  "test:coverage:ui": "vitest --coverage --ui"
}
```

---

## 📊 Baseline Coverage Report

### Overall Metrics

| Metric         | Coverage | Target | Status   |
| -------------- | -------- | ------ | -------- |
| **Lines**      | 18.66%   | 40%    | ⚠️ Below |
| **Statements** | 18.66%   | 40%    | ⚠️ Below |
| **Functions**  | 53.32%   | 40%    | ✅ Above |
| **Branches**   | 69.43%   | 35%    | ✅ Above |

### Test Summary

- ✅ **709 tests passed**
- ⏭️ 1 test skipped
- 📝 51 tests marked as TODO
- 📁 19 test files

### Well-Covered Modules (>90%)

| Module                    | Coverage | Type         |
| ------------------------- | -------- | ------------ |
| `lib/animationBuilder.ts` | 100%     | ✅ Complete  |
| `lib/sceneTemplates.ts`   | 100%     | ✅ Complete  |
| `lib/behaviorTree.ts`     | 98.11%   | ✅ Excellent |
| `lib/robotHelpers.ts`     | 97.82%   | ✅ Excellent |
| `hooks/useShaderGraph.ts` | 97.88%   | ✅ Excellent |
| `lib/store.ts`            | 94.77%   | ✅ Excellent |

### Areas Needing Coverage (0%)

#### Components (0% coverage)

- All React components in `components/`
- Scene rendering components
- UI panels and modals
- Inspector panels

#### Hooks (0% coverage - majority)

- `useMultiSelect.ts`
- `useSceneExport.ts`
- `useSnapshots.ts`
- `useUndoHistory.ts`
- `useXRSession.ts`
- And 30+ more hooks

#### API Routes (Excluded)

- All Next.js API routes in `app/api/`
- Intentionally excluded (require integration tests)

---

## 🚀 Running Coverage

### Quick Commands

```bash
# Run coverage once
pnpm test:coverage

# Watch mode with coverage
pnpm test:coverage:watch

# Interactive UI
pnpm test:coverage:ui

# View HTML report
open coverage/index.html  # macOS/Linux
start coverage/index.html # Windows
```

### Coverage Output

Coverage reports are generated in:

- **Text**: Console output
- **HTML**: `coverage/index.html` (interactive)
- **JSON**: `coverage/coverage-final.json`
- **LCOV**: `coverage/lcov.info` (CI integration)

---

## 📈 Coverage Improvement Strategy

### Phase 1: Quick Wins (Target: 25% → 35%)

**Focus**: Add tests for well-isolated utility modules

1. **Hooks** (15+ files at 0%)
   - `useMultiSelect.ts` - multi-selection logic
   - `useSceneExport.ts` - export functionality
   - `useUndoHistory.ts` - undo/redo logic

2. **Lib Utilities** (10+ files at 0%)
   - `collaboration.ts` - Y.js collaboration
   - `audioSync.ts` - audio synchronization
   - `glbOptimizer.ts` - 3D model optimization

**Estimated Effort**: 2-3 days
**Impact**: +10-15% coverage

### Phase 2: Component Testing (Target: 35% → 45%)

**Focus**: Add tests for critical React components

1. **Core Components**
   - `SaveBar.tsx` - save/auto-save logic
   - `PublishModal.tsx` - scene publishing
   - `HistoryPanel.tsx` - undo/redo UI

2. **Scene Components**
   - `SceneRenderer.tsx` - 3D scene rendering
   - `TransformGizmos.tsx` - transform controls
   - `SceneGraphPanel.tsx` - scene hierarchy

**Estimated Effort**: 1-2 weeks
**Impact**: +15-20% coverage

### Phase 3: Integration Tests (Target: 45% → 60%)

**Focus**: API routes and complex workflows

1. **API Routes** (currently excluded)
   - Generate endpoint
   - Export endpoints
   - Publish endpoint

2. **Scenario Tests**
   - End-to-end user workflows
   - Multi-component integration

**Estimated Effort**: 2-3 weeks
**Impact**: +20-30% coverage

---

## 🐛 Known Issues

### Skipped Tests

**File**: `degen-meme-creator.scenario.skip.ts`

**Reason**: API mismatch - `setRecordedClips()` doesn't exist in `useCharacterStore`

**Fix Required**:

1. Add `setRecordedClips` method to character store, OR
2. Refactor test to use correct API

**Impact**: 22 tests skipped (9 failing)

### Import Issues Fixed

**Issue**: Tests importing from non-existent module paths

**Files Fixed**:

- `useEditorStore` from `../../lib/editorStore` → `../../lib/store`
- `useSceneGraphStore` from `../../lib/sceneGraphStore` → `../../lib/store`

**Lesson**: All Zustand stores are exported from `lib/store.ts`

---

## 🎯 Coverage Thresholds

Current thresholds are **conservative** for baseline:

```typescript
thresholds: {
  lines: 40,      // Target: 40% line coverage
  functions: 40,  // Target: 40% function coverage
  branches: 35,   // Target: 35% branch coverage
  statements: 40, // Target: 40% statement coverage
}
```

### Threshold Adjustment Plan

| Phase        | Lines | Functions | Branches | Statements |
| ------------ | ----- | --------- | -------- | ---------- |
| **Baseline** | 40%   | 40%       | 35%      | 40%        |
| **Phase 1**  | 45%   | 45%       | 40%      | 45%        |
| **Phase 2**  | 55%   | 55%       | 50%      | 55%        |
| **Phase 3**  | 70%   | 70%       | 60%      | 70%        |

Increase thresholds gradually as coverage improves to prevent regression.

---

## 📚 References

- **Vitest Coverage Docs**: https://vitest.dev/guide/coverage
- **V8 Coverage Provider**: https://github.com/vitest-dev/vitest/tree/main/packages/coverage-v8
- **Testing Library**: https://testing-library.com/docs/react-testing-library/intro/

---

## 🔄 Next Steps

1. ✅ Configure vitest coverage
2. ✅ Install coverage packages
3. ✅ Run baseline coverage report
4. ✅ Document coverage setup
5. ⏭️ Create test coverage improvement roadmap
6. ⏭️ Add tests for priority hooks (useMultiSelect, useSceneExport)
7. ⏭️ Add tests for core components (SaveBar, PublishModal)

---

**Generated**: 2026-02-26
**Updated**: 2026-02-26
**Coverage Version**: v1.2.0
**Next Review**: After Phase 1 completion
