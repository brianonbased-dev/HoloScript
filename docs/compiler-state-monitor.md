# Compiler State Monitor - Memory Budget Management

The CompilerStateMonitor provides comprehensive memory monitoring and out-of-memory (OOM) prevention for HoloScript compilation operations. It tracks AST size, symbol table memory usage, and RAM utilization to prevent crashes on large projects (>1M LOC).

## Features

- **AST Size Tracking**: Deep traversal and node counting to estimate memory usage
- **Symbol Table Monitoring**: Tracks symbol table size with automatic pruning
- **RAM Utilization Alerts**: Configurable thresholds (default: 70% warning, 75% critical)
- **Automatic Incremental Compilation**: Triggers incremental compilation on memory pressure
- **AST Pruning**: Removes source locations and debug metadata to free memory
- **Zero OOM Crashes**: Designed to prevent out-of-memory crashes on large projects

## Installation

The CompilerStateMonitor is included in `@holoscript/core`:

```typescript
import {
  CompilerStateMonitor,
  createCompilerStateMonitor,
  type MemoryStats,
  type MemoryAlert
} from '@holoscript/core';
```

## Quick Start

### Basic Usage

```typescript
import { createCompilerStateMonitor } from '@holoscript/core';

// Create monitor with default settings
const monitor = createCompilerStateMonitor({
  enabled: true,
  monitoringInterval: 5000, // Check every 5 seconds
  onAlert: (alert) => {
    console.warn(`Memory Alert [${alert.level}]: ${alert.message}`);
  }
});

// Set the AST to monitor
monitor.setAST(composition);

// Get current memory stats
const stats = monitor.captureMemoryStats();
console.log('RAM Utilization:', (stats.ramUtilization * 100).toFixed(1) + '%');
console.log('AST Node Count:', stats.astNodeCount.toLocaleString());
console.log('Symbol Table Size:', stats.symbolTableEntryCount.toLocaleString());

// Clean up when done
monitor.dispose();
```

### Integration with ExportManager

The ExportManager automatically integrates CompilerStateMonitor:

```typescript
import { getExportManager } from '@holoscript/core';

const exportManager = getExportManager({
  useMemoryMonitoring: true, // Enabled by default
  memoryMonitorConfig: {
    thresholds: {
      ramUtilizationAlert: 0.70,
      ramUtilizationCritical: 0.75,
      astNodeCountThreshold: 500_000,
      symbolTableThreshold: 100_000,
    },
    autoPrune: true,
    autoIncrementalCompile: true,
  }
});

const result = await exportManager.export('unity', composition);

// Memory stats included in result
if (result.memoryStats) {
  console.log('Compilation Memory Usage:', result.memoryStats);
}

// Get current memory monitor
const monitor = exportManager.getMemoryMonitor();
const stats = monitor?.getStats();
```

## Configuration

### Memory Thresholds

```typescript
const monitor = createCompilerStateMonitor({
  thresholds: {
    ramUtilizationAlert: 0.70,      // Alert at 70% RAM usage
    ramUtilizationCritical: 0.75,   // Critical at 75% RAM usage
    astNodeCountThreshold: 500_000, // Alert at 500K AST nodes
    symbolTableThreshold: 100_000,  // Alert at 100K symbols
  }
});
```

### Automatic Actions

```typescript
const monitor = createCompilerStateMonitor({
  autoPrune: true,              // Automatically prune AST when threshold exceeded
  autoIncrementalCompile: true, // Trigger incremental compilation on critical memory
  onAlert: (alert) => {
    // Custom alert handler
    if (alert.level === 'critical') {
      // Take emergency action
      if (alert.action === 'incremental_compile') {
        console.error('Critical memory pressure - triggering incremental compilation');
      }
    }
  }
});
```

## Memory Statistics

### Capturing Stats

```typescript
const stats = monitor.captureMemoryStats();

console.log('Timestamp:', new Date(stats.timestamp));
console.log('Heap Used:', (stats.heapUsed / 1024 / 1024).toFixed(2) + ' MB');
console.log('Heap Total:', (stats.heapTotal / 1024 / 1024).toFixed(2) + ' MB');
console.log('RAM Utilization:', (stats.ramUtilization * 100).toFixed(1) + '%');
console.log('AST Size:', (stats.astSizeBytes / 1024 / 1024).toFixed(2) + ' MB');
console.log('AST Node Count:', stats.astNodeCount.toLocaleString());
console.log('Symbol Table Size:', (stats.symbolTableSizeBytes / 1024).toFixed(2) + ' KB');
console.log('Symbol Table Entries:', stats.symbolTableEntryCount.toLocaleString());
```

### Historical Stats

