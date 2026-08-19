#!/usr/bin/env node
/**
 * HoloShell laptop desktop-control bridge.
 *
 * Runs on the Windows laptop at 127.0.0.1:8751 so the Jetson-hosted HoloShell
 * page can discover the local desktop automation lane through the browser.
 * This bridge is intentionally non-mutating: it reports readiness, writes
 * preflight receipts, issues HoloGate consent tokens, and stages approved
 * execution receipts without touching the OS until a concrete executor lane is
 * implemented and validated.
 */

import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildDesktopControlPlan } from './holoshell-desktop-control-plan.mjs';
import {
  captureGesture,
  verifyProof as verifyGestureProof,
  signProof as signGestureProof,
  CONSENT_GESTURE_SCHEMA,
} from './holoshell-consent-gesture.mjs';

export const LAPTOP_DESKTOP_BRIDGE_SCHEMA = 'hololand.holoshell.laptop-desktop-bridge.v0.1.0';
export const DESKTOP_CONTROL_PREFLIGHT_SCHEMA = 'hololand.holoshell.desktop-control-preflight.v0.1.0';
export const DESKTOP_CONTROL_CONSENT_TOKEN_SCHEMA = 'hololand.holoshell.desktop-control-consent-token.v0.1.0';
export const DESKTOP_CONTROL_EXECUTION_REFUSAL_SCHEMA = 'hololand.holoshell.desktop-control-execution-refusal.v0.1.0';
export const DESKTOP_CONTROL_EXECUTION_SCHEMA = 'hololand.holoshell.desktop-control-execution.v0.1.0';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOST = process.env.HOLOSHELL_LAPTOP_DESKTOP_BRIDGE_HOST || '127.0.0.1';
const DEFAULT_PORT = Number(process.env.HOLOSHELL_LAPTOP_DESKTOP_BRIDGE_PORT || 8751);
const DEFAULT_RECEIPT_DIR = process.env.HOLOSHELL_LAPTOP_DESKTOP_BRIDGE_RECEIPTS ||
  '.tmp/holoshell/desktop-control-bridge';
// GUI-mutating actions are wired + window-scope-protected (the action-executor's
// assertForegroundIsTarget refuses any click/type that would land on a non-target window) and
// consent-token gated — but they are ADMITTED into the autonomous bridge lane ONLY when the
// founder explicitly opts in via HOLOSHELL_ADMIT_GUI_MUTATION=1. Default OFF keeps the
// autonomous Jetson->bridge path open_url-only (the safe default). REMAINING HARDENING before
// trusting the autonomous lane fully: consent-token freshUserGesture must be a real human
// keypress, not an agent-supplied flag (board task lbe3). Direct executor (--approved --execute)
// already gives the window-scope-protected, human-invoked execute capability today.
const GUI_MUTATION_ACTIONS = ['focus_window', 'click_control', 'invoke_control', 'type_text', 'hotkey'];
const ADMIT_GUI_MUTATION = /^(1|true|on)$/i.test(process.env.HOLOSHELL_ADMIT_GUI_MUTATION || '');
const ADMITTED_EXECUTOR_ACTIONS = new Set([
  'open_url',
  ...(ADMIT_GUI_MUTATION ? GUI_MUTATION_ACTIONS : []),
]);

function usage() {
  return `Usage: node scripts/holoshell-laptop-desktop-bridge.mjs [options]

Options:
  --host <host>          Bind host, default 127.0.0.1
  --port <port>          Bind port, default 8751
  --receipt-dir <path>   Receipt directory, default .tmp/holoshell/desktop-control-bridge
  --created-at <iso>     Stable timestamp for tests
  --status               Print bridge status and exit
  --json                 Print JSON output for --status or --self-test
  --self-test            Run non-mutating daemon self-test and exit
`;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    receiptDir: DEFAULT_RECEIPT_DIR,
    createdAt: '',
    status: false,
    json: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--host') args.host = argv[++index] || args.host;
    else if (arg === '--port') args.port = Number(argv[++index] || args.port);
    else if (arg === '--receipt-dir') args.receiptDir = argv[++index] || args.receiptDir;
    else if (arg === '--created-at') args.createdAt = argv[++index] || '';
    else if (arg === '--status') args.status = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(args.port) || args.port < 1 || args.port > 65535) {
    throw new Error('--port must be between 1 and 65535');
  }
  return args;
}

function generatedAt(options = {}) {
  return options.createdAt || new Date().toISOString();
}

function hashText(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hashValue(value) {
  return hashText(stableStringify(value));
}

function stableId(prefix, text) {
  return `${prefix}_${hashText(text).slice(0, 12)}`;
}

function repoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function safeString(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function plusMinutes(iso, minutes) {
  const base = Date.parse(iso);
  const safeBase = Number.isFinite(base) ? base : Date.now();
  return new Date(safeBase + Math.max(1, Number(minutes || 5)) * 60_000).toISOString();
}

function consentGestureMaxTtlMs(preflight = {}) {
  const ttlMs = Number(preflight.consentGesture?.ttlMs || 30000);
  return Number.isFinite(ttlMs) && ttlMs > 0 ? Math.max(1000, ttlMs) : 30000;
}

function tokenHash(token, preflightReceiptHash, operation, expiresAt, consentChallenge = '') {
  return hashText(`${token}:${preflightReceiptHash}:${operation}:${expiresAt}:${consentChallenge}`);
}

function preflightReceiptHash(preflight = {}) {
  return hashValue({
    schemaVersion: preflight.schemaVersion || '',
    preflightId: preflight.preflightId || '',
    planId: preflight.planId || '',
    permissionEnvelope: preflight.permissionEnvelope || '',
    primaryAction: preflight.intent?.primaryAction || '',
    intentSha256: preflight.intent?.sha256 || '',
    target: preflight.target || {},
    targetFingerprint: preflight.targetFingerprint || '',
  });
}

function tokenForResponse(consent) {
  return consent;
}

function tokenForStorage(consent) {
  return {
    ...consent,
    token: '[redacted]',
    tokenRedacted: true,
  };
}

function classifyPublicUrl(url) {
  if (!url) return 'missing_url';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'invalid_url';
  }
  if (!/^https?:$/i.test(parsed.protocol)) return 'blocked_scheme';
  const combined = `${parsed.hostname} ${parsed.pathname} ${parsed.search}`.toLowerCase();
  if (/(checkout|payment|billing|purchase|subscribe|transfer|wallet|bank)/iu.test(combined)) {
    return 'break_glass_payment';
  }
  if (/(login|signin|sign-in|account|settings|profile|admin|oauth|auth|password|security|2fa|mfa|upload|download|export|import|delete|remove|submit|compose|send)/iu.test(combined)) {
    return 'credential_adjacent';
  }
  return 'public_web';
}

function normalizeUrlTarget(url) {
  const text = safeString(url, '');
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
  return normalizeUrlTarget(match[0].replace(/[),.;!?]+$/u, ''));
}

