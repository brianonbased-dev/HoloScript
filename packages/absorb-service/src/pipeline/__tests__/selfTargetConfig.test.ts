import { describe, expect, it } from 'vitest';
import { HOLOSCRIPT_SELF_DNA, SELF_TARGET_DENYLIST, isSelfTargetSafe } from '../selfTargetConfig';

describe('HOLOSCRIPT_SELF_DNA', () => {
  it('has kind spatial with high confidence', () => {
    expect(HOLOSCRIPT_SELF_DNA.kind).toBe('spatial');
    expect(HOLOSCRIPT_SELF_DNA.confidence).toBe(0.99);
  });

  it('recommends deep profile', () => {
    expect(HOLOSCRIPT_SELF_DNA.recommendedProfile).toBe('deep');
  });

  it('has projectDNA with monorepo shape', () => {
    expect(HOLOSCRIPT_SELF_DNA.projectDNA?.repoShape).toBe('monorepo');
  });
});

describe('SELF_TARGET_DENYLIST', () => {
  it('includes daemon-state.json', () => {
    expect(SELF_TARGET_DENYLIST).toContain('daemon-state.json');
  });

  it('includes recursive pipeline path', () => {
    expect(SELF_TARGET_DENYLIST).toContain('src/lib/recursive/');
  });

  it('includes daemon core files', () => {
    expect(SELF_TARGET_DENYLIST).toContain('packages/core/src/cli/daemon-actions.ts');
  });

  it('includes env files', () => {
    expect(SELF_TARGET_DENYLIST).toContain('.env');
  });
});

describe('isSelfTargetSafe', () => {
  it('blocks daemon-state.json', () => {
    expect(isSelfTargetSafe('some/path/daemon-state.json')).toBe(false);
  });

  it('blocks recursive pipeline files', () => {
    expect(isSelfTargetSafe('packages/studio/src/lib/recursive/types.ts')).toBe(false);
  });

  it('blocks daemon-actions.ts', () => {
    expect(isSelfTargetSafe('packages/core/src/cli/daemon-actions.ts')).toBe(false);
  });

  it('allows normal source files', () => {
    expect(isSelfTargetSafe('packages/core/src/compiler/R3FCompiler.ts')).toBe(true);
  });

  it('allows test files', () => {
    expect(isSelfTargetSafe('packages/studio/src/lib/__tests__/something.test.ts')).toBe(true);
  });

  it('normalizes backslashes', () => {
    expect(isSelfTargetSafe('packages\\studio\\src\\lib\\recursive\\types.ts')).toBe(false);
  });
});
