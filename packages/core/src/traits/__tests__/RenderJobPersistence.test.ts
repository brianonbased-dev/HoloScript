/**
 * RenderJobPersistence Tests
 *
 * Tests the IndexedDB-based persistence for render job queue and state.
 * Since IndexedDB is not available in the vitest (Node) environment,
 * these tests verify the graceful-degradation paths (db === null).
 * The class is designed to silently degrade when IndexedDB is absent.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JobQueuePersistence } from '../RenderJobPersistence';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(id: string, overrides: Record<string, unknown> = {}): any {
  return {
    id,
    status: 'pending',
    createdAt: Date.now(),
    completedAt: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JobQueuePersistence', () => {
  let persistence: JobQueuePersistence;

  beforeEach(() => {
    persistence = new JobQueuePersistence();
  });

  describe('construction', () => {
    it('creates a new instance', () => {
      expect(persistence).toBeInstanceOf(JobQueuePersistence);
    });
  });

  describe('init — no IndexedDB environment', () => {
    it('resolves without error when IndexedDB is not available', async () => {
      // In Node/vitest, indexedDB is undefined, so init should resolve gracefully
      await expect(persistence.init()).resolves.toBeUndefined();
    });

    it('calling init twice resolves both times without error', async () => {
      await persistence.init();
      // Second call should also resolve gracefully (idempotent)
      await expect(persistence.init()).resolves.toBeUndefined();
    });
  });

  describe('saveJob — graceful degradation', () => {
    it('returns undefined when db is null (no IndexedDB)', async () => {
      // db is null since IndexedDB is not available in node env
      const result = await persistence.saveJob(makeJob('job-1'));
      expect(result).toBeUndefined();
    });

    it('handles active and completed save variants', async () => {
      await persistence.saveJob(makeJob('job-2'), true);
      await persistence.saveJob(makeJob('job-3'), false);
      // Should not throw
    });
  });

  describe('loadActiveJobs — graceful degradation', () => {
    it('returns empty array when db is null', async () => {
      const jobs = await persistence.loadActiveJobs();
      expect(jobs).toEqual([]);
    });
  });

  describe('loadCompletedJobs — graceful degradation', () => {
    it('returns empty array when db is null', async () => {
      const jobs = await persistence.loadCompletedJobs();
      expect(jobs).toEqual([]);
    });
  });

  describe('deleteJob — graceful degradation', () => {
    it('resolves without error when db is null', async () => {
      await expect(persistence.deleteJob('job-1')).resolves.toBeUndefined();
      await expect(persistence.deleteJob('job-2', false)).resolves.toBeUndefined();
    });
  });

  describe('moveToCompleted — graceful degradation', () => {
    it('resolves without error when db is null', async () => {
      await expect(persistence.moveToCompleted(makeJob('job-1'))).resolves.toBeUndefined();
    });
  });

  describe('saveState — graceful degradation', () => {
    it('resolves without error when db is null', async () => {
      await expect(
        persistence.saveState({
          totalCost: 100,
          monthlyCost: 50,
          selectedRegion: 'us-east',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('loadState — graceful degradation', () => {
    it('returns null when db is null', async () => {
      const state = await persistence.loadState();
      expect(state).toBeNull();
    });
  });

  describe('pruneCompletedJobs — graceful degradation', () => {
    it('resolves without error when db is null', async () => {
      await expect(persistence.pruneCompletedJobs()).resolves.toBeUndefined();
      await expect(persistence.pruneCompletedJobs(50)).resolves.toBeUndefined();
    });
  });

  describe('clear — graceful degradation', () => {
    it('resolves without error when db is null', async () => {
      await expect(persistence.clear()).resolves.toBeUndefined();
    });
  });

  describe('close', () => {
    it('can be called when db is null without error', () => {
      expect(() => persistence.close()).not.toThrow();
    });

    it('can be called multiple times safely', () => {
      persistence.close();
      persistence.close();
      // Should not throw
    });

    it('resets initPromise so init can be called again', async () => {
      await persistence.init();
      persistence.close();
      // After close, init should create a new promise
      await expect(persistence.init()).resolves.toBeUndefined();
    });
  });
});