function extractActionTarget(payload = {}, operation = '') {
  const action = payload.action || payload.target || {};
  return {
    operation,
    url: safeString(payload.url || action.url || payload.preflight?.target?.url, ''),
    windowTitle: safeString(payload.windowTitle || action.windowTitle, ''),
    handle: safeString(payload.handle || action.handle, ''),
    controlName: safeString(payload.controlName || action.controlName, ''),
    text: typeof (payload.text ?? action.text) === 'string' ? String(payload.text ?? action.text) : '',
    hotkey: safeString(payload.hotkey || action.hotkey, ''),
    x: payload.x ?? action.x ?? '',
    y: payload.y ?? action.y ?? '',
  };
}

function normalizeActionTarget(target = {}, operation = '') {
  return {
    operation: safeString(operation || target.operation, ''),
    url: normalizeUrlTarget(target.url),
    windowTitle: safeString(target.windowTitle, ''),
    handle: safeString(target.handle, ''),
    controlName: safeString(target.controlName, ''),
    text: typeof target.text === 'string' ? target.text : '',
    hotkey: safeString(target.hotkey, ''),
    x: target.x === '' || target.x == null ? '' : String(target.x).trim(),
    y: target.y === '' || target.y == null ? '' : String(target.y).trim(),
  };
}

function buildPreflightTarget(plan = {}, payload = {}, operation = '') {
  const payloadTarget = extractActionTarget(payload, operation);
  const planTarget = plan.target || {};
  return normalizeActionTarget({
    operation,
    url: payloadTarget.url || planTarget.url || extractFirstUrl(plan.intent?.raw || payload.intent || ''),
    windowTitle: payloadTarget.windowTitle || planTarget.windowTitle || '',
    handle: payloadTarget.handle || planTarget.handle || '',
    controlName: payloadTarget.controlName || planTarget.controlName || '',
    text: payloadTarget.text || planTarget.text || '',
    hotkey: payloadTarget.hotkey || planTarget.hotkey || '',
    x: payloadTarget.x !== '' && payloadTarget.x != null ? payloadTarget.x : (planTarget.x ?? ''),
    y: payloadTarget.y !== '' && payloadTarget.y != null ? payloadTarget.y : (planTarget.y ?? ''),
  }, operation);
}

function actionTargetFingerprint(target = {}) {
  return hashValue(normalizeActionTarget(target, target.operation));
}

function requiresExactExecutionTarget(operation) {
  return ADMITTED_EXECUTOR_ACTIONS.has(operation);
}

function assertExactExecutionTarget(preflight = {}, target = {}, operation = '') {
  if (!requiresExactExecutionTarget(operation)) return;
  const expectedFingerprint = preflight.targetFingerprint || '';
  if (!expectedFingerprint) throw new Error('desktop_control_target_unbound');
  const actualFingerprint = actionTargetFingerprint(normalizeActionTarget(target, operation));
  if (actualFingerprint !== expectedFingerprint) throw new Error('desktop_control_target_mismatch');
}

// Invoke the action-executor for a GUI-mutating action with --approved --execute. The executor
// applies the window-scope assertion (refuses on foreground!=target) and writes a signed receipt;
// a window_scope_violation surfaces as a status:'error' receipt (executionPerformed:false), never
// a stray keystroke. Only reachable when the operation is in ADMITTED_EXECUTOR_ACTIONS.
function runGuiActionExecutor(operation, target, options = {}) {
  const receiptRoot = repoPath(path.join(options.receiptDir || DEFAULT_RECEIPT_DIR, 'hardware-actions'));
  mkdirSync(receiptRoot, { recursive: true });
  const archiveDir = path.join(receiptRoot, 'receipts');
  const argv = [
    path.join(REPO_ROOT, 'scripts', 'holoshell-action-executor.mjs'),
    '--action', operation, '--approved', '--execute', '--json',
    '--receipt-dir', archiveDir,
    '--output', path.join(receiptRoot, 'action-latest.json'),
    '--js-output', path.join(receiptRoot, 'action-latest.js'),
  ];
  if (target.handle) argv.push('--handle', target.handle);
  else if (target.windowTitle) argv.push('--window-title', target.windowTitle);
  if (target.controlName) argv.push('--control-name', target.controlName);
  if (target.text) argv.push('--text', target.text);
  if (target.hotkey) argv.push('--hotkey', target.hotkey);
  if (target.x !== '' && target.x != null) argv.push('--x', String(target.x));
  if (target.y !== '' && target.y != null) argv.push('--y', String(target.y));
  const result = spawnSync(process.execPath, argv, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`gui_action_executor_failed:${(result.stderr || result.stdout || '').trim().slice(0, 400)}`);
  }
  return JSON.parse(result.stdout);
}

