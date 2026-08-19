#!/usr/bin/env node
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RECEIPT_VERSION = 'hololand.holotunnel-access.v1';
const SHARE_PACKET_VERSION = 'holoscript.holotunnel.share-packet.v1';
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'holotunnel-access.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'holotunnel-access.js');
const DEFAULT_RECEIPT_DIR = path.join(DEFAULT_TMP, 'holotunnel-access-receipts');
const SECRET_QUERY_KEYS = new Set([
  'access_token',
  'api_key',
  'apikey',
  'auth',
  'authorization',
  'clienttoken',
  'client_token',
  'key',
  'relaytoken',
  'relay_token',
  'secret',
  'token',
]);
const REDACTED_PACKET_FIELDS = [
  'apiKey',
  'clientToken',
  'localHost',
  'localPort',
  'localTarget',
  'relayToken',
  'secret',
  'token',
  'tunnelId',
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    sharePacket: '',
    inlinePacket: null,
    worldId: '',
    sessionName: '',
    stableUrl: '',
    directUrl: '',
    sourceRef: '',
    createdBy: '',
    expiresAt: '',
    revokedAt: '',
    accessMode: 'review',
    audience: 'anyone_with_link',
    browserReadiness: 'ready',
    headsetReadiness: 'fallback',
    safetyState: 'approved',
    witnessKind: 'none',
    witnessStatus: 'pending',
    failureKind: '',
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    receiptDir: DEFAULT_RECEIPT_DIR,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--share-packet') args.sharePacket = argv[++index] || '';
    else if (arg === '--world-id') args.worldId = argv[++index] || '';
    else if (arg === '--session-name') args.sessionName = argv[++index] || '';
    else if (arg === '--stable-url') args.stableUrl = argv[++index] || '';
    else if (arg === '--direct-url') args.directUrl = argv[++index] || '';
    else if (arg === '--source-ref') args.sourceRef = argv[++index] || '';
    else if (arg === '--created-by') args.createdBy = argv[++index] || '';
    else if (arg === '--expires-at') args.expiresAt = argv[++index] || '';
    else if (arg === '--revoked-at') args.revokedAt = argv[++index] || '';
    else if (arg === '--access-mode') args.accessMode = argv[++index] || args.accessMode;
    else if (arg === '--audience') args.audience = argv[++index] || args.audience;
    else if (arg === '--browser-readiness') args.browserReadiness = argv[++index] || args.browserReadiness;
    else if (arg === '--headset-readiness') args.headsetReadiness = argv[++index] || args.headsetReadiness;
    else if (arg === '--safety-state') args.safetyState = argv[++index] || args.safetyState;
    else if (arg === '--witness-kind') args.witnessKind = argv[++index] || args.witnessKind;
    else if (arg === '--witness-status') args.witnessStatus = argv[++index] || args.witnessStatus;
    else if (arg === '--failure-kind') args.failureKind = argv[++index] || '';
    else if (arg === '--output') args.output = argv[++index] || args.output;
    else if (arg === '--js-output') args.jsOutput = argv[++index] || args.jsOutput;
    else if (arg === '--receipt-dir') args.receiptDir = argv[++index] || args.receiptDir;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.selfTest) applySelfTestFixture(args);
  return args;
}

function printHelp() {
  console.log(`HoloShell HoloTunnel access bridge

Usage:
  node scripts/holoshell-holotunnel-access.mjs --share-packet .tmp/studio-share.json --json

Options:
  --share-packet <file>       HoloScript Studio HoloTunnel share packet JSON.
  --stable-url <url>          Stable HoloLand access URL when no packet file is used.
  --direct-url <url>          Direct tunnel URL, kept out of the first screen.
  --world-id <id>             World identity override.
  --session-name <name>       Human-facing world/session label.
  --source-ref <path>         Source HoloScript/HoloLand path.
  --expires-at <iso>          Invite expiry.
  --revoked-at <iso>          Revocation timestamp.
  --access-mode <kind>        review, player, headset, operator.
  --audience <kind>           anyone_with_link, invited, local_only, review_mode.
  --failure-kind <kind>       host_offline, expired, revoked, device_unsupported, safety_blocked, timeout.
  --self-test                 Emit and verify a product-safe fixture.
  --json                      Print receipt JSON.
`);
}

