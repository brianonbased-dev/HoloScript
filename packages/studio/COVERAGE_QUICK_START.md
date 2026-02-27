# Vitest Coverage - Quick Start Guide

## 🏃 Run Coverage (30 seconds)

```bash
cd packages/studio

# One-time run
pnpm test:coverage

# Watch mode (re-runs on file changes)
pnpm test:coverage:watch

# Interactive UI (opens browser)
pnpm test:coverage:ui
```

## 📊 View Reports

```bash
# HTML report (interactive, detailed)
open coverage/index.html

# Text report (already shown in terminal)
# JSON report (for CI/CD)
cat coverage/coverage-final.json

# LCOV report (for code editors)
# VS Code: Coverage Gutters extension reads lcov.info
```

## ✅ Current Status

- **Lines**: 18.66% (Target: 40%)
- **Functions**: 53.32% (Target: 40%) ✅
- **Branches**: 69.43% (Target: 35%) ✅
- **709 tests passing**

## 🎯 Priority Areas (0% coverage)

### Add Tests For:

1. **Hooks** (easiest wins):
   - `useMultiSelect.ts` - selection logic
   - `useSceneExport.ts` - export logic
   - `useUndoHistory.ts` - undo/redo

2. **Utilities**:
   - `collaboration.ts` - Y.js sync
   - `audioSync.ts` - audio timing
   - `glbOptimizer.ts` - 3D optimization

3. **Components** (after hooks):
   - `SaveBar.tsx` - save logic
   - `PublishModal.tsx` - publishing
   - `HistoryPanel.tsx` - history UI

## 📝 Writing Tests

### Example: Hook Test

```typescript
// src/hooks/__tests__/useMultiSelect.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMultiSelect } from '../useMultiSelect';

describe('useMultiSelect', () => {
  it('should select multiple objects', () => {
    const { result } = renderHook(() => useMultiSelect());

    act(() => {
      result.current.select('obj1');
      result.current.select('obj2', true); // multi-select
    });

    expect(result.current.selected).toEqual(['obj1', 'obj2']);
  });
});
```

### Example: Utility Test

```typescript
// src/lib/__tests__/audioSync.test.ts
import { describe, it, expect } from 'vitest';
import { syncAudioToFrames } from '../audioSync';

describe('audioSync', () => {
  it('should sync audio to 60fps timeline', () => {
    const audioBuffer = new Float32Array([1, 2, 3, 4]);
    const synced = syncAudioToFrames(audioBuffer, 60);

    expect(synced.fps).toBe(60);
    expect(synced.frames.length).toBeGreaterThan(0);
  });
});
```

## 🔧 Configuration

**File**: [vitest.config.ts](./vitest.config.ts)

**Thresholds**:
```typescript
coverage: {
  thresholds: {
    lines: 40,      // Must have 40% line coverage
    functions: 40,  // Must have 40% function coverage
    branches: 35,   // Must have 35% branch coverage
    statements: 40, // Must have 40% statement coverage
  }
}
```

**Excluded**:
- `src/**/*.test.ts` - Test files
- `src/__tests__/**` - Test directories
- `src/__mocks__/**` - Mock files
- `src/app/**/route.ts` - API routes (need integration tests)

## ⚠️ Common Issues

### Issue: "Coverage below threshold"

**Solution**: Normal for baseline! Add tests to increase coverage.

```bash
# See what's not covered
pnpm test:coverage

# Focus on files with 0% coverage
# Start with utilities and hooks (easier than components)
```

### Issue: "Test fails with 'module not found'"

**Solution**: Check import paths

```typescript
// ❌ Wrong
import { useEditorStore } from '../../lib/editorStore';

// ✅ Correct (all stores are in store.ts)
import { useEditorStore } from '../../lib/store';
```

### Issue: "IndexedDB not available in tests"

**Solution**: Already mocked in `vitest.setup.ts`! Just use idb normally.

## 📈 Tracking Progress

```bash
# Baseline
pnpm test:coverage | grep "All files"
# All files          |   18.66 |    69.43 |   53.32 |   18.66 |

# After adding tests
pnpm test:coverage | grep "All files"
# All files          |   25.42 |    72.11 |   58.90 |   25.42 | ← Better!
```

## 🎯 Goals

| Phase | Target | ETA |
|-------|--------|-----|
| **Baseline** | 18.66% | ✅ Done |
| **Phase 1** | 35% | 1 week |
| **Phase 2** | 50% | 1 month |
| **Phase 3** | 70% | 3 months |

## 🔗 More Info

- **Full Guide**: [COVERAGE_SETUP.md](./COVERAGE_SETUP.md)
- **Scenario Testing**: [SCENARIO_TESTING_GUIDE.md](./SCENARIO_TESTING_GUIDE.md)
- **Vitest Docs**: https://vitest.dev/guide/coverage

---

**TL;DR**: Run `pnpm test:coverage`, look at HTML report, add tests for 0% coverage files, profit!
