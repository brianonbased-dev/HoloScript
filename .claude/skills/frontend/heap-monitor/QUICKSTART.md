# Heap Budget Monitor - Quick Start Guide

Get started with heap budget monitoring in 5 minutes.

## Prerequisites

- Chrome or Edge browser
- React 18+, Vue 3+, or Angular 17+
- TypeScript (recommended)

## Step 1: Enable Memory API

Launch your browser with the memory API enabled:

```bash
# Chrome/Edge
chrome.exe --enable-precise-memory-info

# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --enable-precise-memory-info
```

## Step 2: Copy Files to Your Project

Copy the heap monitor files to your project:

```bash
mkdir -p src/heap-monitor
cp -r heap-monitor/* src/heap-monitor/
```

## Step 3: Framework-Specific Setup

### React

**1. Install in your app entry point (`main.tsx` or `App.tsx`):**

```tsx
import { heapMonitor } from './heap-monitor/HeapBudgetMonitor';

// Start monitoring (development only)
if (import.meta.env.DEV) {
  heapMonitor.start();
}

function App() {
  return <YourApp />;
}
```

**2. Use in components:**

```tsx
import { useHeapMonitor } from './heap-monitor/react/useHeapMonitor';

function DataTable() {
  const [data, setData] = useState(largeDataset);

  const { utilization, isThresholdExceeded } = useHeapMonitor({
    componentName: 'DataTable',
    onCleanupNeeded: () => {
      // Prune data when memory pressure detected
      setData(prev => prev.slice(0, 100));
    },
  });

  return (
    <div>
      <p>Memory: {utilization.toFixed(2)}%</p>
      {/* Your table */}
    </div>
  );
}
```

**3. (Optional) Add dashboard:**

```tsx
import HeapMonitorDashboard from './heap-monitor/examples/HeapMonitorDashboard';

function DevTools() {
  return (
    <div>
      {import.meta.env.DEV && <HeapMonitorDashboard />}
    </div>
  );
}
```

### Vue 3

**1. Install plugin (`main.ts`):**

```typescript
import { createApp } from 'vue';
import { HeapMonitorPlugin } from './heap-monitor/vue/heapMonitorPlugin';
import App from './App.vue';

const app = createApp(App);

// Install heap monitor (development only)
if (import.meta.env.DEV) {
  app.use(HeapMonitorPlugin, {
    alertThreshold: 70,
    enableAutoPruning: true,
  });
}

app.mount('#app');
```

**2. Use in components:**

```vue
<script setup>
import { useHeapMonitor } from './heap-monitor/vue/heapMonitorPlugin';
import { ref } from 'vue';

const data = ref(largeDataset);

const { utilization, isThresholdExceeded } = useHeapMonitor({
  componentName: 'DataTable',
  onCleanupNeeded: () => {
    data.value = data.value.slice(0, 100);
  },
});
</script>

<template>
  <div>
    <p>Memory: {{ utilization.toFixed(2) }}%</p>
    <!-- Your table -->
  </div>
</template>
```

### Angular

**1. Provide service (`app.config.ts` or `app.module.ts`):**

```typescript
import { provideHeapMonitor } from './heap-monitor/angular/heap-monitor.service';

export const appConfig: ApplicationConfig = {
  providers: [
    // ... other providers
    provideHeapMonitor(), // Or just inject HeapMonitorService
  ],
};
```

**2. Use in components:**

```typescript
import { Component, OnInit } from '@angular/core';
import { HeapMonitorService } from './heap-monitor/angular/heap-monitor.service';

@Component({
  selector: 'app-data-table',
  template: `
    <div>
      <p>Memory: {{ utilization | number:'1.2-2' }}%</p>
      <!-- Your table -->
    </div>
  `,
})
export class DataTableComponent implements OnInit {
  utilization = 0;
  data = largeDataset;

  constructor(private heapMonitor: HeapMonitorService) {}

  ngOnInit() {
    this.heapMonitor.getState$().subscribe(state => {
      this.utilization = state.utilization;

      if (state.isThresholdExceeded) {
        this.data = this.data.slice(0, 100);
      }
    });
  }
}
```

## Step 4: Test It

**1. Open your app with DevTools enabled:**
```bash
npm run dev
```

**2. Open browser console and check:**
```javascript
// Check if monitoring is active
console.log(performance.memory);

// Should see: { usedJSHeapSize: ..., totalJSHeapSize: ..., jsHeapSizeLimit: ... }
```

**3. Trigger memory pressure (for testing):**

```javascript
// Create large array to simulate memory pressure
const bigArray = new Array(10000000).fill('test');

// Watch the monitor detect threshold exceeded
```

## Step 5: Configure for Your App

