/**
 * React Hook for Heap Budget Monitoring
 *
 * Automatically tracks component state and props size, integrates with HeapBudgetMonitor
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { heapMonitor, HeapMetrics, MonitorConfig } from '../HeapBudgetMonitor';

export interface UseHeapMonitorOptions {
  /** Component name for tracking */
  componentName: string;
  /** Enable state tracking for this component */
  trackState?: boolean;
  /** Custom alert threshold (overrides global) */
  alertThreshold?: number;
  /** Callback when cleanup is needed */
  onCleanupNeeded?: () => void;
}

export interface UseHeapMonitorReturn {
  /** Current heap metrics */
  metrics: HeapMetrics | null;
  /** Heap utilization percentage */
  utilization: number;
  /** Is threshold exceeded */
  isThresholdExceeded: boolean;
  /** Manually trigger cleanup */
  triggerCleanup: () => void;
  /** Force metrics refresh */
  refreshMetrics: () => void;
}

/**
 * Hook to monitor heap usage in React components
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const [state, setState] = useState(largeData);
 *   const { utilization, isThresholdExceeded, triggerCleanup } = useHeapMonitor({
 *     componentName: 'MyComponent',
 *     trackState: true,
 *     onCleanupNeeded: () => {
 *       // Prune unnecessary state
 *       setState(prev => prev.slice(0, 100));
 *     }
 *   });
 *
 *   useEffect(() => {
 *     if (isThresholdExceeded) {
 *       console.warn('Memory threshold exceeded:', utilization);
 *     }
 *   }, [isThresholdExceeded, utilization]);
 *
 *   return <div>Heap Utilization: {utilization.toFixed(2)}%</div>;
 * }
 * ```
 */
export function useHeapMonitor(options: UseHeapMonitorOptions): UseHeapMonitorReturn {
  const { componentName, trackState = true, alertThreshold, onCleanupNeeded } = options;

  const [metrics, setMetrics] = useState<HeapMetrics | null>(null);
  const cleanupListenerRef = useRef<(() => void) | null>(null);

  // Refresh metrics
  const refreshMetrics = useCallback(() => {
    const currentMetrics = heapMonitor.getHeapMetrics();
    setMetrics(currentMetrics);
  }, []);

  // Setup monitoring on mount
  useEffect(() => {
    // Start global monitor if not already running
    if (!heapMonitor.getStatus().isMonitoring) {
      heapMonitor.start();
    }

    // Initial metrics
    refreshMetrics();

    // Listen for cleanup events
    const handleCleanupNeeded = () => {
      onCleanupNeeded?.();
    };

    window.addEventListener('heap-monitor:state-pruning-required', handleCleanupNeeded);
    cleanupListenerRef.current = () => {
      window.removeEventListener('heap-monitor:state-pruning-required', handleCleanupNeeded);
    };

    // Periodic refresh
    const intervalId = setInterval(refreshMetrics, 5000);

    return () => {
      clearInterval(intervalId);
      cleanupListenerRef.current?.();
    };
  }, [componentName, onCleanupNeeded, refreshMetrics]);

  // Track component state/props (this runs on every render)
  useEffect(() => {
    if (trackState && metrics) {
      // In a real implementation, you'd pass actual state/props
      // This is a placeholder for demonstration
      heapMonitor.trackComponentState(componentName, {}, {});
    }
  });

  // Trigger manual cleanup
  const triggerCleanup = useCallback(() => {
    onCleanupNeeded?.();
    setTimeout(refreshMetrics, 1000);
  }, [onCleanupNeeded, refreshMetrics]);

  const utilization = metrics?.utilizationPercentage ?? 0;
  const threshold = alertThreshold ?? heapMonitor.getStatus().config.alertThreshold;
  const isThresholdExceeded = utilization >= threshold;

  return {
    metrics,
    utilization,
    isThresholdExceeded,
    triggerCleanup,
    refreshMetrics,
  };
}

/**
 * HOC for automatic heap monitoring
 *
 * @example
 * ```tsx
 * const MonitoredComponent = withHeapMonitor(MyComponent, {
 *   componentName: 'MyComponent',
 *   onCleanupNeeded: (props) => {
 *     // Cleanup logic
 *   }
 * });
 * ```
 */
export function withHeapMonitor<P extends object>(
  Component: React.ComponentType<P>,
  options: Omit<UseHeapMonitorOptions, 'componentName'> & { componentName?: string }
) {
  return function HeapMonitoredComponent(props: P) {
    const componentName = options.componentName || Component.displayName || Component.name || 'Unknown';

    const heapState = useHeapMonitor({
      ...options,
      componentName,
    });

    return <Component {...props} heapMonitor={heapState} />;
  };
}

/**
 * Hook for Redux store monitoring
 *
 * @example
 * ```tsx
 * function App() {
 *   const store = useStore();
 *   useReduxStoreMonitor(store);
 *   return <Provider store={store}>...</Provider>;
 * }
 * ```
 */
export function useReduxStoreMonitor(store: any) {
  useEffect(() => {
    const intervalId = setInterval(() => {
      const metrics = heapMonitor.trackReduxStore(store);

      // Log large slices
      Object.entries(metrics.slicesSizes)
        .filter(([_, size]) => size > 1024 * 1024) // > 1MB
        .forEach(([slice, size]) => {
          console.warn(`[HeapMonitor] Large Redux slice: ${slice} (${(size / 1024 / 1024).toFixed(2)} MB)`);
        });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(intervalId);
  }, [store]);
}

/**
 * Hook for cache monitoring
 *
 * @example
 * ```tsx
 * function CachedComponent() {
 *   const cache = useMemo(() => new Map(), []);
 *   useCacheMonitor(cache, { maxSize: 1024 * 1024 * 10 }); // 10MB max
 *   return <div>...</div>;
 * }
 * ```
 */
export function useCacheMonitor(cache: Map<any, any>, options: { maxSize: number }) {
  useEffect(() => {
    const checkCache = () => {
      const metrics = heapMonitor.trackCache(cache);

      if (metrics.totalSize > options.maxSize) {
        console.warn(`[HeapMonitor] Cache size exceeded: ${(metrics.totalSize / 1024 / 1024).toFixed(2)} MB`);

        // Evict oldest entries (if cache is a Map)
        const entriesToEvict = Math.ceil(cache.size * 0.3); // Evict 30%
        const keys = Array.from(cache.keys());
        for (let i = 0; i < entriesToEvict; i++) {
          cache.delete(keys[i]);
        }

        console.log(`[HeapMonitor] Evicted ${entriesToEvict} cache entries`);
      }
    };

    const intervalId = setInterval(checkCache, 5000);

    // Listen for manual eviction events
    const handleEviction = () => {
      cache.clear();
      console.log('[HeapMonitor] Cache cleared due to heap pressure');
    };

    window.addEventListener('heap-monitor:cache-eviction-required', handleEviction);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('heap-monitor:cache-eviction-required', handleEviction);
    };
  }, [cache, options.maxSize]);
}
