#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 'hololand.quest-browser-webxr.v0.1.0';
const ROOM_SOURCE = 'apps/holoshell/source/hololand-quest-browser-webxr-viewer.holo';
const POLICY_SOURCE = 'apps/holoshell/source/hololand-quest-browser-webxr-policy.hsplus';
const ACCESS_CARD_SOURCE = 'apps/holoshell/source/holoshell-holotunnel-access-card.holo';
const ACCESS_BRIDGE = 'scripts/holoshell-holotunnel-access.mjs';
const WEBXR_BRIDGE = 'packages/platform/renderer/src/WebXRSessionBridge.ts';
const WEBXR_PIPELINE_TEST = 'packages/spatial-builder/src/scene-editor/__tests__/webxr-pipeline.test.ts';
const SPEC_SOURCE = 'docs/specs/HOLOTUNNEL_NONDEVELOPER_ACCESS.md';
const SOURCE_MAP = 'apps/holoshell/docs/HOLOSHELL_SOURCE_MAP.md';
const PACKAGE_JSON = 'package.json';
const DEFAULT_OUTPUT = path.join('.tmp', 'hololand-quest-browser-webxr', 'receipt.json');

function parseArgs(argv = process.argv.slice(2)) {
  const args = { output: DEFAULT_OUTPUT, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') args.output = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`HoloLand Quest Browser WebXR check

Usage:
  node scripts/check-hololand-quest-browser-webxr.mjs [--output <path>] [--json]
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function repoPath(relativePath) {
  return path.resolve(process.cwd(), relativePath);
}

function read(relativePath) {
  return readFileSync(repoPath(relativePath), 'utf8');
}

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function includesAll(text, snippets) {
  return snippets.every((snippet) => text.includes(snippet));
}

function uniqueMatches(text, pattern, group = 1) {
  return [...new Set([...text.matchAll(pattern)].map((match) => match[group]).filter(Boolean))];
}

function runCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout ?? 120000,
  });
}

function runTsxTemp(script, name, options = {}) {
  const tempDir = repoPath(path.join('.tmp', 'hololand-quest-browser-webxr'));
  mkdirSync(tempDir, { recursive: true });
  const scriptPath = path.join(tempDir, `${name}.mjs`);
  writeFileSync(scriptPath, `${script}\n`, 'utf8');

  const dirArg = options.pnpmDir ? `--dir ${options.pnpmDir.replace(/\\/g, '/')} ` : '';
  const rawScriptArg = options.pnpmDir ? scriptPath : path.relative(process.cwd(), scriptPath);
  const scriptArg = rawScriptArg.replace(/\\/g, '/');
  const command = `pnpm ${dirArg}exec tsx ${scriptArg}`;

  if (process.platform === 'win32') {
    return runCommand('cmd.exe', ['/d', '/s', '/c', command], { timeout: options.timeout ?? 120000 });
  }
  return runCommand('sh', ['-c', command], { timeout: options.timeout ?? 120000 });
}

function findHoloScriptRoot() {
  const candidates = [
    process.env.HOLOSCRIPT_ROOT,
    path.resolve(process.cwd(), '..', 'HoloScript'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(path.join(candidate, 'package.json'))) || null;
}

function parseWithHoloScript(relativePath) {
  const root = findHoloScriptRoot();
  if (!root) {
    return {
      source: relativePath,
      passed: false,
      kind: 'missing_local_holoscript_root',
      error: 'Set HOLOSCRIPT_ROOT or place HoloScript next to HoloLand before running this check.',
    };
  }

  const absoluteSource = repoPath(relativePath);
  const isHolo = relativePath.endsWith('.holo');
  const parserPath = isHolo
    ? path.join(root, 'packages', 'core', 'src', 'parser', 'HoloCompositionParser.ts')
    : path.join(root, 'packages', 'core', 'src', 'parser', 'HoloScriptPlusParser.ts');
  const parserExport = isHolo ? 'parseHolo' : 'parse';
  const parserUrl = pathToFileURL(parserPath).href;
  const script = `
    import { readFileSync } from 'node:fs';
    import { ${parserExport} as parseSource } from ${JSON.stringify(parserUrl)};
    const result = parseSource(readFileSync(${JSON.stringify(absoluteSource)}, 'utf8'));
    console.log(JSON.stringify({
      success: result.success,
      errors: (result.errors || []).slice(0, 4).map((error) => ({
        message: error.message,
        loc: error.loc || error.location || null,
        severity: error.severity || 'error'
      }))
    }));
    if (!result.success) process.exit(1);
  `;

  const result = runTsxTemp(script, `parse-${path.extname(relativePath).slice(1) || 'source'}`, { pnpmDir: root });
  return {
    source: relativePath,
    passed: result.status === 0,
    kind: 'local_holoscript_source_parser',
    status: result.status,
    stdoutTail: String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean).slice(-4),
    stderrTail: String(result.stderr || result.error?.message || '').trim().split(/\r?\n/).filter(Boolean).slice(-6),
  };
}

