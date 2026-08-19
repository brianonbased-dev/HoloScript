#!/usr/bin/env node
/**
 * HoloShell Natural Phenomena Bridge — runtime adapter.
 *
 * Closes task_1779062800545_mglh. Wires Brittney runtime state signals into
 * the natural-phenomena template library:
 *
 *   BubbleField.set_density()       <- visible_shell_objects + recent_receipts
 *   FireSource.set_activity()       <- runtime tool_call rate + action proposals
 *   LeafField.set_incoming_rate()   <- pending_approvals + recent inbound rate
 *   HoloShellRouter.set_brittney_scene() <- Phase-3 personalization profile
 *
 * Source-of-truth signatures live in:
 *   packages/components/templates/natural-phenomena.holo
 *   packages/components/templates/holoshell-scenes.holo
 *
 * Bridge contract lives in:
 *   apps/holoshell/source/holoshell-natural-phenomena-bridge.hsplus
 *
 * Design intent (Phase-3 personalization, environmental honesty):
 *   C:/Users/josep/.ai-ecosystem/design/holoshell-natural-phenomena-ux.md
 *
 * Usage:
 *   node scripts/holoshell-natural-phenomena-bridge.mjs            # one-shot apply
 *   node scripts/holoshell-natural-phenomena-bridge.mjs --json     # JSON output
 *   node scripts/holoshell-natural-phenomena-bridge.mjs --dry-run  # mapping only
 *
 * Pure mapping functions are exported for vitest. The script is safe to run
 * before upstream adapters exist — missing receipts produce a "skipped" result
 * rather than an error, matching BridgeIsIdempotentPerSource policy.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const DEFAULTS = {
  contextReceipt: resolve(REPO_ROOT, '.tmp', 'holoshell', 'brittney-context.json'),
  runtimeReceipt: resolve(REPO_ROOT, '.tmp', 'holoshell', 'brittney-turn-latest.json'),
  personalizationProfile: resolve(REPO_ROOT, '.tmp', 'holoshell', 'brittney-personalization.json'),
  bridgeReceipt: resolve(REPO_ROOT, '.tmp', 'holoshell', 'natural-phenomena-bridge.json'),
};

// Template clamp constants — match natural-phenomena.holo + holoshell-scenes.holo.
export const TEMPLATE_CLAMPS = {
  bubbleDensityMin: 4,
  bubbleDensityMax: 40,
  fireActivityMin: 0.05,
  fireActivityMax: 2.0,
  leafActivityLevelMin: 0.1,   // produces leaf_count=2 in template (2/20=0.1)
  leafActivityLevelMax: 3.0,   // produces leaf_count=60 in template (60/20=3)
};

export const SCENE_LIBRARY = [
  'UnderwaterScene',
  'WarmLibraryScene',
  'ZenGardenScene',
  'MountainLakeScene',
  'NightCampfireScene',
  'ZenGardenCloseScene',
];

// Temperament → scene mapping per design doc §Phase 1 alternatives table.
export const TEMPERAMENT_SCENE_MAP = Object.freeze({
  reflective: 'ZenGardenScene',
  expansive: 'MountainLakeScene',
  warm: 'NightCampfireScene',
  curious: 'WarmLibraryScene',
  gentle: 'UnderwaterScene',
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure mapping functions — vitest exercises these directly.
// ─────────────────────────────────────────────────────────────────────────────

function clamp(x, lo, hi) {
  if (Number.isNaN(x) || x === undefined || x === null) return lo;
  return Math.min(hi, Math.max(lo, x));
}

/**
 * BubbleField.set_density input.
 * Bubbles = options visible to the user right now (D.049 environmental honesty).
 * The template itself clamps to [4, 40] and computes system_density = count/20.
 */
export function bubbleDensityFromContext({ visibleShellObjectCount = 0, recentReceiptCount = 0 } = {}) {
  const raw = Math.round((Number(visibleShellObjectCount) || 0) + (Number(recentReceiptCount) || 0));
  return clamp(raw, TEMPLATE_CLAMPS.bubbleDensityMin, TEMPLATE_CLAMPS.bubbleDensityMax);
}

/**
 * FireSource.set_activity input.
 * Fire intensity = system doing visible work (D.049). tanh keeps the curve
 * smooth so a single tool-call burst does not strobe the world.
 *   activity = idleFloor + 0.4*tanh(tcpm/3) + 0.6*tanh(apm/2)
 * Template clamps the result to [0.05, 2.0] and chooses color band.
 */
export function fireActivityFromRuntime({
  toolCallCount = 0,
  actionProposalCount = 0,
  windowMs = 60_000,
} = {}) {
  const safeWindow = Math.max(1_000, Number(windowMs) || 60_000);
  const toolCallsPerMinute = ((Number(toolCallCount) || 0) * 60_000) / safeWindow;
  const proposalsPerMinute = ((Number(actionProposalCount) || 0) * 60_000) / safeWindow;
  const idleFloor = 0.15;
  const raw = idleFloor
    + 0.4 * Math.tanh(toolCallsPerMinute / 3)
    + 0.6 * Math.tanh(proposalsPerMinute / 2);
  return clamp(raw, TEMPLATE_CLAMPS.fireActivityMin, TEMPLATE_CLAMPS.fireActivityMax);
}

