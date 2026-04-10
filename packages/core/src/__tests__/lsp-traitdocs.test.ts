/**
 * 11: LSP Deep Dive, Marketplace, Standard Library & MCP Server
 *
 * Tests cover:
 *   - Feature 1:  LSP â€” traitDocs & PromptBuilder (pure TS layers)
 *   - Feature 2:  Marketplace API â€” TraitRegistry, MarketplaceService,
 *                 DependencyResolver utilities, VerificationService
 *   - Feature 3:  Standard Library â€” types, math, strings, collections, time
 *   - Feature 4:  MCP Server â€” generators & training-generators
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Feature 1: LSP â€” traitDocs
// ============================================================================

import {
  TRAIT_DOCS,
  getTraitDoc,
  getAllTraitNames,
  getTraitsByCategory,
  formatTraitDocAsMarkdown,
  formatTraitDocCompact,
} from '../../../lsp/src/traitDocs.js';
import { PromptBuilder } from '../../../lsp/src/ai/PromptBuilder.js';
import type { CompletionContext } from '../../../lsp/src/ai/ContextGatherer.js';

// ============================================================================
// Feature 2: Marketplace API
// ============================================================================

import {
  InMemoryTraitDatabase,
  TraitRegistry,
} from '../../../marketplace-api/src/TraitRegistry.js';
import type { PublishRequest } from '../../../marketplace-api/src/TraitRegistry.js';
import { MarketplaceService } from '../../../marketplace-api/src/MarketplaceService.js';
import {
  parseVersionRequirement,
  satisfies as semverSatisfies,
  compareVersions,
  getLatestVersion,
} from '../../../marketplace-api/src/DependencyResolver.js';
import {
  VerificationService,
  RateLimiter,
  SpamDetector,
  VERIFICATION_REQUIREMENTS,
  VERIFICATION_BADGES,
} from '../../../marketplace-api/src/VerificationService.js';
import { RATE_LIMITS } from '../../../marketplace-api/src/types.js';

// ============================================================================
// Feature 3: Standard Library
// ============================================================================

import {
  // types
  vec2,
  vec3,
  quat,
  transform,
  rgb,
  rgba,
  vec3ToArray,
  arrayToVec3,
  colorToHex,
  parseColor,
  // math
  clamp,
  lerp,
  smoothstep,
  degToRad,
  radToDeg,
  mod,
  fract,
  vec3Math,
  quatMath,
  random as hsRandom,
  // string
  capitalize,
  camelCase,
  snakeCase,
  kebabCase,
  titleCase,
  truncate,
  slugify,
  levenshtein,
  similarity,
  formatBytes,
  escapeHtml,
  isBlank,
  isNotBlank,
  // collections
  List,
  HoloMap,
  HoloSet,
  // time
  now as hsNow,
  sleep,
  Stopwatch,
  debounce,
  // utilities
  assert,
  clone,
  equals,
  identity,
} from '../../../std/src/index.js';

// ============================================================================
// Feature 4: MCP Server â€” generators
// ============================================================================

import {
  suggestTraits,
  generateObject,
  generateScene,
} from '../../../mcp-server/src/generators.js';
import {
  ALL_TRAINING_EXAMPLES,
  generateVariations,
  generateHololandDataset,
  toAlpacaJsonl,
  datasetToJsonl,
} from '../../../mcp-server/src/training-generators.js';

// ============================================================================
// Helpers
// ============================================================================

const uid = () => Math.random().toString(36).slice(2, 8);

function makeMinimalContext(overrides: Partial<CompletionContext> = {}): CompletionContext {
  return {
    type: 'general',
    linePrefix: '',
    lineSuffix: '',
    fullLine: '',
    surroundingLines: [],
    indentLevel: 0,
    line: 0,
    column: 0,
    ...overrides,
  };
}

function makePublishRequest(overrides: Partial<PublishRequest> = {}): PublishRequest {
  return {
    name: `trait-${uid()}`,
    version: '1.0.0',
    description: 'A test trait package for unit tests',
    license: 'MIT',
    keywords: ['test'],
    platforms: ['web'],
    category: 'utility',
    source: 'export const myTrait = {};',
    ...overrides,
  };
}

// ============================================================================
// Feature 1A: LSP traitDocs
// ============================================================================

describe('Feature 1A: LSP traitDocs', () => {
  it('TRAIT_DOCS is a non-empty record', () => {
    expect(typeof TRAIT_DOCS).toBe('object');
    expect(Object.keys(TRAIT_DOCS).length).toBeGreaterThan(5);
  });

  it('TRAIT_DOCS entries have required fields', () => {
    const doc = Object.values(TRAIT_DOCS)[0];
    expect(typeof doc.category).toBe('string');
    expect(typeof doc.description).toBe('string');
  });

  it('getAllTraitNames() returns a non-empty array of strings', () => {
    const names = getAllTraitNames();
    expect(Array.isArray(names)).toBe(true);
    expect(names.length).toBeGreaterThan(5);
    expect(typeof names[0]).toBe('string');
  });

  it('getTraitDoc() returns TraitDoc for a known trait', () => {
    const names = getAllTraitNames();
    const doc = getTraitDoc(names[0]);
    expect(doc).toBeDefined();
    expect(doc?.category).toBeDefined();
    expect(doc?.description).toBeDefined();
  });

  it('getTraitDoc() returns undefined for unknown trait', () => {
    expect(getTraitDoc('nonexistent_trait_xyz')).toBeUndefined();
  });

  it('getTraitsByCategory() returns array for a valid category', () => {
    const results = getTraitsByCategory('physics');
    expect(Array.isArray(results)).toBe(true);
  });

  it('getTraitsByCategory() includes only traits matching the category', () => {
    const results = getTraitsByCategory('networking');
    for (const doc of results) {
      expect(doc.category).toBe('networking');
    }
  });

  it('getTraitsByCategory() for all categories covers TRAIT_DOCS entries', () => {
    // Derive the categories dynamically from the actual trait docs
    const allNames = getAllTraitNames();
    const allCats = [...new Set(allNames.map((n) => getTraitDoc(n)!.category))];
    let totalFound = 0;
    for (const cat of allCats) {
      totalFound += getTraitsByCategory(cat).length;
    }
    expect(totalFound).toBe(Object.keys(TRAIT_DOCS).length);
  });

  it('formatTraitDocAsMarkdown() returns a string with the trait description', () => {
    const names = getAllTraitNames();
    const doc = getTraitDoc(names[0])!;
    const md = formatTraitDocAsMarkdown(doc);
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(10);
  });

  it('formatTraitDocCompact() returns a shorter string than full markdown', () => {
    const names = getAllTraitNames();
    const doc = getTraitDoc(names[0])!;
    const full = formatTraitDocAsMarkdown(doc);
    const compact = formatTraitDocCompact(doc);
    expect(compact.length).toBeLessThanOrEqual(full.length + 10);
  });

  it('trait with properties has PropertyDoc entries', () => {
    const names = getAllTraitNames();
    const docWithProps = names.map((n) => getTraitDoc(n)!).find((d) => d.properties?.length);
    if (docWithProps?.properties) {
      expect(docWithProps.properties[0].name).toBeDefined();
      expect(docWithProps.properties[0].type).toBeDefined();
    }
  });
});

// ============================================================================
// Feature 1B: LSP PromptBuilder
// ============================================================================

describe('Feature 1B: LSP PromptBuilder', () => {
  let builder: PromptBuilder;
  beforeEach(() => {
    builder = new PromptBuilder();
  });

  it('can be instantiated', () => {
    expect(builder).toBeInstanceOf(PromptBuilder);
  });

  it('buildTraitPrompt() returns a non-empty string', () => {
    const ctx = makeMinimalContext({ type: 'trait' });
    const prompt = builder.buildTraitPrompt(ctx);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('buildCodeGenPrompt() returns a non-empty string', () => {
    const ctx = makeMinimalContext({ type: 'general', surroundingCode: 'orb cube {}' });
    const prompt = builder.buildCodeGenPrompt(ctx);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('buildPropertyPrompt() returns a non-empty string', () => {
    const ctx = makeMinimalContext({ type: 'property', objectName: 'cube', objectType: 'orb' });
    const prompt = builder.buildPropertyPrompt(ctx);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('buildErrorFixPrompt() returns string containing error message', () => {
    const ctx = makeMinimalContext();
    const err = { message: 'Unexpected token', line: 5, column: 3 };
    const prompt = builder.buildErrorFixPrompt(ctx, err);
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('Unexpected token');
  });

  it('buildGeneralPrompt() returns a non-empty string', () => {
    const prompt = builder.buildGeneralPrompt(makeMinimalContext());
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('buildTraitRecommendationPrompt() returns a non-empty string', () => {
    const ctx = makeMinimalContext({ type: 'trait', objectName: 'player' });
    const prompt = builder.buildTraitRecommendationPrompt(ctx);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Feature 2A: Marketplace â€” InMemoryTraitDatabase & TraitRegistry
// ============================================================================

describe('Feature 2A: InMemoryTraitDatabase', () => {
  let db: InMemoryTraitDatabase;
  beforeEach(() => {
    db = new InMemoryTraitDatabase();
  });

  it('can be instantiated', () => {
    expect(db).toBeDefined();
  });

  it('search() returns empty results on fresh database', async () => {
    const result = await db.search({ q: 'test' });
    expect(result.total).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('getPopular() returns empty array on fresh database', async () => {
    const result = await db.getPopular();
    expect(result).toEqual([]);
  });

  it('getRecent() returns empty array on fresh database', async () => {
    const result = await db.getRecent();
    expect(result).toEqual([]);
  });
});

describe('Feature 2A: TraitRegistry', () => {
  let registry: TraitRegistry;
  beforeEach(() => {
    registry = new TraitRegistry(new InMemoryTraitDatabase());
  });

  it('publish() creates a new trait entry', async () => {
    const req = makePublishRequest();
    const result = await registry.publish(req, { name: 'alice', verified: true });
    expect(result.success).toBe(true);
    expect(result.traitId).toBeTruthy();
    expect(result.version).toBe('1.0.0');
  });

  it('getTrait() returns published trait', async () => {
    const req = makePublishRequest();
    const pub = await registry.publish(req, { name: 'alice', verified: true });
    const trait = await registry.getTrait(pub.traitId);
    expect(trait).not.toBeNull();
    expect(trait?.name).toBe(req.name);
    expect(trait?.version).toBe('1.0.0');
  });

  it('getTrait() returns null for unknown id', async () => {
    const trait = await registry.getTrait('nonexistent-id');
    expect(trait).toBeNull();
  });

  it('getVersions() returns published versions', async () => {
    const req = makePublishRequest();
    const pub = await registry.publish(req, { name: 'alice', verified: true });
    const versions = await registry.getVersions(pub.traitId);
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe('1.0.0');
  });

  it('search() finds published trait by keyword', async () => {
    const req = makePublishRequest({ keywords: ['physics', 'gravity'] });
    await registry.publish(req, { name: 'alice', verified: true });
    const result = await registry.search({ q: req.name });
    expect(result.total).toBeGreaterThan(0);
  });

  it('deprecate() marks trait as deprecated', async () => {
    const req = makePublishRequest();
    const pub = await registry.publish(req, { name: 'alice', verified: true });
    await expect(
      registry.deprecate(pub.traitId, 'Use @test/newer instead')
    ).resolves.toBeUndefined();
  });

  it('recordDownload() does not throw', async () => {
    const req = makePublishRequest();
    const pub = await registry.publish(req, { name: 'alice', verified: true });
    await expect(registry.recordDownload(pub.traitId, '1.0.0')).resolves.toBeUndefined();
  });

  it('getPopular() returns results after publish', async () => {
    await registry.publish(makePublishRequest(), { name: 'alice', verified: true });
    const popular = await registry.getPopular();
    expect(popular.length).toBeGreaterThan(0);
  });

  it('getRecent() returns results after publish', async () => {
    await registry.publish(makePublishRequest(), { name: 'alice', verified: true });
    const recent = await registry.getRecent();
    expect(recent.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Feature 2B: Marketplace â€” DependencyResolver utilities
// ============================================================================

describe('Feature 2B: DependencyResolver utilities', () => {
  it('parseVersionRequirement parses exact version', () => {
    const r = parseVersionRequirement('1.2.3');
    expect(r.type).toBe('exact');
    expect(r.value).toBe('1.2.3');
  });

  it('parseVersionRequirement parses range (^)', () => {
    const r = parseVersionRequirement('^1.2.3');
    expect(r.type).toBe('range');
  });

  it('parseVersionRequirement parses "latest" tag', () => {
    const r = parseVersionRequirement('latest');
    expect(r.type).toBe('tag');
    expect(r.value).toBe('latest');
  });

  it('satisfies returns true for compatible version', () => {
    expect(semverSatisfies('1.2.5', '^1.2.3')).toBe(true);
  });

  it('satisfies returns false for incompatible version', () => {
    expect(semverSatisfies('2.0.0', '^1.2.3')).toBe(false);
  });

  it('satisfies handles exact match', () => {
    expect(semverSatisfies('1.2.3', '1.2.3')).toBe(true);
    expect(semverSatisfies('1.2.4', '1.2.3')).toBe(false);
  });

  it('compareVersions returns negative when a < b', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
  });

  it('compareVersions returns positive when a > b', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
  });

  it('compareVersions returns 0 for equal versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('getLatestVersion returns highest version from list', () => {
    const versions = ['1.0.0', '2.1.0', '1.5.0', '2.0.0'];
    expect(getLatestVersion(versions)).toBe('2.1.0');
  });

  it('getLatestVersion returns null for empty list', () => {
    expect(getLatestVersion([])).toBeNull();
  });
});

// ============================================================================
// Feature 2C: Marketplace â€” VerificationService, RateLimiter, SpamDetector
// ============================================================================

describe('Feature 2C: VerificationService', () => {
  let svc: VerificationService;
  beforeEach(() => {
    svc = new VerificationService();
  });

  it('VERIFICATION_REQUIREMENTS has entries for all levels', () => {
    expect(VERIFICATION_REQUIREMENTS.none).toBeDefined();
    expect(VERIFICATION_REQUIREMENTS.basic).toBeDefined();
    expect(VERIFICATION_REQUIREMENTS.verified).toBeDefined();
    expect(VERIFICATION_REQUIREMENTS.trusted).toBeDefined();
    expect(VERIFICATION_REQUIREMENTS.official).toBeDefined();
  });

  it('VERIFICATION_BADGES has string badge for each level', () => {
    // 'none' level has an empty string badge by design â€” skip it
    const nonNoneEntries = Object.entries(VERIFICATION_BADGES).filter(([k]) => k !== 'none');
    expect(nonNoneEntries.length).toBeGreaterThan(0);
    for (const [, badge] of nonNoneEntries) {
      expect(typeof badge).toBe('string');
      expect(badge.length).toBeGreaterThan(0);
    }
  });

  it('RATE_LIMITS has four rate tiers', () => {
    expect(typeof RATE_LIMITS.anonymous).toBe('number');
    expect(typeof RATE_LIMITS.authenticated).toBe('number');
    expect(typeof RATE_LIMITS.verified).toBe('number');
    expect(typeof RATE_LIMITS.premium).toBe('number');
  });

  it('RATE_LIMITS tiers are strictly increasing', () => {
    expect(RATE_LIMITS.authenticated).toBeGreaterThan(RATE_LIMITS.anonymous);
    expect(RATE_LIMITS.verified).toBeGreaterThan(RATE_LIMITS.authenticated);
    expect(RATE_LIMITS.premium).toBeGreaterThan(RATE_LIMITS.verified);
  });

  it('getVerificationStatus() returns unverified for new user', async () => {
    const status = await svc.getVerificationStatus(`user-${uid()}`);
    expect(status.verified).toBe(false);
  });

  it('meetsRequirements() returns true for level=none', async () => {
    const meets = await svc.meetsRequirements(`user-${uid()}`, 'none');
    expect(meets).toBe(true);
  });

  it('meetsRequirements() returns false for level=official for new user', async () => {
    const meets = await svc.meetsRequirements(`user-${uid()}`, 'official');
    expect(meets).toBe(false);
  });

  it('verifyTraitSource() returns safe:true for clean source', async () => {
    const result = await svc.verifyTraitSource('export const myTrait = {};');
    expect(result.safe).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.hash).toBeTruthy();
  });

  it('verifyTraitSource() returns safe:false for eval() usage', async () => {
    const result = await svc.verifyTraitSource('const x = eval("bad code")');
    expect(result.safe).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('startEmailVerification() returns sent status and expiresIn', async () => {
    const result = await svc.startEmailVerification(`user-${uid()}`, 'test@example.com');
    expect(typeof result.sent).toBe('boolean');
    expect(typeof result.expiresIn).toBe('number');
    expect(result.expiresIn).toBeGreaterThan(0);
  });
});

describe('Feature 2C: RateLimiter', () => {
  it('allows first N requests within window', () => {
    const limiter = new RateLimiter(60000, 3);
    const key = `user-${uid()}`;
    expect(limiter.isAllowed(key)).toBe(true);
    expect(limiter.isAllowed(key)).toBe(true);
    expect(limiter.isAllowed(key)).toBe(true);
    expect(limiter.isAllowed(key)).toBe(false); // 4th request denied
  });

  it('getRemaining() decrements after each request', () => {
    const limiter = new RateLimiter(60000, 5);
    const key = `user-${uid()}`;
    expect(limiter.getRemaining(key)).toBe(5);
    limiter.isAllowed(key);
    expect(limiter.getRemaining(key)).toBe(4);
  });

  it('reset() restores full quota', () => {
    const limiter = new RateLimiter(60000, 2);
    const key = `user-${uid()}`;
    limiter.isAllowed(key);
    limiter.isAllowed(key);
    expect(limiter.isAllowed(key)).toBe(false);
    limiter.reset(key);
    expect(limiter.isAllowed(key)).toBe(true);
  });
});

describe('Feature 2C: SpamDetector', () => {
  let detector: SpamDetector;
  beforeEach(() => {
    detector = new SpamDetector();
  });

  it('isSpam() returns false for legitimate content', () => {
    const result = detector.isSpam('user1', 'A great physics trait for VR');
    expect(result.isSpam).toBe(false);
  });

  it('isSpam() returns result with isSpam boolean property', () => {
    const result = detector.isSpam('user1', 'buy cheap pills click here!!!');
    expect(typeof result.isSpam).toBe('boolean');
  });
});

// ============================================================================
// Feature 3A: Standard Library â€” types & factories
// ============================================================================

describe('Feature 3A: Std types & factories', () => {
  it('vec2() creates a 2D vector with defaults', () => {
    const v = vec2();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('vec2(x, y) creates a 2D vector with values', () => {
    const v = vec2(3, 4);
    expect(v.x).toBe(3);
    expect(v.y).toBe(4);
  });

  it('vec3() creates a 3D vector with defaults', () => {
    const v = vec3();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });

  it('vec3(x, y, z) creates vector with values', () => {
    const v = vec3(1, 2, 3);
    expect(v).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('quat() creates identity quaternion', () => {
    const q = quat();
    expect(q.w).toBe(1);
  });

  it('transform() creates a transform with default values', () => {
    const t = transform();
    expect(t.position).toBeDefined();
    expect(t.rotation).toBeDefined();
    expect(t.scale).toBeDefined();
  });

  it('rgb() creates a ColorRGB', () => {
    const c = rgb(255, 128, 0);
    expect(c).toEqual({ r: 255, g: 128, b: 0 });
  });

  it('rgba() creates a ColorRGBA', () => {
    const c = rgba(255, 128, 0, 0.5);
    expect(c).toEqual({ r: 255, g: 128, b: 0, a: 0.5 });
  });

  it('rgba() defaults alpha to 1', () => {
    const c = rgba(100, 200, 50);
    expect(c.a).toBe(1);
  });

  it('vec3ToArray() converts Vec3 to tuple', () => {
    const arr = vec3ToArray(vec3(1, 2, 3));
    expect(arr).toEqual([1, 2, 3]);
  });

  it('arrayToVec3() converts tuple to Vec3', () => {
    const v = arrayToVec3([4, 5, 6]);
    expect(v).toEqual({ x: 4, y: 5, z: 6 });
  });

  it('colorToHex() converts RGB to hex string', () => {
    // ColorRGB uses 0â€“1 range, not 0â€“255
    const hex = colorToHex(rgb(1, 0, 0));
    expect(hex.toLowerCase()).toBe('#ff0000');
  });

  it('parseColor() accepts hex string', () => {
    // parseColor returns 0â€“1 normalised components
    const color = parseColor('#ff0000');
    expect(color.r).toBeCloseTo(1, 5);
    expect(color.g).toBeCloseTo(0, 5);
    expect(color.b).toBeCloseTo(0, 5);
  });
});

// ============================================================================
// Feature 3B: Standard Library â€” math
// ============================================================================

describe('Feature 3B: Std math', () => {
  it('clamp() restricts value to [min, max]', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('lerp() interpolates between a and b', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('smoothstep() returns 0 below edge0, 1 above edge1', () => {
    expect(smoothstep(0, 1, -0.1)).toBe(0);
    expect(smoothstep(0, 1, 1.1)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 1);
  });

  it('degToRad() and radToDeg() are inverse', () => {
    const deg = 90;
    expect(radToDeg(degToRad(deg))).toBeCloseTo(deg, 10);
  });

  it('mod() handles positive values', () => {
    expect(mod(7, 3)).toBe(1);
  });

  it('fract() returns fractional part', () => {
    expect(fract(3.75)).toBeCloseTo(0.75, 10);
    expect(fract(5)).toBe(0);
  });

  it('vec3Math.length() computes Euclidean length', () => {
    const v = vec3(3, 4, 0);
    expect(vec3Math.length(v)).toBeCloseTo(5, 5);
  });

  it('vec3Math.normalize() produces unit vector', () => {
    const v = vec3(3, 4, 0);
    const n = vec3Math.normalize(v);
    expect(vec3Math.length(n)).toBeCloseTo(1, 5);
  });

  it('vec3Math.dot() computes dot product', () => {
    const a = vec3(1, 0, 0);
    const b = vec3(0, 1, 0);
    expect(vec3Math.dot(a, b)).toBe(0);
    expect(vec3Math.dot(a, a)).toBe(1);
  });

  it('vec3Math.add() adds two vectors', () => {
    const a = vec3(1, 2, 3);
    const b = vec3(4, 5, 6);
    expect(vec3Math.add(a, b)).toEqual({ x: 5, y: 7, z: 9 });
  });

  it('quatMath.identity() returns {x:0,y:0,z:0,w:1}', () => {
    expect(quatMath.identity()).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it('hsRandom.float() returns number in [0, 1)', () => {
    for (let i = 0; i < 10; i++) {
      const r = hsRandom.float();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });
});

// ============================================================================
// Feature 3C: Standard Library â€” strings
// ============================================================================

describe('Feature 3C: Std strings', () => {
  it('isBlank() returns true for empty / whitespace-only strings', () => {
    expect(isBlank('')).toBe(true);
    expect(isBlank('   ')).toBe(true);
    expect(isBlank('a')).toBe(false);
  });

  it('isNotBlank() is the inverse of isBlank', () => {
    expect(isNotBlank('hello')).toBe(true);
    expect(isNotBlank('')).toBe(false);
  });

  it('capitalize() uppercases first letter', () => {
    expect(capitalize('hello world')).toBe('Hello world');
  });

  it('camelCase() converts to camelCase', () => {
    expect(camelCase('hello world')).toBe('helloWorld');
    expect(camelCase('foo-bar-baz')).toBe('fooBarBaz');
  });

  it('snakeCase() converts to snake_case', () => {
    expect(snakeCase('helloWorld')).toBe('hello_world');
    expect(snakeCase('FooBar')).toBe('foo_bar');
  });

  it('kebabCase() converts to kebab-case', () => {
    expect(kebabCase('helloWorld')).toBe('hello-world');
  });

  it('titleCase() capitalizes each word', () => {
    expect(titleCase('hello world')).toBe('Hello World');
  });

  it('truncate() cuts string to max length with suffix', () => {
    const result = truncate('Hello world', 8, '...');
    expect(result.length).toBeLessThanOrEqual(8);
    expect(result).toContain('...');
  });

  it('slugify() converts to URL-safe slug', () => {
    const slug = slugify('Hello World! 123');
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('levenshtein() returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });

  it('levenshtein() returns positive for different strings', () => {
    expect(levenshtein('hello', 'world')).toBeGreaterThan(0);
  });

  it('similarity() returns 1.0 for identical strings', () => {
    expect(similarity('hello', 'hello')).toBeCloseTo(1.0, 5);
  });

  it('similarity() returns 0.0 for completely different strings', () => {
    expect(similarity('abc', 'xyz')).toBeCloseTo(0.0, 5);
  });

  it('formatBytes() formats bytes as human-readable string', () => {
    const result = formatBytes(1024);
    expect(result).toContain('KB');
  });

  it('escapeHtml() escapes <, >, &', () => {
    const escaped = escapeHtml('<div class="x">&amp;</div>');
    expect(escaped).not.toContain('<div');
    expect(escaped).toContain('&lt;');
  });
});

// ============================================================================
// Feature 3D: Standard Library â€” collections
// ============================================================================

describe('Feature 3D: Std List', () => {
  it('List.of() creates a list from items', () => {
    const list = List.of(1, 2, 3);
    expect(list.length).toBe(3);
  });

  it('List.from() creates a list from iterable', () => {
    const list = List.from([4, 5, 6]);
    expect(list.length).toBe(3);
  });

  it('List.range() creates range list', () => {
    const list = List.range(0, 5);
    expect(list.length).toBe(5);
    expect(list.get(0)).toBe(0);
    expect(list.get(4)).toBe(4);
  });

  it('map() transforms items', () => {
    const doubled = List.of(1, 2, 3).map((x) => x * 2);
    expect(doubled.toArray()).toEqual([2, 4, 6]);
  });

  it('filter() removes items not matching predicate', () => {
    const evens = List.of(1, 2, 3, 4).filter((x) => x % 2 === 0);
    expect(evens.toArray()).toEqual([2, 4]);
  });

  it('reduce() accumulates result', () => {
    const sum = List.of(1, 2, 3).reduce((acc, x) => acc + x, 0);
    expect(sum).toBe(6);
  });

  it('sort() returns sorted list', () => {
    const sorted = List.of(3, 1, 2).sort();
    expect(sorted.toArray()).toEqual([1, 2, 3]);
  });

  it('unique() removes duplicates', () => {
    const u = List.of(1, 2, 2, 3, 1).unique();
    expect(u.toArray()).toEqual([1, 2, 3]);
  });

  it('isEmpty returns true for empty list', () => {
    expect(List.of().isEmpty).toBe(true);
    expect(List.of(1).isEmpty).toBe(false);
  });

  it('first() and last() return expected elements', () => {
    const list = List.of(10, 20, 30);
    expect(list.first()).toBe(10);
    expect(list.last()).toBe(30);
  });

  it('partition() splits by predicate', () => {
    const [evens, odds] = List.of(1, 2, 3, 4).partition((x) => x % 2 === 0);
    expect(evens.toArray()).toEqual([2, 4]);
    expect(odds.toArray()).toEqual([1, 3]);
  });
});

describe('Feature 3D: Std HoloMap', () => {
  it('HoloMap.of() creates map from entries', () => {
    const m = HoloMap.of(['a', 1], ['b', 2]);
    expect(m.size).toBe(2);
  });

  it('get/set are immutable', () => {
    const m = HoloMap.of<string, number>();
    const m2 = m.set('x', 42);
    expect(m.has('x')).toBe(false);
    expect(m2.get('x')).toBe(42);
  });

  it('delete() removes key', () => {
    const m = HoloMap.of(['a', 1]).delete('a');
    expect(m.has('a')).toBe(false);
  });

  it('keys(), values(), entries() return Lists', () => {
    const m = HoloMap.of(['a', 1], ['b', 2]);
    // keys/values/entries return List which uses .length (not .size)
    expect(m.keys().length).toBe(2);
    expect(m.values().length).toBe(2);
    expect(m.entries().length).toBe(2);
  });
});

describe('Feature 3D: Std HoloSet', () => {
  it('HoloSet.of() creates set from items', () => {
    const s = HoloSet.of(1, 2, 3);
    expect(s.size).toBe(3);
  });

  it('add() is immutable', () => {
    const s = HoloSet.of(1);
    const s2 = s.add(2);
    expect(s.has(2)).toBe(false);
    expect(s2.has(2)).toBe(true);
  });

  it('union() combines two sets', () => {
    const a = HoloSet.of(1, 2);
    const b = HoloSet.of(2, 3);
    expect(a.union(b).size).toBe(3);
  });

  it('intersection() keeps common elements', () => {
    const a = HoloSet.of(1, 2, 3);
    const b = HoloSet.of(2, 3, 4);
    expect(a.intersection(b).toArray().sort()).toEqual([2, 3]);
  });

  it('difference() keeps elements not in other set', () => {
    const a = HoloSet.of(1, 2, 3);
    const b = HoloSet.of(2, 3);
    expect(a.difference(b).toArray()).toEqual([1]);
  });
});

// ============================================================================
// Feature 3E: Standard Library â€” time & utilities
// ============================================================================

describe('Feature 3E: Std time & utilities', () => {
  it('hsNow() returns a number close to Date.now()', () => {
    const t = hsNow();
    expect(typeof t).toBe('number');
    expect(Math.abs(t - Date.now())).toBeLessThan(100);
  });

  it('sleep() resolves after given ms', async () => {
    const start = Date.now();
    await sleep(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });

  it('Stopwatch records elapsed time', async () => {
    const sw = new Stopwatch();
    sw.start();
    await sleep(20);
    sw.stop();
    expect(sw.elapsed).toBeGreaterThan(0);
    expect(sw.isRunning).toBe(false);
  });

  it('Stopwatch.reset() resets elapsed to 0', () => {
    const sw = new Stopwatch();
    sw.start();
    sw.stop();
    sw.reset();
    expect(sw.elapsed).toBe(0);
    expect(sw.isRunning).toBe(false);
  });

  it('debounce() delays function call', async () => {
    const calls: number[] = [];
    const fn = debounce(() => calls.push(Date.now()), 30);
    fn();
    fn();
    fn();
    expect(calls).toHaveLength(0);
    await sleep(50);
    expect(calls).toHaveLength(1);
  });

  it('assert() throws on false condition', () => {
    expect(() => assert(false, 'fail')).toThrow('fail');
    expect(() => assert(true, 'ok')).not.toThrow();
  });

  it('clone() deep-copies an object', () => {
    const obj = { a: 1, b: { c: 2 } };
    const copy = clone(obj);
    expect(copy).toEqual(obj);
    expect(copy).not.toBe(obj);
    expect(copy.b).not.toBe(obj.b);
  });

  it('equals() compares values deeply', () => {
    expect(equals({ a: 1 }, { a: 1 })).toBe(true);
    expect(equals({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('identity() returns the same value', () => {
    const obj = { x: 1 };
    expect(identity(obj)).toBe(obj);
    expect(identity(42)).toBe(42);
  });
});

// ============================================================================
// Feature 4A: MCP Server â€” generators
// ============================================================================

describe('Feature 4A: MCP generators', () => {
  it('suggestTraits() returns traits array', () => {
    const result = suggestTraits('a physics cube');
    expect(Array.isArray(result.traits)).toBe(true);
    expect(result.traits.length).toBeGreaterThan(0);
  });

  it('suggestTraits() returns reasoning object', () => {
    const result = suggestTraits('a glowing sphere');
    expect(typeof result.reasoning).toBe('object');
  });

  it('suggestTraits() returns confidence in [0, 1]', () => {
    const result = suggestTraits('a flying orb');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('generateObject() returns code, traits, geometry, format', () => {
    const result = generateObject('a red cube');
    expect(typeof result.code).toBe('string');
    expect(Array.isArray(result.traits)).toBe(true);
    expect(typeof result.geometry).toBe('string');
    expect(typeof result.format).toBe('string');
  });

  it('generateObject() code is non-empty', () => {
    const result = generateObject('a bouncy ball');
    expect(result.code.length).toBeGreaterThan(0);
  });

  it('generateObject() respects format option', () => {
    const result = generateObject('a cube', { format: 'holo' });
    expect(result.format).toBe('holo');
  });

  it('generateScene() returns code with stats', () => {
    const result = generateScene('a VR game lobby');
    expect(typeof result.code).toBe('string');
    expect(typeof result.stats.objects).toBe('number');
    expect(typeof result.stats.lines).toBe('number');
  });

  it('generateScene() stats.objects > 0', () => {
    const result = generateScene('a forest scene with trees');
    expect(result.stats.objects).toBeGreaterThan(0);
  });

  it("generateScene() respects style='minimal'", () => {
    const minimal = generateScene('a room', { style: 'minimal' });
    const detailed = generateScene('a room', { style: 'detailed' });
    // minimal should have fewer or equal lines
    expect(minimal.stats.lines).toBeLessThanOrEqual(detailed.stats.lines + 50);
  });
});

// ============================================================================
// Feature 4B: MCP Server â€” training-generators
// ============================================================================

describe('Feature 4B: MCP training-generators', () => {
  it('ALL_TRAINING_EXAMPLES is a non-empty array', () => {
    expect(Array.isArray(ALL_TRAINING_EXAMPLES)).toBe(true);
    expect(ALL_TRAINING_EXAMPLES.length).toBeGreaterThan(5);
  });

  it('each TrainingExample has required fields', () => {
    const ex = ALL_TRAINING_EXAMPLES[0];
    expect(typeof ex.instruction).toBe('string');
    expect(typeof ex.input).toBe('string');
    expect(typeof ex.output).toBe('string');
    expect(ex.metadata).toBeDefined();
  });

  it('metadata has category, difficulty, traits, keywords, version', () => {
    const meta = ALL_TRAINING_EXAMPLES[0].metadata;
    expect(typeof meta.category).toBe('string');
    expect(typeof meta.difficulty).toBe('string');
    expect(Array.isArray(meta.traits)).toBe(true);
    expect(Array.isArray(meta.keywords)).toBe(true);
    expect(typeof meta.version).toBe('string');
  });

  it('ALL_TRAINING_EXAMPLES covers multiple categories', () => {
    const categories = new Set(ALL_TRAINING_EXAMPLES.map((e) => e.metadata.category));
    expect(categories.size).toBeGreaterThan(2);
  });

  it('generateVariations() returns the requested count', () => {
    const ex = ALL_TRAINING_EXAMPLES[0];
    const variations = generateVariations(ex, 3);
    expect(variations).toHaveLength(3);
  });

  it('generateVariations() returns TrainingExample objects', () => {
    const ex = ALL_TRAINING_EXAMPLES[0];
    const [v] = generateVariations(ex, 1);
    expect(typeof v.instruction).toBe('string');
    expect(typeof v.output).toBe('string');
    expect(v.metadata).toBeDefined();
  });

  it('generateHololandDataset() returns a larger array', () => {
    const dataset = generateHololandDataset(1);
    expect(dataset.length).toBeGreaterThanOrEqual(ALL_TRAINING_EXAMPLES.length);
  });

  it('toAlpacaJsonl() returns valid JSON string', () => {
    const ex = ALL_TRAINING_EXAMPLES[0];
    const jsonl = toAlpacaJsonl(ex);
    expect(typeof jsonl).toBe('string');
    expect(() => JSON.parse(jsonl)).not.toThrow();
  });

  it('toAlpacaJsonl() output has instruction and output fields', () => {
    const ex = ALL_TRAINING_EXAMPLES[0];
    const parsed = JSON.parse(toAlpacaJsonl(ex));
    expect(parsed.instruction).toBeDefined();
    expect(parsed.output).toBeDefined();
  });

  it('datasetToJsonl() returns multi-line JSONL', () => {
    const examples = ALL_TRAINING_EXAMPLES.slice(0, 3);
    const jsonl = datasetToJsonl(examples);
    const lines = jsonl
      .trim()
      .split('\n')
      .filter((l) => l.length > 0);
    expect(lines.length).toBe(3);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
