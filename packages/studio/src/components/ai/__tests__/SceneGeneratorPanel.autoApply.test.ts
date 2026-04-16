// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { shouldAutoApplyGeneratedCode } from '../SceneGeneratorPanel';

describe('SceneGeneratorPanel auto-apply predicate', () => {
  it('returns true when generation is done, code exists, auto-apply enabled, and code is new', () => {
    expect(
      shouldAutoApplyGeneratedCode({
        status: 'done',
        generatedCode: 'composition "Gen" { object "Cube" { geometry: "cube" } }',
        autoApplyOnGenerate: true,
        lastAutoAppliedCode: '',
      })
    ).toBe(true);
  });

  it('returns false when status is not done', () => {
    expect(
      shouldAutoApplyGeneratedCode({
        status: 'generating',
        generatedCode: 'composition "Gen" {}',
        autoApplyOnGenerate: true,
        lastAutoAppliedCode: '',
      })
    ).toBe(false);
  });

  it('returns false when generated code is empty/whitespace', () => {
    expect(
      shouldAutoApplyGeneratedCode({
        status: 'done',
        generatedCode: '   \n\t  ',
        autoApplyOnGenerate: true,
        lastAutoAppliedCode: '',
      })
    ).toBe(false);
  });

  it('returns false when auto-apply is disabled', () => {
    expect(
      shouldAutoApplyGeneratedCode({
        status: 'done',
        generatedCode: 'composition "Gen" {}',
        autoApplyOnGenerate: false,
        lastAutoAppliedCode: '',
      })
    ).toBe(false);
  });

  it('returns false when code was already auto-applied', () => {
    const code = 'composition "Gen" { object "Sphere" { geometry: "sphere" } }';
    expect(
      shouldAutoApplyGeneratedCode({
        status: 'done',
        generatedCode: code,
        autoApplyOnGenerate: true,
        lastAutoAppliedCode: code,
      })
    ).toBe(false);
  });
});
