#!/usr/bin/env node
/**
 * HoloShell desktop-control planner.
 *
 * Plan-only bridge for the Brittney Studio desktop app. Brittney stays the
 * user-facing operator; Fara is the GUI-grounding lane for screenshot and
 * coordinate-bearing desktop control. This script never clicks, types, opens,
 * deletes, sends, buys, installs, or changes settings.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DESKTOP_CONTROL_SCHEMA = 'hololand.holoshell.desktop-control-plan.v0.1.0';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_TMP = '.tmp/holoshell';
const DEFAULT_PLAN_DIR = path.join(DEFAULT_TMP, 'desktop-control-plans');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'desktop-control-latest.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'desktop-control-latest.js');
const SOURCE_CONTRACT = 'apps/holoshell/source/holoshell-desktop-control-bridge.hsplus';
const FARA_MODELS = [
  'fara:7b',
  'hf.co/bartowski/microsoft_Fara-7B-GGUF:Q4_K_M',
  'qwen3-vl:4b',
];

function usage() {
  return `Usage: node scripts/holoshell-desktop-control-plan.mjs --intent "click the Save button" [options]

Options:
  --intent <text>       Desktop-control intent to plan
  --actor <id>          Actor name for the receipt, default brittney
  --output <path>       Latest receipt path
  --js-output <path>    Browser bootstrap path
  --plan-dir <path>     Receipt history directory
  --created-at <iso>    Stable timestamp for tests
  --json                Print the full receipt
  --self-test           Use a deterministic self-test intent if --intent is omitted
`;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    intent: '',
    actor: 'brittney',
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    planDir: DEFAULT_PLAN_DIR,
    createdAt: '',
    json: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--intent') args.intent = argv[++index] || '';
    else if (arg === '--actor') args.actor = argv[++index] || args.actor;
    else if (arg === '--output') args.output = argv[++index] || args.output;
    else if (arg === '--js-output') args.jsOutput = argv[++index] || args.jsOutput;
    else if (arg === '--plan-dir') args.planDir = argv[++index] || args.planDir;
    else if (arg === '--created-at') args.createdAt = argv[++index] || '';
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.intent && args.selfTest) {
    args.intent = 'Use Fara to inspect the current screen and plan how to click the Save button.';
  }
  if (!args.intent.trim()) throw new Error('--intent is required');
  return args;
}

function repoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function hashText(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function stableId(prefix, text) {
  return `${prefix}_${hashText(text).slice(0, 12)}`;
}

function hasAny(text, pattern) {
  return pattern.test(text);
}

function normalizeUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return new URL(text).href;
  } catch {
    return text;
  }
}

function extractFirstUrl(text) {
  const match = String(text || '').match(/\bhttps?:\/\/[^\s<>"']+/iu);
  if (!match) return '';
  return normalizeUrl(match[0].replace(/[),.;!?]+$/u, ''));
}

function stripNegatedSafetyClauses(text) {
  return String(text || '').replace(
    /\b(do not|don't|never|avoid|without|no)\b[^.?!]*(password|credential|login|purchase|buy|payment|delete|remove|registry|install|uninstall|send|post|wallet|trezor)[^.?!]*/giu,
    ' ',
  );
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function classifyIntent(intent) {
  const text = String(intent || '').toLowerCase();
  const targetUrl = extractFirstUrl(intent);
  const riskText = stripNegatedSafetyClauses(text);
  const desktopRelevant = hasAny(
    text,
    /\b(screen|desktop|window|app|application|browser|chrome|edge|excel|word|powerpoint|terminal|button|click|type|hotkey|keyboard|mouse|focus|open|launch|control|save|submit|scroll|tab)\b/u,
  );
  const breakGlass = hasAny(
    riskText,
    /\b(password|credential|login|purchase|buy|payment|delete|remove files?|registry|install|uninstall|send (an? )?(email|message|dm)|post publicly|wallet|trezor)\b/u,
  );
  const readOnly = hasAny(text, /\b(inspect|look|see|describe|summarize|what is|which window|identify|find)\b/u)
    && !hasAny(text, /\b(click|type|press|open|launch|submit|save|send|delete|install|uninstall|change)\b/u);

  let primaryAction = 'inspect_screen';
  if (hasAny(text, /\b(click|button|press)\b/u)) primaryAction = 'click_control';
  else if (hasAny(text, /\b(type|enter text|write into|fill)\b/u)) primaryAction = 'type_text';
  else if (hasAny(text, /\b(hotkey|shortcut|ctrl|alt|shift|tab)\b/u)) primaryAction = 'hotkey';
  else if (hasAny(text, /\b(open|launch|start)\b/u)) primaryAction = hasAny(text, /\b(browser|url|website|youtube|chrome|edge)\b|https?:\/\//u) ? 'open_url' : 'launch_app';
  else if (hasAny(text, /\b(focus|activate|switch)\b/u)) primaryAction = 'focus_window';

  const permissionEnvelope = breakGlass ? 'break_glass' : readOnly ? 'read_only' : 'guarded_execute';
  return {
    relevant: desktopRelevant,
    primaryAction,
    targetUrl,
    permissionEnvelope,
    approvalRequired: permissionEnvelope !== 'read_only',
    founderReviewRequired: permissionEnvelope === 'break_glass',
    screenshotRequired: primaryAction !== 'launch_app' || hasAny(text, /\b(screen|window|button|click|focus|where|which|identify)\b/u),
  };
}

function actionLabel(action) {
  const labels = {
    inspect_screen: 'Inspect screen',
    focus_window: 'Focus window',
    launch_app: 'Launch app',
    open_url: 'Open URL',
    click_control: 'Click control',
    type_text: 'Type text',
    hotkey: 'Press hotkey',
  };
  return labels[action] || action;
}

function buildActions({ intent, classification }) {
  const actions = [
    {
      id: 'capture-screen-context',
      action: 'inspect_screen',
      label: 'Capture/inspect current desktop context',
      permissionEnvelope: 'read_only',
      approvalRequired: false,
      executor: 'desktop_app',
      receiptRequired: true,
    },
  ];

  if (classification.screenshotRequired) {
    actions.push({
      id: 'fara-visual-grounding',
      action: 'fara_visual_grounding',
      label: 'Ask Fara to ground the target in the screenshot',
      permissionEnvelope: 'read_only',
      approvalRequired: false,
      modelLane: 'fara_gui_grounding',
      recommendedModel: FARA_MODELS[0],
      fallbackModels: FARA_MODELS.slice(1),
      outputFormat: 'json_action_plan',
      mayExecute: false,
      receiptRequired: true,
    });
  }

  actions.push({
    id: 'stage-control-action',
    action: classification.primaryAction,
    label: actionLabel(classification.primaryAction),
    intent,
    permissionEnvelope: classification.permissionEnvelope,
    approvalRequired: classification.approvalRequired,
    founderReviewRequired: classification.founderReviewRequired,
    executionDefault: classification.founderReviewRequired ? 'blocked_until_review' : 'staged_not_run',
    mayExecute: false,
    receiptRequired: true,
  });

  actions.push({
    id: 'write-control-receipt',
    action: 'write_receipt',
    label: 'Write desktop-control plan receipt',
    permissionEnvelope: 'read_only',
    approvalRequired: false,
    receiptRequired: true,
  });

  return actions;
}

export function buildDesktopControlPlan(options = {}) {
  const intent = String(options.intent || '').trim();
  if (!intent) throw new Error('Desktop control plan requires intent');
  const generatedAt = options.createdAt || new Date().toISOString();
  const classification = options.classification || classifyIntent(intent);
  const actions = buildActions({ intent, classification });
  const planId = stableId('desktop_control_plan', `${generatedAt}:${intent}`);
  const status = !classification.relevant
    ? 'not_desktop_control'
    : classification.founderReviewRequired
      ? 'blocked_break_glass'
      : 'plan_ready';

  return {
    schemaVersion: DESKTOP_CONTROL_SCHEMA,
    planId,
    generatedAt,
    actor: options.actor || 'brittney',
    sourceAnchors: {
      source: SOURCE_CONTRACT,
      bridgeScript: 'scripts/holoshell-desktop-control-plan.mjs',
      desktopAppPlanEndpoint: 'POST /api/desktop-control/plan',
      desktopAppChatEndpoint: 'POST /api/brittney/chat',
    },
    intent: {
      raw: intent,
      sha256: hashText(intent),
      primaryAction: classification.primaryAction,
      relevant: classification.relevant,
    },
    target: {
      operation: classification.primaryAction,
      url: classification.targetUrl || '',
    },
    modelPolicy: {
      lane: 'fara_gui_grounding',
      purpose: 'desktop GUI grounding and screenshot-to-action planning',
      recommendedModel: FARA_MODELS[0],
      fallbackModels: FARA_MODELS.slice(1),
      mayExecute: false,
    },
    permission: {
      envelope: classification.permissionEnvelope,
      approvalRequired: classification.approvalRequired,
      founderReviewRequired: classification.founderReviewRequired,
      requiresFreshUserGesture: classification.approvalRequired,
      screenshotRequired: classification.screenshotRequired,
    },
    actions,
    proposal: {
      operation: classification.primaryAction,
      lane: 'desktop_control',
      modelLane: 'fara_gui_grounding',
      permissionEnvelope: classification.permissionEnvelope,
      approvalRequired: classification.approvalRequired,
      receiptRequired: true,
      label: actionLabel(classification.primaryAction),
      mayExecute: false,
    },
    receipt: {
      id: stableId('receipt', `${planId}:${status}`),
      receiptType: DESKTOP_CONTROL_SCHEMA,
      actor: options.actor || 'brittney',
      destructiveActionsTaken: false,
      secretsExposedToShell: false,
      rollback: 'not_applicable_for_plan_only',
    },
    summary: {
      status,
      relevant: classification.relevant,
      primaryAction: classification.primaryAction,
      permissionEnvelope: classification.permissionEnvelope,
      approvalRequired: classification.approvalRequired,
      founderReviewRequired: classification.founderReviewRequired,
      screenshotRequired: classification.screenshotRequired,
      modelLane: 'fara_gui_grounding',
      recommendedModel: FARA_MODELS[0],
      actionCount: actions.length,
      mayExecute: false,
      blockedReasons: classification.founderReviewRequired
        ? ['break_glass_desktop_control_requires_founder_review']
        : [],
      nextSafeStep: classification.founderReviewRequired
        ? 'Stop at the plan receipt and request founder review before any desktop mutation.'
        : classification.approvalRequired
          ? 'Show the staged plan and require a fresh user gesture before any execution route.'
          : 'Use the read-only inspection plan and keep the receipt.',
    },
  };
}

function writeJson(filePath, data) {
  const resolved = repoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, receipt) {
  const resolved = repoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(receipt, null, 2).replace(/<\/script/giu, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_DESKTOP_CONTROL_PLAN = ${payload};\n`, 'utf8');
  return resolved;
}

export function persistDesktopControlPlan(receipt, args = {}) {
  const planPath = writeJson(path.join(args.planDir || DEFAULT_PLAN_DIR, `${receipt.planId}.json`), receipt);
  const latestPath = writeJson(args.output || DEFAULT_OUTPUT, receipt);
  const jsPath = writeBrowserBootstrap(args.jsOutput || DEFAULT_JS_OUTPUT, receipt);
  return { planPath, latestPath, jsPath };
}

export function controlProposalFromReceipt(receipt) {
  if (!receipt?.summary?.relevant) return null;
  return {
    operation: receipt.proposal.operation,
    lane: receipt.proposal.lane,
    modelLane: receipt.proposal.modelLane,
    permissionEnvelope: receipt.proposal.permissionEnvelope,
    approvalRequired: receipt.proposal.approvalRequired,
    receiptRequired: receipt.proposal.receiptRequired,
    label: receipt.proposal.label,
  };
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMain()) {
  try {
    const args = parseArgs();
    const receipt = buildDesktopControlPlan(args);
    const paths = persistDesktopControlPlan(receipt, args);
    if (args.selfTest) {
      const failures = [];
      if (receipt.schemaVersion !== DESKTOP_CONTROL_SCHEMA) failures.push('schema mismatch');
      if (receipt.summary.modelLane !== 'fara_gui_grounding') failures.push('missing Fara lane');
      if (receipt.receipt.destructiveActionsTaken !== false) failures.push('plan must not mutate');
      if (!receipt.actions.some((action) => action.id === 'fara-visual-grounding')) failures.push('missing Fara grounding action');
      if (failures.length) throw new Error(`self-test failed: ${failures.join(', ')}`);
    }
    if (args.json) {
      console.log(JSON.stringify({ paths, receipt }, null, 2));
    } else {
      console.log(`HoloShell desktop-control plan: ${paths.planPath}`);
      console.log(`Latest: ${paths.latestPath}`);
      console.log(`Bootstrap: ${paths.jsPath}`);
      console.log(`Status: ${receipt.summary.status}`);
      console.log(`Model lane: ${receipt.summary.modelLane} (${receipt.summary.recommendedModel})`);
      console.log(`Permission: ${receipt.summary.permissionEnvelope}`);
    }
  } catch (error) {
    console.error(`holoshell-desktop-control-plan failed: ${error.message}`);
    process.exit(1);
  }
}
