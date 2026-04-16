/**
 * Redux Store Integration Example
 *
 * Shows how to integrate heap monitoring with Redux for automatic state pruning
 */

import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { heapMonitor } from '../HeapBudgetMonitor';

// ============================================================================
// Data Slice with Pruning Support
// ============================================================================

interface DataItem {
  id: string;
  timestamp: number;
  content: string;
  metadata: Record<string, any>;
}

interface DataState {
  items: DataItem[];
  maxItems: number;
  lastPruned: number | null;
}

const initialState: DataState = {
  items: [],
  maxItems: 1000, // Keep max 1000 items
  lastPruned: null,
};

const dataSlice = createSlice({
  name: 'data',
  initialState,
  reducers: {
    addItem: (state, action: PayloadAction<DataItem>) => {
      state.items.push(action.payload);

      // Auto-prune if exceeding max
      if (state.items.length > state.maxItems) {
        state.items = state.items.slice(-state.maxItems);
      }
    },

    addItems: (state, action: PayloadAction<DataItem[]>) => {
      state.items.push(...action.payload);

      if (state.items.length > state.maxItems) {
        state.items = state.items.slice(-state.maxItems);
      }
    },

    pruneOldItems: (state, action: PayloadAction<{ maxAge?: number; maxCount?: number }>) => {
      const { maxAge, maxCount } = action.payload;
      const now = Date.now();

      let pruned = state.items;

      // Prune by age (default: 1 hour)
      if (maxAge) {
        pruned = pruned.filter(item => now - item.timestamp < maxAge);
      }

      // Prune by count (keep most recent)
      if (maxCount && pruned.length > maxCount) {
        pruned = pruned.slice(-maxCount);
      }

      state.items = pruned;
      state.lastPruned = now;

      console.log(`[DataSlice] Pruned ${state.items.length - pruned.length} items`);
    },

    clearData: (state) => {
      state.items = [];
      state.lastPruned = Date.now();
    },
  },
});

export const { addItem, addItems, pruneOldItems, clearData } = dataSlice.actions;

// ============================================================================
// Cache Slice with Eviction Support
// ============================================================================

interface CacheState {
  entries: Record<string, { value: any; timestamp: number; hits: number }>;
  maxEntries: number;
  lastEvicted: number | null;
}

const cacheInitialState: CacheState = {
  entries: {},
  maxEntries: 500,
  lastEvicted: null,
};

const cacheSlice = createSlice({
  name: 'cache',
  initialState: cacheInitialState,
  reducers: {
    setCacheEntry: (state, action: PayloadAction<{ key: string; value: any }>) => {
      const { key, value } = action.payload;

      state.entries[key] = {
        value,
        timestamp: Date.now(),
        hits: 0,
      };

      // Auto-evict if exceeding max
      const keys = Object.keys(state.entries);
      if (keys.length > state.maxEntries) {
        // Evict least recently used (LRU)
        const sorted = keys
          .map(k => ({ key: k, timestamp: state.entries[k].timestamp, hits: state.entries[k].hits }))
          .sort((a, b) => {
            // Prioritize by hits first, then timestamp
            if (a.hits !== b.hits) return a.hits - b.hits;
            return a.timestamp - b.timestamp;
          });

        // Remove 30% of entries
        const toRemove = Math.ceil(keys.length * 0.3);
        for (let i = 0; i < toRemove; i++) {
          delete state.entries[sorted[i].key];
        }

        state.lastEvicted = Date.now();
      }
    },

    getCacheEntry: (state, action: PayloadAction<string>) => {
      const entry = state.entries[action.payload];
      if (entry) {
        entry.hits++;
      }
    },

    evictCache: (state, action: PayloadAction<{ percentage?: number }>) => {
      const percentage = action.payload.percentage ?? 0.5; // Default: evict 50%
      const keys = Object.keys(state.entries);

      if (keys.length === 0) return;

      // Sort by hits and timestamp (LRU)
      const sorted = keys
        .map(k => ({ key: k, timestamp: state.entries[k].timestamp, hits: state.entries[k].hits }))
        .sort((a, b) => {
          if (a.hits !== b.hits) return a.hits - b.hits;
          return a.timestamp - b.timestamp;
        });

      const toRemove = Math.ceil(keys.length * percentage);
      for (let i = 0; i < toRemove; i++) {
        delete state.entries[sorted[i].key];
      }

      state.lastEvicted = Date.now();

      console.log(`[CacheSlice] Evicted ${toRemove} cache entries (${(percentage * 100).toFixed(0)}%)`);
    },

    clearCache: (state) => {
      state.entries = {};
      state.lastEvicted = Date.now();
    },
  },
});

