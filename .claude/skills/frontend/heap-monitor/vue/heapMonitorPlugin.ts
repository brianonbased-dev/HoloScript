/**
 * Vue 3 Composition API Plugin for Heap Budget Monitoring
 */

import { ref, onMounted, onUnmounted, computed, watch, type Ref, type Plugin, type App } from 'vue';
import { heapMonitor, type HeapMetrics } from '../HeapBudgetMonitor';

export interface UseHeapMonitorOptions {
  /** Component name for tracking */
  componentName: string;
  /** Enable state tracking */
  trackState?: boolean;
  /** Alert threshold percentage */
  alertThreshold?: number;
  /** Cleanup callback */
  onCleanupNeeded?: () => void;
}

/**
 * Vue 3 Composable for Heap Monitoring
 *
 * @example
 * ```vue
 * <script setup>
 * import { useHeapMonitor } from './heapMonitorPlugin';
 * import { ref } from 'vue';
 *
 * const largeData = ref([...]);
 *
 * const { utilization, isThresholdExceeded, triggerCleanup } = useHeapMonitor({
 *   componentName: 'MyComponent',
 *   onCleanupNeeded: () => {
 *     // Prune data
 *     largeData.value = largeData.value.slice(0, 100);
 *   }
 * });
 * </script>
 *
 * <template>
 *   <div>
 *     <p>Heap: {{ utilization.toFixed(2) }}%</p>
 *     <button v-if="isThresholdExceeded" @click="triggerCleanup">Clean Up</button>
 *   </div>
 * </template>
 * ```
 */
export function useHeapMonitor(options: UseHeapMonitorOptions) {
  const { componentName, trackState = true, alertThreshold, onCleanupNeeded } = options;

  const metrics: Ref<HeapMetrics | null> = ref(null);
  const isMonitoring = ref(false);
  let refreshInterval: number | null = null;

  const refreshMetrics = () => {
    metrics.value = heapMonitor.getHeapMetrics();
  };

  const triggerCleanup = () => {
    onCleanupNeeded?.();
    setTimeout(refreshMetrics, 1000);
  };

  const handleCleanupEvent = () => {
    onCleanupNeeded?.();
  };

  onMounted(() => {
    // Start global monitor
    if (!heapMonitor.getStatus().isMonitoring) {
      heapMonitor.start();
    }
    isMonitoring.value = true;

    // Initial metrics
    refreshMetrics();

    // Listen for cleanup events
    window.addEventListener('heap-monitor:state-pruning-required', handleCleanupEvent);

    // Periodic refresh
    refreshInterval = window.setInterval(refreshMetrics, 5000);
  });

  onUnmounted(() => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    window.removeEventListener('heap-monitor:state-pruning-required', handleCleanupEvent);
  });

  const utilization = computed(() => metrics.value?.utilizationPercentage ?? 0);
  const threshold = computed(() => alertThreshold ?? heapMonitor.getStatus().config.alertThreshold);
  const isThresholdExceeded = computed(() => utilization.value >= threshold.value);

  // Watch for threshold exceeded
  watch(isThresholdExceeded, (exceeded) => {
    if (exceeded) {
      console.warn(`[HeapMonitor] ${componentName} - Threshold exceeded:`, utilization.value.toFixed(2) + '%');
    }
  });

  return {
    metrics,
    utilization,
    isThresholdExceeded,
    isMonitoring,
    triggerCleanup,
    refreshMetrics,
  };
}

/**
 * Vue 3 Plugin for Global Heap Monitoring
 *
 * @example
 * ```ts
 * import { createApp } from 'vue';
 * import { HeapMonitorPlugin } from './heapMonitorPlugin';
 *
 * const app = createApp(App);
 * app.use(HeapMonitorPlugin, {
 *   alertThreshold: 70,
 *   enableAutoPruning: true,
 * });
 * ```
 */
export const HeapMonitorPlugin: Plugin = {
  install(app: App, options: any = {}) {
    // Configure global monitor
    heapMonitor.stop(); // Reset if already running
    Object.assign(heapMonitor['config'], {
      alertThreshold: options.alertThreshold ?? 70,
      checkInterval: options.checkInterval ?? 5000,
      enableAutoPruning: options.enableAutoPruning ?? true,
      enableAutoCacheEviction: options.enableAutoCacheEviction ?? true,
    });

    // Start monitoring
    heapMonitor.start();

    // Provide global access
    app.config.globalProperties.$heapMonitor = heapMonitor;

    // Global mixin to track all components (optional)
    if (options.trackAllComponents) {
      app.mixin({
        mounted() {
          const name = this.$options.name || this.$options.__name || 'AnonymousComponent';
          heapMonitor.trackComponentState(name, this.$data, this.$props);
        },
        updated() {
          const name = this.$options.name || this.$options.__name || 'AnonymousComponent';
          heapMonitor.trackComponentState(name, this.$data, this.$props);
        },
      });
    }

    console.log('[HeapMonitorPlugin] Installed', options);
  },
};

/**
 * Composable for Vuex store monitoring
 *
 * @example
 * ```vue
 * <script setup>
 * import { useStore } from 'vuex';
 * import { useVuexStoreMonitor } from './heapMonitorPlugin';
 *
 * const store = useStore();
 * useVuexStoreMonitor(store);
 * </script>
 * ```
 */
export function useVuexStoreMonitor(store: any) {
  let intervalId: number | null = null;

  onMounted(() => {
    intervalId = window.setInterval(() => {
      const metrics = heapMonitor.trackReduxStore(store);

      // Log large modules
      Object.entries(metrics.slicesSizes)
        .filter(([_, size]) => size > 1024 * 1024) // > 1MB
        .forEach(([module, size]) => {
          console.warn(`[HeapMonitor] Large Vuex module: ${module} (${(size / 1024 / 1024).toFixed(2)} MB)`);
        });
    }, 10000);
  });

  onUnmounted(() => {
    if (intervalId) {
      clearInterval(intervalId);
    }
  });
}

/**
 * Composable for cache monitoring
 *
 * @example
 * ```vue
 * <script setup>
 * import { ref } from 'vue';
 * import { useCacheMonitor } from './heapMonitorPlugin';
 *
 * const cache = ref(new Map());
 * useCacheMonitor(cache, { maxSize: 1024 * 1024 * 10 }); // 10MB
 * </script>
 * ```
 */
export function useCacheMonitor(cache: Ref<Map<any, any>>, options: { maxSize: number }) {
  let intervalId: number | null = null;

  const checkCache = () => {
    const metrics = heapMonitor.trackCache(cache.value);

    if (metrics.totalSize > options.maxSize) {
      console.warn(`[HeapMonitor] Cache size exceeded: ${(metrics.totalSize / 1024 / 1024).toFixed(2)} MB`);

      // Evict 30% of entries
      const entriesToEvict = Math.ceil(cache.value.size * 0.3);
      const keys = Array.from(cache.value.keys());
      for (let i = 0; i < entriesToEvict; i++) {
        cache.value.delete(keys[i]);
      }

      console.log(`[HeapMonitor] Evicted ${entriesToEvict} cache entries`);
    }
  };

  const handleEviction = () => {
    cache.value.clear();
    console.log('[HeapMonitor] Cache cleared due to heap pressure');
  };

  onMounted(() => {
    intervalId = window.setInterval(checkCache, 5000);
    window.addEventListener('heap-monitor:cache-eviction-required', handleEviction);
  });

  onUnmounted(() => {
    if (intervalId) {
      clearInterval(intervalId);
    }
    window.removeEventListener('heap-monitor:cache-eviction-required', handleEviction);
  });
}
