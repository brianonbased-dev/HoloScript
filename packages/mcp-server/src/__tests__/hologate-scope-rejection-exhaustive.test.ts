/**
 * HoloGate §5 measurement 7 — Exhaustive scope-violation rejection correctness
 *
 * Formalises the implicit coverage in holo-portal-intent.test.ts into a
 * machine-readable matrix that can appear verbatim as a paper table.
 *
 * Matrix: every (intent kind) × (scope) × (policy variant) → assert reject/allow.
 *
 * Paper evidence: Paper 35 §5, measurement 7 of 8.
 * Board task: task_1779439734598_y1gk (HoloGate measurement §5).
 */

import { describe, it, expect } from 'vitest';
import {
  validatePortalIntent,
  type SpatialPolicy,
  type PortalIntent,
  type SpatialScope,
} from '../holo-portal-intent.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SCOPES: SpatialScope[] = ['read-only', 'mutate-zone', 'drive-avatar'];

const INTENTS: Record<string, PortalIntent> = {
  move: { kind: 'move', entityId: 'zone:lobby:box', position: { x: 1, y: 0, z: 0 } },
  look: { kind: 'look', entityId: 'avatar:agent-1', rotation: { x: 0, y: 0, z: 0, w: 1 } },
  grab: { kind: 'grab', entityId: 'avatar:agent-1', targetId: 'zone:lobby:crate' },
  say: { kind: 'say', entityId: 'avatar:agent-1', utterance: 'hello' },
};

const ZONE_POLICY: SpatialPolicy = {
  mutableZoneGlobs: ['zone:lobby:*'],
  driveAvatar: { allow: true, maxEntities: 2 },
};

// ---------------------------------------------------------------------------
// 1. Full scope × intent kind rejection matrix
//
// Expected outcomes per scope (ZONE_POLICY):
//   read-only    : all intents rejected
//   mutate-zone  : move✅ (matched glob), look✗, grab✅ (matched glob), say✗
//   drive-avatar : move✅, look✅, grab✅, say✅
// ---------------------------------------------------------------------------

