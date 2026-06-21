#!/usr/bin/env node
/**
 * T-NEWS-CI — HoloNews Proof-Adjacency Wall Gate
 *
 * Falsification contract for G.910.01:
 *   A "proven" badge MAY ONLY be rendered when the not-proven wall text is
 *   present and the compile target declares it can render both.
 *
 * This test is the ONLY thing that enforces the proof-adjacency invariant at
 * build time.  If it is deleted or skipped, the wall becomes advisory instead
 * of structural — which is the "composition scandal" failure mode named in the
 * premortem (research/2026-06-16_holonews-hololand-surface-and-router-spec.md).
 *
 * Run: node scripts/__tests__/holonews-proof-adjacency.test.mjs
 */

import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '../../packages/plugins/holonews-plugin/src');

// W.683: on Windows, dynamic import requires file:// URLs, not bare paths.
// Import from the pure .mjs implementations (no TS loader required).
const { resolveProofAdjacencyPolicy, auditReceiptForWallInvariant, buildKioskDisplayModel } =
  await import(pathToFileURL(resolve(PLUGIN_ROOT, 'traits/proof-adjacency-guard.mjs')).href);

const { buildCaelReceipt, createClaimKioskHandler } =
  await import(pathToFileURL(resolve(PLUGIN_ROOT, 'traits/claim-kiosk-trait.mjs')).href);

// ── Test harness ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const CLAIM_TEXT =
  'The walkway collapsed because the fourth-floor box-beam connection changed ' +
  'from a single continuous rod to two separate rods during construction, ' +
  'doubling the load on the upper hanger rod and exceeding its yield strength.';

const WALL_TEXT =
  'This proof covers the load-transfer calculation only. ' +
  'The design-change authorisation chain, contractor communications, and ' +
  'regulatory-approval sequence are documented in the NIST report but are ' +
  'not modelled here.';

function makeProvenReceipt(overrides = {}) {
  return buildCaelReceipt({
    receiptId: 'receipt_s-news-1',
    traceId: 's-news-1-hyatt-walkway',
    verifyUrl: 'https://mcp.holoscript.net/verify-cael?traceId=s-news-1-hyatt-walkway',
    hashChainValid: true,
    replayValid: true,
    claimText: CLAIM_TEXT,
    notProvenWall: WALL_TEXT,
    ...overrides,
  });
}

function makeLabeledReceipt() {
  return buildCaelReceipt({
    receiptId: 'receipt_labeled-001',
    traceId: 'labeled-001',
    verifyUrl: 'https://mcp.holoscript.net/verify-cael?traceId=labeled-001',
    hashChainValid: true,
    replayValid: false,
    claimText: CLAIM_TEXT,
    notProvenWall: WALL_TEXT,
  });
}

function makeCtx() {
  const events = [];
  return {
    emit: (type, payload) => events.push({ type, payload }),
    events,
  };
}

// ── resolveProofAdjacencyPolicy ─────────────────────────────────────────────

console.log('\nresolveProofAdjacencyPolicy');

test('badge-with-wall when proven + wall present + canRenderWall=true', () => {
  assert.equal(resolveProofAdjacencyPolicy(makeProvenReceipt(), true), 'badge-with-wall');
});

test('badge-suppressed-rerun-only when proven + wall present + canRenderWall=false', () => {
  assert.equal(resolveProofAdjacencyPolicy(makeProvenReceipt(), false), 'badge-suppressed-rerun-only');
});

// CRITICAL: proven without wall → must NEVER produce badge-with-wall
test('badge-suppressed-rerun-only when proven but notProvenWall is absent', () => {
  const r = makeProvenReceipt({ notProvenWall: undefined });
  assert.equal(resolveProofAdjacencyPolicy(r, true), 'badge-suppressed-rerun-only');
  assert.equal(resolveProofAdjacencyPolicy(r, false), 'badge-suppressed-rerun-only');
});

test('badge-suppressed-rerun-only when proven but notProvenWall is empty string', () => {
  const r = makeProvenReceipt({ notProvenWall: '' });
  assert.equal(resolveProofAdjacencyPolicy(r, true), 'badge-suppressed-rerun-only');
});

test('badge-suppressed-rerun-only when proven but notProvenWall is whitespace only', () => {
  const r = makeProvenReceipt({ notProvenWall: '   \n\t  ' });
  assert.equal(resolveProofAdjacencyPolicy(r, true), 'badge-suppressed-rerun-only');
});

test('no-badge when verdict is labeled (canRenderWall=true)', () => {
  assert.equal(resolveProofAdjacencyPolicy(makeLabeledReceipt(), true), 'no-badge');
});

