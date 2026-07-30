/*
 * A-003 task_1785348595166_b6ob — JavaScript language ids and vacuous coverage.
 *
 * language-registry.json advertises `javascript` (extensions .js/.jsx/.mjs/.cjs)
 * as a supported language. The runtime disagrees: LANGUAGE_TRAITS ships no
 * javascript adapter, the typescript trait claims those extensions, and
 * detectLanguage() returns 'typescript' for every one of them. So a scan
 * requesting languages:['javascript'] excluded EVERY file, and because
 * completeness is `graphFileCount >= expectedGraphFileCount`, zero candidates
 * made that vacuously true — an empty graph published as authoritative with
 * ratio 1 for an advertised language.
 *
 * These tests pin both halves: the id space must be canonicalized at the policy
 * boundary, and completeness must never be satisfied vacuously over a non-empty
 * repository.
 */
import { describe, expect, it } from 'vitest';

import { detectLanguage, getSupportedLanguages } from '../engine/adapters';
import { isVacuousCoverage, resolveLanguageFilter } from './codebase-tools';

describe('the id-space mismatch this fixes (ground truth)', () => {
  it('detectLanguage never returns javascript, for any JavaScript extension', () => {
    for (const file of ['a.js', 'a.jsx', 'a.mjs', 'a.cjs']) {
      expect(detectLanguage(file)).toBe('typescript');
    }
  });

  it('javascript is not a runtime-supported language id', () => {
    expect(getSupportedLanguages()).not.toContain('javascript');
  });
});

describe('resolveLanguageFilter', () => {
  const supported = getSupportedLanguages();

  it('maps javascript into the detection id space instead of filtering everything away', () => {
    const resolved = resolveLanguageFilter(['javascript'], supported);
    expect(resolved).not.toBeNull();
    // Canonical id is what detectLanguage actually yields for .js files.
    expect([...resolved!.canonical]).toEqual(['typescript']);
    expect(resolved!.unknown).toEqual([]);
  });

  it('narrows a JavaScript-only scan to the JavaScript extensions', () => {
    const resolved = resolveLanguageFilter(['javascript'], supported);
    expect(resolved!.extensions).not.toBeNull();
    for (const ext of ['.js', '.jsx', '.mjs', '.cjs']) {
      expect(resolved!.extensions!.has(ext), ext).toBe(true);
    }
    // ...and does NOT silently widen into TypeScript sources.
    expect(resolved!.extensions!.has('.ts')).toBe(false);
  });

  it('does not narrow when a first-class id is requested', () => {
    const resolved = resolveLanguageFilter(['typescript'], supported);
    expect([...resolved!.canonical]).toEqual(['typescript']);
    // A typescript scan keeps the adapter's full extension set, so this fix
    // does not change what an existing typescript scan already covered.
    expect(resolved!.extensions).toBeNull();
  });

  it('does not narrow when javascript and typescript are requested together', () => {
    const resolved = resolveLanguageFilter(['javascript', 'typescript'], supported);
    expect([...resolved!.canonical]).toEqual(['typescript']);
    expect(resolved!.extensions).toBeNull();
  });

  it('reports unknown ids instead of silently excluding every file', () => {
    const resolved = resolveLanguageFilter(['klingon'], supported);
    expect(resolved!.unknown).toEqual(['klingon']);
    expect(resolved!.canonical.size).toBe(0);
  });

  it('passes through other first-class languages unchanged', () => {
    for (const id of ['python', 'rust', 'go']) {
      const resolved = resolveLanguageFilter([id], supported);
      expect([...resolved!.canonical], id).toEqual([id]);
      expect(resolved!.unknown, id).toEqual([]);
    }
  });

  it('returns null when no filter was requested', () => {
    expect(resolveLanguageFilter(null, supported)).toBeNull();
    expect(resolveLanguageFilter([], supported)).toBeNull();
  });
});

describe('isVacuousCoverage — completeness of nothing is not completeness', () => {
  it('flags zero expected files over a non-empty repository', () => {
    // The exact shape of the bug: every file filtered out, repo not empty.
    expect(isVacuousCoverage(0, 4213)).toBe(true);
  });

  it('does not flag a genuinely empty repository', () => {
    expect(isVacuousCoverage(0, 0)).toBe(false);
  });

  it('does not flag a scan that actually selected files', () => {
    expect(isVacuousCoverage(12, 4213)).toBe(false);
  });
});
