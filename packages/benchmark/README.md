# @holoscript/benchmark

Performance benchmarking suite for HoloScript parser, type checker, formatter, and LSP.

## Installation

```bash
npm install @holoscript/benchmark
```

## Running Benchmarks

```bash
# All suites
npm run bench:all

# Individual suites
npm run bench:parser
npm run bench:compiler
npm run bench:typechecker
npm run bench:formatter

# CI mode (JSON output)
npm run bench:ci
```

## Benchmark Suites

### Parser

Measures full and incremental parse performance across fixture sizes:

```typescript
import { runParserBench } from '@holoscript/benchmark';

const bench = await runParserBench();
// Benchmarks: parse-small, parse-medium, parse-large
// Benchmarks: incremental-small-single-edit, incremental-medium-single-edit, incremental-large-single-edit
```

### Compiler

Measures compilation, incremental recompilation, trait diffing, and cache serialization:

```typescript
import { runCompilerBench } from '@holoscript/benchmark';

const bench = await runCompilerBench();
// Benchmarks: compile-full-*, compile-incremental-*, diff-trait-config-*
// Benchmarks: recompilation-set-*, cache-serialize, cache-deserialize
```

### Formatter

Measures full-file and range formatting:

```typescript
import { runFormatterBench } from '@holoscript/benchmark';

const bench = await runFormatterBench();
// Benchmarks: format-small, format-medium, format-large
// Benchmarks: format-range-small, format-range-medium
```

### Type Checker

Measures type checking with and without trait validation:

```typescript
import { runTypeCheckerBench } from '@holoscript/benchmark';

const bench = await runTypeCheckerBench();
// Benchmarks: typecheck-small, typecheck-medium, typecheck-with-trait-validation-small
```

## Regression Detection

Compare results against a baseline to catch performance regressions:

```bash
# Save baseline
npm run bench:ci > baseline.json

# Compare against baseline
npm run bench -- --compare=baseline.json
```

```typescript
import { extractResults, detectRegressions } from '@holoscript/benchmark';

const current = extractResults(bench, 'parser');
const report = detectRegressions(current, baseline, 0.1); // 10% threshold
```

## Metrics Analysis

```typescript
import { calculateMetrics, compareMetrics, formatMetrics } from '@holoscript/benchmark';

const metrics = calculateMetrics(task);
console.log(formatMetrics(metrics));
// "parse-small: 12,345 ops/sec (0.081ms/op)"

const regression = compareMetrics(baseline, current, 0.05);
if (regression.isRegression) {
  console.warn(`${regression.metric} regressed by ${regression.percentChange}%`);
}
```

## Fixtures

Test fixtures in `fixtures/`:

| File            | Description                                      |
| --------------- | ------------------------------------------------ |
| `small.hsplus`  | Small scene (1 template, 2 objects)              |
| `medium.hsplus` | Medium scene (2 templates, grid layout)          |
| `large.hsplus`  | Large scene (multiple templates, complex traits) |

## Exported Types

- `BenchmarkResult` - Individual benchmark result
- `SuiteResults` - Results for a suite
- `AllResults` - Complete benchmark run
- `BenchmarkMetrics` - Calculated metrics (hz, period, samples, stdDev)
- `PerformanceRegression` - Regression analysis result

## License

MIT
