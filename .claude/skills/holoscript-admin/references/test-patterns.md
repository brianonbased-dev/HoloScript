# HoloScript Test Patterns Reference

**Source**: Canonical HoloScript Repository v3.42.0
**Location**: `c:\Users\josep\Documents\GitHub\HoloScript\packages\core\src\compiler\__tests__`
**Test Framework**: vitest ^4.0.18
**Test Runner**: pnpm test
**Coverage Tool**: @vitest/coverage-v8
**Coverage Target**: 80% (Codecov threshold)
**Last Updated**: 2026-02-21

---

## 📊 Test Statistics

| Metric | Value |
|--------|-------|
| **Total Packages with Tests** | 20+ |
| **Core Compiler Tests** | 200+ test files |
| **E2E Export Tests** | export tests (verify via `pnpm test`) |
| **Python Robotics Tests** | 48 tests |
| **Test Coverage** | ~80% |
| **Test Organization** | vitest.workspace.ts (monorepo) |

---

## 🏗️ Test File Organization

### Directory Structure

```
packages/
├── core/
│   ├── src/
│   │   ├── compiler/
│   │   │   ├── __tests__/
│   │   │   │   ├── UnityCompiler.test.ts              # Unit tests
│   │   │   │   ├── UnityCompiler.prod.test.ts         # Production tests
│   │   │   │   ├── UnrealCompiler.test.ts
│   │   │   │   ├── UnrealCompiler.prod.test.ts
│   │   │   │   ├── AndroidCompiler.test.ts
│   │   │   │   ├── VRChatCompiler.test.ts
│   │   │   │   ├── BabylonCompiler.test.ts
│   │   │   │   ├── URDFCompiler.test.ts
│   │   │   │   ├── ExportTargets.e2e.test.ts          # ⭐ E2E tests
│   │   │   │   └── [more compiler tests...]
│   │   │   ├── UnityCompiler.ts
│   │   │   ├── UnrealCompiler.ts
│   │   │   └── [other compilers...]
│   │   ├── parser/
│   │   │   ├── __tests__/
│   │   │   │   └── parser.test.ts
│   │   │   └── parser.ts
│   │   └── traits/
│   │       ├── __tests__/
│   │       │   ├── ComputeTrait.test.ts
│   │       │   └── ComputeTrait.prod.test.ts
│   │       └── ComputeTrait.ts
│   └── vitest.config.ts
├── python-bindings/
│   └── tests/
│       └── test_robotics.py                            # Python pytest tests
└── [other packages with tests...]
```

### Naming Conventions

| Test Type | Pattern | Example |
|-----------|---------|---------|
| **Unit Tests** | `*.test.ts` | `UnityCompiler.test.ts` |
| **Production Tests** | `*.prod.test.ts` | `UnityCompiler.prod.test.ts` |
| **E2E Tests** | `*.e2e.test.ts` | `ExportTargets.e2e.test.ts` |
| **Python Tests** | `test_*.py` | `test_robotics.py` |

---

## 🧪 Core Test Patterns

### Pattern 1: Test Helper Factory (`makeComposition`)

**Purpose**: Create test HoloComposition objects with sane defaults

**Implementation**:
```typescript
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    name: 'TestScene',
    objects: [],
    lights: [],
    state: { properties: [] },
    environment: { properties: [] },
    ...overrides
  } as HoloComposition;
}
```

**Usage**:
```typescript
// Minimal composition
const comp = makeComposition();

// With objects
const comp = makeComposition({
  objects: [
    { name: 'cube', properties: [{ key: 'geometry', value: 'box' }], traits: [] }
  ]
});

// With state
const comp = makeComposition({
  state: {
    properties: [
      { key: 'score', value: 0 },
      { key: 'active', value: true }
    ]
  }
});
```

**Variations**:
- Some tests use `makeComp()` (shorter name)
- Some include `as any` type assertion for partial data
- Production tests may use `createComposition()` with all required fields

---

### Pattern 2: String-Returning Compiler Tests

**Used by**: Unity, Godot, Babylon, OpenXR, WebGPU, URDF, SDF, PlayCanvas, DTDL, VisionOS

**Structure**:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { UnityCompiler } from '../UnityCompiler';

