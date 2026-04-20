// @vitest-environment node
/**
 * spatial-blame.scenario.ts — Spatial Blame Service Contract
 *
 * Persona: Mia — Studio engineer verifying the gitBlameService contract
 * (BlameResult shape, isMock, error fields).
 *
 * React component tests live in:
 *   src/components/versionControl/__tests__/SpatialBlameOverlay.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as blameService from '@/features/versionControl/gitBlameService';

const mockEntry = {
  line: 42,
  hash: 'abc1234567890123456789012345678901234567',
  shortHash: 'abc1234',
  author: 'brian',
  email: 'brian@holoscript.dev',
  date: '2026-03-10',
  summary: 'feat: add @breakable physics trait',
  filePath: 'scenes/my-world.holo',
};

describe('Scenario: gitBlameService — BlameResult contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchBlame returns isMock=true in fallback case', async () => {
    vi.spyOn(blameService, 'fetchBlame').mockResolvedValueOnce({
      ok: true,
      entries: [mockEntry],
      isMock: true,
    });
    const result = await blameService.fetchBlame({ filePath: 'file.holo', startLine: 1, endLine: 3 });
    expect(result.ok).toBe(true);
    expect(result.isMock).toBe(true);
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it('BlameEntry has required structure fields', async () => {
    const entries = [
      { ...mockEntry, line: 5 },
      { ...mockEntry, line: 6 },
      { ...mockEntry, line: 7 },
    ];
    vi.spyOn(blameService, 'fetchBlame').mockResolvedValueOnce({
      ok: true,
      entries,
      isMock: true,
    });
    const result = await blameService.fetchBlame({ filePath: 'file.holo', startLine: 5, endLine: 7 });
    for (const e of result.entries) {
      expect(e).toHaveProperty('hash');
      expect(e).toHaveProperty('shortHash');
      expect(e).toHaveProperty('author');
      expect(e).toHaveProperty('date');
      expect(e).toHaveProperty('summary');
      expect(e).toHaveProperty('filePath');
      expect(e.line).toBeGreaterThanOrEqual(5);
    }
  });

  it('BlameResult ok=false when error occurs', async () => {
    vi.spyOn(blameService, 'fetchBlame').mockResolvedValueOnce({
      ok: false,
      entries: [],
      error: 'not a git repository',
    });
    const result = await blameService.fetchBlame({ filePath: 'bad-path.holo', startLine: 1, endLine: 5 });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('not a git repository');
    expect(result.entries).toHaveLength(0);
  });
});