```typescript
const stats = monitor.getStats();

console.log('Uptime:', (stats.uptime / 1000 / 60).toFixed(1) + ' minutes');
console.log('Total Prunings:', stats.totalPrunings);
console.log('Total Nodes Removed:', stats.totalNodesRemoved.toLocaleString());
console.log('Total Memory Freed:', (stats.totalMemoryFreed / 1024 / 1024).toFixed(2) + ' MB');
console.log('Alert Counts:', stats.alertCounts);

// Access stats history
stats.statsHistory.forEach((stat, index) => {
  console.log(`Check ${index + 1}: ${(stat.ramUtilization * 100).toFixed(1)}% RAM`);
});
```

## Memory Alerts

### Alert Levels

- **info**: Informational alerts (for logging)
- **warning**: High memory usage detected (70-75% RAM)
- **critical**: Critical memory usage (>75% RAM)

### Alert Types

- **ram_utilization**: RAM usage exceeded threshold
- **ast_size**: AST node count exceeded threshold
- **symbol_table**: Symbol table size exceeded threshold
- **heap_growth**: Rapid heap growth detected (>50% in 25 seconds)

### Handling Alerts

```typescript
const monitor = createCompilerStateMonitor({
  onAlert: (alert) => {
    console.log(`Alert: ${alert.type} [${alert.level}]`);
    console.log(`Message: ${alert.message}`);
    console.log(`Recommended Action: ${alert.action}`);
    console.log(`Current Stats:`, alert.stats);

    // Take custom actions based on alert
    switch (alert.action) {
      case 'incremental_compile':
        // Trigger incremental compilation
        break;
      case 'prune_ast':
        // Prune AST to free memory
        break;
      case 'clear_symbols':
        // Clear unused symbols
        break;
      case 'reduce_batch_size':
        // Reduce compilation batch size
        break;
    }
  }
});

// Get all alerts
const alerts = monitor.getAlerts();

// Filter by level
const criticalAlerts = monitor.getAlertsByLevel('critical');
console.log('Critical Alerts:', criticalAlerts.length);

// Clear alert history
monitor.clearAlerts();
```

## AST Pruning

### Automatic Pruning

When `autoPrune: true`, the monitor automatically prunes the AST when thresholds are exceeded:

- Removes source locations (`loc`, `location`, `sourceRange`)
- Removes debug metadata (`__debug`, `__meta`, `__source`)
- Preserves all essential compilation data

```typescript
const monitor = createCompilerStateMonitor({ autoPrune: true });

// Monitor will automatically prune when needed
monitor.setAST(largeComposition);
monitor.checkMemoryStatus(); // Triggers pruning if threshold exceeded
```

### Manual Pruning

```typescript
const result = monitor.pruneAST();

console.log('Nodes Removed:', result.nodesRemoved);
console.log('Memory Freed:', (result.memoryFreedBytes / 1024).toFixed(2) + ' KB');
console.log('Timestamp:', new Date(result.timestamp));
```

## Symbol Table Management

### Registering Symbols

```typescript
// Register symbols during compilation
monitor.registerSymbol('MyClass', {
  type: 'class',
  location: 'file.ts:10',
  exports: ['method1', 'method2']
});

// Retrieve symbol
const symbol = monitor.getSymbol('MyClass');
```

### Automatic Pruning

```typescript
// Prune unused symbols (symbols not referenced in current AST)
const result = monitor.pruneSymbolTable();

console.log('Symbols Removed:', result.symbolsRemoved);
console.log('Memory Freed:', (result.memoryFreedBytes / 1024).toFixed(2) + ' KB');
```

## Incremental Compilation Integration

### Connecting to IncrementalCompiler

```typescript
import { IncrementalCompiler, createCompilerStateMonitor } from '@holoscript/core';

const incrementalCompiler = new IncrementalCompiler();
const monitor = createCompilerStateMonitor({
  autoIncrementalCompile: true
});

// Connect monitor to incremental compiler
monitor.setIncrementalCompiler(incrementalCompiler);

// Monitor will automatically trigger incremental compilation on critical memory pressure
monitor.setAST(composition);
monitor.checkMemoryStatus();
```

## Best Practices

### For Large Projects (>1M LOC)

```typescript
const monitor = createCompilerStateMonitor({
  enabled: true,
  monitoringInterval: 3000, // Check more frequently
  thresholds: {
    ramUtilizationAlert: 0.60,      // Lower threshold for safety
    ramUtilizationCritical: 0.70,
    astNodeCountThreshold: 300_000, // Lower threshold
    symbolTableThreshold: 50_000,
  },
  autoPrune: true,
  autoIncrementalCompile: true,
  onAlert: (alert) => {
    if (alert.level === 'critical') {
      // Log to monitoring system
      console.error('CRITICAL MEMORY ALERT', alert);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
  }
});
```

