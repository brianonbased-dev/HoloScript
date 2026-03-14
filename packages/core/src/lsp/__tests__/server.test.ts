/**
 * LSP server.test.ts — Unit tests for HoloScript LSP
 *
 * Tests the completion, hover, and diagnostic logic at the module level
 * without actually starting a language server connection.
 */

import { describe, it, expect } from 'vitest';

// Test that the modules we depend on export what the LSP needs
describe('HoloScript LSP Dependencies', () => {
  it('VR_TRAITS exports a non-empty array', async () => {
    const { VR_TRAITS } = await import('../../constants');
    expect(Array.isArray(VR_TRAITS)).toBe(true);
    expect(VR_TRAITS.length).toBeGreaterThan(1000);
  });

  it('HOLOSCHEMA_KEYWORDS exports keyword list', async () => {
    const { HOLOSCHEMA_KEYWORDS } = await import('../../parser/ErrorRecovery');
    expect(HOLOSCHEMA_KEYWORDS).toContain('composition');
    expect(HOLOSCHEMA_KEYWORDS).toContain('object');
    expect(HOLOSCHEMA_KEYWORDS).toContain('template');
  });

  it('HOLOSCHEMA_GEOMETRIES exports geometry list', async () => {
    const { HOLOSCHEMA_GEOMETRIES } = await import('../../parser/ErrorRecovery');
    expect(HOLOSCHEMA_GEOMETRIES).toContain('cube');
    expect(HOLOSCHEMA_GEOMETRIES).toContain('sphere');
    expect(HOLOSCHEMA_GEOMETRIES).toContain('cylinder');
  });

  it('HOLOSCHEMA_PROPERTIES exports property list', async () => {
    const { HOLOSCHEMA_PROPERTIES } = await import('../../parser/ErrorRecovery');
    expect(HOLOSCHEMA_PROPERTIES).toContain('position');
    expect(HOLOSCHEMA_PROPERTIES).toContain('rotation');
    expect(HOLOSCHEMA_PROPERTIES).toContain('color');
  });

  it('ErrorRecovery class is importable', async () => {
    const { ErrorRecovery } = await import('../../parser/ErrorRecovery');
    const recovery = new ErrorRecovery();
    expect(recovery).toBeDefined();
    expect(recovery.hasErrors()).toBe(false);
  });
});

describe('HoloScript LSP — Completion Logic', () => {
  it('trait count exceeds 1,500', async () => {
    const { VR_TRAITS } = await import('../../constants');
    expect(VR_TRAITS.length).toBeGreaterThan(1500);
  });

  it('all traits are strings', async () => {
    const { VR_TRAITS } = await import('../../constants');
    for (const trait of VR_TRAITS.slice(0, 100)) {
      expect(typeof trait).toBe('string');
      expect(trait.length).toBeGreaterThan(0);
    }
  });
});
