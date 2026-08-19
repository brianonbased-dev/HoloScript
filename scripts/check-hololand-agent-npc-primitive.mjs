#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 'hololand.agent-npc-primitive.v0.1.0';
const POLICY_SOURCE = 'apps/holoshell/source/hololand-agent-npc-primitive.hsplus';
const WORLD_SOURCE = 'apps/holoshell/source/hololand-agent-npc-world.holo';
const SPEC_SOURCE = 'docs/specs/HOLOLAND_AGENT_NPC_PRIMITIVE.md';
const NPC_MANIFEST = 'docs/specs/hololand-npc-manifest.holo';
const ACCESS_CONTRACT = 'docs/BRITTNEY_ACCESS_CONTRACT.md';
const OWNERSHIP_MODEL = 'docs/BRITTNEY_OWNERSHIP_MODEL.md';
const SOURCE_MAP = 'apps/holoshell/docs/HOLOSHELL_SOURCE_MAP.md';
const PACKAGE_JSON = 'package.json';
const DEFAULT_OUTPUT = path.join('.tmp', 'hololand-agent-npc-primitive', 'receipt.json');

function parseArgs(argv = process.argv.slice(2)) {
  const args = { output: DEFAULT_OUTPUT, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') args.output = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`HoloLand agent NPC primitive check

Usage:
  node scripts/check-hololand-agent-npc-primitive.mjs [--output <path>] [--json]
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
  const tempDir = repoPath(path.join('.tmp', 'hololand-agent-npc-primitive'));
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

  const result = runTsxTemp(script, `parse-${path.basename(relativePath).replace(/[^a-z0-9]/gi, '-')}`, { pnpmDir: root });
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
    policy: {
      source: POLICY_SOURCE,
      composition: uniqueMatches(texts.policy, /composition\s+"([^"]+)"/g)[0] || '',
      templates: uniqueMatches(texts.policy, /template\s+"([^"]+)"/g),
      policies: uniqueMatches(texts.policy, /policy\s+"([^"]+)"/g),
      actions: uniqueMatches(texts.policy, /^\s*action\s+([A-Za-z0-9_]+)/gm),
      emits: uniqueMatches(texts.policy, /emit\("([^"]+)"/g),
      sourceHash: sha256(texts.policy),
    },
    world: {
      source: WORLD_SOURCE,
      composition: uniqueMatches(texts.world, /composition\s+"([^"]+)"/g)[0] || '',
      templates: uniqueMatches(texts.world, /template\s+"([^"]+)"/g),
      objects: uniqueMatches(texts.world, /object\s+"([^"]+)"/g),
      groups: uniqueMatches(texts.world, /spatial_group\s+"([^"]+)"/g),
      actions: uniqueMatches(texts.world, /^\s*action\s+([A-Za-z0-9_]+)/gm),
      sourceHash: sha256(texts.world),
    },
    docs: {
      spec: {
        source: SPEC_SOURCE,
        hash: sha256(texts.spec),
        sourcePointersPresent: includesAll(texts.spec, [POLICY_SOURCE, WORLD_SOURCE]),
      },
      npcManifest: {
        source: NPC_MANIFEST,
        hash: sha256(texts.npcManifest),
        anchors: ['NPCManifest', 'AutonomousAgenda', 'ReputationLedger', 'TranscriptAttributionTest'].filter((anchor) => texts.npcManifest.includes(anchor)),
      },
      accessContract: {
        source: ACCESS_CONTRACT,
        hash: sha256(texts.accessContract),
        anchors: ['In-world NPC/steward embodiment', 'world id', 'rollback plan'].filter((anchor) => texts.accessContract.includes(anchor)),
      },
      ownershipModel: {
        source: OWNERSHIP_MODEL,
        hash: sha256(texts.ownershipModel),
        anchors: ['HoloLand NPCs', 'HoloMesh teammates', 'emit receipts'].filter((anchor) => texts.ownershipModel.includes(anchor)),
      },
      sourceMap: {
        source: SOURCE_MAP,
        hash: sha256(texts.sourceMap),
        sourcePointersPresent: includesAll(texts.sourceMap, [POLICY_SOURCE, WORLD_SOURCE]),
      },
    },
  };
}

