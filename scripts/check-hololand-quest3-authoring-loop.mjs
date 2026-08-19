#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 'hololand.quest3-authoring.v0.1.0';
const ROOM_SOURCE = 'apps/holoshell/source/hololand-quest3-authoring-room.holo';
const POLICY_SOURCE = 'apps/holoshell/source/hololand-quest3-authoring-policy.hsplus';
const SPEC_SOURCE = 'docs/specs/QUEST3_IN_WORLD_AUTHORING_LOOP.md';
const VR_STUDIO_DESIGN = 'docs/VR_STUDIO_DESIGN.md';
const QUICKSTART = 'docs/CREATOR_QUICKSTART.md';
const SOURCE_MAP = 'apps/holoshell/docs/HOLOSHELL_SOURCE_MAP.md';
const VOICE_PIPELINE = 'packages/brittney/ai-bridge/src/VoiceMCPPipeline.ts';
const AI_BRIDGE = 'packages/brittney/ai-bridge/src/HololandAIBridge.ts';
const SPATIAL_BRIDGE = 'packages/spatial-builder/src/services/SpatialBridgeService.ts';
const TRACKING_BINDINGS = 'packages/ar/tracking/src/holoscript/bindings.ts';
const QUEST_VIEWER = 'apps/holoshell/source/hololand-quest-browser-webxr-viewer.holo';
const PACKAGE_JSON = 'package.json';
const DEFAULT_OUTPUT = path.join('.tmp', 'hololand-quest3-authoring-loop', 'receipt.json');

function parseArgs(argv = process.argv.slice(2)) {
  const args = { output: DEFAULT_OUTPUT, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') args.output = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`HoloLand Quest 3 in-world authoring check

Usage:
  node scripts/check-hololand-quest3-authoring-loop.mjs [--output <path>] [--json]
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
  const tempDir = repoPath(path.join('.tmp', 'hololand-quest3-authoring-loop'));
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

function buildSemanticIr(texts) {
  return {
    room: {
      source: ROOM_SOURCE,
      composition: uniqueMatches(texts.room, /composition\s+"([^"]+)"/g)[0] || '',
      templates: uniqueMatches(texts.room, /template\s+"([^"]+)"/g),
      objects: uniqueMatches(texts.room, /object\s+"([^"]+)"/g),
      groups: uniqueMatches(texts.room, /spatial_group\s+"([^"]+)"/g),
      channels: uniqueMatches(texts.room, /channel_id:\s+"([^"]+)"/g),
      actions: uniqueMatches(texts.room, /action_id:\s+"([^"]+)"/g),
      policies: uniqueMatches(texts.room, /policy_id:\s+"([^"]+)"/g),
      sourceHash: sha256(texts.room),
    },
    policy: {
      source: POLICY_SOURCE,
      composition: uniqueMatches(texts.policy, /composition\s+"([^"]+)"/g)[0] || '',
      templates: uniqueMatches(texts.policy, /template\s+"([^"]+)"/g),
      channels: uniqueMatches(texts.policy, /channel\s+"([^"]+)"/g),
      policies: uniqueMatches(texts.policy, /policy\s+"([^"]+)"/g),
      actions: uniqueMatches(texts.policy, /action\s+([A-Za-z0-9_]+)/g),
      sourceHash: sha256(texts.policy),
    },
    anchors: {
      voicePipeline: {
        source: VOICE_PIPELINE,
        hash: sha256(texts.voicePipeline),
        anchors: ['VoiceMCPPipeline', 'brittney_generate_holoscript', 'suggest_traits', 'onPreviewUpdate'].filter((anchor) => texts.voicePipeline.includes(anchor)),
      },
      aiBridge: {
        source: AI_BRIDGE,
        hash: sha256(texts.aiBridge),
        anchors: ['translateToHoloScript', 'processVoiceCommand', 'enterWorld'].filter((anchor) => texts.aiBridge.includes(anchor)),
      },
      spatialBridge: {
        source: SPATIAL_BRIDGE,
        hash: sha256(texts.spatialBridge),
        anchors: ['compileIntentToTraits', 'processVoiceAgentPayload', 'namespace', 'properties'].filter((anchor) => texts.spatialBridge.includes(anchor)),
      },
      trackingBindings: {
        source: TRACKING_BINDINGS,
        hash: sha256(texts.trackingBindings),
        anchors: ['getHandPositions', 'left_wrist', 'right_wrist', 'TrackingBlock'].filter((anchor) => texts.trackingBindings.includes(anchor)),
      },
      questViewer: {
        source: QUEST_VIEWER,
        hash: sha256(texts.questViewer),
        anchors: ['targetFrameRate: 90', 'frameBudgetMs: 11.11', 'maxDrawCalls: 200', 'maxTriangles: 1500000'].filter((anchor) => texts.questViewer.includes(anchor)),
      },
    },
    docs: {
      spec: {
        source: SPEC_SOURCE,
        hash: sha256(texts.spec),
        sourcePointersPresent: includesAll(texts.spec, [ROOM_SOURCE, POLICY_SOURCE, VOICE_PIPELINE, SPATIAL_BRIDGE, TRACKING_BINDINGS]),
      },
      vrStudioDesign: {
        source: VR_STUDIO_DESIGN,
        hash: sha256(texts.vrStudioDesign),
        sourcePointersPresent: includesAll(texts.vrStudioDesign, [ROOM_SOURCE, POLICY_SOURCE, SPEC_SOURCE]),
      },
      quickstart: {
        source: QUICKSTART,
        hash: sha256(texts.quickstart),
        sourcePointersPresent: includesAll(texts.quickstart, [ROOM_SOURCE, POLICY_SOURCE, SPEC_SOURCE]),
      },
      sourceMap: {
        source: SOURCE_MAP,
        hash: sha256(texts.sourceMap),
        sourcePointersPresent: includesAll(texts.sourceMap, [ROOM_SOURCE, POLICY_SOURCE]),
      },
    },
  };
}