function runHoloTunnelSelfTest() {
  const outputDir = path.join('.tmp', 'hololand-quest-browser-webxr', 'holotunnel-self-test');
  const result = runCommand(process.execPath, [
    ACCESS_BRIDGE,
    '--self-test',
    '--output',
    path.join(outputDir, 'access.json'),
    '--js-output',
    path.join(outputDir, 'access.js'),
    '--receipt-dir',
    path.join(outputDir, 'receipts'),
    '--json',
  ]);

  let parsed = null;
  try {
    parsed = result.stdout.trim() ? JSON.parse(result.stdout.trim()) : null;
  } catch {
    parsed = null;
  }

  return {
    passed: result.status === 0 && parsed?.status === 'live',
    status: result.status,
    stdoutTail: String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean).slice(-8),
    stderrTail: String(result.stderr || result.error?.message || '').trim().split(/\r?\n/).filter(Boolean).slice(-8),
    parsed,
  };
}

function buildSemanticIr(texts, holotunnelSelfTest) {
  return {
    room: {
      source: ROOM_SOURCE,
      composition: uniqueMatches(texts.room, /composition\s+"([^"]+)"/g)[0] || '',
      templates: uniqueMatches(texts.room, /template\s+"([^"]+)"/g),
      objects: uniqueMatches(texts.room, /object\s+"([^"]+)"/g),
      groups: uniqueMatches(texts.room, /spatial_group\s+"([^"]+)"/g),
      actions: uniqueMatches(texts.room, /action_id:\s+"([^"]+)"/g),
      sourceHash: sha256(texts.room),
    },
    policy: {
      source: POLICY_SOURCE,
      composition: uniqueMatches(texts.policy, /composition\s+"([^"]+)"/g)[0] || '',
      templates: uniqueMatches(texts.policy, /template\s+"([^"]+)"/g),
      policies: uniqueMatches(texts.policy, /policy\s+"([^"]+)"/g),
      channels: uniqueMatches(texts.policy, /channel\s+"([^"]+)"/g),
      actions: uniqueMatches(texts.policy, /action\s+([A-Za-z0-9_]+)/g),
      sourceHash: sha256(texts.policy),
    },
    accessBridge: {
      source: ACCESS_BRIDGE,
      hash: sha256(texts.accessBridge),
      selfTestStatus: holotunnelSelfTest.parsed?.status || '',
      firstScreenActions: holotunnelSelfTest.parsed?.accessCard?.firstScreenActions?.map((action) => action.actionId) || [],
      qrPayloadIsStableUrl: Boolean(
        holotunnelSelfTest.parsed?.accessCard?.qr?.payloadUrl
        && holotunnelSelfTest.parsed.accessCard.qr.payloadUrl === holotunnelSelfTest.parsed.stableUrl
      ),
      firstScreenHidesDirectTunnelPath: !JSON.stringify(holotunnelSelfTest.parsed?.accessCard || {}).includes('/t/'),
    },
    webxrBridge: {
      source: WEBXR_BRIDGE,
      hash: sha256(texts.webxrBridge),
      anchors: [
        'XRSessionMode',
        'immersive-vr',
        'local-floor',
        'formFactorToSessionMode',
        "frameRate: targetMode === 'immersive-vr' ? 90",
      ].filter((anchor) => texts.webxrBridge.includes(anchor)),
    },
    webxrPipelineTest: {
      source: WEBXR_PIPELINE_TEST,
      hash: sha256(texts.webxrPipelineTest),
      anchors: [
        '.holo source -> parse -> AST -> R3F render -> WebXR session',
        'quest3',
        'maxTriangles: 1_500_000',
        'VR_FRAME_BUDGET_MS = 11.11',
      ].filter((anchor) => texts.webxrPipelineTest.includes(anchor)),
    },
    spec: {
      source: SPEC_SOURCE,
      hash: sha256(texts.spec),
      sourcePointersPresent: includesAll(texts.spec, [ROOM_SOURCE, POLICY_SOURCE, WEBXR_BRIDGE, WEBXR_PIPELINE_TEST]),
    },
    sourceMap: {
      source: SOURCE_MAP,
      hash: sha256(texts.sourceMap),
      sourcePointersPresent: includesAll(texts.sourceMap, [ROOM_SOURCE, POLICY_SOURCE]),
    },
  };
}