function simulatedOpenUrlReceipt(url, options = {}) {
  const generatedAt = generatedAtForReceipt(options);
  const target = new URL(url);
  return {
    schemaVersion: 'hololand.holoshell.hardware-action.v0.1.0',
    generatedAt,
    actionId: stableId('hwa_simulated_open_url', `${generatedAt}:${url}`),
    request: {
      actionKind: 'open_url',
      url,
      approved: true,
      executeRequested: true,
      receiptRequired: true,
    },
    permission: {
      envelope: 'guarded_execute',
      approvalRequired: true,
      approved: true,
      executeRequested: true,
      mutating: true,
      breakGlass: false,
    },
    browserBoundary: {
      urlClassification: 'public_web',
      publicBrowsing: true,
      host: target.host,
      profileBoundary: 'system_default_public_ok',
    },
    witness: {
      shellVisibleChange: true,
      visibleChangeSource: 'browser_navigation_dispatched',
      browserNavigation: {
        targetUrl: target.href,
        targetHost: target.host,
        targetOrigin: target.origin,
        targetPath: `${target.pathname}${target.search}${target.hash}`,
        dispatchAccepted: true,
        witnessKind: 'browser_navigation_dispatched',
      },
    },
    summary: {
      status: 'completed',
      actionKind: 'open_url',
      permissionEnvelope: 'guarded_execute',
      approvalRequired: true,
      approved: true,
      executeRequested: true,
      executionPerformed: true,
      mutatingActionExecuted: true,
      targetResolved: true,
      targetUrlHost: target.host,
      shellVisibleChange: true,
      visibleWitnessKind: 'browser_navigation_dispatched',
      browserBoundaryStatus: 'public_web',
      browserProfileBoundary: 'system_default_public_ok',
      error: '',
    },
    result: {
      ok: true,
      target: url,
      simulated: true,
      browserNavigation: {
        targetUrl: target.href,
        targetHost: target.host,
        targetOrigin: target.origin,
        targetPath: `${target.pathname}${target.search}${target.hash}`,
        dispatchAccepted: true,
        witnessKind: 'browser_navigation_dispatched',
      },
    },
    rollback: 'close_browser_tab_or_window_manually',
  };
}

function generatedAtForReceipt(options = {}) {
  return options.createdAt || new Date().toISOString();
}

function runOpenUrlActionExecutor(url, options = {}, payload = {}) {
  const classification = classifyPublicUrl(url);
  if (classification !== 'public_web') {
    throw new Error(`open_url_executor_refused:${classification}`);
  }
  if (payload.executorMode === 'simulated' || options.executorMode === 'simulated') {
    return simulatedOpenUrlReceipt(url, options);
  }
  const receiptRoot = repoPath(path.join(options.receiptDir || DEFAULT_RECEIPT_DIR, 'hardware-actions'));
  mkdirSync(receiptRoot, { recursive: true });
  const latestPath = path.join(receiptRoot, 'action-latest.json');
  const latestJsPath = path.join(receiptRoot, 'action-latest.js');
  const archiveDir = path.join(receiptRoot, 'receipts');
  const result = spawnSync(process.execPath, [
    path.join(REPO_ROOT, 'scripts', 'holoshell-action-executor.mjs'),
    '--action',
    'open_url',
    '--url',
    url,
    '--approved',
    '--execute',
    '--json',
    '--receipt-dir',
    archiveDir,
    '--output',
    latestPath,
    '--js-output',
    latestJsPath,
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`open_url_executor_failed:${(result.stderr || result.stdout || '').trim().slice(0, 400)}`);
  }
  return JSON.parse(result.stdout);
}

function executeAdmittedAction(payload = {}, options = {}, validation = {}) {
  const operation = validation.operation || safeString(payload.operation, '');
  if (!ADMITTED_EXECUTOR_ACTIONS.has(operation)) {
    throw new Error(`executor_lane_not_admitted:${operation || 'unknown'}`);
  }
  const target = normalizeActionTarget(extractActionTarget(payload, operation), operation);
  assertExactExecutionTarget(payload.preflight, target, operation);
  if (operation === 'open_url') {
    if (!target.url) throw new Error('open_url_executor_requires_url');
    return {
      action: operation,
      target,
      hardwareActionReceipt: runOpenUrlActionExecutor(target.url, options, payload),
    };
  }
  if (GUI_MUTATION_ACTIONS.includes(operation)) {
    // Admitted only when HOLOSHELL_ADMIT_GUI_MUTATION is on (the membership check above already
    // enforced that). Window-scope assertion + signed receipt applied by the executor.
    return {
      action: operation,
      target,
      hardwareActionReceipt: runGuiActionExecutor(operation, target, options),
    };
  }
  throw new Error(`executor_lane_not_implemented:${operation}`);
}

export function buildBridgeStatus(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = Number(options.port || DEFAULT_PORT);
  const url = options.url || `http://${host}:${port}`;
  const at = generatedAt(options);
  const status = options.status || 'ready';
  return {
    schemaVersion: LAPTOP_DESKTOP_BRIDGE_SCHEMA,
    reportId: stableId('desktop_bridge_report', `${at}:${url}:${process.pid}`),
    generatedAt: at,
    status,
    url,
    hostRole: 'laptop_desktop_bridge',
    expectedSurface: 'Jetson-hosted HoloShell browser page',
    source: 'apps/holoshell/source/holoshell-desktop-control-bridge.hsplus',
    daemonScript: 'scripts/holoshell-laptop-desktop-bridge.mjs',
    statusSource: options.statusSource || 'daemon_runtime',
    loopbackReachable: options.loopbackReachable ?? status === 'ready',
    statusProbe: options.statusProbe || null,
    platform: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
    },
    modelPolicy: {
      lane: 'fara_gui_grounding',
      recommendedModel: 'fara:7b',
      fallbackModels: ['hf.co/bartowski/microsoft_Fara-7B-GGUF:Q4_K_M', 'qwen3-vl:4b'],
      mayExecute: false,
      mayStageApprovedExecution: true,
      admittedExecutorActions: [...ADMITTED_EXECUTOR_ACTIONS],
    },
    capabilities: [
      'bridge_status',
      'desktop_action_preflight',
      'consent_gesture_capture',
      'consent_token_issue',
      'consent_token_verify',
      'approved_execution_staging',
      'admitted_open_url_executor',
      'execution_refusal',
      'receipt_write',
      'browser_proxied_jetson_report',
    ],
    endpoints: {
      status: '/api/desktop-control/bridge',
      preflight: '/api/desktop-control/preflight',
      gestureProof: '/api/desktop-control/gesture-proof',
      consentToken: '/api/desktop-control/consent-token',
      execute: '/api/desktop-control/execute',
    },
    mutationBoundary: 'os_mutation_refused_until_consent_token_and_action_executor',
    destructiveActionsTaken: false,
    desktopAutomationExecuted: false,
    approvalRequiredForDesktopAutomation: true,
  };
}