function buildAssertions({ semanticIr, parsers, texts }) {
  return {
    sourceParser: parsers.every((parser) => parser.passed),
    policyDefinesAgentNpcTemplates: [
      'HoloMeshAgentNpcManifest',
      'MiraWayfinderBrain',
      'SharedWorldStateBinding',
      'AgentNpcActionReceipt',
    ].every((name) => semanticIr.policy.templates.includes(name)),
    policyDefinesIdentityAndReceiptGates: [
      'HoloMeshAgentIdentityRequired',
      'WorldStateMutationRequiresReceipt',
      'NoOpaqueScriptedDialogueBlackBox',
      'LocalFirstBrittneyLineage',
    ].every((name) => semanticIr.policy.policies.includes(name)),
    policyDefinesRuntimeActions: [
      'register_agent_npc',
      'observe_shared_world_state',
      'propose_world_action',
      'apply_receipted_action',
    ].every((name) => semanticIr.policy.actions.includes(name)),
    policyCarriesRequiredIdentityTokens: includesAll(texts.policy, [
      'holomeshAgentId',
      'x402SeatId',
      'brainSource',
      'sharedWorldStateReadKeys',
      'sharedWorldStateWriteKeys',
      'scriptedDialogueOnly: false',
      'rawSecretsIncluded: false',
      'reExecutable: true',
    ]),
    worldEmbedsPlayerVisibleNpc: [
      'MiraWayfinderAgentNpc',
      'SharedWorldStateBoard',
      'AgentActionReceiptLedger',
    ].every((name) => semanticIr.world.objects.includes(name)),
    worldCarriesHoloMeshIdentity: includesAll(texts.world, [
      'holomesh://agent/mira-wayfinder',
      'x402://hololand/npc/mira-wayfinder',
      'blackBoxDialogueEndpoint: false',
      'actionReceiptsRequired: true',
      'playerVisibleEmbodiment: true',
    ]),
    specReferencesSourceLayer: semanticIr.docs.spec.sourcePointersPresent,
    npcManifestStillDefinesDeepNpcTraits: semanticIr.docs.npcManifest.anchors.length === 4,
    accessContractSupportsInWorldReceipts: semanticIr.docs.accessContract.anchors.length === 3,
    ownershipModelRejectsChatbotNpc: semanticIr.docs.ownershipModel.anchors.length === 3,
    sourceMapReferencesSourceLayer: semanticIr.docs.sourceMap.sourcePointersPresent,
    packageScript: texts.packageJson.includes('"check:hololand-agent-npc-primitive": "node scripts/check-hololand-agent-npc-primitive.mjs"'),
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
    policy: read(POLICY_SOURCE),
    world: read(WORLD_SOURCE),
    spec: read(SPEC_SOURCE),
    npcManifest: read(NPC_MANIFEST),
    accessContract: read(ACCESS_CONTRACT),
    ownershipModel: read(OWNERSHIP_MODEL),
    sourceMap: read(SOURCE_MAP),
    packageJson: read(PACKAGE_JSON),
  };
  const parsers = [parseWithHoloScript(POLICY_SOURCE), parseWithHoloScript(WORLD_SOURCE)];
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
    matrixGap: 'HL-014',
    competitorBoundary: {
      benchmark: 'Inworld AI',
      rentedDialogueEndpoint: false,
      nativeHolomeshAgent: true,
      x402IdentityRequired: true,
      receiptsRequiredForWorldEffects: true,
    },
    sources: {
      policy: POLICY_SOURCE,
      world: WORLD_SOURCE,
      spec: SPEC_SOURCE,
      npcManifest: NPC_MANIFEST,
      accessContract: ACCESS_CONTRACT,
      ownershipModel: OWNERSHIP_MODEL,
      sourceMap: SOURCE_MAP,
    },
    parsers,
    semanticIr,
    assertions,
    primitive: {
      npcEntityId: 'npc-mira-wayfinder-agent',
      holomeshAgentId: 'holomesh://agent/mira-wayfinder',
      x402SeatId: 'x402://hololand/npc/mira-wayfinder',
      brainSource: POLICY_SOURCE + '#MiraWayfinderBrain',
      embeddedWorldSource: WORLD_SOURCE,
      sharedWorldStatePresent: true,
      playerVisibleEmbodimentPresent: true,
      actionReceiptRequired: true,
      localFirstRoute: 'local-gguf',
      fallbackOrder: ['lan-ollama', 'byok-cloud', 'managed-hololand'],
    },
    receipt: {
      receiptHash: sha256(JSON.stringify(receiptInput)),
      rawSourceIncluded: false,
      output: args.output.replace(/\\/g, '/'),
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
    console.log('[hololand-agent-npc-primitive] ok');
    console.log(`receipt: ${output}`);
    console.log(`policy: ${receipt.sources.policy}`);
    console.log(`world: ${receipt.sources.world}`);
  }
} catch (error) {
  console.error('[hololand-agent-npc-primitive] failed');
  console.error(error.message || error);
  process.exit(1);
}
