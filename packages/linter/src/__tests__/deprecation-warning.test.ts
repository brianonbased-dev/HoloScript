/**
 * Deprecation Warning Rule Tests
 *
 * Sprint 5 Priority 2: Deprecation Warnings
 */

import { describe, it, expect } from 'vitest';
import { deprecationWarningRule, createDeprecationWarningRule } from '../rules/deprecation-warning';
import type { RuleContext } from '../types';

function createContext(source: string, config: Record<string, unknown> = {}): RuleContext {
  return {
    source,
    lines: source.split('\n'),
    fileType: 'holo',
    config,
  };
}

describe('deprecationWarningRule', () => {
  describe('Trait Deprecations', () => {
    it('should detect deprecated @talkable trait', () => {
      const source = `
        orb "Speaker" {
          @talkable
          color: "blue"
        }
      `;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      const talkableWarning = diagnostics.find((d) => d.message.includes('talkable'));
      expect(talkableWarning).toBeDefined();
      expect(talkableWarning?.message).toContain('@voice');
    });

    it('should detect deprecated @collision trait', () => {
      const source = `
        orb "Ball" {
          @collision
          position: [0, 0, 0]
        }
      `;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      const collisionWarning = diagnostics.find((d) => d.message.includes('collision'));
      expect(collisionWarning).toBeDefined();
      expect(collisionWarning?.message).toContain('@physics or @trigger');
    });

    it('should detect deprecated @interactive trait', () => {
      const source = `
        orb "Button" {
          @interactive
        }
      `;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      const interactiveWarning = diagnostics.find((d) => d.message.includes('interactive'));
      expect(interactiveWarning).toBeDefined();
      expect(interactiveWarning?.message).toContain('@grabbable');
    });

    it('should detect deprecated @collidable trait', () => {
      const source = `
        orb "Wall" {
          @collidable
        }
      `;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      const collidableWarning = diagnostics.find((d) => d.message.includes('collidable'));
      expect(collidableWarning).toBeDefined();
      expect(collidableWarning?.message).toContain('@physics');
    });

    it('should not flag valid traits', () => {
      const source = `
        orb "Object" {
          @grabbable
          @physics
        }
      `;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      expect(diagnostics.length).toBe(0);
    });
  });

  describe('Property Deprecations', () => {
    it('should detect deprecated "pos" property', () => {
      const source = `
        orb "Thing" {
          pos: [1, 2, 3]
        }
      `;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      const posWarning = diagnostics.find((d) => d.message.includes('"pos"'));
      expect(posWarning).toBeDefined();
      expect(posWarning?.message).toContain('position');
    });

    it('should detect deprecated "rot" property', () => {
      const source = `
        orb "Thing" {
          rot: [0, 90, 0]
        }
      `;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      const rotWarning = diagnostics.find((d) => d.message.includes('"rot"'));
      expect(rotWarning).toBeDefined();
      expect(rotWarning?.message).toContain('rotation');
    });

    it('should detect deprecated "scl" property', () => {
      const source = `
        orb "Thing" {
          scl: [2, 2, 2]
        }
      `;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      const sclWarning = diagnostics.find((d) => d.message.includes('"scl"'));
      expect(sclWarning).toBeDefined();
      expect(sclWarning?.message).toContain('scale');
    });

    it('should not flag valid properties', () => {
      const source = `
        orb "Thing" {
          position: [1, 2, 3]
          rotation: [0, 0, 0]
          scale: [1, 1, 1]
        }
      `;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      // Should not have any property deprecations
      const propWarnings = diagnostics.filter((d) => d.message.includes('property'));
      expect(propWarnings.length).toBe(0);
    });
  });

  describe('Function Deprecations', () => {
    it('should detect deprecated spawn() function', () => {
      const source = `
        @on_click {
          spawn("Object")
        }
      `;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      const spawnWarning = diagnostics.find((d) => d.message.includes('spawn()'));
      expect(spawnWarning).toBeDefined();
      expect(spawnWarning?.message).toContain('create()');
    });

    it('should detect deprecated destroy() function', () => {
      const source = `
        @on_click {
          destroy(this)
        }
      `;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      const destroyWarning = diagnostics.find((d) => d.message.includes('destroy()'));
      expect(destroyWarning).toBeDefined();
      expect(destroyWarning?.message).toContain('remove()');
    });
  });

  describe('Syntax Deprecations', () => {
    it('should detect deprecated "var" keyword', () => {
      const source = `
        var x = 1;
        let y = 2;
      `;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      const varWarning = diagnostics.find((d) => d.message.includes('"var"'));
      expect(varWarning).toBeDefined();
      expect(varWarning?.message).toContain('const or let');
      expect(varWarning?.severity).toBe('error');
    });

    it('should detect deprecated "object" keyword', () => {
      const source = `
        object "OldStyle" {
          color: "red"
        }
      `;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      const objectWarning = diagnostics.find((d) => d.message.includes('"object"'));
      expect(objectWarning).toBeDefined();
      expect(objectWarning?.message).toContain('orb');
    });

    it('should detect deprecated on_event() syntax', () => {
      const source = `
        on_event("click", () => {
          doSomething();
        });
      `;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      const eventWarning = diagnostics.find((d) => d.message.includes('on_event()'));
      expect(eventWarning).toBeDefined();
      expect(eventWarning?.message).toContain('@on_*');
    });
  });

  describe('Rule Options', () => {
    it('should respect checkTraits: false option', () => {
      const source = `
        orb "Test" {
          @talkable
          @collidable
        }
      `;

      const context = createContext(source, { checkTraits: false });
      const diagnostics = deprecationWarningRule.check(context);

      const traitWarnings = diagnostics.filter((d) => d.message.includes('trait'));
      expect(traitWarnings.length).toBe(0);
    });

    it('should respect checkProperties: false option', () => {
      const source = `
        orb "Test" {
          pos: [0, 0, 0]
          rot: [0, 0, 0]
        }
      `;

      const context = createContext(source, { checkProperties: false });
      const diagnostics = deprecationWarningRule.check(context);

      const propWarnings = diagnostics.filter((d) => d.message.includes('property'));
      expect(propWarnings.length).toBe(0);
    });

    it('should respect checkFunctions: false option', () => {
      const source = `
        @on_click {
          spawn("Obj")
          destroy(this)
        }
      `;

      const context = createContext(source, { checkFunctions: false });
      const diagnostics = deprecationWarningRule.check(context);

      const funcWarnings = diagnostics.filter((d) => d.message.includes('function'));
      expect(funcWarnings.length).toBe(0);
    });

    it('should respect checkSyntax: false option', () => {
      const source = `
        var x = 1;
        object "Test" {}
      `;

      const context = createContext(source, { checkSyntax: false });
      const diagnostics = deprecationWarningRule.check(context);

      const syntaxWarnings = diagnostics.filter(
        (d) => d.message.includes('keyword') || d.message.includes('syntax')
      );
      expect(syntaxWarnings.length).toBe(0);
    });

    it('should respect ignoreIds option', () => {
      const source = `
        orb "Test" {
          @talkable
        }
      `;

      const context = createContext(source, { ignoreIds: ['trait-talkable'] });
      const diagnostics = deprecationWarningRule.check(context);

      const talkableWarning = diagnostics.find((d) => d.message.includes('talkable'));
      expect(talkableWarning).toBeUndefined();
    });
  });

  describe('Custom Deprecations', () => {
    it('should detect custom deprecations', () => {
      const source = `
        orb "Test" {
          @legacy_trait
        }
      `;

      const context = createContext(source, {
        customDeprecations: [
          {
            id: 'custom-legacy',
            type: 'trait',
            name: 'legacy_trait',
            message: 'The @legacy_trait is deprecated',
            replacement: '@new_trait',
            severity: 'warning',
          },
        ],
      });
      const diagnostics = deprecationWarningRule.check(context);

      const customWarning = diagnostics.find((d) => d.message.includes('legacy_trait'));
      expect(customWarning).toBeDefined();
      expect(customWarning?.message).toContain('@new_trait');
    });
  });

  describe('Location Information', () => {
    it('should include correct line number', () => {
      const source = `line1
line2
@talkable
line4`;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      const talkableWarning = diagnostics.find((d) => d.message.includes('talkable'));
      expect(talkableWarning?.line).toBe(3);
    });

    it('should include correct column number', () => {
      const source = `orb "Test" { @talkable }`;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      const talkableWarning = diagnostics.find((d) => d.message.includes('talkable'));
      expect(talkableWarning).toBeDefined();
      expect(talkableWarning?.column).toBeGreaterThan(0);
    });
  });

  describe('Version Information', () => {
    it('should include deprecation version info in message', () => {
      const source = `
        orb "Test" {
          @talkable
        }
      `;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      const talkableWarning = diagnostics.find((d) => d.message.includes('talkable'));
      expect(talkableWarning?.message).toContain('deprecated since');
      expect(talkableWarning?.message).toContain('will be removed');
    });
  });

  describe('Multiple Deprecations', () => {
    it('should detect multiple deprecations in one file', () => {
      const source = `
        var x = 1;
        object "OldObject" {
          @talkable
          pos: [0, 0, 0]
        }
        spawn("Something")
      `;

      const context = createContext(source);
      const diagnostics = deprecationWarningRule.check(context);

      // Should find: var, object, @talkable, pos, spawn
      expect(diagnostics.length).toBeGreaterThanOrEqual(5);
    });
  });
});

