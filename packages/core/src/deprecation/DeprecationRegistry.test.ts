/**
 * Deprecation Registry Tests
 *
 * Sprint 5 Priority 2: Deprecation Warnings
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DeprecationRegistry,
  createDeprecationRegistry,
  type DeprecationEntry,
} from './DeprecationRegistry';

describe('DeprecationRegistry', () => {
  let registry: DeprecationRegistry;

  beforeEach(() => {
    registry = createDeprecationRegistry();
  });

  describe('Built-in Deprecations', () => {
    it('should have built-in trait deprecations', () => {
      const deprecatedTraits = registry.getDeprecatedTraits();
      expect(deprecatedTraits.length).toBeGreaterThan(0);

      const talkable = registry.isTraitDeprecated('talkable');
      expect(talkable).toBeDefined();
      expect(talkable?.replacement).toBe('@voice');
    });

    it('should have built-in property deprecations', () => {
      const deprecatedProps = registry.getDeprecatedProperties();
      expect(deprecatedProps.length).toBeGreaterThan(0);

      const pos = registry.isPropertyDeprecated('pos');
      expect(pos).toBeDefined();
      expect(pos?.replacement).toBe('position');
    });

    it('should have built-in function deprecations', () => {
      const deprecatedFuncs = registry.getDeprecatedFunctions();
      expect(deprecatedFuncs.length).toBeGreaterThan(0);

      const spawn = registry.isFunctionDeprecated('spawn');
      expect(spawn).toBeDefined();
      expect(spawn?.replacement).toContain('create');
    });
  });

  describe('Custom Deprecation Registration', () => {
    it('should register custom trait deprecation', () => {
      registry.register({
        id: 'custom-trait',
        type: 'trait',
        name: 'my_deprecated_trait',
        message: 'This trait is deprecated',
        replacement: '@new_trait',
        severity: 'warning',
      });

      const result = registry.isTraitDeprecated('my_deprecated_trait');
      expect(result).toBeDefined();
      expect(result?.replacement).toBe('@new_trait');
    });

    it('should register custom property deprecation', () => {
      registry.register({
        id: 'custom-prop',
        type: 'property',
        name: 'oldProp',
        message: 'Use newProp instead',
        replacement: 'newProp',
        severity: 'warning',
      });

      const result = registry.isPropertyDeprecated('oldProp');
      expect(result).toBeDefined();
      expect(result?.message).toBe('Use newProp instead');
    });

    it('should register custom function deprecation', () => {
      registry.register({
        id: 'custom-func',
        type: 'function',
        name: 'legacyFunc',
        message: 'Use modernFunc instead',
        replacement: 'modernFunc',
        since: '2.0.0',
        removeIn: '3.0.0',
        severity: 'warning',
      });

      const result = registry.isFunctionDeprecated('legacyFunc');
      expect(result).toBeDefined();
      expect(result?.since).toBe('2.0.0');
      expect(result?.removeIn).toBe('3.0.0');
    });
  });

  describe('Syntax Deprecation Detection', () => {
    it('should detect deprecated var keyword', () => {
      const source = `
        var x = 1;
        let y = 2;
        const z = 3;
      `;

      const matches = registry.checkSyntax(source);
      const varMatch = matches.find((m) => m.entry.name === 'var keyword');

      expect(varMatch).toBeDefined();
      expect(varMatch?.entry.severity).toBe('error');
    });

    it('should detect deprecated object keyword', () => {
      const source = `
        object "MyObject" {
          color: "red"
        }
      `;

      const matches = registry.checkSyntax(source);
      const objectMatch = matches.find((m) => m.entry.name === 'object keyword');

      expect(objectMatch).toBeDefined();
      expect(objectMatch?.entry.replacement).toBe('orb');
    });

    it('should detect deprecated on_event syntax', () => {
      const source = `
        on_event("click", () => {
          doSomething();
        });
      `;

      const matches = registry.checkSyntax(source);
      const eventMatch = matches.find((m) => m.entry.name === 'on_event syntax');

      expect(eventMatch).toBeDefined();
      expect(eventMatch?.entry.replacement).toBe('@on_* handlers');
    });

    it('should include location information', () => {
      const source = `line1
line2
var deprecated = true;`;

      const matches = registry.checkSyntax(source);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].location?.line).toBe(3);
      expect(matches[0].location?.column).toBeGreaterThan(0);
    });

    it('should detect multiple deprecations in same source', () => {
      const source = `
        var x = 1;
        var y = 2;
        object "Test" {}
      `;

      const matches = registry.checkSyntax(source);

      expect(matches.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Registry Operations', () => {
    it('should get all deprecations', () => {
      const all = registry.getAll();
      expect(all.length).toBeGreaterThan(0);
    });

    it('should get deprecation by ID', () => {
      const entry = registry.get('trait-talkable');
      expect(entry).toBeDefined();
      expect(entry?.name).toBe('talkable');
    });

    it('should return undefined for unknown deprecation', () => {
      const entry = registry.get('nonexistent-id');
      expect(entry).toBeUndefined();
    });

    it('should clear all entries', () => {
      registry.clear();

      expect(registry.getAll().length).toBe(0);
      expect(registry.getDeprecatedTraits().length).toBe(0);
      expect(registry.getDeprecatedProperties().length).toBe(0);
    });
  });

  describe('Deprecation Entry Properties', () => {
    it('should include all required properties', () => {
      const entry = registry.get('trait-talkable');

      expect(entry?.id).toBeDefined();
      expect(entry?.type).toBe('trait');
      expect(entry?.name).toBe('talkable');
      expect(entry?.message).toBeDefined();
      expect(entry?.severity).toBeDefined();
    });

    it('should include optional properties when set', () => {
      const entry = registry.get('trait-talkable');

      expect(entry?.replacement).toBeDefined();
      expect(entry?.since).toBeDefined();
      expect(entry?.removeIn).toBeDefined();
      expect(entry?.migrationGuide).toBeDefined();
    });
  });

  describe('Custom Syntax Pattern', () => {
    it('should support custom regex patterns', () => {
      registry.register({
        id: 'custom-syntax',
        type: 'syntax',
        name: 'legacy_func call',
        message: 'legacy_func is deprecated',
        replacement: 'modern_func',
        severity: 'warning',
        metadata: {
          pattern: /\blegacy_func\s*\(/g,
        },
      });

      const source = `
        legacy_func();
        modern_func();
      `;

      const matches = registry.checkSyntax(source);
      const legacyMatch = matches.find((m) => m.entry.name === 'legacy_func call');

      expect(legacyMatch).toBeDefined();
    });
  });

  describe('Severity Levels', () => {
    it('should categorize deprecations by severity', () => {
      const all = registry.getAll();

      const warnings = all.filter((e) => e.severity === 'warning');
      const errors = all.filter((e) => e.severity === 'error');

      expect(warnings.length).toBeGreaterThan(0);
      expect(errors.length).toBeGreaterThan(0); // var keyword is error
    });
  });
});

describe('Factory Functions', () => {
  it('should create new registry with createDeprecationRegistry', () => {
    const registry = createDeprecationRegistry();
    expect(registry).toBeInstanceOf(DeprecationRegistry);
    expect(registry.getAll().length).toBeGreaterThan(0);
  });
});
