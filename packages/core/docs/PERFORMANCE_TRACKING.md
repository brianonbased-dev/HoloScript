# HoloScript+ Performance Tracking System

## Overview

The Performance Tracking System is a comprehensive suite of tools designed to monitor, measure, and optimize the performance of the HoloScript+ parser, compiler, and runtime. It provides automated metric collection, analysis, and reporting capabilities.

## Components

### 1. PerformanceTracker (Core)

The foundational class that collects and stores performance metrics.

**Location:** `src/performance/PerformanceTracker.ts`

**Key Methods:**

- `recordMetric(name: string, value: number, secondaryValue?: number)` - Record a single metric
- `getAllMetrics()` - Retrieve all collected metrics
- `getMetricHistory(name: string)` - Get historical data for a specific metric
- `reset()` - Clear all collected metrics

**Usage Example:**

```typescript
import { performanceTracker } from './performance/PerformanceTracker';

// Record a single measurement
performanceTracker.recordMetric('Parse Simple Scene', 5.2, 192.3);

// Record multiple measurements over time
for (let i = 0; i < 100; i++) {
  const start = performance.now();
  // ... do work ...
  const elapsed = performance.now() - start;
  performanceTracker.recordMetric('My Operation', elapsed);
}
```

### 2. PerformanceReportGenerator (Analysis)

Generates comprehensive reports from collected metrics with recommendations.

**Location:** `src/performance/PerformanceReportGenerator.ts`

**Key Methods:**

- `generateReport()` - Create a full performance report
- `saveReport(report, outputPath?)` - Save report to JSON file
- `formatReport(report)` - Generate human-readable text report
- `printReport(report)` - Output formatted report to console

**Usage Example:**

```typescript
import { PerformanceReportGenerator } from './performance/PerformanceReportGenerator';

const generator = new PerformanceReportGenerator(performanceTracker);
const report = generator.generateReport();

// Save to file
generator.saveReport(report, 'performance-report.json');

// Print to console
generator.printReport(report);

// Get formatted text
const formatted = generator.formatReport(report);
console.log(formatted);
```

## Metric Categories

Metrics are automatically organized into categories based on their names:

| Category         | Triggers                                 | Threshold       |
| ---------------- | ---------------------------------------- | --------------- |
| **Parser**       | Names containing "Parse"                 | Avg < 15ms      |
| **Compiler**     | Names containing "Compile" or "Generate" | Avg < 10ms      |
| **Code Metrics** | Names containing "Reduction" or "LOC"    | Reduction > 50% |
| **Memory**       | Names containing "Memory"                | Increase < 50MB |
| **Pipeline**     | Names containing "Pipeline"              | Avg < 50ms      |
| **Scalability**  | Names containing "Scalability"           | Avg < 25ms      |

## Test Files

### Benchmark Tests

**Location:** `src/__tests__/benchmark/CodeReduction.test.ts`

Comprehensive benchmarks for:

- Parser performance (Simple, Complex, UI scenes)
- Compiler performance (visionOS, USDA generation)
- End-to-end pipeline performance
- Memory efficiency
- Scalability analysis

**Running Tests:**

```bash
npm test -- CodeReduction.test.ts
npm test -- --coverage  # With coverage reporting
```

### Unit Tests

**Location:** `src/__tests__/performance/PerformanceReportGenerator.test.ts`

Tests for the report generation system:

- Metric collection and organization
- Report generation
- Category classification
- Recommendation generation
- File I/O operations
- Statistics calculation

**Running Tests:**

```bash
npm test -- PerformanceReportGenerator.test.ts
```

### Integration Tests

**Location:** `src/__tests__/integration/PerformanceTrackingIntegration.test.ts`

End-to-end tests demonstrating:

- Real-world metric tracking scenarios
- Report generation with recommendations
- Performance degradation detection
- Optimization tracking

**Running Tests:**

```bash
npm test -- PerformanceTrackingIntegration.test.ts
```

## Common Workflows

### 1. Adding Performance Tracking to Code

```typescript
import { performanceTracker } from '../performance/PerformanceTracker';

function myExpensiveOperation(input: string): Result {
  const start = performance.now();

  // ... perform operation ...
  const result = processInput(input);

  const elapsed = performance.now() - start;
  performanceTracker.recordMetric('My Operation', elapsed);

  return result;
}
```

### 2. Running Benchmarks

```bash
# Run all benchmark tests
npm test -- benchmark

# Run specific benchmark
npm test -- CodeReduction.test.ts

# Run with detailed output
npm test -- benchmark --reporter=verbose
```

### 3. Generating Reports

```typescript
import { PerformanceTracker } from './performance/PerformanceTracker';
import { PerformanceReportGenerator } from './performance/PerformanceReportGenerator';

// After tests or operations have run
const tracker = performanceTracker;
const generator = new PerformanceReportGenerator(tracker);

// Generate and save report
const report = generator.generateReport();
generator.saveReport(report, 'my-performance-report.json');
generator.printReport(report);
```

### 4. Analyzing Performance Trends

```typescript
// Get metric history
const history = performanceTracker.getMetricHistory('Parse Simple Scene');

// Analyze trends
const avgTime = history.reduce((a, b) => a + b) / history.length;
const minTime = Math.min(...history);
const maxTime = Math.max(...history);
const variance = maxTime - minTime;

console.log(`Parse Performance:
  Average: ${avgTime.toFixed(2)}ms
  Min: ${minTime.toFixed(2)}ms
  Max: ${maxTime.toFixed(2)}ms
  Variance: ${variance.toFixed(2)}ms
