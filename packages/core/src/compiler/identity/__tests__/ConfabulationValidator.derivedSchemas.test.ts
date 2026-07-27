import { describe, expect, it } from 'vitest';
import { ConfabulationValidator } from '../ConfabulationValidator';

/**
 * Locks the opt-in derived-schema registration (trait props-schema enforcer, step 2).
 * Derived-from-.holo schemas must be OFF by default (existing callers keep the 63-schema
 * behavior) and, when enabled, must close the coverage gap WITHOUT overriding the richer
 * hand-written built-ins.
 */
describe('ConfabulationValidator — derived .holo schema registration', () => {
  it('does NOT register derived-only traits by default', () => {
    const v = new ConfabulationValidator();
    // `abtest` exists only in the .holo tree, never as a hand-written built-in.
    expect(v.getTraitSchema('abtest')).toBeUndefined();
  });

  it('registers derived-only traits when includeDerivedSchemas is on, with enum members', () => {
    const v = new ConfabulationValidator({ includeDerivedSchemas: true });
    const abtest = v.getTraitSchema('abtest');
    expect(abtest).toBeDefined();
    const strategy = abtest?.properties.find((p) => p.name === 'default_strategy');
    expect(strategy?.type).toBe('enum');
    // @abtest was disambiguated (frdb): the canonical devops/abtest.holo matches the shipped
    // ABTestConfig (equal|weighted|bandit), not the deleted analytics port's 'multi_armed_bandit'.
    expect(strategy?.enumValues).toContain('bandit');
  });

  it('registers the native Quest OCR and speech backends from trait source', () => {
    const v = new ConfabulationValidator({ includeDerivedSchemas: true });
    const documentOcr = v.getTraitSchema('document_ocr');
    const speechSynthesis = v.getTraitSchema('speech_synthesis');

    expect(documentOcr?.properties.find((p) => p.name === 'engine')?.enumValues).toContain(
      'mlkit_bundled'
    );
    expect(documentOcr?.properties.map((p) => p.name)).toEqual(
      expect.arrayContaining([
        'interval_ms',
        'center_crop_fraction',
        'min_text_chars',
        'local_only',
        'discard_frames',
        'log_text_values',
      ])
    );
    expect(speechSynthesis?.properties.find((p) => p.name === 'backend')?.enumValues).toContain(
      'android_tts'
    );
  });

  it('lets hand-written built-ins win over derived on name conflict', () => {
    const v = new ConfabulationValidator({ includeDerivedSchemas: true });
    // `grabbable` is both a built-in (rich, with per-prop descriptions) and a .holo trait.
    const grabbable = v.getTraitSchema('grabbable');
    expect(grabbable).toBeDefined();
    // Only the hand-written built-in carries per-property `description` fields.
    expect(grabbable?.properties.some((p) => typeof p.description === 'string')).toBe(true);
  });
});
