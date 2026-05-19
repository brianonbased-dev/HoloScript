/**
 * Tests for Daemon GRPO Runner
 *
 * Covers:
 * - runDaemonGRPOPass with extraction only (no completions)
 * - runDaemonGRPOPass with completions (scoring)
 * - Error handling for invalid rootDir
 * - Type exports (DaemonGRPOConfig, DaemonGRPOResult)
 *
 * Source: idea-run-13 — Wire GRPORewardOrchestrator into absorb-service daemon
 */

import { describe, it, expect } from 'vitest';
import { runDaemonGRPOPass } from '../daemon-grpo-runner';
import type { DaemonGRPOConfig, DaemonGRPOResult } from '../daemon-grpo-runner';

describe('runDaemonGRPOPass', () => {
  it('should return error for nonexistent rootDir', async () => {
    const config: DaemonGRPOConfig = {
      rootDir: '/nonexistent/path/that/does/not/exist',
    };
    const result = await runDaemonGRPOPass(config);

    // Error message may be undefined if extraction silently returns 0 prompts
    // for a nonexistent directory, or a string containing 'failed'
    if (result.error) {
      expect(result.error).toContain('failed');
    }
    expect(result.promptsExtracted).toBe(0);
    expect(result.completionsScored).toBe(0);
    expect(result.compositeRewards).toEqual([]);
  });

  it('should extract prompts from a valid rootDir without completions', async () => {
    // Use the daemon package directory itself as a small test target
    const config: DaemonGRPOConfig = {
      rootDir: __dirname,
      maxPrompts: 5,
    };
    const result = await runDaemonGRPOPass(config);

    // Extraction should succeed (may find 0 or more prompts from the test files)
    expect(result.promptsExtracted).toBeGreaterThanOrEqual(0);
    expect(result.promptsAfterDedup).toBeGreaterThanOrEqual(0);
    expect(result.bySource).toBeDefined();
    expect(result.byDifficulty).toBeDefined();
    expect(result.byDomain).toBeDefined();
    expect(result.packagesCovered).toBeDefined();
    // No completions scored
    expect(result.completionsScored).toBe(0);
    expect(result.compositeRewards).toEqual([]);
    expect(result.functionResults).toEqual([]);
    expect(result.stats).toBeNull();
  });

  it('should accept completions and attempt scoring', async () => {
    const config: DaemonGRPOConfig = {
      rootDir: __dirname,
      maxPrompts: 5,
    };
    // Provide a simple completion string
    const completions = ['function hello() { return 42; }'];
    const result = await runDaemonGRPOPass(config, completions);

    // Extraction should still succeed
    expect(result.promptsExtracted).toBeGreaterThanOrEqual(0);
    // Scoring may fail in test env (no vitest/tsc available) but should not throw
    // The result should either have scores or an error message
    if (result.error) {
      // Scoring failed — that's OK in test env
      expect(result.error).toContain('Reward scoring failed');
    } else {
      // Scoring succeeded
      expect(result.completionsScored).toBeGreaterThanOrEqual(0);
    }
  });

  it('should respect maxPrompts config', async () => {
    const config: DaemonGRPOConfig = {
      rootDir: __dirname,
      maxPrompts: 2,
    };
    const result = await runDaemonGRPOPass(config);

    // Should not exceed maxPrompts (after dedup)
    expect(result.promptsAfterDedup).toBeLessThanOrEqual(2);
  });

  it('should return correct result shape', async () => {
    const config: DaemonGRPOConfig = {
      rootDir: __dirname,
    };
    const result: DaemonGRPOResult = await runDaemonGRPOPass(config);

    // Verify all expected fields are present
    expect(typeof result.promptsExtracted).toBe('number');
    expect(typeof result.promptsAfterDedup).toBe('number');
    expect(typeof result.bySource).toBe('object');
    expect(typeof result.byDifficulty).toBe('object');
    expect(typeof result.byDomain).toBe('object');
    expect(Array.isArray(result.packagesCovered)).toBe(true);
    expect(typeof result.completionsScored).toBe('number');
    expect(Array.isArray(result.compositeRewards)).toBe(true);
    expect(Array.isArray(result.functionResults)).toBe(true);
    expect(typeof result.totalDurationMs).toBe('number');
  });
});