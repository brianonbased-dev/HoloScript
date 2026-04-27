import { describe, expect, it } from 'vitest';
import {
  ACCEPTANCE_BASELINE_STORAGE_KEY,
  compareFingerprints,
  defaultBaseline,
  manifestFilename,
} from './AcceptanceVideoInspector';

describe('AcceptanceVideoInspector helpers', () => {
  describe('compareFingerprints', () => {
    it('returns "no-baseline" when baseline is empty', () => {
      expect(compareFingerprints('', 'fp-current')).toBe('no-baseline');
      expect(compareFingerprints(undefined, 'fp-current')).toBe('no-baseline');
      expect(compareFingerprints(null, 'fp-current')).toBe('no-baseline');
      expect(compareFingerprints('   ', 'fp-current')).toBe('no-baseline');
    });

    it('returns "match" when baseline equals current', () => {
      expect(compareFingerprints('fp-abc', 'fp-abc')).toBe('match');
    });

    it('trims whitespace before comparing — pasted-in baselines often have trailing newlines', () => {
      expect(compareFingerprints('  fp-abc\n', 'fp-abc')).toBe('match');
      expect(compareFingerprints('fp-abc', '  fp-abc\n')).toBe('match');
    });

    it('returns "drift" when fingerprints differ', () => {
      expect(compareFingerprints('fp-abc', 'fp-xyz')).toBe('drift');
    });

    it('drift is byte-sensitive — a single character difference is drift, not match', () => {
      expect(compareFingerprints('fp-abc1', 'fp-abc2')).toBe('drift');
    });
  });

  describe('manifestFilename', () => {
    it('embeds a slugged 16-char prefix of the fingerprint', () => {
      expect(manifestFilename('abc123def456ghi789jkl')).toBe(
        'acceptance-manifest-abc123def456ghi7.json',
      );
    });

    it('strips disallowed characters (slash, colon, dot) so the filename is portable', () => {
      expect(manifestFilename('sha256:abc/def.789')).toBe('acceptance-manifest-sha256abcdef789.json');
    });

    it('falls back to "unknown" when the fingerprint has no allowed characters', () => {
      expect(manifestFilename('!!!///***')).toBe('acceptance-manifest-unknown.json');
    });

    it('keeps short fingerprints intact below the 16-char cap', () => {
      expect(manifestFilename('short')).toBe('acceptance-manifest-short.json');
    });
  });

  describe('defaultBaseline', () => {
    it('returns empty string when storage is undefined', () => {
      expect(defaultBaseline(undefined)).toBe('');
    });

    it('returns empty string when key is absent', () => {
      const fakeStorage = { getItem: () => null };
      expect(defaultBaseline(fakeStorage)).toBe('');
    });

    it('returns the stored baseline when present', () => {
      const fakeStorage = { getItem: (k: string) => (k === ACCEPTANCE_BASELINE_STORAGE_KEY ? 'fp-stored' : null) };
      expect(defaultBaseline(fakeStorage)).toBe('fp-stored');
    });

    it('survives localStorage throwing (private mode, quota) — returns empty string', () => {
      const fakeStorage: Pick<Storage, 'getItem'> = {
        getItem: () => {
          throw new Error('SecurityError: localStorage disabled');
        },
      };
      expect(defaultBaseline(fakeStorage)).toBe('');
    });
  });

  describe('ACCEPTANCE_BASELINE_STORAGE_KEY', () => {
    it('is namespaced under studio.holomap to avoid collision with other features', () => {
      expect(ACCEPTANCE_BASELINE_STORAGE_KEY).toBe('studio.holomap.acceptance-baseline');
    });
  });
});