test('no-badge when verdict is labeled (canRenderWall=false)', () => {
  assert.equal(resolveProofAdjacencyPolicy(makeLabeledReceipt(), false), 'no-badge');
});

test('no-badge when verdict is pending', () => {
  const r = { ...makeProvenReceipt(), verdict: 'pending' };
  assert.equal(resolveProofAdjacencyPolicy(r, true), 'no-badge');
});

// ── auditReceiptForWallInvariant ────────────────────────────────────────────

console.log('\nauditReceiptForWallInvariant');

test('no violations for a structurally sound proven receipt', () => {
  assert.deepEqual(auditReceiptForWallInvariant(makeProvenReceipt()), []);
});

test('flags missing notProvenWall on a proven receipt', () => {
  const v = auditReceiptForWallInvariant(makeProvenReceipt({ notProvenWall: undefined }));
  assert.ok(v.length > 0, 'expected at least one violation');
  assert.ok(v[0].includes('notProvenWall is absent or empty'), `unexpected message: ${v[0]}`);
});

test('flags missing verifyUrl on a proven receipt', () => {
  const v = auditReceiptForWallInvariant(makeProvenReceipt({ verifyUrl: '' }));
  assert.ok(v.some((x) => x.includes('verifyUrl is missing')), 'expected verifyUrl violation');
});

test('flags contradictory state: proven verdict but hashChainValid=false', () => {
  const r = { ...makeProvenReceipt(), hashChainValid: false };
  const v = auditReceiptForWallInvariant(r);
  assert.ok(v.some((x) => x.includes('hashChainValid is false')), 'expected hashChainValid violation');
});

test('flags contradictory state: proven verdict but replayValid=false', () => {
  const r = { ...makeProvenReceipt(), replayValid: false };
  const v = auditReceiptForWallInvariant(r);
  assert.ok(v.some((x) => x.includes('replayValid is false')), 'expected replayValid violation');
});

test('no violations for a labeled receipt (no badge expected)', () => {
  assert.deepEqual(auditReceiptForWallInvariant(makeLabeledReceipt()), []);
});

// ── buildKioskDisplayModel ──────────────────────────────────────────────────

console.log('\nbuildKioskDisplayModel');

test('showBadge=true and wallText populated when policy is badge-with-wall', () => {
  const model = buildKioskDisplayModel(makeProvenReceipt(), true);
  assert.equal(model.policy, 'badge-with-wall');
  assert.equal(model.showBadge, true);
  assert.equal(model.wallText, WALL_TEXT);
  assert.ok(model.verifyUrl, 'verifyUrl should be present');
  assert.equal(model.claimText, CLAIM_TEXT);
});

test('showBadge=false and wallText absent when policy is badge-suppressed-rerun-only', () => {
  const model = buildKioskDisplayModel(makeProvenReceipt(), false);
  assert.equal(model.policy, 'badge-suppressed-rerun-only');
  assert.equal(model.showBadge, false);
  assert.equal(model.wallText, undefined);
  assert.ok(model.verifyUrl, 'verifyUrl still present for re-run');
});

test('showBadge=false, wallText absent, verifyUrl absent when verdict is labeled', () => {
  const model = buildKioskDisplayModel(makeLabeledReceipt(), true);
  assert.equal(model.policy, 'no-badge');
  assert.equal(model.showBadge, false);
  assert.equal(model.wallText, undefined);
  assert.equal(model.verifyUrl, undefined);
});

// WALL INVARIANT: wallText NEVER appears without showBadge=true
test('wallText is NEVER present when showBadge=false (invariant cross-check)', () => {
  const cases = [
    buildKioskDisplayModel(makeProvenReceipt({ notProvenWall: undefined }), true),
    buildKioskDisplayModel(makeProvenReceipt({ notProvenWall: undefined }), false),
    buildKioskDisplayModel(makeLabeledReceipt(), true),
    buildKioskDisplayModel(makeLabeledReceipt(), false),
    buildKioskDisplayModel(makeProvenReceipt(), false), // canRenderWall=false
  ];
  for (const model of cases) {
    if (!model.showBadge) {
      assert.equal(
        model.wallText,
        undefined,
        `wallText should be undefined when showBadge=false (policy=${model.policy})`,
      );
    }
  }
});

test('showEnvelope=true when policy is badge-with-wall and envelope exists', () => {
  const envelope = {
    params: [{ name: 'load', label: 'Load', unit: 'kN', min: 0, max: 100, default: 63.5 }],
    boundaryDescription: 'Exceeding 100 kN causes yielding.',
  };
  const model = buildKioskDisplayModel(makeProvenReceipt({ envelope }), true);
  assert.equal(model.showEnvelope, true);
});

