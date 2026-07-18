import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';
import type { PapersStatusDoc } from '../../../packages/core/src/traits/deriveLotusHealth';
import {
  PAPERS_STATUS_PATH,
  PAPERS_STATUS_SCHEMA,
  SERVICE_PAPERS_STATUS_PATH,
  bakePaperFlower,
  compileScene,
  loadAudit,
  syncPublicPapersStatusCopy,
} from './bake-lotus-scenes';

describe('lotus paper-status source policy', () => {
  it('reads the canonical docs/public v3 manifest, not the service snapshot', () => {
    const expected = fileURLToPath(
      new URL('../../../docs/public/papers-status.json', import.meta.url)
    );

    expect(resolve(PAPERS_STATUS_PATH)).toBe(resolve(expected));
    expect(resolve(PAPERS_STATUS_PATH)).not.toBe(resolve(SERVICE_PAPERS_STATUS_PATH));
    expect(readFileSync(SERVICE_PAPERS_STATUS_PATH)).toEqual(readFileSync(PAPERS_STATUS_PATH));
    expect(loadAudit()).toMatchObject({
      schema: PAPERS_STATUS_SCHEMA,
      matrixSourcePath: 'research/paper-audit-matrix/front-matrix-core-papers.md',
    });
  });

  it('maintains the legacy public URL as an idempotent byte-for-byte mirror', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lotus-papers-status-'));
    const source = join(dir, 'canonical.json');
    const target = join(dir, 'public-copy.json');
    const payload = JSON.stringify({ schema: PAPERS_STATUS_SCHEMA, papers: [] });
    try {
      writeFileSync(source, payload);
      expect(syncPublicPapersStatusCopy(source, target)).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe(payload);
      expect(syncPublicPapersStatusCopy(source, target)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a stale v2 manifest instead of baking it into the readiness overlay', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lotus-papers-status-v2-'));
    const stale = join(dir, 'papers-status.json');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      writeFileSync(stale, JSON.stringify({ schema: 'paper-audit-matrix.v2', papers: [] }));
      expect(loadAudit(stale)).toBeNull();
      expect(warning).toHaveBeenCalledWith(expect.stringContaining(PAPERS_STATUS_SCHEMA));
    } finally {
      warning.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('paper-flower structural-readiness metadata', () => {
  it('serializes a full structural bloom without asserting empirical verification', () => {
    const audit: PapersStatusDoc = {
      schema: PAPERS_STATUS_SCHEMA,
      generatedAt: '2026-07-17T00:00:00.000Z',
      scriptCommit: 'fixture-commit',
      papers: [
        {
          rowId: 'TVCG',
          title: 'Trust by Construction',
          pillars: {
            novelty: { token: '✅' },
            evidencePair: {
              token: '✅',
              scope: 'paper-wide-path-presence',
              claimSupport: 'unverified',
            },
          },
        },
      ],
    };
    const { objects } = compileScene('garden.seedable.holo');
    const roundTrip = JSON.parse(
      JSON.stringify(bakePaperFlower(objects, 'structurally-green-fixture', audit))
    ) as ReturnType<typeof bakePaperFlower>;
    const petal = roundTrip.paperPetals?.find((candidate) => candidate.rowId === 'TVCG');

    expect(roundTrip.aggregate).toBe(1);
    expect(roundTrip.aggregateBloom).toBe('full');
    expect(roundTrip.healthBasis).toBe('structural-readiness-proxy');
    expect(roundTrip.claimSupport).toBe('unverified');
    expect(roundTrip.healthSource).toEqual({
      path: 'docs/public/papers-status.json',
      schema: PAPERS_STATUS_SCHEMA,
      generatedAt: '2026-07-17T00:00:00.000Z',
      scriptCommit: 'fixture-commit',
      sourceClaimSupport: ['unverified'],
    });
    expect(petal).toMatchObject({
      health: 1,
      bloomHealth: 'full',
      healthBasis: 'structural-readiness-proxy',
      claimSupport: 'unverified',
      sourceClaimSupport: ['unverified'],
    });
  });
});
