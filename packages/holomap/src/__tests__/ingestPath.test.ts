import { describe, expect, it } from 'vitest';
import {
  resolveIngestPath,
  parseIngestPathArgv,
  parseVerticalArgv,
  resolveHoloMapVertical,
  selectHoloMapVerticalFromTraits,
  getHoloMapVerticalProfile,
} from '../ingestPath';

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

describe('HoloMap vertical resolution', () => {
  it('parses --holomap-vertical flag', () => {
    expect(parseVerticalArgv(['--holomap-vertical=outdoor'])).toBe('outdoor');
  });

  it('resolves vertical from argv first', () => {
    expect(
      resolveHoloMapVertical({
        argv: ['node', 'vitest', '--holomap-vertical=object'],
        env: { HOLOSCRIPT_HOLOMAP_VERTICAL: 'indoor' },
      }),
    ).toBe('object');
  });

  it('resolves vertical from env when argv is missing', () => {
    expect(
      resolveHoloMapVertical({
        argv: [],
        env: { HOLOSCRIPT_HOLOMAP_VERTICAL: 'indoor' },
      }),
    ).toBe('indoor');
  });

  it('defaults to base when not specified', () => {
    expect(resolveHoloMapVertical({ argv: [], env: {} })).toBe('base');
  });
});

describe('trait-based vertical selection', () => {
  it('selects object for close-range traits', () => {
    expect(selectHoloMapVerticalFromTraits(['close_range_scan', 'reconstruction_source'])).toBe(
      'object',
    );
  });

  it('selects outdoor for geospatial traits', () => {
    expect(selectHoloMapVerticalFromTraits(['geospatial', 'reconstruction_source'])).toBe(
      'outdoor',
    );
  });

  it('selects indoor for SLAM-heavy traits', () => {
    expect(selectHoloMapVerticalFromTraits(['slam_heavy', 'reconstruction_source'])).toBe(
      'indoor',
    );
  });

  it('falls back to base profile', () => {
    const v = selectHoloMapVerticalFromTraits(['reconstruction_source']);
    expect(v).toBe('base');
    expect(getHoloMapVerticalProfile(v).id).toBe('native-holomap-v1');
  });
});