test('showEnvelope=false when verdict is labeled even if envelope exists', () => {
  const envelope = {
    params: [{ name: 'load', label: 'Load', unit: 'kN', min: 0, max: 100, default: 63.5 }],
    boundaryDescription: 'Exceeding 100 kN causes yielding.',
  };
  const r = { ...makeLabeledReceipt(), envelope };
  const model = buildKioskDisplayModel(r, true);
  assert.equal(model.showEnvelope, false);
});

test('auditViolations empty for structurally sound proven receipt', () => {
  const model = buildKioskDisplayModel(makeProvenReceipt(), true);
  assert.deepEqual(model.auditViolations, []);
});

test('auditViolations non-empty when wall text missing on proven receipt', () => {
  const model = buildKioskDisplayModel(makeProvenReceipt({ notProvenWall: undefined }), true);
  assert.ok(model.auditViolations.length > 0, 'expected audit violations');
});

// ── ClaimKioskTrait handler (event-driven integration) ─────────────────────

console.log('\ncreateClaimKioskHandler — event integration');

test('emits kiosk:ready on attach', () => {
  const handler = createClaimKioskHandler();
  const node = {};
  const ctx = makeCtx();
  handler.onAttach(node, handler.defaultConfig, ctx);
  assert.ok(ctx.events.some((e) => e.type === 'kiosk:ready'), 'expected kiosk:ready');
});

test('emits kiosk:badge_render when a proven receipt with wall is bound', () => {
  const handler = createClaimKioskHandler();
  const node = {};
  const ctx = makeCtx();
  handler.onAttach(node, handler.defaultConfig, ctx);
  ctx.events.length = 0;

  handler.onEvent(node, handler.defaultConfig, ctx, {
    type: 'kiosk:receipt_bind',
    payload: { receipt: makeProvenReceipt() },
  });

  assert.ok(ctx.events.some((e) => e.type === 'kiosk:badge_render'), 'expected kiosk:badge_render');
  assert.ok(!ctx.events.some((e) => e.type === 'kiosk:badge_suppressed'), 'must NOT emit kiosk:badge_suppressed');

  const ev = ctx.events.find((e) => e.type === 'kiosk:badge_render');
  assert.equal(ev.payload.wallText, WALL_TEXT);
  assert.equal(ev.payload.claimText, CLAIM_TEXT);
});

// CRITICAL: proven without wall text → MUST NOT emit kiosk:badge_render
test('emits kiosk:badge_suppressed (not kiosk:badge_render) when wall text is absent', () => {
  const handler = createClaimKioskHandler();
  const node = {};
  const ctx = makeCtx();
  handler.onAttach(node, handler.defaultConfig, ctx);
  ctx.events.length = 0;

  handler.onEvent(node, handler.defaultConfig, ctx, {
    type: 'kiosk:receipt_bind',
    payload: { receipt: makeProvenReceipt({ notProvenWall: undefined }) },
  });

  assert.ok(!ctx.events.some((e) => e.type === 'kiosk:badge_render'), 'must NOT emit kiosk:badge_render');
  assert.ok(ctx.events.some((e) => e.type === 'kiosk:badge_suppressed'), 'expected kiosk:badge_suppressed');

  const ev = ctx.events.find((e) => e.type === 'kiosk:badge_suppressed');
  assert.equal(ev.payload.reason, 'missing_wall_text');
});

test('emits kiosk:badge_suppressed when canRenderWall=false even with wall text present', () => {
  const handler = createClaimKioskHandler();
  const node = {};
  const ctx = makeCtx();
  const config = { ...handler.defaultConfig, canRenderWall: false };
  handler.onAttach(node, config, ctx);
  ctx.events.length = 0;

  handler.onEvent(node, config, ctx, {
    type: 'kiosk:receipt_bind',
    payload: { receipt: makeProvenReceipt() },
  });

  assert.ok(!ctx.events.some((e) => e.type === 'kiosk:badge_render'), 'must NOT emit kiosk:badge_render');
  assert.ok(ctx.events.some((e) => e.type === 'kiosk:badge_suppressed'), 'expected kiosk:badge_suppressed');
  const ev = ctx.events.find((e) => e.type === 'kiosk:badge_suppressed');
  assert.equal(ev.payload.reason, 'target_cannot_render_wall');
});

test('emits kiosk:audit_violation when loudAuditFailures=true and wall is missing', () => {
  const handler = createClaimKioskHandler();
  const node = {};
  const ctx = makeCtx();
  handler.onAttach(node, handler.defaultConfig, ctx);
  ctx.events.length = 0;

  handler.onEvent(node, handler.defaultConfig, ctx, {
    type: 'kiosk:receipt_bind',
    payload: { receipt: makeProvenReceipt({ notProvenWall: '' }) },
  });

  assert.ok(ctx.events.some((e) => e.type === 'kiosk:audit_violation'), 'expected kiosk:audit_violation');
});

