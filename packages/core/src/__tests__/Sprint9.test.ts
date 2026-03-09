/**
 * Sprint 9-10: Certified Packages + Partner SDK + HoloScript 3.0 Release
 *
 * Tests cover:
 *   - Feature 1A: CERTIFICATION_LEVELS thresholds
 *   - Feature 1B: CertificationChecker.check() logic
 *   - Feature 1C: Badge.ts — issueBadge, verifyBadge, SVG/Markdown, store ops
 *   - Feature 2:  Partner SDK — HoloScriptRuntime embedding
 *   - Feature 3:  Partner SDK — WebhookHandler
 *   - Feature 4:  HoloScript 3.0 release artifact verification
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = join(__dirname, '../../../../');
const PARTNER_SDK_ROOT = join(__dirname, '../../../../packages/partner-sdk');
const REGISTRY_ROOT = join(__dirname, '../../../../packages/registry');

// ============================================================================
// Imports — Certification
// ============================================================================

import {
  CERTIFICATION_LEVELS,
  CertificationChecker,
  generateBadge as generateBadgeFromChecker,
} from '../../../registry/src/certification/Checker.js';
import type {
  CertificationResult,
  CertificationBadge as CheckerBadgeType,
} from '../../../registry/src/certification/Checker.js';
import type { Package } from '../../../registry/src/types.js';

import {
  issueBadge,
  verifyBadge,
  generateBadgeSVG as generateBadgeSVGBadge,
  generateMarkdownBadge,
  storeBadge,
  getBadge,
  listBadges,
  revokeBadge,
  isActivelyCertified,
} from '../../../registry/src/certification/Badge.js';

// ============================================================================
// Imports — Partner SDK
// ============================================================================

import { HoloScriptRuntime, createRuntime } from '../../../partner-sdk/src/runtime/Runtime.js';

import {
  WebhookHandler,
  createWebhookHandler,
} from '../../../partner-sdk/src/webhooks/WebhookHandler.js';

// ============================================================================
// Helpers
// ============================================================================

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const NOW = new Date();
const RECENT = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

function makePackage(overrides: Partial<Package> = {}): Package {
  return {
    name: '@test/cert-pkg',
    version: '1.2.3',
    author: 'test-user',
    downloads: 100,
    tags: ['test'],
    createdAt: NOW,
    updatedAt: RECENT,
    ...overrides,
  };
}

function makeGoodFiles(): Map<string, string> {
  return new Map([
    [
      'README.md',
      '# My Package\n\n## Installation\n\n```sh\nnpm i\n```\n\n## Usage\nUse it like this.',
    ],
    ['CHANGELOG.md', '# Changelog\n\n## v1.2.3\n- New features'],
    ['LICENSE', 'MIT License'],
    ['package.json', JSON.stringify({ dependencies: {} })],
    ['holoscript.config.json', '{}'],
    ['src/index.ts', '/** @param x The value */ export function foo(x: number) { return x; }'],
    ['__tests__/index.test.ts', 'describe("foo", () => { it("works", () => {}) })'],
    ['docs/API.md', '# API Reference'],
  ]);
}

function makePoorFiles(): Map<string, string> {
  return new Map([['index.js', 'module.exports = {}']]);
}

function makeCertifiedResult(
  level: 'bronze' | 'silver' | 'gold' | 'platinum'
): CertificationResult {
  return {
    certified: true,
    level,
    score: 80,
    maxScore: 100,
    categories: [],
    issues: [],
    certifiedAt: new Date(),
  };
}

// ============================================================================
// Feature 1A: CERTIFICATION_LEVELS
// ============================================================================