export const { setCacheEntry, getCacheEntry, evictCache, clearCache } = cacheSlice.actions;

// ============================================================================
// Store Configuration with Heap Monitoring
// ============================================================================

export const store = configureStore({
  reducer: {
    data: dataSlice.reducer,
    cache: cacheSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// ============================================================================
// Heap Monitor Integration
// ============================================================================

// Configure heap monitor
heapMonitor.start();

// Listen for threshold exceeded events
window.addEventListener('heap-monitor:state-pruning-required', () => {
  console.warn('[Redux] Heap threshold exceeded - pruning state');

  // Prune data slice (keep last 500 items from last hour)
  store.dispatch(
    pruneOldItems({
      maxAge: 60 * 60 * 1000, // 1 hour
      maxCount: 500,
    })
  );
});

window.addEventListener('heap-monitor:cache-eviction-required', () => {
  console.warn('[Redux] Heap threshold exceeded - evicting cache');

  // Evict 50% of cache
  store.dispatch(evictCache({ percentage: 0.5 }));
});

// Periodic store size tracking
setInterval(() => {
  const metrics = heapMonitor.trackReduxStore(store);

  // Log large slices
  Object.entries(metrics.slicesSizes).forEach(([slice, size]) => {
    if (size > 1024 * 1024) {
      // > 1MB
      console.warn(`[Redux] Large slice: ${slice} (${(size / 1024 / 1024).toFixed(2)} MB)`);

      // Auto-prune if data slice is too large
      if (slice === 'data' && size > 5 * 1024 * 1024) {
        // > 5MB
        store.dispatch(pruneOldItems({ maxCount: 500 }));
      }

      // Auto-evict if cache slice is too large
      if (slice === 'cache' && size > 3 * 1024 * 1024) {
        // > 3MB
        store.dispatch(evictCache({ percentage: 0.3 }));
      }
    }
  });
}, 10000); // Check every 10 seconds

// ============================================================================
// React Component Example
// ============================================================================

import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHeapMonitor } from '../react/useHeapMonitor';

export function DataViewer() {
  const dispatch = useDispatch();
  const items = useSelector((state: RootState) => state.data.items);
  const cacheSize = useSelector((state: RootState) => Object.keys(state.cache.entries).length);

  const { utilization, isThresholdExceeded } = useHeapMonitor({
    componentName: 'DataViewer',
    onCleanupNeeded: () => {
      // Component-level cleanup
      dispatch(pruneOldItems({ maxCount: 100 }));
      dispatch(evictCache({ percentage: 0.5 }));
    },
  });

  useEffect(() => {
    // Simulate loading data
    const interval = setInterval(() => {
      const newItem: DataItem = {
        id: Math.random().toString(36),
        timestamp: Date.now(),
        content: `Item ${Date.now()}`,
        metadata: { random: Math.random() },
      };

      dispatch(addItem(newItem));
    }, 1000);

    return () => clearInterval(interval);
  }, [dispatch]);

  return (
    <div>
      <h1>Data Viewer</h1>

      <div style={{ padding: '16px', backgroundColor: isThresholdExceeded ? '#fef2f2' : '#f0fdf4' }}>
        <p>Heap Utilization: {utilization.toFixed(2)}%</p>
        <p>Items in Store: {items.length}</p>
        <p>Cache Entries: {cacheSize}</p>
      </div>

      {isThresholdExceeded && (
        <div style={{ padding: '16px', backgroundColor: '#fef2f2', color: '#ef4444' }}>
          <strong>Memory Warning!</strong> Consider clearing old data.
          <button
            onClick={() => {
              dispatch(pruneOldItems({ maxCount: 100 }));
              dispatch(clearCache());
            }}
          >
            Clear Now
          </button>
        </div>
      )}

      <ul>
        {items.slice(-50).map(item => (
          <li key={item.id}>
            {item.content} - {new Date(item.timestamp).toLocaleTimeString()}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// Export store for testing
// ============================================================================

export default store;