describe('UnityCompiler', () => {
  let compiler: UnityCompiler;

  beforeEach(() => {
    compiler = new UnityCompiler();
  });

  it('compiles minimal composition to C#', () => {
    const cs = compiler.compile(makeComposition());
    expect(cs).toContain('using UnityEngine');
    expect(cs).toContain('MonoBehaviour');
    expect(cs).toContain('Awake');
  });

  it('respects custom namespace', () => {
    const c = new UnityCompiler({ namespace: 'MyGame' });
    const cs = c.compile(makeComposition());
    expect(cs).toContain('namespace MyGame');
  });
});
```

**Key Assertions**:
```typescript
// String contains check
expect(output).toContain('expected string');

// Multiple checks
expect(cs).toContain('using UnityEngine');
expect(cs).toContain('MonoBehaviour');

// Not contain
expect(output).not.toContain('unwanted string');
```

---

### Pattern 3: Object-Returning Compiler Tests

**Used by**: Unreal, VRChat, Android, iOS, WASM

**Structure**:
```typescript
import { describe, it, expect } from 'vitest';
import { AndroidCompiler } from '../AndroidCompiler';

describe('AndroidCompiler', () => {
  it('returns AndroidCompileResult with all files', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(makeComposition());

    // Check all result properties exist
    expect(result).toHaveProperty('activityFile');
    expect(result).toHaveProperty('stateFile');
    expect(result).toHaveProperty('nodeFactoryFile');
    expect(result).toHaveProperty('manifestFile');
    expect(result).toHaveProperty('buildGradle');
  });

  it('generates Kotlin activity file', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(makeComposition());

    expect(result.activityFile).toContain('class');
    expect(result.activityFile).toContain('Activity');
  });
});
```

**Key Assertions**:
```typescript
// Property existence
expect(result).toHaveProperty('activityFile');
expect(result).toHaveProperty('stateFile');

// Type check
expect(typeof result.activityFile).toBe('string');
expect(typeof result.manifestFile).toBe('string');

// Content check
expect(result.activityFile).toContain('class MyActivity');
```

---

### Pattern 4: Production Tests (Stricter Validation)

**File**: `*.prod.test.ts`

**Purpose**: Verify production-ready output with all edge cases

**Structure**:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { AndroidCompiler } from '../AndroidCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

function createComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  // Full required fields, no shortcuts
  return {
    name: overrides.name || 'TestScene',
    objects: overrides.objects || [],
    lights: overrides.lights || [],
    state: overrides.state || { properties: [] },
    environment: overrides.environment || { properties: [] },
    ...overrides
  } as HoloComposition;
}

describe('AndroidCompiler — Production', () => {
  let compiler: AndroidCompiler;

  beforeEach(() => {
    compiler = new AndroidCompiler();
  });

  it('constructs with default options', () => {
    expect(compiler).toBeDefined();
  });

  it('compile returns all 5 output files', () => {
    const result = compiler.compile(createComposition());
    expect(typeof result.activityFile).toBe('string');
    expect(typeof result.stateFile).toBe('string');
    expect(typeof result.nodeFactoryFile).toBe('string');
    expect(typeof result.manifestFile).toBe('string');
    expect(typeof result.buildGradle).toBe('string');
  });

  it('empty composition compiles without error', () => {
    expect(() => compiler.compile(createComposition())).not.toThrow();
  });
});
```

**Differences from Unit Tests**:
- Uses `createComposition()` with all required fields (no shortcuts)
- Verifies type safety (`typeof result.activityFile === 'string'`)
- Tests error handling (`not.toThrow()`)
- More comprehensive edge case coverage

---

### Pattern 5: E2E Export Tests

**File**: `ExportTargets.e2e.test.ts`

**Purpose**: Test full export pipeline for all compilers