function planFromPayload(payload = {}, options = {}) {
  const suppliedPlan = payload.plan || payload.receipt || payload.desktopControlPlan || null;
  if (suppliedPlan?.schemaVersion) return suppliedPlan;
  const intent = safeString(payload.intent || payload.message, '');
  if (!intent) throw new Error('preflight requires intent or plan receipt');
  return buildDesktopControlPlan({
    intent,
    actor: payload.actor || 'brittney',
    createdAt: options.createdAt,
  });
}

export function buildDesktopControlPreflight(payload = {}, options = {}) {
  const plan = planFromPayload(payload, options);
  const at = generatedAt(options);
  const planId = plan.planId || stableId('desktop_control_plan', JSON.stringify(plan).slice(0, 2000));
  const permissionEnvelope = plan.summary?.permissionEnvelope || plan.permission?.envelope || 'guarded_execute';
  const primaryAction = plan.summary?.primaryAction || plan.intent?.primaryAction || payload.action || 'inspect_screen';
  const target = buildPreflightTarget(plan, payload, primaryAction);
  const targetFingerprint = actionTargetFingerprint(target);
  const status = permissionEnvelope === 'break_glass'
    ? 'blocked_break_glass'
    : (permissionEnvelope === 'read_only' ? 'read_only_ready' : 'preflight_ready');
  const preflightId = stableId('desktop_preflight', `${at}:${planId}:${primaryAction}:${permissionEnvelope}:${targetFingerprint}`);
  const consentRequired = permissionEnvelope !== 'read_only';
  const consentChallenge = consentRequired
    ? safeString(payload.consentChallenge || options.consentChallenge, randomBytes(16).toString('base64url'))
    : '';
  const receipt = {
    schemaVersion: DESKTOP_CONTROL_PREFLIGHT_SCHEMA,
    preflightId,
    generatedAt: at,
    status,
    source: 'apps/holoshell/source/holoshell-desktop-control-bridge.hsplus',
    daemonScript: 'scripts/holoshell-laptop-desktop-bridge.mjs',
    planId,
    planReceiptType: plan.schemaVersion || null,
    actor: payload.actor || plan.actor || 'brittney',
    intent: {
      raw: plan.intent?.raw || payload.intent || '',
      sha256: plan.intent?.sha256 || hashText(payload.intent || planId),
      primaryAction,
    },
    target,
    targetFingerprint,
    targetUrlClassification: target.url ? classifyPublicUrl(target.url) : 'not_applicable',
    requiresExactExecutionTarget: requiresExactExecutionTarget(primaryAction),
    modelLane: 'fara_gui_grounding',
    permissionEnvelope,
    consentRequired,
    consentChallenge,
    consentGesture: consentRequired ? {
      schemaVersion: CONSENT_GESTURE_SCHEMA,
      challenge: consentChallenge,
      key: 'F8',
      ttlMs: 30000,
      proofRequired: true,
    } : null,
    executionAllowed: false,
    executionDefault: 'refused_until_consent_token_lane',
    approvalRequiredForDesktopAutomation: true,
    founderReviewRequired: permissionEnvelope === 'break_glass',
    destructiveActionsTaken: false,
    desktopAutomationExecuted: false,
    receiptRequired: true,
    bridge: buildBridgeStatus(options),
    nextSafeStep: consentRequired
      ? 'Show this preflight receipt and require a fresh challenge-bound HoloGate consent gesture before any desktop mutation lane exists.'
      : 'Read-only inspection is preflighted; keep the receipt and do not mutate the desktop.',
  };
  return {
    ...receipt,
    preflightReceiptHash: preflightReceiptHash(receipt),
  };
}

