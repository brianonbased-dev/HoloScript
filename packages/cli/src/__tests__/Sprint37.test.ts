/**
 * Sprint 37 — @holoscript/cli acceptance tests
 * Covers: parseArgs (commands + flags), formatters, traits utilities, generator templates
 *
 * NOTE: Imports from '../args' resolve to the compiled args.js (supports limited command set).
 * Tests reflect the currently compiled/available API.
 */
import { describe, it, expect } from 'vitest';
import { parseArgs } from '../args';
import { formatError } from '../formatters';
import {
  TRAITS,
  getTraitsByCategory,
  getCategories,
  formatTrait,
  formatAllTraits,
} from '../traits';
import { listTemplates, getTemplate } from '../generator';

// ═══════════════════════════════════════════════
// parseArgs — commands (compiled API)
// ═══════════════════════════════════════════════
describe('parseArgs — command parsing', () => {
  it('parses parse command', () => {
    const opts = parseArgs(['parse', 'file.holo']);
    expect(opts.command).toBe('parse');
    expect(opts.input).toBe('file.holo');
  });

  it('parses run command', () => {
    const opts = parseArgs(['run', 'scene.holo']);
    expect(opts.command).toBe('run');
    expect(opts.input).toBe('scene.holo');
  });

  it('parses ast command', () => {
    const opts = parseArgs(['ast', 'file.holo']);
    expect(opts.command).toBe('ast');
  });

  it('parses repl command', () => {
    const opts = parseArgs(['repl']);
    expect(opts.command).toBe('repl');
  });

  it('parses watch command', () => {
    const opts = parseArgs(['watch', 'scene.holo']);
    expect(opts.command).toBe('watch');
  });

  it('parses help command', () => {
    const opts = parseArgs(['help']);
    expect(opts.command).toBe('help');
  });

  it('parses version command', () => {
    const opts = parseArgs(['version']);
    expect(opts.command).toBe('version');
  });

  it('defaults to help for unknown command', () => {
    const opts = parseArgs(['unknown-xyz']);
    // Unknown positional args are treated as input, command stays 'help'
    expect(opts.command).toBe('help');
    expect(opts.input).toBe('unknown-xyz');
  });

  it('input is set for parse command', () => {
    const opts = parseArgs(['parse', 'my-file.holo']);
    expect(opts.input).toBe('my-file.holo');
  });
});

// ═══════════════════════════════════════════════
// parseArgs — flags
// ═══════════════════════════════════════════════
describe('parseArgs — flags', () => {
  it('--verbose flag sets verbose=true', () => {
    const opts = parseArgs(['parse', 'f.holo', '--verbose']);
    expect(opts.verbose).toBe(true);
  });

  it('-v flag sets verbose=true', () => {
    const opts = parseArgs(['parse', 'f.holo', '-v']);
    expect(opts.verbose).toBe(true);
  });

  it('--json flag sets json=true', () => {
    const opts = parseArgs(['ast', 'f.holo', '--json']);
    expect(opts.json).toBe(true);
  });

  it('-j flag sets json=true', () => {
    const opts = parseArgs(['ast', 'f.holo', '-j']);
    expect(opts.json).toBe(true);
  });

  it('--output flag', () => {
    const opts = parseArgs(['parse', 'in.holo', '--output', 'out.js']);
    expect(opts.output).toBe('out.js');
  });

  it('-o flag', () => {
    const opts = parseArgs(['parse', 'in.holo', '-o', 'out.js']);
    expect(opts.output).toBe('out.js');
  });

  it('--max-depth flag', () => {
    const opts = parseArgs(['parse', 'f.holo', '--max-depth', '5']);
    expect(opts.maxDepth).toBe(5);
  });

  it('--timeout flag', () => {
    const opts = parseArgs(['run', 'f.holo', '--timeout', '10000']);
    expect(opts.timeout).toBe(10000);
  });

  it('--show-ast flag', () => {
    const opts = parseArgs(['parse', 'f.holo', '--show-ast']);
    expect(opts.showAST).toBe(true);
  });

  it('--help flag overrides command', () => {
    const opts = parseArgs(['parse', 'f.holo', '--help']);
    expect(opts.command).toBe('help');
  });

  it('-h flag overrides command', () => {
    const opts = parseArgs(['parse', 'f.holo', '-h']);
    expect(opts.command).toBe('help');
  });

  it('--version flag overrides command', () => {
    const opts = parseArgs(['parse', 'f.holo', '--version']);
    expect(opts.command).toBe('version');
  });
});