**Structure**:
```typescript
import { describe, it, expect } from 'vitest';
import {
  compileToUnity,
  compileToUnreal,
  compileToGodot,
  compileToBabylon,
  compileToURDF,
  // ... all export functions
} from '../index';

describe('Export Targets E2E', () => {
  const testScene: HoloComposition = {
    name: 'E2E_Test_Scene',
    objects: [
      {
        name: 'testCube',
        properties: [
          { key: 'geometry', value: 'box' },
          { key: 'position', value: [0, 1, 0] }
        ],
        traits: ['@physics', '@collidable']
      }
    ],
    lights: [],
    state: { properties: [] },
    environment: { properties: [] }
  };

  describe('Unity Export', () => {
    it('exports to Unity C# script', () => {
      const result = compileToUnity(testScene);
      expect(result).toContain('using UnityEngine');
      expect(result).toContain('testCube');
    });
  });

  describe('Unreal Export', () => {
    it('exports to Unreal C++ header and source', () => {
      const result = compileToUnreal(testScene);
      expect(result.headerFile).toContain('#pragma once');
      expect(result.sourceFile).toContain('#include');
    });
  });

  // ... export targets tested (verify via `find packages/core/src -name "*Compiler.ts"`)
});
```

**Coverage**: Compiler tests across compilers (run `pnpm test` for current count)

---

## 🔧 Common Test Utilities

### Vitest Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('SuiteName', () => {
  let compiler: MyCompiler;

  beforeEach(() => {
    // Setup before each test
    compiler = new MyCompiler();
  });

  afterEach(() => {
    // Cleanup after each test (optional)
  });

  it('test description', () => {
    // Test implementation
    expect(compiler).toBeDefined();
  });
});
```

---

### Vitest Assertions Reference

| Assertion | Use Case | Example |
|-----------|----------|---------|
| `toContain(str)` | String/array contains value | `expect(cs).toContain('MonoBehaviour')` |
| `toBe(value)` | Strict equality | `expect(result).toBe(true)` |
| `toEqual(obj)` | Deep equality | `expect(obj).toEqual({ a: 1 })` |
| `toHaveProperty(key)` | Object has property | `expect(result).toHaveProperty('headerFile')` |
| `toBeDefined()` | Value is not undefined | `expect(compiler).toBeDefined()` |
| `toBeTypeOf(type)` | Type check | `expect(fn).toBeTypeOf('function')` |
| `not.toThrow()` | Function doesn't throw | `expect(() => compile()).not.toThrow()` |
| `toMatchObject(obj)` | Partial object match | `expect(result).toMatchObject({ success: true })` |

---

## 🐍 Python Test Patterns (pytest)

**File**: `packages/python-bindings/tests/test_robotics.py`

**Framework**: pytest 7.0.0

**Structure**:
```python
import pytest
from holoscript.robotics import export_urdf, URDFExportResult

class TestURDFExport:
    """Tests for export_urdf() function."""

    def test_export_empty_scene_produces_valid_urdf(self):
        """Empty scene should produce minimal valid URDF."""
        result = export_urdf("")
        assert isinstance(result, URDFExportResult)
        assert result.success is True
        assert '<?xml version="1.0"?>' in result.urdf_content
        assert '<robot name=' in result.urdf_content

    def test_custom_robot_name_used_in_output(self):
        """Custom robot name should appear in URDF robot element."""
        result = export_urdf("", robot_name="my_robot")
        assert 'name="my_robot"' in result.urdf_content
```

**Key Python Assertions**:
```python
# Type check
assert isinstance(result, URDFExportResult)

# Boolean check
assert result.success is True
assert result.success is False

# String contains
assert 'expected' in result.urdf_content

# List/property checks
assert len(result.errors) == 0
assert hasattr(result, 'urdf_content')

# Exception handling
with pytest.raises(ValueError):
    export_urdf(invalid_code)
```

---

## 🛠️ Test Commands

### Run All Tests
```bash
# From repository root
pnpm test

# With coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

### Run Specific Package Tests
```bash
# Core package
pnpm --filter @holoscript/core test

# Python bindings
cd packages/python-bindings && pytest

# Specific test file
pnpm --filter @holoscript/core test UnityCompiler
```

### Run E2E Tests Only
```bash
pnpm --filter @holoscript/core test ExportTargets.e2e
```

### Coverage Reports
```bash
# Generate coverage report
pnpm test:coverage

# View HTML report
open coverage/index.html
```

---

## 🎯 Test Category Patterns

### Category 1: Minimal Output Tests
**Purpose**: Verify compiler produces valid minimal output