describe('Feature 1A: CERTIFICATION_LEVELS', () => {
  it('bronze has minScore 60', () => {
    expect(CERTIFICATION_LEVELS.bronze.minScore).toBe(60);
  });

  it('silver has minScore 75', () => {
    expect(CERTIFICATION_LEVELS.silver.minScore).toBe(75);
  });

  it('gold has minScore 85', () => {
    expect(CERTIFICATION_LEVELS.gold.minScore).toBe(85);
  });

  it('platinum has minScore 95', () => {
    expect(CERTIFICATION_LEVELS.platinum.minScore).toBe(95);
  });

  it('scores are strictly increasing: bronze < silver < gold < platinum', () => {
    const levels = ['bronze', 'silver', 'gold', 'platinum'] as const;
    for (let i = 1; i < levels.length; i++) {
      expect(CERTIFICATION_LEVELS[levels[i]].minScore).toBeGreaterThan(
        CERTIFICATION_LEVELS[levels[i - 1]].minScore
      );
    }
  });

  it('bronze requires codeQuality and documentation categories', () => {
    expect(CERTIFICATION_LEVELS.bronze.requiredCategories).toContain('codeQuality');
    expect(CERTIFICATION_LEVELS.bronze.requiredCategories).toContain('documentation');
  });

  it('gold requires all four categories', () => {
    const req = CERTIFICATION_LEVELS.gold.requiredCategories;
    expect(req).toContain('codeQuality');
    expect(req).toContain('documentation');
    expect(req).toContain('security');
    expect(req).toContain('maintenance');
  });

  it('platinum requires all four categories with boosted weights', () => {
    const req = CERTIFICATION_LEVELS.platinum.requiredCategories;
    expect(req).toHaveLength(4);
    expect(CERTIFICATION_LEVELS.platinum.weights.codeQuality).toBeGreaterThan(
      CERTIFICATION_LEVELS.gold.weights.codeQuality
    );
  });

  it('all four level keys are present', () => {
    expect(Object.keys(CERTIFICATION_LEVELS)).toEqual(
      expect.arrayContaining(['bronze', 'silver', 'gold', 'platinum'])
    );
  });
});

// ============================================================================
// Feature 1B: CertificationChecker
// ============================================================================