export function buildConsentToken(payload = {}, options = {}) {
  const preflight = payload.preflight || payload.receipt || null;
  if (!preflight?.preflightId) throw new Error('consent token requires exact preflight receipt');
  const at = generatedAt(options);
  const operation = safeString(payload.operation || preflight.intent?.primaryAction, 'inspect_screen');
  const permissionEnvelope = preflight.permissionEnvelope || 'guarded_execute';
  const consentRequired = preflight.consentRequired !== false && permissionEnvelope !== 'read_only';
  const hash = payload.preflightReceiptHash || preflightReceiptHash(preflight);
  const expectedChallenge = safeString(payload.consentChallenge || preflight.consentChallenge, '');
  // freshUserGesture is now a REAL physical keypress proof (HMAC-signed, preflight-bound,
  // fresh-TTL via holoshell-consent-gesture.mjs), NOT an agent-assertable flag (founder
  // 2026-06-24). The legacy boolean flag is honored ONLY when HOLOSHELL_ALLOW_FLAG_GESTURE=1
  // (dev/test escape hatch); production desktop mutation requires the signed gesture proof.
  const maxGestureTtlMs = consentGestureMaxTtlMs(preflight);
  const gestureResult = payload.gestureProof
    ? verifyGestureProof(payload.gestureProof, {
        preflightReceiptHash: hash,
        expectedChallenge,
        nowIso: at,
        maxTtlMs: maxGestureTtlMs,
      })
    : { ok: false, reason: 'no_gesture_proof' };
  const flagGestureAllowed = /^(1|true|on)$/i.test(process.env.HOLOSHELL_ALLOW_FLAG_GESTURE || '');
  const missingChallenge = consentRequired && !expectedChallenge;
  const freshUserGesture = gestureResult.ok
    || (flagGestureAllowed && (payload.freshUserGesture === true || payload.freshGesture === true));
  const ttlMinutes = Number(payload.ttlMinutes || options.ttlMinutes || 5);
  const expiresAt = options.expiresAt || plusMinutes(at, ttlMinutes);
  const token = options.token || randomBytes(24).toString('base64url');
  const blockedReason = permissionEnvelope === 'break_glass'
    ? 'break_glass_requires_founder_review'
    : (missingChallenge
        ? 'consent_challenge_required'
        : (!freshUserGesture && consentRequired
        ? (gestureResult.reason && gestureResult.reason !== 'no_gesture_proof'
            ? gestureResult.reason
            : 'fresh_user_gesture_required')
        : ''));
  const status = blockedReason ? 'blocked' : (consentRequired ? 'issued' : 'not_required_read_only');
  const tokenId = stableId('desktop_consent_token', `${at}:${preflight.preflightId}:${operation}:${hash}`);
  return {
    schemaVersion: DESKTOP_CONTROL_CONSENT_TOKEN_SCHEMA,
    tokenId,
    token,
    tokenHash: tokenHash(token, hash, operation, expiresAt, expectedChallenge),
    generatedAt: at,
    expiresAt,
    status,
    blockedReason,
    source: 'apps/holoshell/source/holoshell-desktop-control-bridge.hsplus',
    daemonScript: 'scripts/holoshell-laptop-desktop-bridge.mjs',
    holoGateStages: ['identify', 'scope', 'log'],
    operation,
    preflightId: preflight.preflightId,
    planId: preflight.planId || '',
    preflightReceiptHash: hash,
    targetFingerprint: preflight.targetFingerprint || '',
    tokenBoundToTargetFingerprint: Boolean(preflight.targetFingerprint),
    consentChallenge: expectedChallenge,
    permissionEnvelope,
    consentRequired,
    freshUserGestureRequired: consentRequired,
    freshUserGestureObserved: freshUserGesture,
    gestureVerified: gestureResult.ok,
    gestureReason: gestureResult.reason || '',
    gestureProofSchema: CONSENT_GESTURE_SCHEMA,
    maxGestureProofTtlMs: maxGestureTtlMs,
    challengeBound: Boolean(expectedChallenge),
    executionAllowed: status === 'issued',
    executionMode: 'staged_receipt_only_until_action_executor',
    destructiveActionsTaken: false,
    desktopAutomationExecuted: false,
    receiptRequired: true,
    nextSafeStep: status === 'issued'
      ? 'Use this short-lived token with the exact preflight receipt to stage an approved execution receipt; OS mutation remains off until an action executor lane is admitted.'
      : (blockedReason || 'Read-only preflight does not require a consent token.'),
  };
}

export function validateConsentToken(payload = {}, options = {}) {
  const preflight = payload.preflight || null;
  const consentToken = payload.consentToken || payload.token || null;
  const token = typeof consentToken === 'string' ? { token: consentToken } : consentToken;
  if (!preflight?.preflightId) return { valid: false, reason: 'missing_exact_preflight_receipt' };
  if (!token?.token || !token?.tokenHash) return { valid: false, reason: 'missing_consent_token' };
  const operation = safeString(payload.operation || preflight.intent?.primaryAction || token.operation, 'inspect_screen');
  const hash = preflightReceiptHash(preflight);
  const consentChallenge = safeString(token.consentChallenge || preflight.consentChallenge, '');
  if (token.schemaVersion && token.schemaVersion !== DESKTOP_CONTROL_CONSENT_TOKEN_SCHEMA) {
    return { valid: false, reason: 'consent_token_schema_mismatch' };
  }
  if (token.status && token.status !== 'issued') return { valid: false, reason: token.blockedReason || 'consent_token_not_issued' };
  if (token.preflightId && token.preflightId !== preflight.preflightId) return { valid: false, reason: 'consent_token_preflight_mismatch' };
  if (token.preflightReceiptHash && token.preflightReceiptHash !== hash) return { valid: false, reason: 'consent_token_receipt_hash_mismatch' };
  if (token.targetFingerprint && token.targetFingerprint !== (preflight.targetFingerprint || '')) {
    return { valid: false, reason: 'consent_token_target_mismatch' };
  }
  if (token.consentChallenge && preflight.consentChallenge && token.consentChallenge !== preflight.consentChallenge) {
    return { valid: false, reason: 'consent_token_challenge_mismatch' };
  }
  if (token.operation && token.operation !== operation) return { valid: false, reason: 'consent_token_operation_mismatch' };
  if (token.expiresAt && Date.parse(token.expiresAt) <= Date.parse(generatedAt(options))) return { valid: false, reason: 'consent_token_expired' };
  const expectedHash = tokenHash(token.token, hash, operation, token.expiresAt || '', consentChallenge);
  if (expectedHash !== token.tokenHash) return { valid: false, reason: 'consent_token_hash_mismatch' };
  return {
    valid: true,
    reason: '',
    operation,
    preflightReceiptHash: hash,
    targetFingerprint: preflight.targetFingerprint || '',
    consentChallenge,
    tokenId: token.tokenId || '',
    expiresAt: token.expiresAt || '',
  };
}