```typescript
it('compiles minimal composition to C#', () => {
  const cs = compiler.compile(makeComposition());
  expect(cs).toContain('using UnityEngine');
  expect(cs).toContain('MonoBehaviour');
});
```

---

### Category 2: Options Tests
**Purpose**: Verify compiler options are respected

```typescript
it('respects custom namespace', () => {
  const c = new UnityCompiler({ namespace: 'MyGame' });
  const cs = c.compile(makeComposition());
  expect(cs).toContain('namespace MyGame');
});

it('respects custom className', () => {
  const c = new UnityCompiler({ className: 'MyScene' });
  const cs = c.compile(makeComposition());
  expect(cs).toContain('class MyScene');
});
```

---

### Category 3: State Compilation Tests
**Purpose**: Verify state properties compile correctly

```typescript
it('compiles state to C# fields', () => {
  const comp = makeComposition({
    state: {
      properties: [
        { key: 'score', value: 0 },
        { key: 'active', value: true },
      ],
    },
  });
  const cs = compiler.compile(comp);
  expect(cs).toContain('score');
  expect(cs).toContain('active');
});
```

---

### Category 4: Objects Compilation Tests
**Purpose**: Verify object geometry compiles correctly

```typescript
it('compiles objects into Awake body', () => {
  const comp = makeComposition({
    objects: [
      { name: 'cube', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
    ] as any,
  });
  const cs = compiler.compile(comp);
  expect(cs).toContain('cube');
  expect(cs).toContain('GameObject');
});

it('handles sphere geometry', () => {
  const comp = makeComposition({
    objects: [
      { name: 'ball', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
    ] as any,
  });
  const cs = compiler.compile(comp);
  expect(cs).toContain('ball');
});
```

---

### Category 5: Lights Tests
**Purpose**: Verify light compilation

```typescript
it('compiles lights', () => {
  const comp = makeComposition({
    lights: [
      { name: 'sun', lightType: 'directional', properties: [{ key: 'intensity', value: 1.5 }] }
    ] as any,
  });
  const cs = compiler.compile(comp);
  expect(cs).toContain('Light');
});
```

---

### Category 6: Environment Tests
**Purpose**: Verify environment settings

```typescript
it('compiles environment settings', () => {
  const comp = makeComposition({
    environment: { properties: [{ key: 'skybox', value: 'sunset' }] } as any,
  });
  const cs = compiler.compile(comp);
  expect(cs).toContain('skybox');
});
```

---

## 📊 Coverage Configuration

**File**: `codecov.yml`

```yaml
coverage:
  status:
    project:
      default:
        target: 80%
        threshold: 2%
    patch:
      default:
        target: 80%
```

**Vitest Coverage Config**:
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        '**/dist/**',
        '**/node_modules/**',
        '**/*.test.ts',
        '**/*.prod.test.ts',
      ],
    },
  },
});
```

---

## 🚨 Common Test Patterns & Gotchas

### Pattern: Always Use Test Helper Factories
```typescript
// ✅ Good - use factory
const comp = makeComposition({ name: 'MyScene' });

// ❌ Bad - manual object creation (error-prone)
const comp = {
  name: 'MyScene',
  objects: [],
  // Missing required fields!
};
```

---

### Pattern: Test Both Success and Failure Cases
```typescript
// ✅ Good - test both paths
it('succeeds with valid input', () => {
  const result = compile(validInput);
  expect(result.success).toBe(true);
});

it('fails with invalid input', () => {
  const result = compile(invalidInput);
  expect(result.success).toBe(false);
  expect(result.errors.length).toBeGreaterThan(0);
});
```

---

### Gotcha: Object-Returning Compilers Return Objects, Not Strings
```typescript
// ✅ Correct - check result properties
const result = compiler.compile(comp);
expect(result.headerFile).toContain('class');
expect(result.sourceFile).toContain('implementation');

// ❌ Incorrect - treating as string
const result = compiler.compile(comp);
expect(result).toContain('class'); // FAILS - result is object!
```

**Object-Returning Compilers**: Unreal, VRChat, Android, iOS, WASM

---

### Gotcha: Production Tests Use Full HoloComposition
```typescript
// ✅ Production test - all fields
function createComposition(overrides = {}): HoloComposition {
  return {
    name: 'TestScene',
    objects: [],
    lights: [],
    state: { properties: [] },
    environment: { properties: [] },
    ...overrides
  } as HoloComposition;
}

