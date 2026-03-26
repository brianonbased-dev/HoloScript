/**
 * RuleForge Tests
 *
 * Gap 3: Validates trait composition rule engine.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RuleForge } from '../RuleForge';
import type { RuleSet } from '../types';

describe('RuleForge', () => {
  let forge: RuleForge;

  beforeEach(() => {
    forge = new RuleForge();
  });

  describe('rule loading', () => {
    it('starts with zero rules', () => {
      expect(forge.getRuleCount()).toBe(0);
    });

    it('loads a rule set', () => {
      const ruleSet: RuleSet = {
        version: '1.0.0',
        description: 'Test rules',
        rules: [
          {
            id: 'test-conflict',
            type: 'conflict',
            traits: ['static', 'physics'],
            description: 'Static + physics conflict',
            commutative: true,
            ruleVersion: '1.0.0',
            severity: 'error',
          },
        ],
      };

      forge.loadRuleSet(ruleSet);
      expect(forge.getRuleCount()).toBe(1);
      expect(forge.getRuleVersion()).toBe('1.0.0');
    });
  });

  describe('conflict detection', () => {
    beforeEach(() => {
      forge.setWarningOnlyMode(false);
      forge.addRule({
        id: 'conflict-static-physics',
        type: 'conflict',
        traits: ['static', 'physics'],
        description: 'Static objects cannot have physics',
        commutative: true,
        ruleVersion: '1.0.0',
        severity: 'error',
      });
    });

    it('detects conflicts between incompatible traits', () => {
      const result = forge.validate(['static', 'physics']);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('conflict');
      expect(result.errors[0].traits).toContain('static');
      expect(result.errors[0].traits).toContain('physics');
    });

    it('passes when no conflicts exist', () => {
      const result = forge.validate(['grabbable', 'throwable']);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects commutative conflicts regardless of order', () => {
      const resultAB = forge.validate(['static', 'physics']);
      const resultBA = forge.validate(['physics', 'static']);
      expect(resultAB.valid).toBe(false);
      expect(resultBA.valid).toBe(false);
    });
  });

  describe('expansion rules', () => {
    beforeEach(() => {
      forge.addRule({
        id: 'expansion-networked',
        type: 'expansion',
        traits: ['networked'],
        description: 'Networked objects need sync',
        commutative: true,
        ruleVersion: '1.0.0',
        severity: 'info',
        implies: ['synced'],
      });
    });

    it('suggests implied traits', () => {
      const result = forge.validate(['networked']);
      expect(result.suggestions.some(s => s.trait === 'synced')).toBe(true);
      expect(result.suggestions.find(s => s.trait === 'synced')?.source).toBe('expansion');
    });

    it('does not suggest already-present traits', () => {
      const result = forge.validate(['networked', 'synced']);
      expect(result.suggestions.filter(s => s.trait === 'synced')).toHaveLength(0);
    });
  });

  describe('deprecation rules', () => {
    beforeEach(() => {
      forge.setWarningOnlyMode(false);
      forge.addRule({
        id: 'deprecation-talkable',
        type: 'deprecation',
        traits: ['talkable'],
        description: 'Use @voice instead',
        commutative: true,
        ruleVersion: '1.0.0',
        severity: 'warning',
        replacement: 'voice',
      });
    });

    it('warns about deprecated traits', () => {
      const result = forge.validate(['talkable']);
      expect(result.warnings.some(w => w.type === 'deprecation')).toBe(true);
    });

    it('suggests replacements for deprecated traits', () => {
      const result = forge.validate(['talkable']);
      expect(result.suggestions.some(s => s.trait === 'voice')).toBe(true);
    });
  });

  describe('warning-only mode', () => {
    it('downgrades errors to warnings in warning-only mode', () => {
      forge.setWarningOnlyMode(true);
      forge.addRule({
        id: 'conflict-test',
        type: 'conflict',
        traits: ['static', 'physics'],
        description: 'test',
        commutative: true,
        ruleVersion: '1.0.0',
        severity: 'error',
      });

      const result = forge.validate(['static', 'physics']);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('grandfathering (G.GAP.06)', () => {
    beforeEach(() => {
      forge.setWarningOnlyMode(false);
      forge.addRule({
        id: 'new-rule',
        type: 'conflict',
        traits: ['trait_a', 'trait_b'],
        description: 'New stricter rule',
        commutative: true,
        ruleVersion: '2.0.0',
        severity: 'error',
      });
    });

    it('skips rules newer than composition version', () => {
      const result = forge.validate(['trait_a', 'trait_b'], '1.0.0');
      expect(result.valid).toBe(true);
    });

    it('applies rules matching composition version', () => {
      const result = forge.validate(['trait_a', 'trait_b'], '2.0.0');
      expect(result.valid).toBe(false);
    });
  });

  describe('suggest()', () => {
    beforeEach(() => {
      forge.addRule({
        id: 'expansion-grabbable',
        type: 'expansion',
        traits: ['grabbable'],
        description: 'Grabbable needs physics',
        commutative: true,
        ruleVersion: '1.0.0',
        severity: 'info',
        implies: ['physics'],
      });
      forge.addRule({
        id: 'comp-grab-throw',
        type: 'composition',
        traits: ['grabbable', 'throwable'],
        description: 'Pick-up-and-throw',
        commutative: true,
        ruleVersion: '1.0.0',
        severity: 'info',
      });
    });

    it('suggests expansion traits', () => {
      const suggestions = forge.suggest(['grabbable']);
      expect(suggestions.some(s => s.trait === 'physics')).toBe(true);
    });

    it('suggests composition partners', () => {
      const suggestions = forge.suggest(['grabbable']);
      expect(suggestions.some(s => s.trait === 'throwable')).toBe(true);
    });
  });
});

describe('RuleForge with default rules', () => {
  it('loads default rules from JSON', async () => {
    const { defaultRuleForge } = await import('../index');
    expect(defaultRuleForge.getRuleCount()).toBeGreaterThan(0);
    expect(defaultRuleForge.getRuleVersion()).toBe('1.0.0');
  });

  it('validates static + physics conflict with defaults', async () => {
    const { createRuleForge } = await import('../index');
    const forge = createRuleForge();
    const defaultRules = (await import('../default-rules.json')).default;
    forge.loadRuleSet(defaultRules as any);
    forge.setWarningOnlyMode(false);

    const result = forge.validate(['static', 'physics']);
    expect(result.valid).toBe(false);
  });
});