/**
 * LeafField.set_incoming_rate input.
 * activity_level scales leaf_count = clamp(activity*20, 2, 60).
 *   activity_level = 0.4*pendingApprovals + 0.1*receiptsPerMinute
 * Pending approvals weighted heavier — those are leaves the user must catch
 * (per design doc §Brittney Conversation Layer).
 */
export function leafActivityFromContext({
  pendingApprovalCount = 0,
  recentReceiptCount = 0,
  windowMs = 60_000,
} = {}) {
  const safeWindow = Math.max(1_000, Number(windowMs) || 60_000);
  const receiptsPerMinute = ((Number(recentReceiptCount) || 0) * 60_000) / safeWindow;
  const pending = Number(pendingApprovalCount) || 0;
  const raw = 0.4 * pending + 0.1 * receiptsPerMinute;
  return clamp(raw, TEMPLATE_CLAMPS.leafActivityLevelMin, TEMPLATE_CLAMPS.leafActivityLevelMax);
}

/**
 * HoloShellRouter.set_brittney_scene input.
 * Phase-3 personalization profile -> scene id. Order:
 *   1. preferredScene (if explicitly set AND in the scene library)
 *   2. temperament map
 *   3. null (no mutation — preserves D.051 "no signal, no action")
 */
export function sceneFromPersonalization(profile = {}) {
  if (!profile || typeof profile !== 'object') return null;
  const preferred = String(profile.preferredScene || '').trim();
  if (preferred && SCENE_LIBRARY.includes(preferred)) return preferred;
  const temperament = String(profile.temperament || '').trim().toLowerCase();
  if (temperament && TEMPERAMENT_SCENE_MAP[temperament]) {
    return TEMPERAMENT_SCENE_MAP[temperament];
  }
  return null;
}

/**
 * Full bridge compute — pure, takes the three inputs and returns the mapped
 * call set. The Node-side `applyBridge` adds I/O + receipt write around this.
 */