describe('scope × intent kind exhaustive matrix (zone policy)', () => {
  type Outcome = 'allow' | 'reject';

  const EXPECTED: Record<SpatialScope, Record<keyof typeof INTENTS, Outcome>> = {
    'read-only': { move: 'reject', look: 'reject', grab: 'reject', say: 'reject' },
    'mutate-zone': { move: 'allow', look: 'reject', grab: 'allow', say: 'reject' },
    'drive-avatar': { move: 'allow', look: 'allow', grab: 'allow', say: 'allow' },
  };

  for (const scope of SCOPES) {
    for (const [kind, intent] of Object.entries(INTENTS)) {
      const expected = EXPECTED[scope][kind as keyof typeof INTENTS];
      it(`scope='${scope}' + intent='${kind}' → ${expected}`, () => {
        const result = validatePortalIntent(intent, ZONE_POLICY, scope);
        if (expected === 'allow') {
          expect(result.allowed).toBe(true);
          expect(result.reason).toBeUndefined();
        } else {
          expect(result.allowed).toBe(false);
          expect(result.reason).toBeTruthy();
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 2. allowedScopes gate — every scope not in the list must be rejected
// ---------------------------------------------------------------------------

describe('allowedScopes gate', () => {
  it('rejects drive-avatar when allowedScopes=[read-only]', () => {
    const p: SpatialPolicy = { allowedScopes: ['read-only'] };
    const r = validatePortalIntent(INTENTS.move, p, 'drive-avatar');
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/allowedScopes/);
  });

  it('rejects mutate-zone when allowedScopes=[drive-avatar]', () => {
    const p: SpatialPolicy = { allowedScopes: ['drive-avatar'] };
    const r = validatePortalIntent(INTENTS.move, p, 'mutate-zone');
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/allowedScopes/);
  });

  it('allows drive-avatar when allowedScopes includes it', () => {
    const p: SpatialPolicy = { allowedScopes: ['drive-avatar'], driveAvatar: { allow: true } };
    const r = validatePortalIntent(INTENTS.say, p, 'drive-avatar');
    expect(r.allowed).toBe(true);
  });

  it('allows any scope when allowedScopes is empty []', () => {
    const p: SpatialPolicy = { allowedScopes: [], driveAvatar: { allow: true } };
    const r = validatePortalIntent(INTENTS.say, p, 'drive-avatar');
    expect(r.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. mutableZoneGlob specificity — move allowed only for matching ids
// ---------------------------------------------------------------------------

describe('mutableZoneGlob specificity (mutate-zone)', () => {
  const p: SpatialPolicy = { defaultScope: 'mutate-zone', mutableZoneGlobs: ['zone:lobby:*'] };

  const cases: Array<{ id: string; expected: boolean }> = [
    { id: 'zone:lobby:chair-1', expected: true },
    { id: 'zone:lobby:', expected: true }, // trailing-wildcard edge
    { id: 'zone:vault:safe', expected: false },
    { id: 'lobby:chair-1', expected: false }, // prefix-anchor
    { id: 'zone:lobby:deep:item', expected: true }, // * matches path separators
  ];

  for (const { id, expected } of cases) {
    it(`entityId='${id}' → ${expected ? 'allow' : 'reject'}`, () => {
      const intent: PortalIntent = { kind: 'move', entityId: id, position: { x: 0, y: 0, z: 0 } };
      expect(validatePortalIntent(intent, p).allowed).toBe(expected);
    });
  }

  it('grab uses targetId for glob matching, not entityId', () => {
    const grabInZone: PortalIntent = {
      kind: 'grab',
      entityId: 'avatar:bot',
      targetId: 'zone:lobby:crate',
    };
    const grabOutOfZone: PortalIntent = {
      kind: 'grab',
      entityId: 'avatar:bot',
      targetId: 'zone:vault:safe',
    };
    expect(validatePortalIntent(grabInZone, p).allowed).toBe(true);
    expect(validatePortalIntent(grabOutOfZone, p).allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. driveAvatar policy variants
// ---------------------------------------------------------------------------

describe('driveAvatar policy variants', () => {
  it('denies say/look when driveAvatar.allow=false', () => {
    const p: SpatialPolicy = { defaultScope: 'drive-avatar', driveAvatar: { allow: false } };
    expect(validatePortalIntent(INTENTS.say, p).allowed).toBe(false);
    expect(validatePortalIntent(INTENTS.look, p).allowed).toBe(false);
  });

  it('denies say/look when maxEntities limit reached', () => {
    const p: SpatialPolicy = {
      defaultScope: 'drive-avatar',
      driveAvatar: { allow: true, maxEntities: 1 },
    };
    // activeCount = 1 (at limit)
    expect(validatePortalIntent(INTENTS.say, p, 'drive-avatar', 1).allowed).toBe(false);
  });

  it('allows say/look when activeCount is below maxEntities', () => {
    const p: SpatialPolicy = {
      defaultScope: 'drive-avatar',
      driveAvatar: { allow: true, maxEntities: 3 },
    };
    expect(validatePortalIntent(INTENTS.say, p, 'drive-avatar', 2).allowed).toBe(true);
  });

  it('allows say/look when maxEntities=0 (unlimited)', () => {
    const p: SpatialPolicy = {
      defaultScope: 'drive-avatar',
      driveAvatar: { allow: true, maxEntities: 0 },
    };
    expect(validatePortalIntent(INTENTS.say, p, 'drive-avatar', 999).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Enforcement=warn mode — intent is allowed but warned flag is set
// ---------------------------------------------------------------------------

describe('enforcement=warn mode', () => {
  it('allows with warned=true when read-only scope tries to move', () => {
    const p: SpatialPolicy = {
      defaultScope: 'read-only',
      enforcement: { onScopeViolation: 'warn' },
    };
    const r = validatePortalIntent(INTENTS.move, p);
    expect(r.allowed).toBe(true);
    expect(r.warned).toBe(true);
    expect(r.reason).toBeTruthy();
  });

  it('allows with warned=true when mutate-zone tries embodied say', () => {
    const p: SpatialPolicy = {
      defaultScope: 'mutate-zone',
      enforcement: { onScopeViolation: 'warn' },
    };
    const r = validatePortalIntent(INTENTS.say, p);
    expect(r.allowed).toBe(true);
    expect(r.warned).toBe(true);
  });

  it('normal allow has no warned flag', () => {
    const p: SpatialPolicy = {
      defaultScope: 'drive-avatar',
      driveAvatar: { allow: true },
      enforcement: { onScopeViolation: 'warn' },
    };
    const r = validatePortalIntent(INTENTS.say, p);
    expect(r.allowed).toBe(true);
    expect(r.warned).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Undefined / minimal policy defaults
// ---------------------------------------------------------------------------

describe('undefined / minimal policy defaults', () => {
  it('undefined policy → read-only default → all mutations rejected', () => {
    expect(validatePortalIntent(INTENTS.move, undefined).allowed).toBe(false);
    expect(validatePortalIntent(INTENTS.say, undefined).allowed).toBe(false);
  });

  it('empty policy object → read-only default → all mutations rejected', () => {
    expect(validatePortalIntent(INTENTS.move, {}).allowed).toBe(false);
    expect(validatePortalIntent(INTENTS.grab, {}).allowed).toBe(false);
  });

  it('scope override via requestedScope wins over policy.defaultScope', () => {
    const p: SpatialPolicy = { defaultScope: 'read-only', driveAvatar: { allow: true } };
    // Override to drive-avatar → say should be allowed
    expect(validatePortalIntent(INTENTS.say, p, 'drive-avatar').allowed).toBe(true);
  });
});