function buildAssertions({ semanticIr, parsers, holotunnelSelfTest, texts }) {
  return {
    sourceParser: parsers.every((parser) => parser.passed),
    roomDefinesQuestBrowserObjects: [
      'QuestBrowserEntryPanel',
      'HoloWorldSourceToken',
      'QuestWebXRReadinessPanel',
      'CreatorReceiptPanel',
      'PerformanceBudgetRail',
      'FallbackPanel',
    ].every((name) => semanticIr.room.objects.includes(name)),
    roomDefinesLaunchActions: [
      'open_in_quest_browser',
      'start_webxr_viewer',
      'capture_quest_browser_witness',
    ].every((name) => semanticIr.room.actions.includes(name)),
    policyDefinesViewerReceipt: semanticIr.policy.templates.includes('QuestBrowserViewerReceipt'),
    policyDefinesRequiredGates: [
      'HoloSourceMustParseBeforeLaunch',
      'StableHoloTunnelUrlStartsViewer',
      'QuestPerformanceBudgetRequired',
      'CreatorReceiptIsRequired',
    ].every((name) => semanticIr.policy.policies.includes(name)),
    policyCarriesQuestBudget: includesAll(texts.policy, [
      'targetFrameRate: 90',
      'frameBudgetMs: 11.11',
      'maxDrawCalls: 200',
      'maxTriangles: 1500000',
    ]),
    holotunnelSelfTestPassed: holotunnelSelfTest.passed,
    holotunnelStableQrContract: semanticIr.accessBridge.qrPayloadIsStableUrl
      && semanticIr.accessBridge.firstScreenHidesDirectTunnelPath
      && semanticIr.accessBridge.firstScreenActions.includes('open_on_headset'),
    webxrBridgeCarriesQuestMode: semanticIr.webxrBridge.anchors.length === 5,
    webxrPipelineCarriesHoloToWebxrBudget: semanticIr.webxrPipelineTest.anchors.length === 4,
    packageScript: texts.packageJson.includes('"check:hololand-quest-browser-webxr": "node scripts/check-hololand-quest-browser-webxr.mjs"'),
    specReferencesSourceLayer: semanticIr.spec.sourcePointersPresent,
    sourceMapReferencesSourceLayer: semanticIr.sourceMap.sourcePointersPresent,
  };
}

function assertReceipt(receipt) {
  const failures = [];
  for (const [name, passed] of Object.entries(receipt.assertions || {})) {
    if (!passed) failures.push(`failed assertion: ${name}`);
  }
  for (const parser of receipt.parsers || []) {
    if (!parser.passed) failures.push(`parser failed for ${parser.source}: ${parser.error || parser.stderrTail?.join(' ') || parser.status}`);
  }
  if (!receipt.holotunnelSelfTest?.passed) failures.push('HoloTunnel access self-test failed');
  if (!receipt.receipt?.receiptHash) failures.push('missing receipt hash');
  if (failures.length) throw new Error(failures.join('\n'));
}

function writeReceipt(output, receipt) {
  const resolved = repoPath(output);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return resolved;
}

function runCheck(args) {
  const texts = {
    room: read(ROOM_SOURCE),
    policy: read(POLICY_SOURCE),
    accessCard: read(ACCESS_CARD_SOURCE),
    accessBridge: read(ACCESS_BRIDGE),
    webxrBridge: read(WEBXR_BRIDGE),
    webxrPipelineTest: read(WEBXR_PIPELINE_TEST),
    spec: read(SPEC_SOURCE),
    sourceMap: read(SOURCE_MAP),
    packageJson: read(PACKAGE_JSON),
  };
  const parsers = [parseWithHoloScript(ROOM_SOURCE), parseWithHoloScript(POLICY_SOURCE)];
  const holotunnelSelfTest = runHoloTunnelSelfTest();
  const semanticIr = buildSemanticIr(texts, holotunnelSelfTest);
  const assertions = buildAssertions({ semanticIr, parsers, holotunnelSelfTest, texts });
  const receiptInput = {
    schemaVersion: SCHEMA_VERSION,
    semanticIr,
    assertions,
    parsers: parsers.map(({ stdoutTail: _stdoutTail, stderrTail: _stderrTail, ...parser }) => parser),
    holotunnelSelfTest: {
      passed: holotunnelSelfTest.passed,
      status: holotunnelSelfTest.status,
      accessStatus: holotunnelSelfTest.parsed?.status || '',
    },
  };
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sources: {
      room: ROOM_SOURCE,
      policy: POLICY_SOURCE,
      accessCard: ACCESS_CARD_SOURCE,
      accessBridge: ACCESS_BRIDGE,
      webxrBridge: WEBXR_BRIDGE,
      webxrPipelineTest: WEBXR_PIPELINE_TEST,
      spec: SPEC_SOURCE,
      sourceMap: SOURCE_MAP,
    },
    parsers,
    holotunnelSelfTest,
    semanticIr,
    assertions,
    policy: {
      sourceOwnedByHoloScript: true,
      questStorePresenceStillMissing: true,
      directTunnelUrlHiddenFromFirstScreen: true,
      creatorReceiptRequired: true,
      hardwareWitnessMayBePending: true,
      noHeadsetStorePresenceClaim: true,
    },
    receipt: {
      receiptHash: sha256(JSON.stringify(receiptInput)),
      rawSourceIncluded: false,
    },
  };

  assertReceipt(receipt);
  const output = writeReceipt(args.output, receipt);
  return { receipt, output };
}

try {
  const args = parseArgs();
  const { receipt, output } = runCheck(args);
  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log('[hololand-quest-browser-webxr] ok');
    console.log(`receipt: ${output}`);
    console.log(`room: ${receipt.sources.room}`);
    console.log(`policy: ${receipt.sources.policy}`);
    console.log(`webxr: ${receipt.sources.webxrBridge}`);
  }
} catch (error) {
  console.error('[hololand-quest-browser-webxr] failed');
  console.error(error.message || error);
  process.exit(1);
}
