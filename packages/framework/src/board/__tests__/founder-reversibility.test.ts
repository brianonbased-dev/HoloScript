/**
 * Founder reversibility policy — unit tests + divergence guard.
 *
 * Task: task_1780431630769_a2um
 *
 * Two test suites:
 *
 *  1. Functional: verifies the shared module's classification and reversibility
 *     logic is correct (mirrors the tests that previously lived in
 *     mcp-server/routes/__tests__/founder-approval-policy.test.ts so both sides
 *     stay covered here).
 *
 *  2. Divergence guard: reads the two consumer source files and fails immediately
 *     if any of the four regex constants (IRREVERSIBLE_RE, SPATIAL_RE, RENTAL_RE,
 *     MOBILITY_RE) are re-defined inline instead of imported from the shared
 *     module. This is the structural guarantee: adding a second copy is a test
 *     failure, not just a code-review concern.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  inferFounderActionType,
  deriveFounderReversibility,
  IRREVERSIBLE_RE,
  SPATIAL_RE,
  RENTAL_RE,
  MOBILITY_RE,
} from '../founder-reversibility';

// ── 1. Functional tests ───────────────────────────────────────────────────────

describe('founder-reversibility — inferFounderActionType', () => {
  it('classifies plain code titles as code', () => {
    expect(inferFounderActionType('Add a unit test for the parser')).toBe('code');
  });

  it('classifies spatial titles', () => {
    expect(inferFounderActionType('Render the scene preview for the demo zone')).toBe('spatial');
  });

  it('rental beats spatial (spend gate is stricter)', () => {
    expect(inferFounderActionType('render on a rented gpu')).toBe('service_rental');
  });

  it('classifies GPU provisioning as service_rental', () => {
    expect(inferFounderActionType('Provision a GPU fleet for the benchmark')).toBe('service_rental');
  });

  it('classifies door-to-door mobility as mobility_coordination', () => {
    expect(inferFounderActionType('Coordinate the door-to-door mobility trip')).toBe(
      'mobility_coordination',
    );
  });

  it('does NOT classify a software "route" as mobility_coordination', () => {
    // regression: MOBILITY_RE must not match bare "route" in API/code context
    expect(inferFounderActionType('Add the founder-approval route')).toBe('code');
  });
});

describe('founder-reversibility — deriveFounderReversibility', () => {
  it('admits plain code intents as reversible one-tap', () => {
    const r = deriveFounderReversibility('Add a unit test for the parser');
    expect(r.reversible).toBe(true);
    expect(r.actionType).toBe('code');
  });

  it('admits spatial intents as reversible', () => {
    const r = deriveFounderReversibility('Render the scene preview for the demo zone');
    expect(r.reversible).toBe(true);
    expect(r.actionType).toBe('spatial');
  });

  it.each([
    ['Deploy studio to production', 'deploy'],
    ['Force-push the rebased branch', 'force-push'],
    ['Spend treasury on the audit', 'spend/treasury'],
    ['Sign and broadcast the on-chain anchor', 'sign/broadcast'],
    ['Merge to main after review', 'merge to main'],
    ['Delete the stale world', 'delete'],
  ])('blocks irreversible intent: %s', (title) => {
    const r = deriveFounderReversibility(title);
    expect(r.reversible).toBe(false);
    expect(r.reason).toMatch(/irreversible|review/i);
  });

  it('blocks service_rental even without an irreversible verb', () => {
    const r = deriveFounderReversibility('Provision a GPU fleet for the benchmark');
    expect(r.actionType).toBe('service_rental');
    expect(r.reversible).toBe(false);
  });

  it('blocks mobility_coordination', () => {
    const r = deriveFounderReversibility('Coordinate the door-to-door mobility trip');
    expect(r.actionType).toBe('mobility_coordination');
    expect(r.reversible).toBe(false);
  });

  it('still blocks actual mobility coordination (regression)', () => {
    const r = deriveFounderReversibility(
      'Coordinate the mobility trip for door-to-door delivery',
    );
    expect(r.actionType).toBe('mobility_coordination');
    expect(r.reversible).toBe(false);
  });
});

describe('IRREVERSIBLE_RE / SPATIAL_RE exported constants', () => {
  it('IRREVERSIBLE_RE matches known irreversible verbs', () => {
    for (const verb of ['deploy', 'force-push', 'spend', 'sign', 'broadcast', 'delete']) {
      expect(IRREVERSIBLE_RE.test(verb)).toBe(true);
    }
  });

  it('SPATIAL_RE matches known spatial keywords', () => {
    for (const kw of ['world', 'scene', 'hologram', 'zone', 'holomap']) {
      expect(SPATIAL_RE.test(kw)).toBe(true);
    }
  });

  it('RENTAL_RE matches fleet / compute keywords', () => {
    for (const kw of ['gpu', 'fleet', 'provision', 'compute', 'vast']) {
      expect(RENTAL_RE.test(kw)).toBe(true);
    }
  });

  it('MOBILITY_RE matches mobility context, not bare "route"', () => {
    expect(MOBILITY_RE.test('door-to-door delivery')).toBe(true);
    expect(MOBILITY_RE.test('mobility coordination')).toBe(true);
    expect(MOBILITY_RE.test('Add the founder-approval route')).toBe(false);
  });
});

// ── 2. Divergence guard ───────────────────────────────────────────────────────
//
// These tests read the RAW SOURCE TEXT of the two consumer files and assert that
// none of the four regex patterns are defined inline. Any const/let/var
// assignment of the form `= /\b(deploy|...)/i` in those files is a violation.
//
// The detection heuristic: look for the distinctive start of each regex literal.
// If found anywhere in the file source (excluding import lines), the test fails.

// __dirname = packages/framework/src/board/__tests__
// resolve up 5 levels → HoloScript repo root
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');

const CONSUMER_FILES = [
  resolve(
    REPO_ROOT,
    'packages/mcp-server/src/holomesh/routes/founder-approval-policy.ts',
  ),
  resolve(
    REPO_ROOT,
    'packages/studio/src/app/api/quest-proof/next-actions/nextActions.ts',
  ),
];

/**
 * Strip import/export lines so we only scan the logic body.
 * A regex literal on an import line would be valid (re-exporting a constant);
 * we only care about inline definitions in the logic body.
 */