### Production Deployment

```typescript
const monitor = createCompilerStateMonitor({
  enabled: process.env.NODE_ENV === 'production',
  monitoringInterval: 10000, // Less frequent in production
  thresholds: {
    ramUtilizationAlert: 0.75,
    ramUtilizationCritical: 0.85,
    astNodeCountThreshold: 1_000_000,
    symbolTableThreshold: 200_000,
  },
  onAlert: (alert) => {
    // Send to logging/monitoring service
    logger.error('Memory Alert', {
      level: alert.level,
      type: alert.type,
      message: alert.message,
      stats: alert.stats,
    });
  }
});
```

### Testing Environment

```typescript
const monitor = createCompilerStateMonitor({
  enabled: false, // Disable background monitoring in tests
  monitoringInterval: 100, // Fast interval for tests
});

// Manually trigger checks in tests
beforeEach(() => {
  monitor.resetStats();
});

it('should compile without memory issues', () => {
  monitor.setAST(testComposition);

  const beforeStats = monitor.captureMemoryStats();

  // Run compilation
  compiler.compile(testComposition);

  const afterStats = monitor.captureMemoryStats();

  // Verify memory didn't grow excessively
  const growth = (afterStats.heapUsed - beforeStats.heapUsed) / beforeStats.heapUsed;
  expect(growth).toBeLessThan(0.5); // Less than 50% growth
});
```

## API Reference

### CompilerStateMonitor

#### Constructor Options

```typescript
interface CompilerStateMonitorOptions {
  enabled?: boolean;                    // Enable monitoring (default: true)
  thresholds?: Partial<MemoryThresholds>;
  autoPrune?: boolean;                  // Auto-prune on threshold (default: true)
  autoIncrementalCompile?: boolean;     // Auto-trigger incremental compile (default: true)
  onAlert?: (alert: MemoryAlert) => void;
  monitoringInterval?: number;          // Check interval in ms (default: 5000)
}
```

#### Methods

- `startMonitoring()`: Start background monitoring
- `stopMonitoring()`: Stop background monitoring
- `checkMemoryStatus()`: Manually check memory status
- `captureMemoryStats()`: Capture current memory statistics
- `setAST(ast)`: Set the AST to monitor
- `getAST()`: Get current AST
- `clearAST()`: Clear AST from memory
- `registerSymbol(name, metadata)`: Register symbol in symbol table
- `getSymbol(name)`: Get symbol from symbol table
- `pruneSymbolTable()`: Prune unused symbols
- `pruneAST()`: Prune AST metadata
- `setIncrementalCompiler(compiler)`: Connect to incremental compiler
- `getAlerts()`: Get all alerts
- `getAlertsByLevel(level)`: Get alerts by level
- `clearAlerts()`: Clear alert history
- `getStats()`: Get monitoring statistics
- `resetStats()`: Reset statistics
- `dispose()`: Clean up and dispose monitor

## Performance Impact

The CompilerStateMonitor has minimal performance impact:

- **Monitoring Overhead**: ~5-10ms per check (default: every 5 seconds)
- **AST Size Estimation**: ~100-200ms for 1M node AST
- **Symbol Table Estimation**: ~1-5ms for 100K symbols
- **Memory Overhead**: ~50-100KB for monitor data structures

## Troubleshooting

### High Memory Alerts

If you're getting frequent memory alerts:

1. **Lower thresholds** for earlier detection
2. **Enable autoPrune** to automatically free memory
3. **Use incremental compilation** for large projects
4. **Batch operations** into smaller chunks
5. **Force garbage collection** after heavy operations

### OOM Crashes Still Occurring

If crashes still occur despite monitoring:

1. **Check Node.js heap limit**: Increase with `--max-old-space-size=8192`
2. **Review AST structure**: Look for circular references or memory leaks
3. **Monitor external memory**: Check `stats.external` for buffer usage
4. **Profile with heap snapshots**: Use Chrome DevTools for detailed analysis

### False Alerts

If you're getting false alerts:

1. **Increase thresholds** to reduce sensitivity
2. **Adjust monitoring interval** to check less frequently
3. **Review baseline memory usage** for your project size
4. **Filter alerts** by type or level in the handler

## Examples

See the comprehensive test suite for more examples:
- `packages/core/src/compiler/__tests__/CompilerStateMonitor.test.ts`

## Resources

- [Node.js Memory Documentation](https://nodejs.org/en/learn/diagnostics/memory/understanding-and-tuning-memory)
- [Tracking Memory Allocation](https://nearform.com/insights/tracking-memory-allocation-node-js/)
- [Memory Profiling Guide](https://www.valentinog.com/blog/node-usage/)

## License

MIT License - See LICENSE file in the HoloScript repository.