function applySelfTestFixture(args) {
  args.inlinePacket = {
    schemaVersion: SHARE_PACKET_VERSION,
    worldId: 'world_frontier_shard_preview',
    sessionName: 'Frontier Shard Preview',
    stableUrl: 'https://hololand.local/live/frontier-shard-preview',
    directUrl: 'https://holotunnel.holoscript.dev/t/tunnel_fixture_123',
    sourceRef: 'apps/holoshell/source/holoshell-holotunnel-access-card.holo',
    createdBy: 'studio',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    tunnelId: 'tunnel_fixture_123',
    localTarget: 'http://127.0.0.1:4321',
    clientToken: 'fixture-token-must-not-leak',
  };
  if (args.output === DEFAULT_OUTPUT) {
    args.output = path.join(DEFAULT_TMP, 'self-test', 'holotunnel-access.json');
  }
  if (args.jsOutput === DEFAULT_JS_OUTPUT) {
    args.jsOutput = path.join(DEFAULT_TMP, 'self-test', 'holotunnel-access.js');
  }
  if (args.receiptDir === DEFAULT_RECEIPT_DIR) {
    args.receiptDir = path.join(DEFAULT_TMP, 'self-test', 'holotunnel-access-receipts');
  }
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function publicPath(filePath) {
  return path.relative(REPO_ROOT, resolveRepoPath(filePath)).replace(/\\/g, '/');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolveRepoPath(filePath), 'utf8'));
}

function writeText(filePath, text) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const tempPath = `${resolved}.${process.pid}.${Date.now().toString(36)}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tempPath, text, 'utf8');
  renameSync(tempPath, resolved);
  return resolved;
}

function writeJson(filePath, value) {
  return writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeBrowserBootstrap(filePath, value) {
  const payload = JSON.stringify(value, null, 2).replace(/<\/script/gi, '<\\/script');
  return writeText(filePath, `window.HOLOSHELL_HOLOTUNNEL_ACCESS = ${payload};\n`);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hashValue(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function shortHash(value, length = 12) {
  return hashValue(value).slice(0, length);
}

function normalizeOptionalText(value) {
  const text = String(value || '').trim();
  return text || undefined;
}

function overlayPacketArgs(packet, args) {
  const next = { ...packet };
  const overlays = [
    ['worldId', args.worldId],
    ['sessionName', args.sessionName],
    ['stableUrl', args.stableUrl],
    ['directUrl', args.directUrl],
    ['sourceRef', args.sourceRef],
    ['createdBy', args.createdBy],
    ['expiresAt', args.expiresAt],
  ];
  for (const [key, value] of overlays) {
    if (normalizeOptionalText(value)) next[key] = value;
  }
  return next;
}

function loadSharePacket(args) {
  let packet = args.inlinePacket || {};
  if (args.sharePacket) {
    if (!existsSync(resolveRepoPath(args.sharePacket))) {
      throw new Error(`Share packet not found: ${args.sharePacket}`);
    }
    packet = readJson(args.sharePacket);
  }
  packet = overlayPacketArgs(packet, args);
  validateSharePacket(packet);
  return packet;
}

function hasSecretQuery(urlText) {
  const url = new URL(urlText);
  for (const key of url.searchParams.keys()) {
    if (SECRET_QUERY_KEYS.has(key.toLowerCase())) return true;
  }
  return false;
}

function assertHttpUrl(urlText, field) {
  let url;
  try {
    url = new URL(urlText);
  } catch {
    throw new Error(`${field} must be a valid URL.`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${field} must use http or https.`);
  }
  if (hasSecretQuery(urlText)) {
    throw new Error(`${field} must not contain secret-bearing query parameters.`);
  }
}

function validateSharePacket(packet) {
  const errors = [];
  if (packet.schemaVersion && packet.schemaVersion !== SHARE_PACKET_VERSION) {
    errors.push(`schemaVersion must be ${SHARE_PACKET_VERSION}.`);
  }
  if (!packet.worldId) errors.push('worldId is required.');
  if (!packet.sessionName) errors.push('sessionName is required.');
  if (!packet.stableUrl) errors.push('stableUrl is required.');
  if (errors.length) throw new Error(`Invalid HoloTunnel share packet:\n- ${errors.join('\n- ')}`);
  assertHttpUrl(packet.stableUrl, 'stableUrl');
  if (packet.directUrl) assertHttpUrl(packet.directUrl, 'directUrl');
  if (packet.expiresAt && Number.isNaN(Date.parse(packet.expiresAt))) {
    throw new Error('expiresAt must be an ISO timestamp when provided.');
  }
}

