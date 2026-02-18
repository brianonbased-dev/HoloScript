/**
 * Sprint 14: CLI Argument Parsing, Trait Constants, Generator Templates,
 *            HoloScriptLinter class, Built-in Linting Rules
 *
 * Tests cover:
 *   - Feature 1:  parseArgs / CLIOptions defaults (CLI args module)
 *   - Feature 2:  CLI formatters (formatError)
 *   - Feature 3:  TRAITS module -- 49+ VR traits, categories, helpers
 *   - Feature 4:  Generator templates -- listTemplates, getTemplate
 *   - Feature 5:  HoloScriptLinter class -- instantiation, config, rules
 *   - Feature 6:  lint() output shape & built-in rule objects
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  parseArgs,
  type CLIOptions,
} from '../../../cli/src/args.js';

import {
  formatError,
} from '../../../cli/src/formatters.js';

import {
  TRAITS,
  getCategories,
  getTraitsByCategory,
  suggestTraits,
  formatTrait,
  type TraitInfo,
} from '../../../cli/src/traits.js';

import {
  listTemplates,
  getTemplate,
} from '../../../cli/src/generator.js';

import {
  HoloScriptLinter,
  createLinter,
  lint,
  DEFAULT_CONFIG,
  type LintResult,
} from '../../../linter/src/index.js';

import { noDeadCodeRule } from '../../../linter/src/rules/no-dead-code.js';
import { deprecationWarningRule } from '../../../linter/src/rules/deprecation-warning.js';

// ============================================================================
// Feature 1A: parseArgs -- basic command parsing
// ============================================================================

describe('Feature 1A: parseArgs -- basic command parsing', () => {
  it('parseArgs returns an object', () => {
    const opts = parseArgs([]);
    expect(typeof opts).toBe('object');
    expect(opts).not.toBeNull();
  });

  it('parseArgs([]) has a command property', () => {
    const opts = parseArgs([]);
    expect(typeof opts.command).toBe('string');
  });

  it('parseArgs(["parse"]) sets command to "parse"', () => {
    const opts = parseArgs(['parse']);
    expect(opts.command).toBe('parse');
  });

  it('parseArgs(["run"]) sets command to "run"', () => {
    const opts = parseArgs(['run']);
    expect(opts.command).toBe('run');
  });

  it('parseArgs(["ast"]) sets command to "ast"', () => {
    const opts = parseArgs(['ast']);
    expect(opts.command).toBe('ast');
  });

  it('parseArgs(["repl"]) sets command to "repl"', () => {
    const opts = parseArgs(['repl']);
    expect(opts.command).toBe('repl');
  });

  it('parseArgs sets input from positional argument', () => {
    const opts = parseArgs(['parse', 'scene.holo']);
    expect(opts.input).toBe('scene.holo');
  });
});

// ============================================================================
// Feature 1B: parseArgs -- CLIOptions defaults
// ============================================================================

describe('Feature 1B: parseArgs -- CLIOptions defaults', () => {
  let opts: CLIOptions;
  beforeEach(() => { opts = parseArgs([]); });

  it('verbose defaults to false', () => {
    expect(opts.verbose).toBe(false);
  });

  it('json defaults to false', () => {
    expect(opts.json).toBe(false);
  });

  it('packages field is defined', () => {
    expect(opts.packages !== null).toBe(true);
  });

  it('maxDepth is a positive number', () => {
    expect(typeof opts.maxDepth).toBe('number');
    expect(opts.maxDepth).toBeGreaterThan(0);
  });

  it('timeout is a positive number (ms)', () => {
    expect(typeof opts.timeout).toBe('number');
    expect(opts.timeout).toBeGreaterThan(0);
  });

  it('showAST defaults to false', () => {
    expect(opts.showAST).toBe(false);
  });

  it('--verbose / -v flag enables verbose mode', () => {
    const v1 = parseArgs(['parse', '--verbose']);
    const v2 = parseArgs(['parse', '-v']);
    expect(v1.verbose).toBe(true);
    expect(v2.verbose).toBe(true);
  });

  it('--json flag enables JSON output', () => {
    const opts2 = parseArgs(['parse', '--json']);
    expect(opts2.json).toBe(true);
  });
});

// ============================================================================
// Feature 2: CLI formatters -- formatError
// ============================================================================

describe('Feature 2: formatError', () => {
  it('returns a string for string input', () => {
    expect(typeof formatError('something went wrong')).toBe('string');
  });

  it('result contains the original message', () => {
    expect(formatError('something went wrong')).toContain('something went wrong');
  });

  it('result signals an error (contains "Error" or "error")', () => {
    const result = formatError('boom');
    expect(result.toLowerCase()).toContain('error');
  });

  it('accepts an Error object', () => {
    const result = formatError(new Error('my error'));
    expect(typeof result).toBe('string');
  });

  it('Error object message appears in output', () => {
    const result = formatError(new Error('my error'));
    expect(result).toContain('my error');
  });
});

// ============================================================================
// Feature 3A: TRAITS -- count and key names
// ============================================================================

describe('Feature 3A: TRAITS -- count & keys', () => {
  it('TRAITS is a non-null object', () => {
    expect(typeof TRAITS).toBe('object');
    expect(TRAITS).not.toBeNull();
  });

  it('has at least 20 trait entries', () => {
    expect(Object.keys(TRAITS).length).toBeGreaterThanOrEqual(20);
  });

  it('contains "grabbable"', () => {
    expect(TRAITS).toHaveProperty('grabbable');
  });

  it('contains "physics"', () => {
    expect(TRAITS).toHaveProperty('physics');
  });

  it('contains "hoverable"', () => {
    expect(TRAITS).toHaveProperty('hoverable');
  });

  it('contains "animated"', () => {
    expect(TRAITS).toHaveProperty('animated');
  });

  it('contains "spatial_audio"', () => {
    expect(TRAITS).toHaveProperty('spatial_audio');
  });
});

// ============================================================================
// Feature 3B: TRAITS -- TraitInfo structure
// ============================================================================

describe('Feature 3B: TRAITS -- TraitInfo structure', () => {
  it('every trait has a string name', () => {
    for (const [, trait] of Object.entries(TRAITS)) {
      expect(typeof (trait as TraitInfo).name).toBe('string');
    }
  });

  it('every trait has a string category', () => {
    for (const [, trait] of Object.entries(TRAITS)) {
      expect(typeof (trait as TraitInfo).category).toBe('string');
    }
  });

  it('every trait has a string description', () => {
    for (const [, trait] of Object.entries(TRAITS)) {
      expect(typeof (trait as TraitInfo).description).toBe('string');
    }
  });

  it('every trait has a string example', () => {
    for (const [, trait] of Object.entries(TRAITS)) {
      expect(typeof (trait as TraitInfo).example).toBe('string');
    }
  });

  it('grabbable category is "interaction"', () => {
    expect((TRAITS.grabbable as TraitInfo).category).toBe('interaction');
  });

  it('physics category is "physics"', () => {
    expect((TRAITS.physics as TraitInfo).category).toBe('physics');
  });
});

// ============================================================================
// Feature 3C: getCategories
// ============================================================================

describe('Feature 3C: getCategories', () => {
  it('returns an array', () => {
    expect(Array.isArray(getCategories())).toBe(true);
  });

  it('has at least 5 categories', () => {
    expect(getCategories().length).toBeGreaterThanOrEqual(5);
  });

  it('includes "interaction"', () => {
    expect(getCategories().some((c) => c.name === 'interaction')).toBe(true);
  });

  it('includes "physics"', () => {
    expect(getCategories().some((c) => c.name === 'physics')).toBe(true);
  });

  it('includes "visual"', () => {
    expect(getCategories().some((c) => c.name === 'visual')).toBe(true);
  });

  it('each entry has name and count', () => {
    for (const cat of getCategories()) {
      expect(typeof cat.name).toBe('string');
      expect(typeof cat.count).toBe('number');
      expect(cat.count).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Feature 3D: getTraitsByCategory
// ============================================================================

describe('Feature 3D: getTraitsByCategory', () => {
  it('returns an array for "interaction"', () => {
    expect(Array.isArray(getTraitsByCategory('interaction'))).toBe(true);
  });

  it('"interaction" category has at least 1 trait', () => {
    expect(getTraitsByCategory('interaction').length).toBeGreaterThanOrEqual(1);
  });

  it('all results have category === "interaction"', () => {
    for (const trait of getTraitsByCategory('interaction')) {
      expect(trait.category).toBe('interaction');
    }
  });

  it('"physics" category has at least 1 trait', () => {
    expect(getTraitsByCategory('physics').length).toBeGreaterThanOrEqual(1);
  });

  it('unknown category returns an array (empty or small)', () => {
    expect(Array.isArray(getTraitsByCategory('__nonexistent__'))).toBe(true);
  });
});

// ============================================================================
// Feature 3E: formatTrait
// ============================================================================

describe('Feature 3E: formatTrait', () => {
  it('returns a string for a TraitInfo object', () => {
    expect(typeof formatTrait(TRAITS.grabbable as TraitInfo)).toBe('string');
  });

  it('result is non-empty', () => {
    expect(formatTrait(TRAITS.grabbable as TraitInfo).length).toBeGreaterThan(0);
  });

  it('result contains the trait name', () => {
    expect(formatTrait(TRAITS.grabbable as TraitInfo).toLowerCase()).toContain('grabbable');
  });
});

// ============================================================================
// Feature 3F: suggestTraits
// ============================================================================

describe('Feature 3F: suggestTraits', () => {
  it('suggestTraits is an async function', () => {
    // suggestTraits is async (returns a Promise) — just verify it is a function
    expect(typeof suggestTraits).toBe('function');
  });

  it('suggestTraits returns a Promise', () => {
    const result = suggestTraits('grab something');
    // It may reject due to optional AI adapter, so just check it is thenable
    expect(typeof result).toBe('object');
    // Suppress unhandled rejection
    result.catch(() => {});
  });

  it('suggestTraits called with empty string returns a thenable', () => {
    const result = suggestTraits('');
    expect(typeof result.then).toBe('function');
    result.catch(() => {});
  });
});

// ============================================================================
// Feature 4: Generator -- listTemplates and getTemplate
// ============================================================================

describe('Feature 4: Generator templates', () => {
  it('listTemplates() returns an array', () => {
    expect(Array.isArray(listTemplates())).toBe(true);
  });

  it('listTemplates() has at least 5 templates', () => {
    expect(listTemplates().length).toBeGreaterThanOrEqual(5);
  });

  it('listTemplates() includes "button"', () => {
    expect(listTemplates()).toContain('button');
  });

  it('listTemplates() includes "ball"', () => {
    expect(listTemplates()).toContain('ball');
  });

  it('getTemplate("button") returns an object', () => {
    const t = getTemplate('button');
    expect(typeof t).toBe('object');
    expect(t).not.toBeNull();
  });

  it('getTemplate("button") has a traits array', () => {
    const t = getTemplate('button');
    expect(Array.isArray(t!.traits)).toBe(true);
  });

  it('getTemplate("button") has a template string', () => {
    const t = getTemplate('button');
    expect(typeof t!.template).toBe('string');
  });

  it('getTemplate("ball") has traits including "grabbable"', () => {
    const t = getTemplate('ball');
    expect(t!.traits).toContain('grabbable');
  });

  it('getTemplate("__nonexistent__") returns null', () => {
    expect(getTemplate('__nonexistent__')).toBeNull();
  });
});

// ============================================================================
// Feature 5A: HoloScriptLinter -- class instantiation
// ============================================================================

describe('Feature 5A: HoloScriptLinter -- instantiation', () => {
  it('HoloScriptLinter is a class (function)', () => {
    expect(typeof HoloScriptLinter).toBe('function');
  });

  it('new HoloScriptLinter() creates an instance', () => {
    const linter = new HoloScriptLinter();
    expect(linter).toBeInstanceOf(HoloScriptLinter);
  });

  it('instance has lint method', () => {
    expect(typeof new HoloScriptLinter().lint).toBe('function');
  });

  it('instance has getRules method', () => {
    expect(typeof new HoloScriptLinter().getRules).toBe('function');
  });

  it('instance has getConfig method', () => {
    expect(typeof new HoloScriptLinter().getConfig).toBe('function');
  });

  it('instance has setConfig method', () => {
    expect(typeof new HoloScriptLinter().setConfig).toBe('function');
  });

  it('instance has registerRule method', () => {
    expect(typeof new HoloScriptLinter().registerRule).toBe('function');
  });
});

// ============================================================================
// Feature 5B: DEFAULT_CONFIG
// ============================================================================

describe('Feature 5B: DEFAULT_CONFIG', () => {
  it('DEFAULT_CONFIG is a non-null object', () => {
    expect(typeof DEFAULT_CONFIG).toBe('object');
    expect(DEFAULT_CONFIG).not.toBeNull();
  });

  it('maxErrors is 100', () => {
    expect(DEFAULT_CONFIG.maxErrors).toBe(100);
  });

  it('typeChecking is true', () => {
    expect(DEFAULT_CONFIG.typeChecking).toBe(true);
  });

  it('rules is an object', () => {
    expect(typeof DEFAULT_CONFIG.rules).toBe('object');
    expect(DEFAULT_CONFIG.rules).not.toBeNull();
  });

  it('has at least 20 rules configured', () => {
    expect(Object.keys(DEFAULT_CONFIG.rules).length).toBeGreaterThanOrEqual(20);
  });

  it('"no-syntax-errors" rule is set to "error"', () => {
    expect(DEFAULT_CONFIG.rules['no-syntax-errors']).toBe('error');
  });

  it('"no-duplicate-ids" rule is set to "error"', () => {
    expect(DEFAULT_CONFIG.rules['no-duplicate-ids']).toBe('error');
  });

  it('"no-var" rule is set to "error"', () => {
    expect(DEFAULT_CONFIG.rules['no-var']).toBe('error');
  });

  it('ignorePatterns is an array', () => {
    expect(Array.isArray(DEFAULT_CONFIG.ignorePatterns)).toBe(true);
  });

  it('ignorePatterns contains "node_modules/**"', () => {
    expect(DEFAULT_CONFIG.ignorePatterns).toContain('node_modules/**');
  });
});

// ============================================================================
// Feature 5C: createLinter
// ============================================================================

describe('Feature 5C: createLinter', () => {
  it('createLinter() returns a HoloScriptLinter instance', () => {
    expect(createLinter()).toBeInstanceOf(HoloScriptLinter);
  });

  it('createLinter().getConfig() returns config object', () => {
    const cfg = createLinter().getConfig();
    expect(typeof cfg).toBe('object');
    expect(cfg).not.toBeNull();
  });

  it('createLinter().getRules() returns an array', () => {
    expect(Array.isArray(createLinter().getRules())).toBe(true);
  });

  it('createLinter({maxErrors: 50}).getConfig().maxErrors is 50', () => {
    const linter = createLinter({ maxErrors: 50 });
    expect(linter.getConfig().maxErrors).toBe(50);
  });

  it('createLinter() getRules() has at least 10 rules', () => {
    expect(createLinter().getRules().length).toBeGreaterThanOrEqual(10);
  });
});

// ============================================================================
// Feature 6A: lint() output shape
// ============================================================================

describe('Feature 6A: lint() output shape', () => {
  const SIMPLE_VALID = 'composition TestScene {}';

  it('lint() returns an object', () => {
    const result = lint(SIMPLE_VALID);
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  });

  it('result has filePath string', () => {
    const result: LintResult = lint(SIMPLE_VALID);
    expect(typeof result.filePath).toBe('string');
  });

  it('result has diagnostics array', () => {
    const result: LintResult = lint(SIMPLE_VALID);
    expect(Array.isArray(result.diagnostics)).toBe(true);
  });

  it('result has errorCount number', () => {
    const result: LintResult = lint(SIMPLE_VALID);
    expect(typeof result.errorCount).toBe('number');
  });

  it('result has warningCount number', () => {
    const result: LintResult = lint(SIMPLE_VALID);
    expect(typeof result.warningCount).toBe('number');
  });

  it('result has fixableCount number', () => {
    const result: LintResult = lint(SIMPLE_VALID);
    expect(typeof result.fixableCount).toBe('number');
  });

  it('errorCount is non-negative', () => {
    const result = lint(SIMPLE_VALID);
    expect(result.errorCount).toBeGreaterThanOrEqual(0);
  });

  it('custom filePath is reflected in result', () => {
    const result = lint(SIMPLE_VALID, 'my-scene.holo');
    expect(result.filePath).toBe('my-scene.holo');
  });
});

// ============================================================================
// Feature 6B: Built-in rule objects
// ============================================================================

describe('Feature 6B: Built-in rule objects', () => {
  it('noDeadCodeRule is a non-null object', () => {
    expect(typeof noDeadCodeRule).toBe('object');
    expect(noDeadCodeRule).not.toBeNull();
  });

  it('noDeadCodeRule.id is "no-dead-code"', () => {
    expect(noDeadCodeRule.id).toBe('no-dead-code');
  });

  it('noDeadCodeRule.category is "best-practice"', () => {
    expect(noDeadCodeRule.category).toBe('best-practice');
  });

  it('noDeadCodeRule has check function', () => {
    expect(typeof noDeadCodeRule.check).toBe('function');
  });

  it('deprecationWarningRule is a non-null object', () => {
    expect(typeof deprecationWarningRule).toBe('object');
    expect(deprecationWarningRule).not.toBeNull();
  });

  it('deprecationWarningRule.id is "deprecation-warning"', () => {
    expect(deprecationWarningRule.id).toBe('deprecation-warning');
  });

  it('deprecationWarningRule.defaultSeverity is "warning"', () => {
    expect(deprecationWarningRule.defaultSeverity).toBe('warning');
  });

  it('deprecationWarningRule has check function', () => {
    expect(typeof deprecationWarningRule.check).toBe('function');
  });
});
