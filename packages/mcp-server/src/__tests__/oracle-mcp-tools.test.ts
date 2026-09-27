/**
 * Oracle MCP Tools Tests
 *
 * Tests the graduated /oracle skill tools:
 * - holo_oracle_discover
 * - holo_oracle_synthesize
 * - holo_oracle_gaps
 * - holo_oracle_explore
 * - holo_oracle_curate
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleOracleMcpTool } from '../oracle-mcp-tools';

describe('oracle-mcp-tools', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    process.env = { ...originalEnv, HOLOSCRIPT_API_KEY: 'test-key' };
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('holo_oracle_discover', () => {
    it('requires topic', async () => {
      const result = (await handleOracleMcpTool('holo_oracle_discover', {})) as {
        error: string;
      };
      expect(result.error).toBe('topic is required');
    });

    it('returns research files for a known oracle topic', async () => {
      const result = (await handleOracleMcpTool('holo_oracle_discover', {
        topic: 'compilation as gossip',
        depth: 'brief',
        sources: 'internal',
      })) as {
        topic: string;
        researchFilesFound: number;
        knowledgeEntriesFound: number;
        report: string;
        citations: Array<{ file: string }>;
      };

      expect(result.topic).toBe('compilation as gossip');
      expect(result.researchFilesFound).toBeGreaterThan(0);
      expect(result.citations.length).toBeGreaterThan(0);
      expect(result.citations[0].file).toContain('oracle');
      expect(result.report).toContain('Research Archive');
      expect(result.report).toContain('Next Steps');
    });

    it('deep mode includes longer previews', async () => {
      const result = (await handleOracleMcpTool('holo_oracle_discover', {
        topic: 'thermodynamic trust',
        depth: 'deep',
      })) as { report: string };

      // Deep mode reads up to 4000 chars per file; brief only 300
      expect(result.report.length).toBeGreaterThan(500);
    });

    it('handles unknown topics gracefully', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          json: async () => ({ results: [] }),
        } as Response;
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = (await handleOracleMcpTool('holo_oracle_discover', {
        topic: 'xyzabc123-nothing-here-987654',
        depth: 'brief',
      })) as {
        researchFilesFound: number;
        report: string;
      };

      expect(result.researchFilesFound).toBe(0);
      expect(result.report).toContain('No Findings');
    });

    it('skips a broken symlink and does not return files under node_modules or .git', async () => {
      // RESEARCH_ROOT is read once at module load. Point ORACLE_RESEARCH_ROOT
      // at a temp dir, then vi.resetModules() and dynamic-import so this case
      // sees that root.
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-scan-'));
      const previousRoot = process.env.ORACLE_RESEARCH_ROOT;
      try {
        const notes = path.join(tmp, 'notes');
        fs.mkdirSync(notes, { recursive: true });

        const visible = path.join(tmp, '2026-09-27_hardeningprobe-visible.md');
        const visibleNested = path.join(notes, '2026-09-27_hardeningprobe-visible-nested.md');
        fs.writeFileSync(visible, '# visible hardeningprobe\n');
        fs.writeFileSync(visibleNested, '# nested visible hardeningprobe\n');

        fs.mkdirSync(path.join(tmp, 'node_modules'), { recursive: true });
        fs.writeFileSync(
          path.join(tmp, 'node_modules', '2026-09-27_hardeningprobe-hidden-nm-top.md'),
          '# hidden node_modules hardeningprobe\n'
        );
        fs.mkdirSync(path.join(notes, 'node_modules', 'pkg'), { recursive: true });
        fs.writeFileSync(
          path.join(notes, 'node_modules', 'pkg', '2026-09-27_hardeningprobe-hidden-nm.md'),
          '# hidden nested node_modules hardeningprobe\n'
        );
        fs.mkdirSync(path.join(tmp, '.git'), { recursive: true });
        fs.writeFileSync(
          path.join(tmp, '.git', '2026-09-27_hardeningprobe-hidden-git-top.md'),
          '# hidden git hardeningprobe\n'
        );
        fs.mkdirSync(path.join(notes, 'pkg', '.git'), { recursive: true });
        fs.writeFileSync(
          path.join(notes, 'pkg', '.git', '2026-09-27_hardeningprobe-hidden-git.md'),
          '# hidden nested git hardeningprobe\n'
        );

        const hiddenNames = [
          '2026-09-27_hardeningprobe-hidden-nm-top.md',
          '2026-09-27_hardeningprobe-hidden-nm.md',
          '2026-09-27_hardeningprobe-hidden-git-top.md',
          '2026-09-27_hardeningprobe-hidden-git.md',
        ];
        const expectedNames = [
          '2026-09-27_hardeningprobe-visible.md',
          '2026-09-27_hardeningprobe-visible-nested.md',
        ];

        let symlinkSkipReason = '';
        try {
          fs.symlinkSync(
            path.join(tmp, 'missing-target-for-broken-symlink'),
            path.join(tmp, 'dangling-root')
          );
          fs.symlinkSync(path.join(tmp, 'missing-nested-target'), path.join(notes, 'dangling-nested'));
          fs.symlinkSync(visible, path.join(tmp, '2026-09-27_hardeningprobe-linked.md'));
        } catch (err) {
          const code =
            err && typeof err === 'object' && 'code' in err
              ? String((err as { code?: unknown }).code)
              : '';
          if (code === 'EPERM' || code === 'EACCES' || code === 'ENOTSUP') {
            symlinkSkipReason = `symlink creation is not permitted on this platform (${code}); skipping only the broken-symlink case`;
          } else {
            throw err;
          }
        }
        if (!symlinkSkipReason) {
          expect(() => fs.statSync(path.join(tmp, 'dangling-root'))).toThrow(/ENOENT/);
          expectedNames.push('2026-09-27_hardeningprobe-linked.md');
        }

        delete process.env.HOLOSCRIPT_API_KEY;
        delete process.env.HOLOMESH_API_KEY;
        process.env.ORACLE_RESEARCH_ROOT = tmp;
        vi.resetModules();

        const { handleOracleMcpTool: discover } = await import('../oracle-mcp-tools');
        const result = (await discover('holo_oracle_discover', {
          topic: 'hardeningprobe',
          depth: 'brief',
          sources: 'internal',
        })) as {
          researchFilesFound: number;
          report: string;
          citations: Array<{ file: string; path: string }>;
        };

        if (symlinkSkipReason) {
          expect(symlinkSkipReason).toContain('skipping only the broken-symlink case');
        }

        const files = result.citations.map((c) => c.file).sort();
        expect(files).toEqual([...expectedNames].sort());
        expect(result.researchFilesFound).toBe(expectedNames.length);
        for (const hidden of hiddenNames) {
          expect(files).not.toContain(hidden);
          expect(result.report).not.toContain(hidden);
        }
        for (const citation of result.citations) {
          expect(citation.path.split(path.sep)).not.toContain('node_modules');
          expect(citation.path.split(path.sep)).not.toContain('.git');
        }
      } finally {
        if (previousRoot === undefined) delete process.env.ORACLE_RESEARCH_ROOT;
        else process.env.ORACLE_RESEARCH_ROOT = previousRoot;
        vi.resetModules();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe('holo_oracle_synthesize', () => {
    it('requires research_files', async () => {
      const result = (await handleOracleMcpTool('holo_oracle_synthesize', {})) as {
        error: string;
      };
      expect(result.error).toBe('research_files is required (array of file paths)');
    });

    it('synthesizes entries from existing research files', async () => {
      const result = (await handleOracleMcpTool('holo_oracle_synthesize', {
        research_files: ['2026-03-29_oracle-collision-compilation-as-gossip.md'],
        target_format: 'wisdom',
        topic: 'compilation-gossip',
      })) as {
        filesProcessed: number;
        synthesizedEntries: Array<{ type: string; content: string }>;
        proposedPublishActions: Array<unknown>;
      };

      expect(result.filesProcessed).toBe(1);
      expect(result.synthesizedEntries.length).toBeGreaterThan(0);
      expect(result.synthesizedEntries[0].type).toBe('wisdom');
      expect(result.synthesizedEntries[0].content.length).toBeGreaterThan(20);
      expect(result.proposedPublishActions.length).toBeGreaterThan(0);
    });

    it('returns empty for missing files', async () => {
      const result = (await handleOracleMcpTool('holo_oracle_synthesize', {
        research_files: ['nonexistent-file-xyz.md'],
        target_format: 'all',
      })) as {
        filesProcessed: number;
        synthesizedEntries: unknown[];
      };

      expect(result.filesProcessed).toBe(1);
      expect(result.synthesizedEntries.length).toBe(0);
    });
  });

  describe('holo_oracle_gaps', () => {
    it('returns gap reports with mocked knowledge store', async () => {
      // Mock fetch to avoid real network calls and timeouts
      const mockFetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          json: async () => ({
            results: [
              { id: 'w1', type: 'wisdom', content: 'Test wisdom', domain: 'security' },
              { id: 'p1', type: 'pattern', content: 'Test pattern', domain: 'security' },
            ],
          }),
        } as Response;
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = (await handleOracleMcpTool('holo_oracle_gaps', {
        domain: 'security',
        min_coverage_score: 20,
      })) as {
        auditedDomains: number;
        gapReports: Array<{ domain: string; coverageScore: number; gaps: string[] }>;
        topGaps: Array<{ domain: string; score: number }>;
      };

      expect(result.auditedDomains).toBe(1);
      expect(result.gapReports.length).toBe(1);
      expect(result.gapReports[0].domain).toBe('security');
      expect(result.topGaps.length).toBeLessThanOrEqual(1);
    });

    it('flags zero-coverage domains', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          json: async () => ({ results: [] }),
        } as Response;
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = (await handleOracleMcpTool('holo_oracle_gaps', {
        domain: 'education',
        min_coverage_score: 1,
      })) as {
        gapReports: Array<{ domain: string; coverageScore: number; gaps: string[] }>;
      };

      expect(result.gapReports[0].coverageScore).toBe(0);
      expect(result.gapReports[0].gaps).toContain('Zero knowledge entries — completely unexplored');
    });
  });

  describe('holo_oracle_explore', () => {
    it('requires domain1 and domain2', async () => {
      const result = (await handleOracleMcpTool('holo_oracle_explore', {
        domain1: 'security',
      })) as { error: string };
      expect(result.error).toBe('domain1 and domain2 are required');
    });

    it('returns collision hypotheses for known domains', async () => {
      const result = (await handleOracleMcpTool('holo_oracle_explore', {
        domain1: 'compilation',
        domain2: 'gossip',
        depth: 'hypothesis',
      })) as {
        domain1: string;
        domain2: string;
        collisionHypotheses: string[];
        proposedExplorations: string[];
        researchFilesFound: number;
      };

      expect(result.domain1).toBe('compilation');
      expect(result.domain2).toBe('gossip');
      expect(result.collisionHypotheses.length).toBeGreaterThan(0);
      expect(result.proposedExplorations.length).toBeGreaterThan(0);
      expect(result.researchFilesFound).toBeGreaterThan(0);
    });
  });

  describe('holo_oracle_curate', () => {
    it('returns curation reports with mocked store', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          json: async () => ({
            results: [
              { id: 'w1', type: 'wisdom', content: 'W', domain: 'security' },
              { id: 'p1', type: 'pattern', content: 'P', domain: 'security' },
              { id: 'g1', type: 'gotcha', content: 'G', domain: 'security' },
              { id: 'w2', type: 'wisdom', content: 'W2', domain: 'security' },
              { id: 'w3', type: 'wisdom', content: 'W3', domain: 'security' },
            ],
          }),
        } as Response;
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = (await handleOracleMcpTool('holo_oracle_curate', {
        domain: 'security',
        min_entries: 3,
      })) as {
        auditedDomains: number;
        domainReports: Array<{
          domain: string;
          health: string;
          totalEntries: number;
          recommendations: string[];
        }>;
        networkHealthSummary: { strong: number; weak: number; critical: number };
      };

      expect(result.auditedDomains).toBe(1);
      expect(result.domainReports.length).toBe(1);
      expect(result.domainReports[0].domain).toBe('security');
      expect(result.networkHealthSummary).toHaveProperty('strong');
      expect(result.networkHealthSummary).toHaveProperty('critical');
    });

    it('filters to single domain when requested', async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          json: async () => ({ results: [] }),
        } as Response;
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = (await handleOracleMcpTool('holo_oracle_curate', {
        domain: 'security',
        min_entries: 1,
      })) as {
        auditedDomains: number;
        domainReports: Array<{ domain: string }>;
      };

      expect(result.auditedDomains).toBe(1);
      expect(result.domainReports[0].domain).toBe('security');
    });
  });

  describe('unknown tool', () => {
    it('returns null for unrecognized oracle tool', async () => {
      const result = await handleOracleMcpTool('holo_oracle_unknown', {});
      expect(result).toBeNull();
    });
  });

  it('paid probe: holo_oracle_discover drops a hidden-body premium row', async () => {
    const previousResearchRoot = process.env.ORACLE_RESEARCH_ROOT;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-research-empty-'));
    process.env.ORACLE_RESEARCH_ROOT = dir;
    try {
      const premiumId = 'entry_oracle_store_paid_probe';
      const token = 'xylophonequartz9f3a';
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            results: [
              {
                id: premiumId,
                type: 'wisdom',
                content: `${token} paidprobe ${'lead in prose that is freely readable. '.repeat(12)}`,
                domain: 'general',
                metadata: { price: 25, authorId: 'author-not-caller' },
              },
              {
                id: 'entry_oracle_store_free_keep',
                type: 'wisdom',
                content: 'ordinary free note with no overlap',
                domain: 'general',
                metadata: { price: 0, authorId: 'someone-else' },
              },
            ],
          }),
        })
      );

      vi.resetModules();
      const { handleOracleMcpTool } = await import('../oracle-mcp-tools');

      const result = (await handleOracleMcpTool('holo_oracle_discover', {
        topic: 'xyzabc123-nothing-here-987654',
        depth: 'brief',
        sources: 'internal',
      })) as { report: string };
      const text = JSON.stringify(result);
      expect({
        hasId: text.includes(premiumId),
        hasToken: text.includes(token),
        hasPaidProbe: text.includes('paidprobe'),
      }).toEqual({ hasId: false, hasToken: false, hasPaidProbe: false });
      expect(result.report).toContain('ordinary free note with no overlap');
    } finally {
      if (previousResearchRoot === undefined) {
        delete process.env.ORACLE_RESEARCH_ROOT;
      } else {
        process.env.ORACLE_RESEARCH_ROOT = previousResearchRoot;
      }
      fs.rmSync(dir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