function failureCopy(kind) {
  if (kind === 'host_offline') return 'The host is not live right now.';
  if (kind === 'expired') return 'This invite expired.';
  if (kind === 'revoked') return 'The host turned this invite off.';
  if (kind === 'device_unsupported') return 'This device can open the browser preview, but not headset mode.';
  if (kind === 'safety_blocked') return 'This share needs host approval before opening.';
  return 'The world is taking too long to respond.';
}

function accessStateFor(packet, args, now = new Date()) {
  if (args.revokedAt) return 'revoked';
  const expiresAt = normalizeOptionalText(args.expiresAt) || normalizeOptionalText(packet.expiresAt);
  if (expiresAt && Date.parse(expiresAt) <= now.getTime()) return 'expired';
  if (args.failureKind) return 'needs_attention';
  return 'live';
}

function statusCopyFor(state, args) {
  if (state === 'live') return 'Live now';
  if (state === 'expired') return 'This invite expired.';
  if (state === 'revoked') return 'The host turned this invite off.';
  if (state === 'needs_attention') return failureCopy(args.failureKind);
  return 'Preparing invite.';
}

function directUrlSummary(directUrl) {
  if (!directUrl) return { available: false, host: '', pathKind: 'none' };
  const url = new URL(directUrl);
  return {
    available: true,
    host: url.host,
    pathKind: url.pathname.startsWith('/t/') ? 'holotunnel_direct_path' : 'direct_access_path',
  };
}

function buildAccessCard(packet, args, state) {
  const live = state === 'live';
  const statusCopy = statusCopyFor(state, args);
  return {
    title: 'Open This HoloLand World',
    sessionName: packet.sessionName,
    worldId: packet.worldId,
    status: {
      state,
      label: statusCopy,
      recipientFacingCopy: statusCopy,
    },
    stableUrl: packet.stableUrl,
    audience: args.audience,
    expiresAt: normalizeOptionalText(args.expiresAt) || normalizeOptionalText(packet.expiresAt) || null,
    firstScreenActions: [
      { actionId: 'share_world', label: 'Share World', enabled: live, target: 'stable_access_url' },
      { actionId: 'open_here', label: 'Open Here', enabled: live, target: 'stable_access_url' },
      { actionId: 'open_on_headset', label: 'Open On Headset', enabled: live, target: 'stable_access_qr' },
      { actionId: 'copy_invite', label: 'Copy Invite', enabled: live, target: 'stable_access_url' },
    ],
    readinessSummary: {
      browser: args.browserReadiness,
      headset: args.headsetReadiness,
      safety: args.safetyState,
      fallbackCopy: 'Browser preview is available when headset mode is not.',
    },
    qr: {
      status: live ? 'ready' : 'not_ready',
      payloadUrl: packet.stableUrl,
      copy: live ? 'Scan to open the live world.' : statusCopy,
    },
    hiddenFirstScreenFields: [
      'tunnelId',
      'directUrl',
      'relayBase',
      'localTarget',
      'proxyCounters',
      'clientToken',
    ],
    advancedDetailsAvailable: true,
  };
}

