import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  graphCacheMetaPath,
  graphCacheSidecarTrustworthy,
  hashGraphCacheBuffer,
  parseGraphCacheEnvelopeBuffer,
  readGraphCacheMetadataFromFile,
  writeGraphCacheMetaSidecar,
} from './graph-cache-envelope';

const PAYLOAD = 'line\nquote:"hi"\\slash\u0007end';

function envelopeJson(order: 'first' | 'middle' | 'last', graphJson: string): string {
  const metadata = {
    version: 2,
    rootDir: '/repo',
    timestamp: 1_700_000_000_000,
    stats: { totalFiles: 12, totalSymbols: 34 },
    gitCommitHash: 'abc123',
    coverageAtScan: { complete: false, graphFileCount: 12 },
  };
  if (order === 'first') {
    return JSON.stringify({ graphJson, ...metadata });
  }
  if (order === 'middle') {
    return JSON.stringify({
      version: metadata.version,
      graphJson,
      rootDir: metadata.rootDir,
      timestamp: metadata.timestamp,
      stats: metadata.stats,
      gitCommitHash: metadata.gitCommitHash,
      coverageAtScan: metadata.coverageAtScan,
    });
  }
  const metadataJson = JSON.stringify(metadata);
  return `${metadataJson.slice(0, -1)},"graphJson":${JSON.stringify(graphJson)}}`;
}

describe('graph-cache envelope parser', () => {
  it.each(['first', 'middle', 'last'] as const)(
    'keeps metadata when graphJson is %s without materializing the payload',
    (order) => {
      const buffer = Buffer.from(envelopeJson(order, PAYLOAD), 'utf-8');
      const split = parseGraphCacheEnvelopeBuffer<{
        version: number;
        rootDir: string;
        gitCommitHash?: string;
        graphJson?: string;
      }>(buffer, { includeGraphJson: false });
      expect(split.graphJson).toBeUndefined();
      expect(split.metadata).not.toHaveProperty('graphJson');
      expect(split.metadata).toMatchObject({
        version: 2,
        rootDir: '/repo',
        gitCommitHash: 'abc123',
        stats: { totalFiles: 12, totalSymbols: 34 },
      });
      expect(JSON.stringify(split.metadata)).not.toContain('\\slash');
    }
  );

  it('unescapes graphJson when requested', () => {
    const buffer = Buffer.from(envelopeJson('last', PAYLOAD), 'utf-8');
    const split = parseGraphCacheEnvelopeBuffer(buffer, { includeGraphJson: true });
    expect(split.graphJson).toBe(PAYLOAD);
    expect(split.metadata).toMatchObject({ version: 2, rootDir: '/repo' });
  });

  it('hashes the raw envelope bytes rather than a UTF-8 string copy', () => {
    const buffer = Buffer.from(envelopeJson('last', PAYLOAD), 'utf-8');
    expect(hashGraphCacheBuffer(buffer)).toHaveLength(64);
    expect(hashGraphCacheBuffer(buffer)).toBe(hashGraphCacheBuffer(Buffer.from(buffer)));
  });
});

describe('graph-cache metadata streaming', () => {
  it('reads production-shaped envelopes without returning graphJson', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-cache-envelope-'));
    const cacheFile = path.join(dir, 'graph-cache.json');
    const bulky = `{"nodes":"${'n'.repeat(256 * 1024)}"}`;
    fs.writeFileSync(cacheFile, envelopeJson('last', bulky), 'utf-8');

    const metadata = readGraphCacheMetadataFromFile<{
      version: number;
      stats?: { totalFiles?: number };
      graphJson?: string;
    }>(cacheFile);
    expect(metadata).toMatchObject({ version: 2, stats: { totalFiles: 12 } });
    expect(metadata?.graphJson).toBeUndefined();
    expect(JSON.stringify(metadata)).not.toContain('n'.repeat(32));
  });

  it('writes a sidecar that later status can trust without rereading the envelope', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-cache-meta-'));
    const cacheFile = path.join(dir, 'graph-cache.json');
    fs.writeFileSync(cacheFile, envelopeJson('last', 'x'.repeat(1024)), 'utf-8');
    const originalBytes = fs.statSync(cacheFile).size;
    const metadata = { version: 2 as const, rootDir: '/repo', timestamp: 1, stats: { totalFiles: 3 } };
    writeGraphCacheMetaSidecar(cacheFile, metadata);

    expect(graphCacheMetaPath(cacheFile)).toBe(path.join(dir, 'graph-cache.meta.json'));
    expect(graphCacheSidecarTrustworthy(cacheFile, metadata, { graphBytes: originalBytes })).toBe(
      true
    );

    fs.writeFileSync(cacheFile, envelopeJson('last', 'changed'), 'utf-8');
    expect(graphCacheSidecarTrustworthy(cacheFile, metadata, { graphBytes: originalBytes })).toBe(
      false
    );
  });
});
