# Testing Guide

> How to run, write, and organize tests for HoloScript.

## Framework

HoloScript uses **Vitest** for all unit and integration tests across the monorepo. Tests are colocated with source code in `__tests__/` directories.

## Running Tests

```bash
# Run all tests across the monorepo
pnpm test

# Run tests for a specific package
pnpm --filter @holoscript/core test

# Run tests with coverage
pnpm test -- --coverage

# Run a specific test file
pnpm vitest run packages/core/src/__tests__/Infrastructure.test.ts

# Watch mode
pnpm vitest watch
```

## Test Structure

Tests live alongside source code:

```text
packages/core/src/
├── __tests__/
│   ├── Integration.comprehensive.test.ts    # Multi-stage integration tests
│   ├── Infrastructure.test.ts               # Core infra verification
│   └── ...
├── resilience/__tests__/
│   └── ResiliencePatterns.test.ts            # Circuit breaker, retry, bulkhead
├── runtime/__tests__/
│   └── SceneRunner.test.ts                  # Runtime execution tests
└── compiler/__tests__/
    └── UnrealCompiler.test.ts               # Compiler output verification
```

## Writing Tests

```typescript
import { describe, it, expect } from 'vitest';
import { HoloScriptParser } from '../HoloScriptParser';

describe('HoloScriptParser', () => {
  it('parses a basic composition', () => {
    const parser = new HoloScriptParser();
    const ast = parser.parse('composition "Test" { object "Cube" { geometry: "box" } }');
    expect(ast).toBeDefined();
    expect(ast.objects).toHaveLength(1);
  });
});
```

## Native Testing (`@script_test`)

HoloScript also has a **native testing framework** built into the language itself:

```hs
@script_test "economy init" {
  assert { balance == 500 }
  assert { entity.health > 0 }
}
```

Run native tests with:

```bash
holoscript test my-scene.hs
```

These assertions evaluate against live runtime state, not in an external harness.

## Test Categories

| Category | Location | What It Tests |
|----------|----------|---------------|
| **Unit** | `src/**/__tests__/` | Individual classes and functions |
| **Integration** | `src/__tests__/Integration.*` | Cross-module interactions |
| **Infrastructure** | `src/__tests__/Infrastructure.*` | Core system wiring |
| **Resilience** | `src/resilience/__tests__/` | Circuit breaker, retry, bulkhead |
| **Compiler** | `src/compiler/__tests__/` | Compilation output for each target |
| **Parser** | `src/HoloScript*.test.ts` | Parser correctness |
| **E2E** | `tests/e2e/` | End-to-end CLI and MCP flows |

## Coverage

The codebase has **17,740+ passing tests across 1,062 files**. Coverage targets vary by package.

## CI Integration

Tests run automatically on push and PR via GitHub Actions. The CI pipeline:

1. Installs dependencies (`pnpm install`)
2. Builds all packages (`pnpm build`)
3. Runs all tests (`pnpm test`)
4. Reports coverage to Codecov

## Best Practices

- **Colocate tests** with source in `__tests__/` directories
- **Name convention**: `ClassName.test.ts` or `feature.test.ts`
- **Use factories** for complex test data — avoid hardcoded strings
- **Test resilience** with `src/resilience/` patterns (circuit breaker, retry)
- **Verify compiler output** for at least 2 targets per feature