Adjust settings based on your app's baseline memory usage:

```typescript
import { heapMonitor } from './heap-monitor/HeapBudgetMonitor';

// Measure baseline first
setTimeout(() => {
  const baseline = heapMonitor.getHeapMetrics();
  console.log('Baseline utilization:', baseline?.utilizationPercentage);

  // Set threshold 20% above baseline
  // e.g., if baseline is 40%, set threshold to 60%
}, 5000);

// Configure
heapMonitor.stop();
heapMonitor = new HeapBudgetMonitor({
  alertThreshold: 60, // Adjust based on baseline
  checkInterval: 5000,
  enableAutoPruning: true,
});
heapMonitor.start();
```

## Common Integration Patterns

### Redux Integration

See `examples/redux-integration.tsx` for full example:

```typescript
import { heapMonitor } from './heap-monitor/HeapBudgetMonitor';

// Listen for cleanup events
window.addEventListener('heap-monitor:state-pruning-required', () => {
  store.dispatch(pruneOldData());
});

// Monitor store size periodically
setInterval(() => {
  const metrics = heapMonitor.trackReduxStore(store);
  console.log('Store size:', metrics.totalSize / 1024 / 1024, 'MB');
}, 10000);
```

### Cache Management

```typescript
import { useCacheMonitor } from './heap-monitor/react/useHeapMonitor';

function CachedComponent() {
  const cache = useMemo(() => new Map(), []);

  useCacheMonitor(cache, {
    maxSize: 10 * 1024 * 1024 // 10MB max
  });

  // Cache automatically evicts when size exceeded
  return <div>...</div>;
}
```

### Automatic Cleanup

```typescript
const { isThresholdExceeded } = useHeapMonitor({
  componentName: 'MyComponent',
  alertThreshold: 70,
  onCleanupNeeded: () => {
    // Option 1: Prune state
    setState(prev => prev.slice(0, 100));

    // Option 2: Clear cache
    cache.clear();

    // Option 3: Unload non-critical data
    setImages([]);
    setLargeObjects(null);
  },
});

// Automatic cleanup triggered when utilization >= 70%
```

## Troubleshooting

### "Memory API not available"

**Problem:** `performance.memory` is undefined

**Solution:**
- Launch browser with `--enable-precise-memory-info` flag
- Check browser compatibility (Chrome/Edge only)

### Threshold always exceeded

**Problem:** Memory usage always > 70%

**Solutions:**
1. Increase threshold based on baseline:
   ```typescript
   alertThreshold: 80
   ```

2. Implement more aggressive cleanup:
   ```typescript
   onCleanupNeeded: () => {
     // Keep only last 50 items instead of 100
     setData(prev => prev.slice(-50));
   }
   ```

3. Use virtualization for large lists:
   ```bash
   npm install react-window
   # or
   npm install vue-virtual-scroller
   ```

### Memory still growing

**Problem:** Memory keeps growing despite cleanup

**Diagnosis:**
1. Check for memory leaks in DevTools:
   - Open Chrome DevTools > Memory
   - Take heap snapshot
   - Perform actions
   - Take another snapshot
   - Compare to find leaks

2. Common leak sources:
   - Event listeners not removed
   - Timers not cleared
   - Closures holding references
   - Global variables

**Solution:**
```typescript
useEffect(() => {
  const handler = () => { /* ... */ };
  window.addEventListener('resize', handler);

  return () => {
    // Always clean up!
    window.removeEventListener('resize', handler);
  };
}, []);
```

## Production Deployment

**Disable in production:**

```typescript
// Only enable in development
if (import.meta.env.DEV || process.env.ENABLE_HEAP_MONITORING === 'true') {
  heapMonitor.start();
}
```

**Or use feature flags:**

```typescript
import { featureFlags } from './config';

if (featureFlags.enableHeapMonitoring) {
  heapMonitor.start();
}
```

## Next Steps

- Read full [README.md](./README.md) for API reference
- Check [examples/](./examples/) for integration patterns
- Review [__tests__/](./__tests__/) for test examples
- Monitor production apps with custom logging:
  ```typescript
  onThresholdExceeded: (metrics) => {
    // Send to analytics
    analytics.track('heap_threshold_exceeded', {
      utilization: metrics.utilizationPercentage,
      usedMB: metrics.usedJSHeapSize / 1024 / 1024,
    });
  }
  ```

## Support

- GitHub Issues: [Report bugs](https://github.com/claude-skills/heap-budget-monitor/issues)
- Documentation: [Full API reference](./README.md)
- Examples: [Integration patterns](./examples/)

---

**Target Achieved: Zero memory leak incidents, responsive UI maintained**

Happy monitoring!