function stripImportLines(src: string): string {
  return src
    .split('\n')
    .filter((l) => !/^\s*(import|export)\s+/.test(l))
    .join('\n');
}

// The start of each inline regex literal as it appeared before the refactor.
// If any of these substrings appear in the non-import body of a consumer file,
// the regex is defined inline and the divergence guard fires.
const INLINE_REGEX_STARTS = [
  '/\\b(deploy|force[- ]?push',   // IRREVERSIBLE_RE start
  '/\\b(world|scene|hololand',    // SPATIAL_RE start
  '/\\b(rent|rental|gpu|fleet',   // RENTAL_RE start
  '/\\b(mobility|door-to-door',   // MOBILITY_RE start
];

describe('divergence guard — regex constants must NOT be defined inline in consumers', () => {
  for (const filePath of CONSUMER_FILES) {
    const shortPath = filePath.replace(REPO_ROOT + '/', '');

    it(`${shortPath} has no inline IRREVERSIBLE_RE definition`, () => {
      const body = stripImportLines(readFileSync(filePath, 'utf8'));
      expect(body).not.toContain('/\\b(deploy|force[- ]?push');
    });

    it(`${shortPath} has no inline SPATIAL_RE definition`, () => {
      const body = stripImportLines(readFileSync(filePath, 'utf8'));
      expect(body).not.toContain('/\\b(world|scene|hololand');
    });

    it(`${shortPath} has no inline RENTAL_RE definition`, () => {
      const body = stripImportLines(readFileSync(filePath, 'utf8'));
      expect(body).not.toContain('/\\b(rent|rental|gpu|fleet');
    });

    it(`${shortPath} has no inline MOBILITY_RE definition`, () => {
      const body = stripImportLines(readFileSync(filePath, 'utf8'));
      expect(body).not.toContain('/\\b(mobility|door-to-door');
    });
  }
});
