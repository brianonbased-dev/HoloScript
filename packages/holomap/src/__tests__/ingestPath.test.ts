import { describe, expect, it } from 'vitest';
import { resolveIngestPath, parseIngestPathArgv } from '../ingestPath';

describe('resolveIngestPath', () => {
  it('defaults to marble', () => {
    expect(resolveIngestPath({ argv: [], env: {} })).toBe('marble');
  });

  it('reads argv flag', () => {
    expect(
      resolveIngestPath({
        argv: ['node', 'vitest', '--ingest-path=both'],
        env: {},
      }),
    ).toBe('both');
  });

  it('reads HOLOSCRIPT_INGEST_PATH', () => {
    expect(
      resolveIngestPath({
        argv: [],
        env: { HOLOSCRIPT_INGEST_PATH: 'holomap' },
      }),
    ).toBe('holomap');
  });

  it('reads reconstruction profile', () => {
    expect(
      resolveIngestPath({
        argv: [],
        env: { HOLOSCRIPT_RECONSTRUCTION_PROFILE: 'compare-both' },
      }),
    ).toBe('both');
  });
});

describe('parseIngestPathArgv', () => {
  it('extracts flag', () => {
    expect(parseIngestPathArgv(['--ingest-path=marble'])).toBe('marble');
  });
});