test('clamps envelope slider values to param bounds', () => {
  const handler = createClaimKioskHandler();
  const node = {};
  const ctx = makeCtx();
  handler.onAttach(node, handler.defaultConfig, ctx);

  const envelope = {
    params: [{ name: 'load', label: 'Load', unit: 'kN', min: 10, max: 150, default: 63.5 }],
    boundaryDescription: 'Exceeding 150 kN causes failure.',
  };
  handler.onEvent(node, handler.defaultConfig, ctx, {
    type: 'kiosk:receipt_bind',
    payload: { receipt: makeProvenReceipt({ envelope }) },
  });
  ctx.events.length = 0;

  handler.onEvent(node, handler.defaultConfig, ctx, {
    type: 'kiosk:envelope_update',
    payload: { paramName: 'load', value: 999 },
  });

  const changed = ctx.events.find((e) => e.type === 'kiosk:envelope_changed');
  assert.ok(changed, 'expected kiosk:envelope_changed');
  assert.equal(changed.payload.value, 150, 'value should be clamped to max=150');
});

test('emits kiosk:rerun_initiated with verifyUrl and traceId', () => {
  const handler = createClaimKioskHandler();
  const node = {};
  const ctx = makeCtx();
  handler.onAttach(node, handler.defaultConfig, ctx);

  handler.onEvent(node, handler.defaultConfig, ctx, {
    type: 'kiosk:receipt_bind',
    payload: { receipt: makeProvenReceipt() },
  });
  ctx.events.length = 0;

  handler.onEvent(node, handler.defaultConfig, ctx, {
    type: 'kiosk:rerun_request',
    payload: {},
  });

  const ev = ctx.events.find((e) => e.type === 'kiosk:rerun_initiated');
  assert.ok(ev, 'expected kiosk:rerun_initiated');
  assert.ok(ev.payload.verifyUrl.includes('verify-cael'), 'verifyUrl should point to verify-cael');
  assert.equal(ev.payload.traceId, 's-news-1-hyatt-walkway');
});

test('resets to idle on kiosk:reset', () => {
  const handler = createClaimKioskHandler();
  const node = {};
  const ctx = makeCtx();
  handler.onAttach(node, handler.defaultConfig, ctx);

  handler.onEvent(node, handler.defaultConfig, ctx, {
    type: 'kiosk:receipt_bind',
    payload: { receipt: makeProvenReceipt() },
  });
  ctx.events.length = 0;

  handler.onEvent(node, handler.defaultConfig, ctx, {
    type: 'kiosk:reset',
    payload: {},
  });

  const s = node.__kioskState;
  assert.equal(s.idle, true);
  assert.equal(s.receipt, null);
  assert.equal(s.displayModel, null);
  assert.ok(ctx.events.some((e) => e.type === 'kiosk:ready'), 'expected kiosk:ready after reset');
});

// ── buildCaelReceipt ────────────────────────────────────────────────────────

console.log('\nbuildCaelReceipt');

test('verdict is proven when both hashChainValid and replayValid are true', () => {
  const r = buildCaelReceipt({
    receiptId: 'r1', traceId: 't1',
    verifyUrl: 'https://example.com/verify',
    hashChainValid: true, replayValid: true,
    claimText: 'claim', notProvenWall: 'wall',
  });
  assert.equal(r.verdict, 'proven');
});

test('verdict is labeled when hashChainValid is false', () => {
  const r = buildCaelReceipt({
    receiptId: 'r2', traceId: 't2',
    verifyUrl: 'https://example.com/verify',
    hashChainValid: false, replayValid: true,
    claimText: 'claim', notProvenWall: 'wall',
  });
  assert.equal(r.verdict, 'labeled');
});

test('verdict is labeled when replayValid is false', () => {
  const r = buildCaelReceipt({
    receiptId: 'r3', traceId: 't3',
    verifyUrl: 'https://example.com/verify',
    hashChainValid: true, replayValid: false,
    claimText: 'claim', notProvenWall: 'wall',
  });
  assert.equal(r.verdict, 'labeled');
});

test('sealedAt defaults to a valid ISO string', () => {
  const r = buildCaelReceipt({
    receiptId: 'r4', traceId: 't4',
    verifyUrl: 'https://example.com/verify',
    hashChainValid: true, replayValid: true,
    claimText: 'claim', notProvenWall: 'wall',
  });
  assert.doesNotThrow(() => new Date(r.sealedAt).toISOString());
});

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
