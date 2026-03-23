/**
 * Render Job Persistence
 *
 * IndexedDB-based persistence for render job queue and state.
 * Ensures job continuity across browser sessions and page reloads.
 *
 * @version 3.2.0
 * @milestone v3.2 (June 2026)
 */

import type { RenderJob, RenderNetworkState } from './RenderNetworkTypes';

const DB_NAME = 'holoscript_render_jobs';
const DB_VERSION = 1;
const STORE_ACTIVE = 'active_jobs';
const STORE_COMPLETED = 'completed_jobs';
const STORE_STATE = 'state';

/**
 * Job Queue Persistence using IndexedDB
 */
export class JobQueuePersistence {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      // Check if IndexedDB is available
      if (typeof indexedDB === 'undefined') {
        console.warn('IndexedDB not available, job persistence disabled');
        resolve();
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores
        if (!db.objectStoreNames.contains(STORE_ACTIVE)) {
          const activeStore = db.createObjectStore(STORE_ACTIVE, { keyPath: 'id' });
          activeStore.createIndex('createdAt', 'createdAt', { unique: false });
          activeStore.createIndex('status', 'status', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_COMPLETED)) {
          const completedStore = db.createObjectStore(STORE_COMPLETED, { keyPath: 'id' });
          completedStore.createIndex('completedAt', 'completedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_STATE)) {
          db.createObjectStore(STORE_STATE, { keyPath: 'key' });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Save a job to IndexedDB
   */
  async saveJob(job: RenderJob, isActive: boolean = true): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [isActive ? STORE_ACTIVE : STORE_COMPLETED],
        'readwrite'
      );
      const store = transaction.objectStore(isActive ? STORE_ACTIVE : STORE_COMPLETED);
      const request = store.put(job);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Load all active jobs from IndexedDB
   */
  async loadActiveJobs(): Promise<RenderJob[]> {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_ACTIVE], 'readonly');
      const store = transaction.objectStore(STORE_ACTIVE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Load all completed jobs from IndexedDB
   */
  async loadCompletedJobs(): Promise<RenderJob[]> {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_COMPLETED], 'readonly');
      const store = transaction.objectStore(STORE_COMPLETED);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a job from IndexedDB
   */
  async deleteJob(jobId: string, isActive: boolean = true): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [isActive ? STORE_ACTIVE : STORE_COMPLETED],
        'readwrite'
      );
      const store = transaction.objectStore(isActive ? STORE_ACTIVE : STORE_COMPLETED);
      const request = store.delete(jobId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Move a job from active to completed
   */
  async moveToCompleted(job: RenderJob): Promise<void> {
    if (!this.db) return;

    await this.deleteJob(job.id, true);
    await this.saveJob(job, false);
  }

  /**
   * Save state metadata (cost tracking, etc.)
   */
  async saveState(state: Partial<RenderNetworkState>): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_STATE], 'readwrite');
      const store = transaction.objectStore(STORE_STATE);
      const request = store.put({
        key: 'render_state',
        totalCost: state.totalCost,
        costByQuality: state.costByQuality,
        monthlyCost: state.monthlyCost,
        selectedRegion: state.selectedRegion,
        lastUpdated: Date.now(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Load state metadata
   */
  async loadState(): Promise<Partial<RenderNetworkState> | null> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_STATE], 'readonly');
      const store = transaction.objectStore(STORE_STATE);
      const request = store.get('render_state');

      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }
        resolve({
          totalCost: result.totalCost,
          costByQuality: result.costByQuality,
          monthlyCost: result.monthlyCost,
          selectedRegion: result.selectedRegion,
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear old completed jobs (keep last 100)
   */
  async pruneCompletedJobs(keepCount: number = 100): Promise<void> {
    if (!this.db) return;

    const jobs = await this.loadCompletedJobs();
    if (jobs.length <= keepCount) return;

    // Sort by completion time (oldest first)
    jobs.sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));

    // Delete oldest jobs
    const toDelete = jobs.slice(0, jobs.length - keepCount);
    for (const job of toDelete) {
      await this.deleteJob(job.id, false);
    }
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(
        [STORE_ACTIVE, STORE_COMPLETED, STORE_STATE],
        'readwrite'
      );

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      transaction.objectStore(STORE_ACTIVE).clear();
      transaction.objectStore(STORE_COMPLETED).clear();
      transaction.objectStore(STORE_STATE).clear();
    });
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}