function buildReceipt(args, packet) {
  const createdAt = new Date().toISOString();
  const accessState = accessStateFor(packet, args);
  const accessId = `holotunnel-access-${shortHash({
    worldId: packet.worldId,
    sessionName: packet.sessionName,
    stableUrl: packet.stableUrl,
    sourceRef: packet.sourceRef,
  }, 14)}`;
  const receiptPath = path.join(args.receiptDir, `${accessId}.json`);
  const directSummary = directUrlSummary(packet.directUrl);
  const accessCard = buildAccessCard(packet, args, accessState);
  const redactedPacketFields = REDACTED_PACKET_FIELDS.filter((field) => packet[field] !== undefined);
  const receipt = {
    receiptVersion: RECEIPT_VERSION,
    createdAt,
    accessId,
    workflow: 'holotunnel-nondeveloper-access',
    status: accessState,
    worldId: packet.worldId,
    sessionName: packet.sessionName,
    sourceRef: normalizeOptionalText(packet.sourceRef) || '',
    accessMode: args.accessMode,
    audience: args.audience,
    stableUrl: packet.stableUrl,
    directUrlAvailable: directSummary.available,
    expiresAt: accessCard.expiresAt,
    revokedAt: normalizeOptionalText(args.revokedAt) || null,
    readiness: {
      browser: args.browserReadiness,
      headset: args.headsetReadiness,
      safety: args.safetyState,
    },
    witness: {
      kind: args.witnessKind,
      status: args.witnessStatus,
    },
    accessCard,
    advancedDiagnostics: {
      visibleByDefault: false,
      operatorDirectUrl: packet.directUrl || '',
      directUrlHost: directSummary.host,
      directUrlPathKind: directSummary.pathKind,
      packetSchemaVersion: packet.schemaVersion || '',
      createdBy: normalizeOptionalText(packet.createdBy) || 'unknown',
      tunnelIdRedacted: true,
      localTargetRedacted: true,
      relayTokenRedacted: true,
      relayStatus: 'summary',
    },
    security: {
      stableUrlSecretQueryRejected: true,
      directUrlSecretQueryRejected: true,
      redactedPacketFields,
      rawPacketRetained: false,
      firstScreenDirectUrlExposed: false,
      localMachineDetailsExposed: false,
    },
    sourceAnchors: {
      room: 'apps/holoshell/source/holoshell-holotunnel-access-card.holo',
      policy: 'apps/holoshell/source/holoshell-holotunnel-access-policy.hsplus',
      pipeline: 'apps/holoshell/source/holoshell-holotunnel-access-pipeline.hs',
      spec: 'docs/specs/HOLOTUNNEL_NONDEVELOPER_ACCESS.md',
      bridge: 'scripts/holoshell-holotunnel-access.mjs',
    },
    output: {
      latestPath: publicPath(args.output),
      jsPath: publicPath(args.jsOutput),
      receiptPath: publicPath(receiptPath),
    },
    verificationCommands: [
      'node scripts/holoshell-holotunnel-access.mjs --self-test',
      'node scripts/__tests__/holoshell-holotunnel-access.test.mjs',
    ],
    hash: '',
    hashAlgorithm: 'sha256',
  };
  receipt.hash = hashValue({ ...receipt, hash: '' });
  return receipt;
}

function assertSelfTest(receipt) {
  const failures = [];
  const firstScreen = JSON.stringify(receipt.accessCard);
  const wholeReceipt = JSON.stringify(receipt);
  if (receipt.receiptVersion !== RECEIPT_VERSION) failures.push('unexpected receipt version');
  if (receipt.status !== 'live') failures.push('expected live access state');
  if (!receipt.accessCard.firstScreenActions.some((action) => action.actionId === 'copy_invite')) {
    failures.push('expected Copy Invite first-screen action');
  }
  if (firstScreen.includes('/t/')) failures.push('direct tunnel URL leaked into first screen');
  if (firstScreen.includes('127.0.0.1') || firstScreen.includes('localhost')) {
    failures.push('local target leaked into first screen');
  }
  if (wholeReceipt.includes('fixture-token-must-not-leak')) failures.push('client token leaked into receipt');
  if (!receipt.advancedDiagnostics.tunnelIdRedacted) failures.push('tunnel id redaction flag missing');
  if (receipt.security.firstScreenDirectUrlExposed !== false) failures.push('unexpected first-screen direct URL flag');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs();
  const packet = loadSharePacket(args);
  const receipt = buildReceipt(args, packet);
  const output = writeJson(args.output, receipt);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, receipt);
  const receiptPath = writeJson(path.join(args.receiptDir, `${receipt.accessId}.json`), receipt);
  if (args.selfTest) assertSelfTest(receipt);

  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log(`HoloShell HoloTunnel access: ${output}`);
    console.log(`HoloShell HoloTunnel access bootstrap: ${jsOutput}`);
    console.log(`HoloShell HoloTunnel access receipt: ${receiptPath}`);
    console.log(`Status: ${receipt.status}`);
    console.log(`World: ${receipt.sessionName}`);
    console.log(`Open: ${receipt.stableUrl}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
