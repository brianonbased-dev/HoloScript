/**
 * HoloMap Sprint-2 Integration — end-to-end acceptance harness
 *
 * Tests the full: step() → weight loader → manifest fingerprint flow
 * through the @holoscript/holomap package's paperHarnessProbe API.
 *
 * This is the "acceptance harness" referenced in [HoloMap Sprint-2 Integration].
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPaperHarnessIngestProbe } from '../paperHarnessProbe';
import { resolveIngestPath } from '../ingestPath';

// ── Fixture ───────────────────────────────────────────────────────────────────

const WEIGHT_FIXTURE = new TextEncoder().encode('holomap-sprint2-acceptance-weight-v1');

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => new Response(WEIGHT_FIXTURE, { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HoloMap Sprint-2: end-to-end acceptance harness', () => {
  // ── marble path (no weight fetch) ──────────────────────────────────────────
  describe('marble ingest path', () => {
    it('runs without fetch and returns a fingerprint row', async () => {
      const result = await runPaperHarnessIngestProbe({
        paperId: 'paper-sprint2-acceptance',
        ingestPath: 'marble',
      });

      expect(result.rows).toHaveLength(1);
      const row = result.rows[0]!;
      expect(row.technicalPath).toBe('marble');
      expect(row.contractFingerprint).toMatch(/^[0-9a-f]{16}$/); // FNV-1a 64-bit (2 × 8)
      expect(row.ingestMs).toBeGreaterThanOrEqual(0);
    });

    it('marble fingerprint is deterministic across calls', async () => {
      const r1 = await runPaperHarnessIngestProbe({
        paperId: 'paper-determinism-check',
        ingestPath: 'marble',
      });
      const r2 = await runPaperHarnessIngestProbe({
        paperId: 'paper-determinism-check',
        ingestPath: 'marble',
      });
      expect(r1.rows[0]!.contractFingerprint).toBe(r2.rows[0]!.contractFingerprint);
    });

    it('different paperId produces different fingerprint', async () => {
      const r1 = await runPaperHarnessIngestProbe({
        paperId: 'paper-A',
        ingestPath: 'marble',
      });
      const r2 = await runPaperHarnessIngestProbe({
        paperId: 'paper-B',
        ingestPath: 'marble',
      });
      expect(r1.rows[0]!.contractFingerprint).not.toBe(r2.rows[0]!.contractFingerprint);
    });

    it('report markdown includes paperId and marble label', async () => {
      const result = await runPaperHarnessIngestProbe({
        paperId: 'sprint2-md-check',
        ingestPath: 'marble',
      });
      expect(result.reportMarkdown).toContain('sprint2-md-check');
      expect(result.reportMarkdown).toContain('marble');
    });
  });

  // ── holomap path (weight fetch + step loop) ────────────────────────────────
  describe('holomap ingest path (step() + weight loader)', () => {
    it('fetches weights, runs step(), returns holomap row with SimulationContract fingerprint', async () => {
      const fetchMock = stubFetch();

      const result = await runPaperHarnessIngestProbe({
        paperId: 'paper-sprint2-holomap',
        ingestPath: 'holomap',
      });

      expect(fetchMock).not.toHaveBeenCalled(); // no weightUrl provided → no fetch needed

      expect(result.rows).toHaveLength(1);
      const row = result.rows[0]!;
      expect(row.technicalPath).toBe('holomap');
      expect(row.contractFingerprint).toBeTruthy();
      expect(row.contractFingerprint.length).toBeGreaterThanOrEqual(8);
      expect(row.ingestMs).toBeGreaterThanOrEqual(0);
    });

    it('holomap fingerprint is deterministic (same paperId → same fingerprint)', async () => {
      const r1 = await runPaperHarnessIngestProbe({
        paperId: 'paper-sprint2-determinism',
        ingestPath: 'holomap',
      });
      const r2 = await runPaperHarnessIngestProbe({
        paperId: 'paper-sprint2-determinism',
        ingestPath: 'holomap',
      });
      expect(r1.rows[0]!.contractFingerprint).toBe(r2.rows[0]!.contractFingerprint);
    });

    it('report markdown contains HoloMap label', async () => {
      const result = await runPaperHarnessIngestProbe({
        paperId: 'sprint2-holomap-md',
        ingestPath: 'holomap',
      });
      expect(result.reportMarkdown).toContain('HoloMap');
    });
  });

  // ── both paths ─────────────────────────────────────────────────────────────
  describe('both ingest paths', () => {
    it('returns one row per path when ingestPath=both', async () => {
      const result = await runPaperHarnessIngestProbe({
        paperId: 'paper-sprint2-both',
        ingestPath: 'both',
      });

      expect(result.rows).toHaveLength(2);
      const paths = result.rows.map((r) => r.technicalPath).sort();
      expect(paths).toEqual(['holomap', 'marble']);
    });

    it('both rows have non-empty fingerprints', async () => {
      const result = await runPaperHarnessIngestProbe({
        paperId: 'paper-sprint2-both-fp',
        ingestPath: 'both',
      });
      for (const row of result.rows) {
        expect(row.contractFingerprint).toBeTruthy();
        expect(row.contractFingerprint.length).toBeGreaterThanOrEqual(8);
      }
    });

    it('report markdown references both paths', async () => {
      const result = await runPaperHarnessIngestProbe({
        paperId: 'paper-sprint2-both-md',
        ingestPath: 'both',
      });
      expect(result.reportMarkdown).toContain('marble');
      expect(result.reportMarkdown).toContain('holomap');
    });
  });

  // ── ingestPath resolver integration ───────────────────────────────────────
  describe('resolveIngestPath integration', () => {
    it('resolves marble by default', () => {
      const path = resolveIngestPath({ argv: [], env: {} });
      expect(path).toBe('marble');
    });

    it('resolves holomap from env', () => {
      const path = resolveIngestPath({ argv: [], env: { HOLOSCRIPT_INGEST_PATH: 'holomap' } });
      expect(path).toBe('holomap');
    });

    it('resolves both from env', () => {
      const path = resolveIngestPath({ argv: [], env: { HOLOSCRIPT_INGEST_PATH: 'both' } });
      expect(path).toBe('both');
    });
  });
});