`);
```

## Interpreting Reports

### Report Structure

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "totalMetrics": 42,
  "summary": {
    "categories": {
      "Parser": {
        "count": 12,
        "avgValue": 8.5,
        "minValue": 4.2,
        "maxValue": 12.8,
        "metrics": [...]
      },
      ...
    }
  },
  "recommendations": [
    "✅ All metrics within target ranges!"
  ]
}
```

### Recommendation Severity

- **✅ Green (Good)**: All metrics within targets
- **ℹ️ Blue (Info)**: Metric details worth noting
- **⚠️ Yellow (Warning)**: Metric exceeds threshold

### Understanding Metrics

**Parser Metrics:**

- Measured in milliseconds (ms)
- Lower is better
- Target: < 15ms average
- Includes: tokenization, AST generation, semantic analysis

**Compiler Metrics:**

- Measured in milliseconds (ms)
- Lower is better
- Target: < 10ms average
- Includes: code generation, optimization, output formatting

**Memory Metrics:**

- Measured in megabytes (MB)
- Lower is better
- Indicates: heap growth, GC pressure
- Should stay < 50MB for 1000+ operations

**Code Reduction Metrics:**

- Measured in percentage (%)
- Higher is better
- Compares HoloScript LOC vs equivalent compiled code
- Target: > 50% reduction

## Performance Optimization Tips

### When Parser is Slow (> 15ms)

1. **Profile tokenization**: Check if regex-based tokenization is bottleneck
2. **Optimize AST generation**: Consider using parser generators (Antlr, etc.)
3. **Cache results**: Implement memoization for repeated parses
4. **Reduce lookahead**: Minimize grammar lookahead requirements

### When Compiler is Slow (> 10ms)

1. **Parallelize code generation**: Generate different output formats in parallel
2. **Implement incremental compilation**: Only compile changed portions
3. **Cache intermediate passes**: Store post-optimization ASTs
4. **Reduce complexity**: Simplify code generation templates

### When Memory is High (> 50MB growth)

1. **Enable object pooling**: Reuse AST nodes
2. **Implement lazy loading**: Defer non-critical parsing
3. **Add explicit cleanup**: Call reset() between operations
4. **Monitor GC**: Check garbage collection frequency

### When Scalability is Poor

1. **Identify bottlenecks**: Profile with different scene complexities
2. **Optimize recursion**: Replace deep recursion with iteration
3. **Use streaming**: Process large inputs in chunks
4. **Parallelize parsing**: Support concurrent parsing of independent sections

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Performance Benchmarks
on: [push, pull_request]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'

      - run: npm install
      - run: npm test -- benchmark

      - name: Generate report
        run: npm run perf:report

      - uses: actions/upload-artifact@v2
        with:
          name: performance-reports
          path: '*-performance-report.json'
```

## Advanced Usage

### Custom Metric Categories

Extend the categorization logic in `PerformanceReportGenerator`:

```typescript
private extractCategory(name: string): string {
  if (name.includes('MyCustomMetric')) return 'Custom Category';
  // ... existing logic ...
}
```

### Custom Recommendations

Add new recommendation logic:

```typescript
private generateRecommendations(...) {
  // ... existing recommendations ...

  // Add custom check
  if (categories['Custom Category']) {
    const metrics = categories['Custom Category'];
    if (metrics.avgValue > THRESHOLD) {
      recommendations.push('Custom optimization suggestion');
    }
  }
}
```

### Exporting Metrics

```typescript
// Export as CSV
const csv = Array.from(metrics.entries())
  .map(([name, values]) => `${name},${values.join(',')}`)
  .join('\n');
fs.writeFileSync('metrics.csv', csv);

// Export as Prometheus metrics
const prometheus = Array.from(metrics.entries())
  .map(
    ([name, values]) =>
      `# HELP ${name} HoloScript+ ${name}\n` +
      `# TYPE ${name} gauge\n` +
      `${name} ${values[values.length - 1]}`
  )
  .join('\n');
```

## Troubleshooting

### No metrics collected

- Ensure `performanceTracker.recordMetric()` is being called
- Check that performance hooks are properly imported
- Verify tests are actually running the instrumented code

### Inaccurate measurements

- Warmup before measuring (first iterations are slower)
- Run multiple iterations for statistical significance
- Be aware of system load affecting timings
- Use `performance.now()` for millisecond precision

### Reports not generating

- Check PerformanceTracker is initialized
- Verify reportGenerator has access to tracker instance
- Ensure output directory is writable

## Best Practices

1. **Add metrics throughout codebase**: Not just at boundaries
2. **Use consistent naming**: Follow category conventions
3. **Track secondary metrics**: opsPerSecond, memory, etc.
4. **Regular comparisons**: Run benchmarks before/after changes
5. **Document baselines**: Record expected performance targets
6. **Monitor trends**: Look for gradual degradation
7. **Test with realistic data**: Use representative input sizes
8. **Profile bottlenecks**: Don't guess, measure

## References

- [Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance)
- [Node.js Performance Hooks](https://nodejs.org/api/perf_hooks.html)
- [V8 Profiler](https://v8.dev/docs/profile)
- [HoloScript+ Architecture](./ARCHITECTURE.md)

---

**Last Updated:** 2024-01-15  
**Version:** 1.0.0