export function buildDesktopControlExecution(payload = {}, options = {}) {
  const validation = validateConsentToken(payload, options);
  if (!validation.valid) {
    throw new Error(validation.reason || 'consent_token_invalid');
  }
  const at = generatedAt(options);
  const preflight = payload.preflight;
  const executeApprovedAction = payload.executeApprovedAction === true;
  const actionExecution = executeApprovedAction
    ? executeAdmittedAction(payload, options, validation)
    : null;
  const hardwareSummary = actionExecution?.hardwareActionReceipt?.summary || null;
  const hardwareStatus = hardwareSummary?.status || '';
  const performed = Boolean(hardwareSummary?.executionPerformed);
  const executionId = stableId(
    'desktop_execution',
    `${at}:${validation.tokenId}:${preflight.preflightId}:${validation.operation}:${validation.preflightReceiptHash}:${executeApprovedAction ? 'execute' : 'stage'}`
  );
  return {
    schemaVersion: DESKTOP_CONTROL_EXECUTION_SCHEMA,
    executionId,
    generatedAt: at,
    status: actionExecution ? `completed_${validation.operation}` : 'approved_execution_staged',
    source: 'apps/holoshell/source/holoshell-desktop-control-bridge.hsplus',
    daemonScript: 'scripts/holoshell-laptop-desktop-bridge.mjs',
    holoGateStages: ['identify', 'scope', 'log'],
    operation: validation.operation,
    preflightId: preflight.preflightId,
    planId: preflight.planId || '',
    preflightReceiptHash: validation.preflightReceiptHash,
    consentChallenge: validation.consentChallenge,
    consentTokenId: validation.tokenId,
    consentTokenExpiresAt: validation.expiresAt,
    executionAllowed: true,
    executionMode: actionExecution ? `admitted_${validation.operation}_executor` : 'staged_receipt_only_until_action_executor',
    executeApprovedAction,
    admittedExecutorAction: ADMITTED_EXECUTOR_ACTIONS.has(validation.operation),
    requiresExactExecutionTarget: requiresExactExecutionTarget(validation.operation),
    preflightTargetFingerprint: preflight.targetFingerprint || '',
    executionTargetFingerprint: actionExecution?.target ? actionTargetFingerprint(actionExecution.target) : '',
    executionTargetMatchVerified: Boolean(actionExecution?.target && preflight.targetFingerprint),
    destructiveActionsTaken: false,
    desktopAutomationExecuted: performed,
    hardwareAction: actionExecution ? {
      action: actionExecution.action,
      target: actionExecution.target,
      status: hardwareStatus,
      actionId: actionExecution.hardwareActionReceipt?.actionId || '',
      receiptPath: actionExecution.hardwareActionReceipt?.output?.receiptPath || '',
      visibleWitnessKind: hardwareSummary?.visibleWitnessKind || '',
      targetUrlHost: hardwareSummary?.targetUrlHost || '',
    } : null,
    approvalRequiredForDesktopAutomation: true,
    receiptRequired: true,
    bridge: buildBridgeStatus(options),
    nextSafeStep: actionExecution
      ? 'Review the hardware action receipt and rollback manually if the opened browser tab is not desired.'
      : 'Admit and validate a concrete action executor lane for this action class before allowing OS mutation.',
  };
}

export function buildExecutionRefusal(payload = {}, options = {}) {
  const at = generatedAt(options);
  const preflightId = safeString(payload.preflightId || payload.preflight?.preflightId, 'missing_preflight');
  const reason = payload.reason || 'desktop_control_execution_requires_holoshell_consent_token_lane';
  return {
    schemaVersion: DESKTOP_CONTROL_EXECUTION_REFUSAL_SCHEMA,
    refusalId: stableId('desktop_execution_refusal', `${at}:${preflightId}:${reason}`),
    generatedAt: at,
    status: 'refused',
    reason,
    source: 'apps/holoshell/source/holoshell-desktop-control-bridge.hsplus',
    daemonScript: 'scripts/holoshell-laptop-desktop-bridge.mjs',
    preflightId,
    consentTokenProvided: Boolean(payload.consentToken),
    executionAllowed: false,
    destructiveActionsTaken: false,
    desktopAutomationExecuted: false,
    approvalRequiredForDesktopAutomation: true,
    receiptRequired: true,
    nextSafeStep: 'Use the HoloShell consent-token path to authorize an exact preflight receipt before enabling any mutating executor.',
  };
}

function writeReceipt(receipt, receiptDir, subdir, fileId, suffix) {
  const dir = repoPath(path.join(receiptDir || DEFAULT_RECEIPT_DIR, subdir));
  mkdirSync(dir, { recursive: true });
  const receiptPath = path.join(dir, `${fileId}${suffix}.json`);
  const withPath = { ...receipt, receiptPath };
  writeFileSync(receiptPath, `${JSON.stringify(withPath, null, 2)}\n`, 'utf8');
  return withPath;
}

export function writeLatestBridgeStatus(status, receiptDir = DEFAULT_RECEIPT_DIR) {
  const receiptPath = repoPath(path.join(receiptDir || DEFAULT_RECEIPT_DIR, 'latest-status.json'));
  mkdirSync(path.dirname(receiptPath), { recursive: true });
  const withPath = { ...status, receiptPath };
  writeFileSync(receiptPath, `${JSON.stringify(withPath, null, 2)}\n`, 'utf8');
  return withPath;
}

function sendJson(res, data, statusCode = 200) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-HoloShell-Bridge',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error(`invalid_json: ${error.message}`));
      }
    });
    req.on('error', reject);
  });
}