function buildAssertions({ semanticIr, parsers, texts }) {
  return {
    sourceParser: parsers.every((parser) => parser.passed),
    roomDefinesAuthoringObjects: [
      'VoiceWorldIntentPanel',
      'GestureTraitBindingPanel',
      'TraitSuggestionPanel',
      'SourcePatchPreviewPanel',
      'QuestFrameBudgetPanel',
      'ReceiptWitnessPanel',
      'ResoniteBoundaryPanel',
    ].every((name) => semanticIr.room.objects.includes(name)),
    roomDefinesAuthoringActions: [
      'capture_voice_world_intent',
      'bind_gesture_to_trait',
      'preview_holoscript_patch',
      'confirm_authoring_commit',
      'record_authoring_receipt',
    ].every((name) => semanticIr.room.actions.includes(name)),
    policyDefinesPackets: [
      'VoiceWorldIntentPacket',
      'GestureTraitBindingPacket',
      'InWorldAuthoringPatch',
      'Quest3AuthoringReceipt',
    ].every((name) => semanticIr.policy.templates.includes(name)),
    policyDefinesRequiredGates: [
      'VoiceIntentMustBecomeHoloScriptPatch',
      'GestureTraitBindingRequiresConfirm',
      'QuestPreviewBeforeCommit',
      'NoResoniteProtoFluxParityClaim',
      'CollaborationAndHeadlessStillBackendWork',
    ].every((name) => semanticIr.policy.policies.includes(name)),
    policyCarriesGestureSet: includesAll(texts.policy, [
      'point_select',
      'pinch_grab',
      'wrist_rotate',
      'two_hand_scale',
      'palm_inspect',
      'air_draw',
      'cup_spawn',
      'wrist_save',
    ]),
    policyCarriesQuestBudget: includesAll(texts.policy, [
      'targetFrameRate: 90',
      'frameBudgetMs: 11.11',
      'maxDrawCalls: 200',
      'maxTriangles: 1500000',
    ]),
    noProtoFluxParityClaim: includesAll(texts.policy, [
      'realtimeNodeScriptingRuntimePresent: false',
      'collaborativeGraphRuntimePresent: false',
      'headlessSelfHostedSessionPresent: false',
      'noParityClaimAllowed: true',
    ]),
    existingVoicePipelineAnchors: semanticIr.anchors.voicePipeline.anchors.length === 4,
    existingAiBridgeAnchors: semanticIr.anchors.aiBridge.anchors.length === 3,
    existingSpatialBridgeAnchors: semanticIr.anchors.spatialBridge.anchors.length === 4,
    existingTrackingAnchors: semanticIr.anchors.trackingBindings.anchors.length === 4,
    existingQuestBudgetAnchors: semanticIr.anchors.questViewer.anchors.length === 4,
    specReferencesSourceLayer: semanticIr.docs.spec.sourcePointersPresent,
    vrStudioDesignReferencesSourceLayer: semanticIr.docs.vrStudioDesign.sourcePointersPresent,
    quickstartReferencesSourceLayer: semanticIr.docs.quickstart.sourcePointersPresent,
    sourceMapReferencesSourceLayer: semanticIr.docs.sourceMap.sourcePointersPresent,
    packageScript: texts.packageJson.includes('"check:hololand-quest3-authoring-loop": "node scripts/check-hololand-quest3-authoring-loop.mjs"'),
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
    spec: read(SPEC_SOURCE),
    vrStudioDesign: read(VR_STUDIO_DESIGN),
    quickstart: read(QUICKSTART),
    sourceMap: read(SOURCE_MAP),
    voicePipeline: read(VOICE_PIPELINE),
    aiBridge: read(AI_BRIDGE),
    spatialBridge: read(SPATIAL_BRIDGE),
    trackingBindings: read(TRACKING_BINDINGS),
    questViewer: read(QUEST_VIEWER),
    packageJson: read(PACKAGE_JSON),
  };
  const parsers = [parseWithHoloScript(ROOM_SOURCE), parseWithHoloScript(POLICY_SOURCE)];
  const semanticIr = buildSemanticIr(texts);
  const assertions = buildAssertions({ semanticIr, parsers, texts });
  const receiptInput = {
    schemaVersion: SCHEMA_VERSION,
    semanticIr,
    assertions,
    parsers: parsers.map(({ stdoutTail: _stdoutTail, stderrTail: _stderrTail, ...parser }) => parser),
  };
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sources: {
      room: ROOM_SOURCE,
      policy: POLICY_SOURCE,
      spec: SPEC_SOURCE,
      vrStudioDesign: VR_STUDIO_DESIGN,
      quickstart: QUICKSTART,
      sourceMap: SOURCE_MAP,
      voicePipeline: VOICE_PIPELINE,
      aiBridge: AI_BRIDGE,
      spatialBridge: SPATIAL_BRIDGE,
      trackingBindings: TRACKING_BINDINGS,
      questViewer: QUEST_VIEWER,
    },
    parsers,
    semanticIr,
    assertions,
    policy: {
      sourceOwnedByHoloScript: true,
      voiceToWorldContractDefined: true,
      gestureToTraitContractDefined: true,
      previewBeforeCommitRequired: true,
      noResoniteProtoFluxParityClaim: true,
      collaborationAndHeadlessStillGaps: true,
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
    console.log('[hololand-quest3-authoring-loop] ok');
    console.log(`receipt: ${output}`);
    console.log(`room: ${receipt.sources.room}`);
    console.log(`policy: ${receipt.sources.policy}`);
    console.log(`spec: ${receipt.sources.spec}`);
  }
} catch (error) {
  console.error('[hololand-quest3-authoring-loop] failed');
  console.error(error.message || error);
  process.exit(1);
}
