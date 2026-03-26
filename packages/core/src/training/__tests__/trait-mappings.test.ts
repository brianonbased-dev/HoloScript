/**
 * Trait Mappings Tests
 *
 * Gap 1 + 2: Validates TM-to-HS trait mapping and validation functions.
 */

import { describe, it, expect } from 'vitest';
import {
  TM_REGISTERED_TRAITS,
  validateTraitName,
  generateValidationReport,
} from '../trait-mappings';

describe('TM_REGISTERED_TRAITS', () => {
  it('has 48 registered traits', () => {
    expect(TM_REGISTERED_TRAITS).toHaveLength(48);
  });

  it('includes core VR traits', () => {
    expect(TM_REGISTERED_TRAITS).toContain('grabbable');
    expect(TM_REGISTERED_TRAITS).toContain('throwable');
    expect(TM_REGISTERED_TRAITS).toContain('physics');
  });

  it('includes AI traits', () => {
    expect(TM_REGISTERED_TRAITS).toContain('llm_agent');
    expect(TM_REGISTERED_TRAITS).toContain('behavior_tree');
  });
});

describe('validateTraitName', () => {
  const validTraits = new Set(['grabbable', 'throwable', 'physics', 'networked']);

  it('matches exact trait names', () => {
    expect(validateTraitName('grabbable', validTraits)).toBe('grabbable');
    expect(validateTraitName('physics', validTraits)).toBe('physics');
  });

  it('strips @ prefix and normalizes', () => {
    expect(validateTraitName('@grabbable', validTraits)).toBe('grabbable');
  });

  it('returns null for unknown traits', () => {
    expect(validateTraitName('unknown_trait', validTraits)).toBeNull();
  });

  it('works with readonly arrays', () => {
    const arr = ['grabbable', 'physics'] as const;
    expect(validateTraitName('grabbable', arr)).toBe('grabbable');
  });
});

describe('generateValidationReport', () => {
  const hsTraits = new Set(['grabbable', 'throwable', 'physics', 'networked', 'glowing']);
  const deprecatedTraits = new Set(['collision', 'talkable']);

  it('correctly classifies matched traits', () => {
    const report = generateValidationReport(['grabbable', 'physics'], hsTraits);
    expect(report.matched).toBe(2);
    expect(report.unmatched).toBe(0);
    expect(report.total).toBe(2);
  });

  it('correctly identifies unmatched traits', () => {
    const report = generateValidationReport(['grabbable', 'unknown_trait'], hsTraits);
    expect(report.matched).toBe(1);
    expect(report.unmatched).toBe(1);
  });

  it('correctly identifies deprecated traits', () => {
    const report = generateValidationReport(['collision', 'grabbable'], hsTraits, deprecatedTraits);
    expect(report.deprecated).toBe(1);
    expect(report.matched).toBe(1);
  });

  it('generates full report for TM traits', () => {
    const report = generateValidationReport(
      TM_REGISTERED_TRAITS as unknown as string[],
      hsTraits
    );
    expect(report.total).toBe(48);
    expect(report.matched + report.unmatched + report.deprecated).toBe(48);
  });
});