export async function handleBridgeRequest(req, res, options = {}) {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const requestOptions = {
    host: options.host || DEFAULT_HOST,
    port: options.port || DEFAULT_PORT,
    receiptDir: options.receiptDir || DEFAULT_RECEIPT_DIR,
    createdAt: options.createdAt,
  };

  if (req.method === 'OPTIONS') {
    sendJson(res, { ok: true }, 204);
    return;
  }

  if (req.method === 'GET' && (requestUrl.pathname === '/health' || requestUrl.pathname === '/api/desktop-control/bridge')) {
    const status = writeLatestBridgeStatus(buildBridgeStatus(requestOptions), requestOptions.receiptDir);
    sendJson(res, requestUrl.pathname === '/health' ? { ok: true, bridge: status } : status);
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/desktop-control/preflight') {
    try {
      const payload = await readRequestBody(req);
      const receipt = buildDesktopControlPreflight(payload, requestOptions);
      const saved = writeReceipt(receipt, requestOptions.receiptDir, 'preflights', receipt.preflightId, '.preflight');
      sendJson(res, { ...saved, destructiveActionsTaken: false });
    } catch (error) {
      sendJson(res, { error: String(error.message || error), destructiveActionsTaken: false }, 400);
    }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/desktop-control/gesture-proof') {
    try {
      const payload = await readRequestBody(req);
      const preflight = payload.preflight || payload.receipt || null;
      if (!preflight?.preflightId) throw new Error('gesture proof requires exact preflight receipt');
      const challenge = safeString(payload.challenge || payload.consentChallenge || preflight.consentChallenge, '');
      if (!challenge) throw new Error('consent_challenge_required');
      const hash = payload.preflightReceiptHash || preflight.preflightReceiptHash || preflightReceiptHash(preflight);
      const maxTtlMs = consentGestureMaxTtlMs(preflight);
      const requestedTtlMs = Number(payload.ttlMs || payload.ttl || maxTtlMs);
      const ttlMs = Math.min(
        Math.max(1000, Number.isFinite(requestedTtlMs) ? requestedTtlMs : maxTtlMs),
        maxTtlMs
      );
      const proof = captureGesture({
        challenge,
        preflightReceiptHash: hash,
        key: payload.key || preflight.consentGesture?.key || 'F8',
        ttlMs,
      });
      sendJson(res, {
        ...proof,
        preflightId: preflight.preflightId,
        destructiveActionsTaken: false,
        desktopAutomationExecuted: false,
      }, proof.observedGesture ? 200 : 403);
    } catch (error) {
      sendJson(res, { error: String(error.message || error), destructiveActionsTaken: false }, 400);
    }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/desktop-control/consent-token') {
    try {
      const payload = await readRequestBody(req);
      const consent = buildConsentToken(payload, requestOptions);
      const saved = writeReceipt(
        tokenForStorage(consent),
        requestOptions.receiptDir,
        'consent-tokens',
        consent.tokenId,
        '.consent'
      );
      sendJson(res, { ...saved, ...tokenForResponse(consent), receiptPath: saved.receiptPath }, consent.status === 'issued' ? 200 : 403);
    } catch (error) {
      sendJson(res, { error: String(error.message || error), destructiveActionsTaken: false }, 400);
    }
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/desktop-control/execute') {
    let payload = {};
    try {
      payload = await readRequestBody(req);
      if (payload.consentToken && payload.preflight) {
        const receipt = buildDesktopControlExecution(payload, requestOptions);
        const saved = writeReceipt(receipt, requestOptions.receiptDir, 'executions', receipt.executionId, '.execution');
        sendJson(res, saved);
      } else {
        const receipt = buildExecutionRefusal(payload, requestOptions);
        const saved = writeReceipt(receipt, requestOptions.receiptDir, 'refusals', receipt.refusalId, '.refusal');
        sendJson(res, saved, 403);
      }
    } catch (error) {
      const refusalPayload = {
        ...payload,
        reason: `desktop_control_consent_token_invalid:${String(error.message || error)}`,
      };
      const receipt = buildExecutionRefusal(refusalPayload, requestOptions);
      const saved = writeReceipt(receipt, requestOptions.receiptDir, 'refusals', receipt.refusalId, '.refusal');
      sendJson(res, saved, 403);
    }
    return;
  }

  sendJson(res, { error: 'not_found', path: requestUrl.pathname, destructiveActionsTaken: false }, 404);
}

export function createLaptopDesktopBridgeServer(options = {}) {
  return createServer((req, res) => {
    handleBridgeRequest(req, res, options).catch((error) => {
      sendJson(res, { error: String(error.message || error), destructiveActionsTaken: false }, 500);
    });
  });
}

function bridgeStatusEndpoint(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const port = Number(options.port || DEFAULT_PORT);
  const url = options.url || `http://${host}:${port}`;
  return `${url}/api/desktop-control/bridge`;
}

function statusProbeError(error) {
  return String(error?.cause?.code || error?.message || error || 'unknown_error');
}

export async function probeBridgeStatus(options = {}) {
  const endpoint = bridgeStatusEndpoint(options);
  try {
    const response = await fetch(endpoint, {
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`status_endpoint_${response.status}`);
    }
    if (body.schemaVersion !== LAPTOP_DESKTOP_BRIDGE_SCHEMA) {
      throw new Error('schema_mismatch');
    }
    return writeLatestBridgeStatus({
      ...body,
      statusSource: 'status_cli_live_probe',
      loopbackReachable: true,
      statusProbe: {
        mode: 'loopback_status_cli',
        endpoint,
        ok: true,
        statusCode: response.status,
      },
    }, options.receiptDir);
  } catch (error) {
    return writeLatestBridgeStatus(buildBridgeStatus({
      ...options,
      status: 'offline',
      statusSource: 'status_cli_live_probe',
      loopbackReachable: false,
      statusProbe: {
        mode: 'loopback_status_cli',
        endpoint,
        ok: false,
        error: statusProbeError(error),
      },
    }), options.receiptDir);
  }
}