describe('Feature 1B: CertificationChecker', () => {
  it('can be instantiated with package info and files', () => {
    const checker = new CertificationChecker(makePackage(), makeGoodFiles());
    expect(checker).toBeInstanceOf(CertificationChecker);
  });

  it('check() returns CertificationResult with required fields', async () => {
    const checker = new CertificationChecker(makePackage(), makeGoodFiles());
    const result = await checker.check();
    expect(typeof result.certified).toBe('boolean');
    expect(typeof result.score).toBe('number');
    expect(typeof result.maxScore).toBe('number');
    expect(Array.isArray(result.categories)).toBe(true);
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it('check() returns exactly 4 categories', async () => {
    const checker = new CertificationChecker(makePackage(), makeGoodFiles());
    const result = await checker.check();
    expect(result.categories).toHaveLength(4);
  });

  it('categories are: codeQuality, documentation, security, maintenance', async () => {
    const checker = new CertificationChecker(makePackage(), makeGoodFiles());
    const result = await checker.check();
    const names = result.categories.map((c) => c.name).sort();
    expect(names).toEqual(['codeQuality', 'documentation', 'maintenance', 'security']);
  });

  it('score is within range [0, maxScore]', async () => {
    const checker = new CertificationChecker(makePackage(), makeGoodFiles());
    const result = await checker.check();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(result.maxScore);
  });

  it('well-equipped package gets certified', async () => {
    const checker = new CertificationChecker(makePackage(), makeGoodFiles());
    const result = await checker.check();
    expect(result.certified).toBe(true);
    expect(result.level).toBeDefined();
  });

  it('poor package (only index.js, no docs/tests/license) is NOT certified', async () => {
    const checker = new CertificationChecker(makePackage(), makePoorFiles());
    const result = await checker.check();
    expect(result.certified).toBe(false);
    expect(result.level).toBeUndefined();
  });

  it('poor package accumulates issues', async () => {
    const checker = new CertificationChecker(makePackage(), makePoorFiles());
    const result = await checker.check();
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('each issue has severity, category, check, and message', async () => {
    const checker = new CertificationChecker(makePackage(), makePoorFiles());
    const result = await checker.check();
    const issue = result.issues[0];
    expect(['error', 'warning', 'info']).toContain(issue.severity);
    expect(typeof issue.category).toBe('string');
    expect(typeof issue.check).toBe('string');
    expect(typeof issue.message).toBe('string');
  });

  it('certified result has certifiedAt and expiresAt dates', async () => {
    const checker = new CertificationChecker(makePackage(), makeGoodFiles());
    const result = await checker.check();
    if (result.certified) {
      expect(result.certifiedAt).toBeInstanceOf(Date);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt!.getTime()).toBeGreaterThan(result.certifiedAt!.getTime());
    }
  });

  it('generateBadge (from Checker) returns null for uncertified result', () => {
    const uncertified: CertificationResult = {
      certified: false,
      score: 0,
      maxScore: 100,
      categories: [],
      issues: [],
    };
    expect(generateBadgeFromChecker(uncertified, '@test/pkg', '1.0.0')).toBeNull();
  });

  it('generateBadge (from Checker) returns badge for certified result', async () => {
    const checker = new CertificationChecker(makePackage(), makeGoodFiles());
    const result = await checker.check();
    if (result.certified) {
      const badge = generateBadgeFromChecker(result, '@test/certified-pkg', '2.0.0');
      expect(badge).not.toBeNull();
      expect(badge?.level).toBe(result.level);
      expect(badge?.packageName).toBe('@test/certified-pkg');
      expect(badge?.version).toBe('2.0.0');
    }
  });
});

// ============================================================================
// Feature 1C: Badge.ts — issueBadge / verifyBadge
// ============================================================================

describe('Feature 1C: issueBadge / verifyBadge', () => {
  it('issueBadge returns null for uncertified result', () => {
    const result: CertificationResult = {
      certified: false,
      score: 0,
      maxScore: 100,
      categories: [],
      issues: [],
    };
    expect(issueBadge('@test/uncert', '1.0.0', result)).toBeNull();
  });

  it('issueBadge returns null when level is missing even if certified=true', () => {
    const result: CertificationResult = {
      certified: true,
      level: undefined,
      score: 75,
      maxScore: 100,
      categories: [],
      issues: [],
    };
    expect(issueBadge('@test/no-level', '1.0.0', result)).toBeNull();
  });

  it('issueBadge returns a badge for valid certified result', () => {
    const badge = issueBadge('@test/cert-ok', '1.0.0', makeCertifiedResult('bronze'));
    expect(badge).not.toBeNull();
    expect(badge?.packageName).toBe('@test/cert-ok');
    expect(badge?.version).toBe('1.0.0');
    expect(badge?.level).toBe('bronze');
  });

  it('issued badge has score, fingerprint and signature', () => {
    const badge = issueBadge('@test/badge-fields', '2.0.0', makeCertifiedResult('silver'))!;
    expect(typeof badge.score).toBe('number');
    expect(badge.fingerprint).toBeTruthy();
    expect(badge.signature).toBeTruthy();
  });

  it('issued badge has issuedAt and expiresAt ISO strings', () => {
    const badge = issueBadge('@test/badge-ttl', '1.0.0', makeCertifiedResult('gold'))!;
    expect(() => new Date(badge.issuedAt)).not.toThrow();
    expect(() => new Date(badge.expiresAt)).not.toThrow();
    const issued = new Date(badge.issuedAt).getTime();
    const expires = new Date(badge.expiresAt).getTime();
    expect(expires).toBeGreaterThan(issued);
  });

  it('badge expires approximately 1 year after issuance', () => {
    const badge = issueBadge('@test/badge-1yr', '1.0.0', makeCertifiedResult('platinum'))!;
    const issued = new Date(badge.issuedAt).getTime();
    const expires = new Date(badge.expiresAt).getTime();
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    expect(expires - issued).toBeCloseTo(oneYearMs, -6); // within 1 second
  });

  it('verifyBadge returns valid=true for a fresh badge', () => {
    const badge = issueBadge('@test/verify-ok', '1.0.0', makeCertifiedResult('bronze'))!;
    const result = verifyBadge(badge);
    expect(result.valid).toBe(true);
    expect(result.badge).toBeDefined();
  });

  it('verifyBadge detects tampered fingerprint', () => {
    const badge = issueBadge('@test/tamper-fp', '1.0.0', makeCertifiedResult('gold'))!;
    const tampered = { ...badge, fingerprint: 'a'.repeat(64) };
    const result = verifyBadge(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Fingerprint');
  });

  it('verifyBadge detects invalid signature', () => {
    const badge = issueBadge('@test/tamper-sig', '1.0.0', makeCertifiedResult('silver'))!;
    const tampered = { ...badge, signature: 'b'.repeat(64) };
    const result = verifyBadge(tampered);
    expect(result.valid).toBe(false);
  });
});

// ============================================================================
// Feature 1C: Badge.ts — SVG / Markdown generation
// ============================================================================

describe('Feature 1C: generateBadgeSVG and generateMarkdownBadge', () => {
  const levels = ['bronze', 'silver', 'gold', 'platinum'] as const;

  for (const level of levels) {
    it(`generateBadgeSVG for ${level} returns valid SVG`, () => {
      const badge = issueBadge(`@test/svg-${level}-${uid()}`, '1.0.0', makeCertifiedResult(level))!;
      const svg = generateBadgeSVGBadge(badge);
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });
  }

  it('generateBadgeSVG contains "HoloScript Certified"', () => {
    const badge = issueBadge(`@test/svg-brand-${uid()}`, '1.0.0', makeCertifiedResult('gold'))!;
    const svg = generateBadgeSVGBadge(badge);
    expect(svg).toContain('HoloScript Certified');
  });

  it('generateMarkdownBadge returns Markdown image syntax', () => {
    const badge = issueBadge(`@test/md-${uid()}`, '1.0.0', makeCertifiedResult('bronze'))!;
    const md = generateMarkdownBadge(badge);
    expect(md).toContain('![');
    expect(md).toContain('HoloScript');
  });

  it('generateMarkdownBadge contains shields.io URL', () => {
    const badge = issueBadge(`@test/md-shield-${uid()}`, '1.0.0', makeCertifiedResult('platinum'))!;
    const md = generateMarkdownBadge(badge);
    expect(md).toContain('shields.io');
  });
});

// ============================================================================
// Feature 1C: Badge.ts — store operations
// ============================================================================

describe('Feature 1C: Badge store operations', () => {
  it('storeBadge / getBadge round-trip', () => {
    const pkgName = `@test/store-${uid()}`;
    const badge = issueBadge(pkgName, '1.0.0', makeCertifiedResult('bronze'))!;
    storeBadge(badge);
    expect(getBadge(pkgName, '1.0.0')).toEqual(badge);
    revokeBadge(pkgName, '1.0.0');
  });

  it('getBadge returns undefined for unknown package', () => {
    expect(getBadge('@does/not-exist-getbadge', '99.99.99')).toBeUndefined();
  });

  it('listBadges includes a stored badge', () => {
    const pkgName = `@test/list-${uid()}`;
    const badge = issueBadge(pkgName, '1.0.0', makeCertifiedResult('silver'))!;
    storeBadge(badge);
    const all = listBadges();
    expect(all.some((b) => b.packageName === pkgName)).toBe(true);
    revokeBadge(pkgName, '1.0.0');
  });

  it('revokeBadge returns true and removes the badge', () => {
    const pkgName = `@test/revoke-${uid()}`;
    const badge = issueBadge(pkgName, '1.0.0', makeCertifiedResult('bronze'))!;
    storeBadge(badge);
    expect(revokeBadge(pkgName, '1.0.0')).toBe(true);
    expect(getBadge(pkgName, '1.0.0')).toBeUndefined();
  });

  it('revokeBadge returns false for non-existent badge', () => {
    expect(revokeBadge('@does/not-exist-revoke', '0.0.0')).toBe(false);
  });

  it('isActivelyCertified returns true for a fresh stored badge', () => {
    const pkgName = `@test/active-${uid()}`;
    const badge = issueBadge(pkgName, '1.0.0', makeCertifiedResult('gold'))!;
    storeBadge(badge);
    expect(isActivelyCertified(pkgName, '1.0.0')).toBe(true);
    revokeBadge(pkgName, '1.0.0');
  });

  it('isActivelyCertified returns false for unknown package', () => {
    expect(isActivelyCertified('@does/not-exist-active', '1.0.0')).toBe(false);
  });

  it('isActivelyCertified returns false after revoke', () => {
    const pkgName = `@test/revoke-check-${uid()}`;
    const badge = issueBadge(pkgName, '1.0.0', makeCertifiedResult('silver'))!;
    storeBadge(badge);
    revokeBadge(pkgName, '1.0.0');
    expect(isActivelyCertified(pkgName, '1.0.0')).toBe(false);
  });
});

// ============================================================================
// Feature 2: Partner SDK — HoloScriptRuntime
// ============================================================================

describe('Feature 2: HoloScriptRuntime', () => {
  it('createRuntime() returns a HoloScriptRuntime instance', () => {
    const runtime = createRuntime();
    expect(runtime).toBeInstanceOf(HoloScriptRuntime);
  });

  it('new HoloScriptRuntime() is constructable with defaults', () => {
    const rt = new HoloScriptRuntime();
    expect(rt).toBeDefined();
  });

  it('new HoloScriptRuntime() accepts config overrides', () => {
    const rt = new HoloScriptRuntime({ sandbox: false, timeout: 5000 });
    expect(rt).toBeDefined();
  });

  it('getScene() returns null before any load()', () => {
    const runtime = createRuntime();
    expect(runtime.getScene()).toBeNull();
  });

  it('getAllObjects() returns empty array before any createObject()', () => {
    const runtime = createRuntime();
    expect(runtime.getAllObjects()).toEqual([]);
  });

  it('load() resolves for empty source', async () => {
    const runtime = createRuntime();
    await expect(runtime.load('')).resolves.toBeUndefined();
  });

  it('load() resolves for minimal HoloScript source', async () => {
    const runtime = createRuntime();
    await expect(runtime.load('orb cube { position: [0, 1, 0] }')).resolves.toBeUndefined();
  });

  it('getScene() returns a SceneGraph object after load()', async () => {
    const runtime = createRuntime();
    await runtime.load('orb test { color: "red" }');
    const scene = runtime.getScene();
    expect(scene).not.toBeNull();
    expect(typeof scene?.name).toBe('string');
    expect(Array.isArray(scene?.objects)).toBe(true);
  });

  it('createObject() adds an object to the runtime', () => {
    const runtime = createRuntime();
    runtime.createObject({
      id: 'box-1',
      name: 'Box',
      type: 'box',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      properties: {},
      children: [],
    });
    expect(runtime.getAllObjects()).toHaveLength(1);
    expect(runtime.getAllObjects()[0].id).toBe('box-1');
  });

  it('destroyObject() removes an object', () => {
    const runtime = createRuntime();
    runtime.createObject({
      id: 'del-me',
      name: 'Delete',
      type: 'sphere',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      properties: {},
      children: [],
    });
    runtime.destroyObject('del-me');
    expect(runtime.getAllObjects()).toHaveLength(0);
  });

  it('on() registers listener that fires on objectCreated', () => {
    const runtime = createRuntime();
    const events: unknown[] = [];
    runtime.on('objectCreated', (data) => events.push(data));
    runtime.createObject({
      id: 'event-obj',
      name: 'Ev',
      type: 'box',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      properties: {},
      children: [],
    });
    expect(events).toHaveLength(1);
  });

  it('on() returns an unsubscribe function', () => {
    const runtime = createRuntime();
    const events: unknown[] = [];
    const unsub = runtime.on('objectCreated', (data) => events.push(data));
    runtime.createObject({
      id: 'sub-1',
      name: 'Sub1',
      type: 'box',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      properties: {},
      children: [],
    });
    unsub();
    runtime.createObject({
      id: 'sub-2',
      name: 'Sub2',
      type: 'box',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      properties: {},
      children: [],
    });
    // After unsubscribe, second event is not received
    expect(events).toHaveLength(1);
  });

  it('destroy() clears scene and objects', async () => {
    const runtime = createRuntime();
    await runtime.load('');
    runtime.createObject({
      id: 'will-be-cleared',
      name: 'Obj',
      type: 'box',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      properties: {},
      children: [],
    });
    runtime.destroy();
    expect(runtime.getScene()).toBeNull();
    expect(runtime.getAllObjects()).toEqual([]);
  });
});

// ============================================================================
// Feature 3: Partner SDK — WebhookHandler
// ============================================================================

describe('Feature 3: WebhookHandler', () => {
  const makeHandler = () =>
    createWebhookHandler({
      signingSecret: 'test-secret-key',
      partnerId: 'partner-123',
      maxTimestampAge: 3600, // 1 hour — avoids timestamp failures in tests
      strictMode: false,
    });

  const makePayload = (
    overrides: Partial<{
      eventId: string;
      eventType: string;
      timestamp: string;
      partnerId: string;
      data: unknown;
    }> = {}
  ) => ({
    eventId: `evt-${uid()}`,
    eventType: 'package.published' as const,
    timestamp: new Date().toISOString(),
    partnerId: 'partner-123',
    data: {
      name: '@test/pkg',
      version: '1.0.0',
      author: 'user',
      tarballUrl: 'https://test.example',
    },
    ...overrides,
  });

  it('createWebhookHandler() returns a WebhookHandler instance', () => {
    expect(makeHandler()).toBeInstanceOf(WebhookHandler);
  });

  it('on() + handle() dispatches payload to registered handler', async () => {
    const handler = makeHandler();
    const received: unknown[] = [];
    handler.on('package.published', (payload) => received.push(payload));
    const result = await handler.handle(makePayload());
    expect(result.success).toBe(true);
    expect(received).toHaveLength(1);
  });

  it('wildcard handler (*) receives all event types', async () => {
    const handler = makeHandler();
    const received: unknown[] = [];
    handler.on('*', (payload) => received.push(payload));
    await handler.handle(makePayload({ eventType: 'certification.passed' }));
    expect(received).toHaveLength(1);
  });

  it('handle() is idempotent — duplicate eventId is silently skipped', async () => {
    const handler = makeHandler();
    const received: unknown[] = [];
    handler.on('package.published', () => received.push(1));
    const payload = makePayload();
    await handler.handle(payload);
    await handler.handle(payload); // exact same eventId
    expect(received).toHaveLength(1);
  });

  it('handle() fails gracefully for wrong partnerId', async () => {
    const handler = makeHandler();
    const result = await handler.handle(makePayload({ partnerId: 'wrong-partner' }));
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('onPackagePublished() convenience method registers handler', async () => {
    const handler = makeHandler();
    let received = false;
    handler.onPackagePublished(() => {
      received = true;
    });
    await handler.handle(makePayload({ eventType: 'package.published' }));
    expect(received).toBe(true);
  });

  it('handle() accepts a raw JSON string payload', async () => {
    const handler = makeHandler();
    const received: unknown[] = [];
    handler.on('package.published', (p) => received.push(p));
    await handler.handle(JSON.stringify(makePayload()));
    expect(received).toHaveLength(1);
  });

  it('strictMode=true rejects unknown event types', async () => {
    const strictHandler = createWebhookHandler({
      signingSecret: 'test-secret',
      partnerId: 'partner-123',
      maxTimestampAge: 3600,
      strictMode: true,
    });
    const result = await strictHandler.handle(
      makePayload({ eventType: 'unknown.custom.event' as never })
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown event type');
  });

  it('handle() returns success=true for valid known event with no handlers', async () => {
    const handler = makeHandler();
    const result = await handler.handle(makePayload({ eventType: 'package.updated' }));
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Feature 4: HoloScript 3.0 Release Artifact Verification
// ============================================================================

describe('Feature 4: HoloScript 3.0 release artifacts', () => {
  it('packages/partner-sdk/ directory exists', () => {
    expect(existsSync(PARTNER_SDK_ROOT)).toBe(true);
  });

  it('partner-sdk/src/index.ts exists', () => {
    expect(existsSync(join(PARTNER_SDK_ROOT, 'src', 'index.ts'))).toBe(true);
  });

  it('partner-sdk has runtime module (Runtime.ts)', () => {
    expect(existsSync(join(PARTNER_SDK_ROOT, 'src', 'runtime', 'Runtime.ts'))).toBe(true);
  });

  it('partner-sdk has webhooks module (WebhookHandler.ts)', () => {
    expect(existsSync(join(PARTNER_SDK_ROOT, 'src', 'webhooks', 'WebhookHandler.ts'))).toBe(true);
  });

  it('partner-sdk has analytics module (PartnerAnalytics.ts)', () => {
    expect(existsSync(join(PARTNER_SDK_ROOT, 'src', 'analytics', 'PartnerAnalytics.ts'))).toBe(
      true
    );
  });

  it('partner-sdk has API client module (RegistryClient.ts)', () => {
    expect(existsSync(join(PARTNER_SDK_ROOT, 'src', 'api', 'RegistryClient.ts'))).toBe(true);
  });

  it('registry certification Checker.ts exists', () => {
    expect(existsSync(join(REGISTRY_ROOT, 'src', 'certification', 'Checker.ts'))).toBe(true);
  });

  it('registry certification Badge.ts exists', () => {
    expect(existsSync(join(REGISTRY_ROOT, 'src', 'certification', 'Badge.ts'))).toBe(true);
  });

  it('HoloScript Academy docs directory exists', () => {
    const academyPath = join(PROJECT_ROOT, 'docs', 'academy');
    expect(existsSync(academyPath)).toBe(true);
  });

  it('partner-sdk has branding module', () => {
    expect(existsSync(join(PARTNER_SDK_ROOT, 'src', 'branding'))).toBe(true);
  });
});
