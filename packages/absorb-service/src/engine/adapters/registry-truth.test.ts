/*
 * A-003 task_1785432913972_o1nf — language-registry.json vs the runtime.
 *
 * The registry used to advertise 14 ids while `getSupportedLanguages()` returned
 * 6. Seven of the difference had no adapter at all, so `detectLanguage` could
 * never return them: a scan requesting one selected zero files and reported
 * complete coverage at ratio 1 over an empty graph.
 *
 * `scripts/check-language-registry.mjs` is the gate, but a gate that nobody runs
 * is not a gate — nothing in this repo's root scripts, CI, or pre-commit invoked
 * it (checked 2026-08-16). These tests run in the ordinary package suite, and
 * they assert against the SHIPPED registry artifact and the LIVE adapter
 * registry, not against fixtures.
 */
import { describe, expect, it } from 'vitest';

import registry from './language-registry.json';
import { getSupportedLanguages } from './index';
import {
  FALLBACK_LANGUAGE,
  findRegistryRuntimeDrift,
  isAdapterBacked,
  type RegistryLanguageRow,
} from './registry-truth';

const rows = registry.languages as RegistryLanguageRow[];

describe('language-registry.json vs getSupportedLanguages()', () => {
  it('advertises exactly the ids the runtime can return, plus the fallback', () => {
    expect(findRegistryRuntimeDrift(rows, getSupportedLanguages())).toEqual([]);
  });

  it('carries no adapterless id other than the fallback', () => {
    const adapterless = rows.filter((row) => !isAdapterBacked(row)).map((row) => row.id);
    expect(adapterless).toEqual([FALLBACK_LANGUAGE]);
  });

  it('does not reintroduce the phantom ids that made coverage vacuous', () => {
    const ids = new Set(rows.map((row) => row.id));
    for (const phantom of ['java', 'cpp', 'csharp', 'php', 'swift', 'kotlin', 'javascript']) {
      expect(ids.has(phantom), `${phantom} is back in the registry`).toBe(false);
    }
  });

  it('keeps the fallback adapterless — it exists because no adapter claims the file', () => {
    expect(getSupportedLanguages()).not.toContain(FALLBACK_LANGUAGE);
  });
});

describe('the comparison itself is not vacuous', () => {
  const runtime = ['typescript', 'python'];

  it('catches the historical javascript row: advertised, unreachable', () => {
    const findings = findRegistryRuntimeDrift(
      [
        { id: 'typescript', status: 'implemented', adapter: 'TreeSitterTraitAdapter' },
        { id: 'python', status: 'implemented', adapter: 'TreeSitterTraitAdapter' },
        { id: 'javascript', status: 'implemented', adapter: 'TreeSitterTraitAdapter' },
        { id: FALLBACK_LANGUAGE, status: 'fallback', adapter: null },
      ],
      runtime
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('"javascript"');
    expect(findings[0]).toContain('getSupportedLanguages() does not return it');
  });

  it('catches a declared build target with no adapter', () => {
    const findings = findRegistryRuntimeDrift(
      [
        { id: 'typescript', status: 'implemented', adapter: 'TreeSitterTraitAdapter' },
        { id: 'python', status: 'implemented', adapter: 'TreeSitterTraitAdapter' },
        { id: 'java', status: 'declared', adapter: null },
        { id: FALLBACK_LANGUAGE, status: 'fallback', adapter: null },
      ],
      runtime
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('"java"');
    expect(findings[0]).toContain('only id permitted without one');
  });

  it('catches a runtime language the registry forgot', () => {
    const findings = findRegistryRuntimeDrift(
      [
        { id: 'typescript', status: 'implemented', adapter: 'TreeSitterTraitAdapter' },
        { id: FALLBACK_LANGUAGE, status: 'fallback', adapter: null },
      ],
      runtime
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('"python"');
    expect(findings[0]).toContain('does not carry it as implemented/native');
  });

  it('catches the fallback growing an adapter', () => {
    const findings = findRegistryRuntimeDrift(
      [
        { id: 'typescript', status: 'implemented', adapter: 'TreeSitterTraitAdapter' },
        { id: 'python', status: 'implemented', adapter: 'TreeSitterTraitAdapter' },
        { id: FALLBACK_LANGUAGE, status: 'fallback', adapter: null },
      ],
      [...runtime, FALLBACK_LANGUAGE]
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('no longer the fallback');
  });
});
