/**
 * Angular Service for Heap Budget Monitoring
 */

import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { heapMonitor, HeapMetrics, MonitorConfig } from '../HeapBudgetMonitor';

export interface HeapMonitorState {
  metrics: HeapMetrics | null;
  utilization: number;
  isThresholdExceeded: boolean;
  isMonitoring: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class HeapMonitorService implements OnDestroy {
  private destroy$ = new Subject<void>();
  private state$ = new BehaviorSubject<HeapMonitorState>({
    metrics: null,
    utilization: 0,
    isThresholdExceeded: false,
    isMonitoring: false,
  });

  constructor() {
    this.initialize();
  }

  /**
   * Initialize the heap monitor service
   */
  private initialize(): void {
    // Start global monitor
    if (!heapMonitor.getStatus().isMonitoring) {
      heapMonitor.start();
    }

    // Update state periodically
    interval(5000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateState();
      });

    // Listen for cleanup events
    window.addEventListener('heap-monitor:state-pruning-required', this.handleCleanupEvent);
    window.addEventListener('heap-monitor:cache-eviction-required', this.handleCacheEviction);

    console.log('[HeapMonitorService] Initialized');
  }

  /**
   * Get observable state stream
   */
  getState$(): Observable<HeapMonitorState> {
    return this.state$.asObservable();
  }

  /**
   * Get current state snapshot
   */
  getState(): HeapMonitorState {
    return this.state$.value;
  }

  /**
   * Update internal state
   */
  private updateState(): void {
    const metrics = heapMonitor.getHeapMetrics();
    const status = heapMonitor.getStatus();
    const utilization = metrics?.utilizationPercentage ?? 0;
    const isThresholdExceeded = utilization >= status.config.alertThreshold;

    this.state$.next({
      metrics,
      utilization,
      isThresholdExceeded,
      isMonitoring: status.isMonitoring,
    });
  }

  /**
   * Handle cleanup event
   */
  private handleCleanupEvent = (): void => {
    console.warn('[HeapMonitorService] State pruning required');
    // Emit event for subscribers to handle
    this.updateState();
  };

  /**
   * Handle cache eviction event
   */
  private handleCacheEviction = (): void => {
    console.warn('[HeapMonitorService] Cache eviction required');
  };

  /**
   * Track component state
   */
  trackComponent(componentName: string, state: any, inputs: any): void {
    heapMonitor.trackComponentState(componentName, state, inputs);
  }

  /**
   * Track NgRx store
   */
  trackStore(store: any): void {
    const metrics = heapMonitor.trackReduxStore(store);

    // Log large slices
    Object.entries(metrics.slicesSizes)
      .filter(([_, size]) => size > 1024 * 1024)
      .forEach(([slice, size]) => {
        console.warn(`[HeapMonitor] Large NgRx slice: ${slice} (${(size / 1024 / 1024).toFixed(2)} MB)`);
      });
  }

  /**
   * Track cache
   */
  trackCache(cache: Map<any, any>): void {
    heapMonitor.trackCache(cache);
  }

  /**
   * Manually trigger cleanup
   */
  triggerCleanup(): void {
    window.dispatchEvent(new CustomEvent('heap-monitor:state-pruning-required'));
    window.dispatchEvent(new CustomEvent('heap-monitor:cache-eviction-required'));

    setTimeout(() => this.updateState(), 1000);
  }

  /**
   * Get top memory-consuming components
   */
  getTopComponents(limit = 10) {
    return heapMonitor.getTopMemoryComponents(limit);
  }

  /**
   * Reset metrics history
   */
  reset(): void {
    heapMonitor.reset();
    this.updateState();
  }

  /**
   * Cleanup on service destroy
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    window.removeEventListener('heap-monitor:state-pruning-required', this.handleCleanupEvent);
    window.removeEventListener('heap-monitor:cache-eviction-required', this.handleCacheEviction);

    console.log('[HeapMonitorService] Destroyed');
  }
}

/**
 * Example Component Integration
 *
 * @example
 * ```typescript
 * import { Component, OnInit, OnDestroy } from '@angular/core';
 * import { HeapMonitorService } from './heap-monitor.service';
 * import { Subject } from 'rxjs';
 * import { takeUntil } from 'rxjs/operators';
 *
 * @Component({
 *   selector: 'app-my-component',
 *   template: `
 *     <div>
 *       <p>Heap Utilization: {{ utilization | number:'1.2-2' }}%</p>
 *       <button *ngIf="isThresholdExceeded" (click)="cleanup()">
 *         Clean Up Memory
 *       </button>
 *     </div>
 *   `
 * })
 * export class MyComponent implements OnInit, OnDestroy {
 *   private destroy$ = new Subject<void>();
 *   utilization = 0;
 *   isThresholdExceeded = false;
 *
 *   constructor(private heapMonitor: HeapMonitorService) {}
 *
 *   ngOnInit(): void {
 *     // Subscribe to heap monitor state
 *     this.heapMonitor.getState$()
 *       .pipe(takeUntil(this.destroy$))
 *       .subscribe(state => {
 *         this.utilization = state.utilization;
 *         this.isThresholdExceeded = state.isThresholdExceeded;
 *
 *         if (state.isThresholdExceeded) {
 *           this.cleanup();
 *         }
 *       });
 *
 *     // Track this component's state
 *     this.heapMonitor.trackComponent('MyComponent', this, {});
 *   }
 *
 *   cleanup(): void {
 *     // Prune component state
 *     // ... cleanup logic
 *
 *     console.log('Cleanup performed');
 *   }
 *
 *   ngOnDestroy(): void {
 *     this.destroy$.next();
 *     this.destroy$.complete();
 *   }
 * }
 * ```
 */