// ⚠️ Unit test - shortcuts allowed
function makeComposition(overrides = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}
```

---

### Pattern: BeforeEach for Fresh Compiler Instance
```typescript
describe('MyCompiler', () => {
  let compiler: MyCompiler;

  beforeEach(() => {
    // Fresh instance for each test (prevents state leakage)
    compiler = new MyCompiler();
  });

  it('test 1', () => { /* uses fresh compiler */ });
  it('test 2', () => { /* uses fresh compiler */ });
});
```

---

## 🔗 Related Files

| File | Purpose |
|------|---------|
| [vitest.workspace.ts](c:\Users\josep\Documents\GitHub\HoloScript\vitest.workspace.ts) | Monorepo test configuration |
| [codecov.yml](c:\Users\josep\Documents\GitHub\HoloScript\codecov.yml) | Coverage thresholds (80%) |
| [packages/core/vitest.config.ts](c:\Users\josep\Documents\GitHub\HoloScript\packages\core\vitest.config.ts) | Core package test config |
| [packages/core/src/parser/HoloCompositionTypes.ts](c:\Users\josep\Documents\GitHub\HoloScript\packages\core\src\parser\HoloCompositionTypes.ts) | Type definitions for test helpers |

---

## 📚 Example: Complete Test File

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { UnityCompiler } from '../UnityCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

// ──────────────────────────────────────────────────────────────────────────
// Test Helper
// ──────────────────────────────────────────────────────────────────────────

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    name: 'TestScene',
    objects: [],
    lights: [],
    state: { properties: [] },
    environment: { properties: [] },
    ...overrides
  } as HoloComposition;
}

// ──────────────────────────────────────────────────────────────────────────
// Test Suite
// ──────────────────────────────────────────────────────────────────────────

describe('UnityCompiler', () => {
  let compiler: UnityCompiler;

  beforeEach(() => {
    compiler = new UnityCompiler();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Minimal Output
  // ═══════════════════════════════════════════════════════════════════════

  it('compiles minimal composition to C#', () => {
    const cs = compiler.compile(makeComposition());
    expect(cs).toContain('using UnityEngine');
    expect(cs).toContain('MonoBehaviour');
    expect(cs).toContain('Awake');
  });

  it('includes auto-generated header', () => {
    const cs = compiler.compile(makeComposition());
    expect(cs).toContain('Auto-generated by HoloScript');
    expect(cs).toContain('TestScene');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Options
  // ═══════════════════════════════════════════════════════════════════════

  it('respects custom namespace', () => {
    const c = new UnityCompiler({ namespace: 'MyGame' });
    const cs = c.compile(makeComposition());
    expect(cs).toContain('namespace MyGame');
  });

  it('respects custom className', () => {
    const c = new UnityCompiler({ className: 'MyScene' });
    const cs = c.compile(makeComposition());
    expect(cs).toContain('class MyScene');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // State Compilation
  // ═══════════════════════════════════════════════════════════════════════

  it('compiles state to C# fields', () => {
    const comp = makeComposition({
      state: {
        properties: [
          { key: 'score', value: 0 },
          { key: 'active', value: true },
        ],
      },
    });
    const cs = compiler.compile(comp);
    expect(cs).toContain('score');
    expect(cs).toContain('active');
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Objects
  // ═══════════════════════════════════════════════════════════════════════

  it('compiles objects into Awake body', () => {
    const comp = makeComposition({
      objects: [
        { name: 'cube', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const cs = compiler.compile(comp);
    expect(cs).toContain('cube');
    expect(cs).toContain('GameObject');
  });

  it('handles sphere geometry', () => {
    const comp = makeComposition({
      objects: [
        { name: 'ball', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const cs = compiler.compile(comp);
    expect(cs).toContain('ball');
  });
});
```

---

*Canonical Test Patterns from HoloScript v3.42.0*
*Test Framework: vitest ^4.0.18 • Coverage: ~80% • 200+ test files*
*Updated: 2026-02-21*