describe('createDeprecationWarningRule', () => {
  it('should create a rule with custom default options', () => {
    const customRule = createDeprecationWarningRule({
      checkTraits: true,
      checkProperties: false,
      checkFunctions: false,
      checkSyntax: false,
    });

    const source = `
      @talkable
      pos: [0, 0, 0]
      spawn("Test")
      var x = 1;
    `;

    const context: RuleContext = {
      source,
      lines: source.split('\n'),
      fileType: 'holo',
      config: {},
    };

    const diagnostics = customRule.check(context);

    // Should only find trait deprecations
    const traitWarnings = diagnostics.filter((d) => d.message.includes('talkable'));
    const propWarnings = diagnostics.filter((d) => d.message.includes('property'));

    expect(traitWarnings.length).toBeGreaterThan(0);
    expect(propWarnings.length).toBe(0);
  });

  it('should merge context config with default options', () => {
    const customRule = createDeprecationWarningRule({
      checkTraits: true,
      checkProperties: true,
    });

    const source = `
      @talkable
      pos: [0, 0, 0]
    `;

    // Context config should override factory options
    const context: RuleContext = {
      source,
      lines: source.split('\n'),
      fileType: 'holo',
      config: { checkProperties: false },
    };

    const diagnostics = customRule.check(context);

    const propWarnings = diagnostics.filter((d) => d.message.includes('property'));
    expect(propWarnings.length).toBe(0);
  });
});

describe('Rule Metadata', () => {
  it('should have correct rule ID', () => {
    expect(deprecationWarningRule.id).toBe('deprecation-warning');
  });

  it('should have correct category', () => {
    expect(deprecationWarningRule.category).toBe('best-practice');
  });

  it('should have correct default severity', () => {
    expect(deprecationWarningRule.defaultSeverity).toBe('warning');
  });
});
