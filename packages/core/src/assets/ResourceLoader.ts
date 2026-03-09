/**
 * ResourceLoader.ts
 *
 * Async resource loading: dependency graphs, progress tracking,
 * cancellation, and error handling.
 *
 * @module assets
 */

// =============================================================================
// TYPES
// =============================================================================

export type ResourceStatus = 'pending' | 'loading' | 'loaded' | 'error' | 'cancelled';

export interface ResourceRequest {
  id: string;
  url: string;
  type: string;
  dependencies: string[];
  priority: number;
}

export interface ResourceResult {
  id: string;
  status: ResourceStatus;
  data: unknown;
  error?: string;
  loadTimeMs: number;
}

export type ProgressCallback = (loaded: number, total: number, currentId: string) => void;

// =============================================================================
// RESOURCE LOADER
// =============================================================================

export class ResourceLoader {
  private requests: Map<string, ResourceRequest> = new Map();
  private results: Map<string, ResourceResult> = new Map();
  private cancelled = new Set<string>();
  private progressCallbacks: ProgressCallback[] = [];
  private simulateLoad: (req: ResourceRequest) => Promise<unknown>;

  constructor(loader?: (req: ResourceRequest) => Promise<unknown>) {
    this.simulateLoad = loader ?? (async (req) => ({ type: req.type, url: req.url }));
  }

  // ---------------------------------------------------------------------------
  // Request Management
  // ---------------------------------------------------------------------------

  addRequest(req: ResourceRequest): void {
    this.requests.set(req.id, req);
  }
  cancelRequest(id: string): void {
    this.cancelled.add(id);
  }
  onProgress(callback: ProgressCallback): void {
    this.progressCallbacks.push(callback);
  }

  // ---------------------------------------------------------------------------
  // Loading (respects dependency order)
  // ---------------------------------------------------------------------------

  async loadAll(): Promise<ResourceResult[]> {
    const order = this.topologicalSort();
    let loaded = 0;

    for (const id of order) {
      if (this.cancelled.has(id)) {
        this.results.set(id, { id, status: 'cancelled', data: null, loadTimeMs: 0 });
        loaded++;
        continue;
      }

      const req = this.requests.get(id)!;

      // Check dependencies
      const depsFailed = req.dependencies.some((depId) => {
        const depResult = this.results.get(depId);
        return !depResult || depResult.status !== 'loaded';
      });

      if (depsFailed) {
        this.results.set(id, {
          id,
          status: 'error',
          data: null,
          error: 'dependency failed',
          loadTimeMs: 0,
        });
        loaded++;
        continue;
      }

      const start = Date.now();
      try {
        const data = await this.simulateLoad(req);
        this.results.set(id, { id, status: 'loaded', data, loadTimeMs: Date.now() - start });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'unknown error';
        this.results.set(id, {
          id,
          status: 'error',
          data: null,
          error: msg,
          loadTimeMs: Date.now() - start,
        });
      }

      loaded++;
      for (const cb of this.progressCallbacks) cb(loaded, order.length, id);
    }

    return [...this.results.values()];
  }

  // ---------------------------------------------------------------------------
  // Dependency Ordering
  // ---------------------------------------------------------------------------

  private topologicalSort(): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const req = this.requests.get(id);
      if (req) {
        for (const dep of req.dependencies) visit(dep);
      }
      sorted.push(id);
    };

    // Process by priority (higher first)
    const byPriority = [...this.requests.values()].sort((a, b) => b.priority - a.priority);
    for (const req of byPriority) visit(req.id);

    return sorted;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getResult(id: string): ResourceResult | undefined {
    return this.results.get(id);
  }
  getRequestCount(): number {
    return this.requests.size;
  }
  getLoadedCount(): number {
    return [...this.results.values()].filter((r) => r.status === 'loaded').length;
  }
}