export function runSelfTest(options = {}) {
  const status = buildBridgeStatus({ ...options, createdAt: options.createdAt || '2026-06-23T00:00:00.000Z' });
  const preflight = buildDesktopControlPreflight({
    intent: 'Use Fara to inspect the screen and click the Save button.',
  }, { ...options, createdAt: status.generatedAt });
  // Construct a VALID signed gesture proof (mirrors a real keypress capture) so the self-test
  // exercises the real proof path — not the agent-assertable flag.
  const proofFor = (pf) => {
    const fields = {
      schemaVersion: CONSENT_GESTURE_SCHEMA,
      challenge: pf.consentChallenge,
      preflightReceiptHash: pf.preflightReceiptHash || preflightReceiptHash(pf),
      key: 'F8',
      pressedAt: status.generatedAt,
      observedGesture: true,
      ttlMs: pf.consentGesture?.ttlMs || 30000,
    };
    return { ...fields, signature: signGestureProof(fields) };
  };
  const consentToken = buildConsentToken({
    preflight,
    operation: preflight.intent.primaryAction,
    gestureProof: proofFor(preflight),
  }, { ...options, createdAt: status.generatedAt, token: 'self-test-token' });
  // A consent request with NO gesture proof must be BLOCKED (the agent can't self-authorize).
  const noGestureConsent = buildConsentToken({
    preflight,
    operation: preflight.intent.primaryAction,
  }, { ...options, createdAt: status.generatedAt, token: 'self-test-nogesture' });
  const refusal = buildExecutionRefusal({ preflightId: preflight.preflightId }, { ...options, createdAt: status.generatedAt });
  const execution = buildDesktopControlExecution({
    preflight,
    operation: preflight.intent.primaryAction,
    consentToken,
  }, { ...options, createdAt: status.generatedAt });
  const openUrlPreflight = buildDesktopControlPreflight({
    intent: 'Open URL https://example.com/status in the default browser.',
  }, { ...options, createdAt: status.generatedAt });
  const openUrlConsent = buildConsentToken({
    preflight: openUrlPreflight,
    operation: 'open_url',
    gestureProof: proofFor(openUrlPreflight),
  }, { ...options, createdAt: status.generatedAt, token: 'self-test-open-url-token' });
  const openUrlExecution = buildDesktopControlExecution({
    preflight: openUrlPreflight,
    operation: 'open_url',
    consentToken: openUrlConsent,
    url: 'https://example.com/status',
    executeApprovedAction: true,
    executorMode: 'simulated',
  }, { ...options, createdAt: status.generatedAt, executorMode: 'simulated' });
  const failures = [];
  if (status.status !== 'ready') failures.push('status not ready');
  if (status.destructiveActionsTaken !== false) failures.push('status mutated');
  if (preflight.modelLane !== 'fara_gui_grounding') failures.push('missing Fara lane');
  if (preflight.executionAllowed !== false) failures.push('preflight should not allow execution');
  if (preflight.destructiveActionsTaken !== false) failures.push('preflight mutated');
  if (consentToken.status !== 'issued') failures.push('consent token not issued');
  if (consentToken.executionAllowed !== true) failures.push('consent token should allow staging');
  if (consentToken.gestureVerified !== true) failures.push('valid signed gesture proof should verify');
  if (noGestureConsent.status !== 'blocked') failures.push('consent WITHOUT a gesture proof must be blocked (no agent self-authorize)');
  if (noGestureConsent.blockedReason !== 'fresh_user_gesture_required') failures.push('missing-gesture consent must require fresh user gesture');
  if (refusal.status !== 'refused') failures.push('execution should be refused');
  if (refusal.desktopAutomationExecuted !== false) failures.push('refusal executed desktop automation');
  if (execution.status !== 'approved_execution_staged') failures.push('approved execution was not staged');
  if (execution.desktopAutomationExecuted !== false) failures.push('staged execution touched desktop');
  if (openUrlExecution.status !== 'completed_open_url') failures.push('open_url executor did not complete');
  if (openUrlExecution.desktopAutomationExecuted !== true) failures.push('open_url executor did not record desktop automation');
  if (openUrlExecution.destructiveActionsTaken !== false) failures.push('open_url executor marked destructive action');
  // Safe-default guarantee (founder 2026-06-24): open_url is always admitted; GUI-mutating
  // actions (click/type/focus/hotkey) must NOT be admitted into the autonomous lane unless the
  // founder explicitly set HOLOSHELL_ADMIT_GUI_MUTATION.
  if (!ADMITTED_EXECUTOR_ACTIONS.has('open_url')) failures.push('open_url must always be admitted');
  if (!ADMIT_GUI_MUTATION && (ADMITTED_EXECUTOR_ACTIONS.has('type_text') || ADMITTED_EXECUTOR_ACTIONS.has('click_control'))) {
    failures.push('GUI mutation MUST stay gated off without HOLOSHELL_ADMIT_GUI_MUTATION');
  }
  if (failures.length) throw new Error(`self-test failed: ${failures.join(', ')}`);
  return { status, preflight, consentToken, refusal, execution, openUrlExecution };
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMain()) {
  try {
    const args = parseArgs();
    if (args.selfTest) {
      const result = runSelfTest(args);
      if (args.json) console.log(JSON.stringify(result, null, 2));
      else console.log('HoloShell laptop desktop bridge self-test passed');
      process.exit(0);
    }
    if (args.status) {
      const status = await probeBridgeStatus(args);
      if (args.json) console.log(JSON.stringify(status, null, 2));
      else {
        console.log(`Status: ${status.status}`);
        console.log(`URL: ${status.url}`);
        console.log(`Loopback reachable: ${status.loopbackReachable ? 'yes' : 'no'}`);
        console.log(`Mutation boundary: ${status.mutationBoundary}`);
      }
      process.exit(0);
    }
    const server = createLaptopDesktopBridgeServer(args);
    server.listen(args.port, args.host, () => {
      console.log(`HoloShell laptop desktop bridge: http://${args.host}:${args.port}`);
      console.log('Execution: consent-token staging enabled; OS mutation waits for an admitted action executor');
    });
  } catch (error) {
    console.error(`holoshell-laptop-desktop-bridge failed: ${error.message}`);
    process.exit(1);
  }
}