// ═══════════════════════════════════════════════
// parseArgs — defaults
// ═══════════════════════════════════════════════
describe('parseArgs — defaults', () => {
  it('default command is help for empty args', () => {
    const opts = parseArgs([]);
    expect(opts.command).toBe('help');
  });

  it('default verbose is false', () => {
    expect(parseArgs(['parse', 'f.holo']).verbose).toBe(false);
  });

  it('default json is false', () => {
    expect(parseArgs(['parse', 'f.holo']).json).toBe(false);
  });

  it('default maxDepth is 10', () => {
    expect(parseArgs(['parse', 'f.holo']).maxDepth).toBe(10);
  });

  it('default timeout is 5000', () => {
    expect(parseArgs(['parse', 'f.holo']).timeout).toBe(5000);
  });

  it('default showAST is false', () => {
    expect(parseArgs(['parse', 'f.holo']).showAST).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// formatters
// ═══════════════════════════════════════════════
describe('formatError', () => {
  it('formats an Error object to string', () => {
    const err = new Error('something went wrong');
    const s = formatError(err);
    expect(typeof s).toBe('string');
    expect(s).toContain('something went wrong');
  });

  it('formats a string error message', () => {
    const s = formatError('plain error');
    expect(typeof s).toBe('string');
    expect(s).toContain('plain error');
  });

  it('returns non-empty string', () => {
    expect(formatError(new Error('test')).length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════
// traits utilities
// ═══════════════════════════════════════════════
describe('TRAITS catalog', () => {
  it('TRAITS is a non-empty record', () => {
    expect(typeof TRAITS).toBe('object');
    expect(Object.keys(TRAITS).length).toBeGreaterThan(0);
  });

  it('each trait has required fields', () => {
    for (const [key, trait] of Object.entries(TRAITS)) {
      expect(trait.name, `${key} has name`).toBeDefined();
      expect(trait.category, `${key} has category`).toBeDefined();
      expect(trait.description, `${key} has description`).toBeDefined();
      expect(trait.example, `${key} has example`).toBeDefined();
    }
  });

  it('getTraitsByCategory returns array', () => {
    const list = getTraitsByCategory('interaction');
    expect(Array.isArray(list)).toBe(true);
  });

  it('getTraitsByCategory traits match category', () => {
    const list = getTraitsByCategory('physics');
    for (const t of list) {
      expect(t.category).toBe('physics');
    }
  });

  it('getTraitsByCategory covers all categories', () => {
    const categories = [
      'interaction',
      'physics',
      'visual',
      'networking',
      'behavior',
      'spatial',
      'audio',
      'state',
    ] as const;
    for (const cat of categories) {
      const list = getTraitsByCategory(cat);
      expect(Array.isArray(list)).toBe(true);
    }
  });

  it('getCategories returns array with name and count', () => {
    const cats = getCategories();
    expect(Array.isArray(cats)).toBe(true);
    expect(cats.length).toBeGreaterThan(0);
    for (const c of cats) {
      expect(c).toHaveProperty('name');
      expect(c).toHaveProperty('count');
      expect(typeof c.count).toBe('number');
    }
  });

  it('formatTrait returns string', () => {
    const trait = Object.values(TRAITS)[0];
    expect(typeof formatTrait(trait)).toBe('string');
    expect(formatTrait(trait).length).toBeGreaterThan(0);
  });

  it('formatTrait verbose returns longer string', () => {
    const trait = Object.values(TRAITS)[0];
    const brief = formatTrait(trait, false);
    const verbose = formatTrait(trait, true);
    expect(verbose.length).toBeGreaterThanOrEqual(brief.length);
  });

  it('formatAllTraits returns string', () => {
    const s = formatAllTraits();
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
  });

  it('formatAllTraits json=true returns JSON', () => {
    const s = formatAllTraits(false, true);
    expect(() => JSON.parse(s)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════
// generator — templates
// ═══════════════════════════════════════════════
describe('generator — templates', () => {
  it('listTemplates returns non-empty array', () => {
    const templates = listTemplates();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
  });

  it('getTemplate returns object for valid name', () => {
    const names = listTemplates();
    const t = getTemplate(names[0]);
    expect(t).not.toBeNull();
    expect(t).toHaveProperty('traits');
    expect(t).toHaveProperty('template');
  });

  it('getTemplate returns null for unknown name', () => {
    expect(getTemplate('no-such-template-xyz')).toBeNull();
  });

  it('template traits is an array', () => {
    const names = listTemplates();
    const t = getTemplate(names[0]);
    expect(Array.isArray(t!.traits)).toBe(true);
  });

  it('template code is a string', () => {
    const names = listTemplates();
    const t = getTemplate(names[0]);
    expect(typeof t!.template).toBe('string');
  });

  it('all templates have traits array', () => {
    const names = listTemplates();
    for (const name of names) {
      const t = getTemplate(name);
      expect(t, `template ${name} exists`).not.toBeNull();
      expect(Array.isArray(t!.traits), `${name} has traits`).toBe(true);
    }
  });
});