export function computeBridge({ context, runtime, personalization } = {}) {
  const bubbleDensity = bubbleDensityFromContext(context?.summary ? {
    visibleShellObjectCount: context.summary.visibleShellObjectCount,
    recentReceiptCount: context.summary.recentReceiptCount,
  } : {});
  const leafActivity = leafActivityFromContext(context?.summary ? {
    pendingApprovalCount: context.approvalSummary?.pendingApprovalCount
      ?? context.summary?.pendingApprovalCount
      ?? 0,
    recentReceiptCount: context.summary.recentReceiptCount,
    windowMs: context.summary.windowMs,
  } : {});
  const fireActivity = fireActivityFromRuntime(runtime ? {
    toolCallCount: runtime.toolCallCount,
    actionProposalCount: runtime.actionProposalCount,
    windowMs: runtime.windowMs,
  } : {});
  const routerScene = sceneFromPersonalization(personalization || {});
  return {
    calls: [
      { template: 'BubbleField', action: 'set_density', argument: bubbleDensity },
      { template: 'FireSource', action: 'set_activity', argument: fireActivity },
      { template: 'LeafField', action: 'set_incoming_rate', argument: leafActivity },
      ...(routerScene
        ? [{ template: 'HoloShellRouter', action: 'set_brittney_scene', argument: routerScene }]
        : []),
    ],
    summary: {
      bubbleDensity,
      fireActivity,
      leafIncomingRate: leafActivity,
      routerScene,        // null => no mutation
      sceneMutationApplied: Boolean(routerScene),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// I/O helpers (no-op friendly — missing receipts are not errors).
// ─────────────────────────────────────────────────────────────────────────────

function safeReadJson(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    return { __error: err.message, __path: path };
  }
}

function confirmRedacted(context) {
  if (!context) return true;
  const pb = context.privacyBoundary;
  if (!pb) return true;
  if (pb.redacted === true) return true;
  if (pb.redacted === false) return false;
  // Component-flag form — all three must be falsy/missing.
  return (
    pb.rawCommandsIncluded !== true &&
    pb.rawWindowTitlesIncluded !== true &&
    pb.secretsIncluded !== true
  );
}

function sourceHashes(context, runtime, personalization) {
  return {
    context: context?.receipt?.contextHash ?? null,
    runtime: runtime?.turnId ?? null,
    personalization: personalization?.producedAt ?? null,
  };
}

/**
 * Run the bridge end-to-end against the receipt files declared in the
 * composition spec. Returns the receipt envelope. Idempotent per
 * (contextHash, turnId, producedAt) tuple.
 */
export function applyBridge({ paths = DEFAULTS, now = () => new Date().toISOString() } = {}) {
  const context = safeReadJson(paths.contextReceipt);
  const runtime = safeReadJson(paths.runtimeReceipt);
  const personalization = safeReadJson(paths.personalizationProfile);
  const prevReceipt = safeReadJson(paths.bridgeReceipt);

  const hashes = sourceHashes(context, runtime, personalization);

  // Idempotency gate — BridgeIsIdempotentPerSource.
  if (prevReceipt && prevReceipt.sourceHashes
      && prevReceipt.sourceHashes.context === hashes.context
      && prevReceipt.sourceHashes.runtime === hashes.runtime
      && prevReceipt.sourceHashes.personalization === hashes.personalization
      && prevReceipt.appliedAt) {
    return {
      ...prevReceipt,
      skipped: true,
      skipReason: 'no-signal-change',
      reEvaluatedAt: now(),
    };
  }

  // Redaction gate — BridgeConsumesRedactedOnly.
  // Two valid shapes:
  //   1. Composition-style: privacyBoundary.redacted (boolean, derived upstream)
  //   2. Adapter-style: rawCommandsIncluded / rawWindowTitlesIncluded / secretsIncluded
  //      (three component booleans, no derived field) — match the live receipt
  //      shape written by scripts/holoshell-brittney-context.mjs.
  if (context && context.privacyBoundary) {
    const pb = context.privacyBoundary;
    let notRedacted = false;
    if (pb.redacted === false) {
      notRedacted = true;
    } else if (pb.redacted === undefined) {
      // Defensive: if any of the three component flags is explicitly true, the
      // context is NOT safe to consume.
      notRedacted =
        pb.rawCommandsIncluded === true ||
        pb.rawWindowTitlesIncluded === true ||
        pb.secretsIncluded === true;
    }
    if (notRedacted) {
      return {
        bridgeApplyId: randomBytes(8).toString('hex'),
        appliedAt: now(),
        skipped: true,
        skipReason: 'context-not-redacted',
        sourceHashes: hashes,
      };
    }
  }

  const { calls, summary } = computeBridge({ context, runtime, personalization });

  const receipt = {
    bridgeApplyId: randomBytes(8).toString('hex'),
    receiptType: 'hololand.holoshell.natural-phenomena-bridge.v0.1.0',
    appliedAt: now(),
    skipped: false,
    sources: {
      contextReceipt: paths.contextReceipt,
      runtimeReceipt: paths.runtimeReceipt,
      personalizationProfile: paths.personalizationProfile,
    },
    sourceHashes: hashes,
    redactedConfirmed: confirmRedacted(context),
    calls,
    summary,
  };

  // Write receipt — best-effort, don't crash if .tmp is unwritable.
  try {
    mkdirSync(dirname(paths.bridgeReceipt), { recursive: true });
    writeFileSync(paths.bridgeReceipt, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  } catch (err) {
    receipt.writeError = err.message;
  }

  return receipt;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv = process.argv.slice(2)) {
  const args = { json: false, dryRun: false, paths: { ...DEFAULTS } };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--context') args.paths.contextReceipt = resolve(argv[++i]);
    else if (arg === '--runtime') args.paths.runtimeReceipt = resolve(argv[++i]);
    else if (arg === '--personalization') args.paths.personalizationProfile = resolve(argv[++i]);
    else if (arg === '--receipt') args.paths.bridgeReceipt = resolve(argv[++i]);
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write(`Usage: node scripts/holoshell-natural-phenomena-bridge.mjs [options]

Options:
  --json                       JSON output
  --dry-run                    Compute mapping without writing receipt
  --context <path>             Override context receipt path
  --runtime <path>             Override runtime receipt path
  --personalization <path>     Override personalization profile path
  --receipt <path>             Override bridge receipt write path
  --help, -h                   Show this message
`);
      process.exit(0);
    }
  }
  return args;
}

function isMain() {
  try {
    return resolve(process.argv[1] || '') === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const args = parseArgs();
  let receipt;
  if (args.dryRun) {
    const context = safeReadJson(args.paths.contextReceipt);
    const runtime = safeReadJson(args.paths.runtimeReceipt);
    const personalization = safeReadJson(args.paths.personalizationProfile);
    const computed = computeBridge({ context, runtime, personalization });
    receipt = {
      dryRun: true,
      sourceHashes: sourceHashes(context, runtime, personalization),
      ...computed,
    };
  } else {
    receipt = applyBridge({ paths: args.paths });
  }
  if (args.json) {
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } else {
    process.stdout.write(`bridge: ${receipt.skipped ? `SKIPPED (${receipt.skipReason})` : 'APPLIED'}\n`);
    if (receipt.summary) {
      process.stdout.write(`  BubbleField.set_density        = ${receipt.summary.bubbleDensity}\n`);
      process.stdout.write(`  FireSource.set_activity         = ${receipt.summary.fireActivity.toFixed(3)}\n`);
      process.stdout.write(`  LeafField.set_incoming_rate     = ${receipt.summary.leafIncomingRate.toFixed(3)}\n`);
      process.stdout.write(`  HoloShellRouter.set_brittney_scene = ${receipt.summary.routerScene ?? '(unchanged)'}\n`);
    }
    if (receipt.bridgeApplyId) {
      process.stdout.write(`  bridge_apply_id = ${receipt.bridgeApplyId}\n`);
    }
    if (!args.dryRun && receipt.bridgeApplyId) {
      process.stdout.write(`  receipt: ${args.paths.bridgeReceipt}\n`);
    }
  }
}
