#!/usr/bin/env node
import { execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 'hololand.gold-game-native-fixture.v0.1.0';
const SOURCE = 'apps/holoshell/source/hololand-gold-game-native-fixture.hsplus';
const LEGACY_GOLD_DEMO = 'examples/hololand-central/public/zones/holoplus_gold.hsplus';
const LEGACY_LEGENDS = 'examples/hololand-legends/game.hsplus';
const GAME_SYSTEMS = 'packages/components/templates/game-systems.holo';
const BRITTNEY_GAME_MODULE = 'packages/platform/library/src/AI/BrittneyGameModule.hsplus';
const PACKAGE_JSON = 'package.json';
const DEFAULT_OUTPUT = path.join('.tmp', 'gold-game-native-fixture', 'receipt.json');

const GOLD_ADAPTER_SURFACE_PATTERNS = [
  /^examples\/hololand-central\/.*\.(?:html|js|jsx|ts|tsx|css)$/i,
  /^examples\/hololand-legends\/src\/.*\.(?:html|js|jsx|ts|tsx|css)$/i,
  /^examples\/hololand-legends\/.*\.(?:html|js|jsx|ts|tsx|css)$/i,
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = { output: DEFAULT_OUTPUT, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') args.output = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Gold game native fixture check

Usage:
  node scripts/check-gold-game-native-fixture.mjs [--output <path>] [--json]

When BASE_REF and HEAD_REF are present, adapter/UI changes under the gold-game
surfaces require ${SOURCE} to change in the same diff.
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

function normalize(file) {
  return String(file || '').replace(/\\/g, '/');
}

function run(command) {
  return execSync(command, { encoding: 'utf8', windowsHide: true }).trim();
}

function findHoloScriptRoot() {
  const candidates = [
    process.env.HOLOSCRIPT_ROOT,
    path.resolve(process.cwd(), '..', 'HoloScript'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'package.json'))) return candidate;
  }
  return null;
}

function findHoloScriptCli(root) {
  if (!root) return null;
  const candidates = [
    process.env.HOLOSCRIPT_CLI,
    path.join(root, 'packages', 'cli', 'dist', 'cli.js'),
    path.join(root, 'packages', 'cli', 'bin', 'holoscript.cjs'),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function parseWithHoloScript(relativePath) {
  const root = findHoloScriptRoot();
  const cli = findHoloScriptCli(root);
  if (!root || !cli) {
    return {
      source: relativePath,
      passed: false,
      kind: 'missing_local_holoscript_cli',
      error: 'Set HOLOSCRIPT_ROOT or build ../HoloScript packages/cli before running this check.',
    };
  }

  const result = spawnSync(process.execPath, [cli, 'parse', repoPath(relativePath)], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
  });
  return {
    source: relativePath,
    passed: result.status === 0,
    kind: 'local_holoscript_cli',
    status: result.status,
    stdoutTail: String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean).slice(-4),
    stderrTail: String(result.stderr || result.error?.message || '').trim().split(/\r?\n/).filter(Boolean).slice(-6),
  };
}

function uniqueMatches(text, pattern, group = 1) {
  return [...new Set([...text.matchAll(pattern)].map((match) => match[group]).filter(Boolean))];
}

function includesAll(text, snippets) {
  return snippets.every((snippet) => text.includes(snippet));
}

function readChangedFiles() {
  const baseRef = process.env.BASE_REF;
  const headRef = process.env.HEAD_REF;
  if (!baseRef || !headRef) return { enabled: false, changedFiles: [] };

  const changedFilesRaw = run(`git diff --name-only --diff-filter=ACMR ${baseRef}...${headRef}`);
  const changedFiles = changedFilesRaw ? changedFilesRaw.split(/\r?\n/).map(normalize).filter(Boolean) : [];
  return { enabled: true, changedFiles };
}

function isGoldAdapterSurface(file) {
  return GOLD_ADAPTER_SURFACE_PATTERNS.some((pattern) => pattern.test(file));
}

function buildAdapterOnlyGate(changedFilesInfo) {
  const changedFiles = changedFilesInfo.changedFiles || [];
  const nativeFixtureChanged = changedFiles.includes(SOURCE);
  const adapterSurfaceChanges = changedFiles.filter(isGoldAdapterSurface);
  return {
    enabled: changedFilesInfo.enabled,
    nativeFixtureChanged,
    adapterSurfaceChanges,
    passed: !changedFilesInfo.enabled || adapterSurfaceChanges.length === 0 || nativeFixtureChanged,
    policy: 'gold-game adapter/UI changes require native HoloScript fixture updates',
  };
}

function buildSemanticIr(texts) {
  const templates = uniqueMatches(texts.source, /template\s+"([^"]+)"/g);
  const roomObjects = uniqueMatches(texts.source, /object\s+"([^"]+)"/g);
  const policies = uniqueMatches(texts.source, /policy\s+"([^"]+)"/g);
  const channels = uniqueMatches(texts.source, /channel\s+"([^"]+)"/g);

  return {
    fixture: {
      source: SOURCE,
      composition: uniqueMatches(texts.source, /composition\s+"([^"]+)"/g)[0] || '',
      templates,
      roomObjects,
      policies,
      channels,
      sourceHash: sha256(texts.source),
      sourceOwnedByHoloScript: texts.source.includes('sourceOwnedByHoloScript: true'),
    },
    scene: {
      id: 'central_hub',
      visibleObjects: ['CentralHub', 'HeroAvatar', 'BrittneyAgent', 'InteractiveBox', 'QuestStatusPanel', 'RewardLedger'],
      legacyGoldAnchors: uniqueMatches(texts.goldDemo, /template\s+"([^"]+)"/g),
      sourceOwnedByHoloScript: texts.source.includes('template "GoldSceneCentralHub"'),
    },
    player: {
      id: 'HeroAvatar',
      movementModel: 'four_directional_grid_or_room_space',
      inputActions: ['move_player', 'talk_to_brittney', 'grab_interactive_box', 'open_status_panel'],
      sourceOwnedByHoloScript: texts.source.includes('template "GoldPlayerAvatar"'),
    },
    brittneyAgent: {
      id: 'BrittneyAgent',
      dialogueSystem: texts.gameSystems.includes('template "DialogueSystem"'),
      generationModule: texts.brittneyModule.includes('generateNPCDialogue') && texts.brittneyModule.includes('generateQuest'),
      sourceOwnedByHoloScript: texts.source.includes('template "GoldBrittneyAgent"'),
    },
    interactiveObject: {
      id: 'InteractiveBox',
      interactions: ['hover', 'grab', 'release', 'quest_objective_progress'],
      sourceOwnedByHoloScript: texts.source.includes('template "GoldInteractiveBox"'),
    },
    gameLoop: {
      phases: ['input', 'simulation', 'interaction', 'quest', 'reward', 'render_receipt'],
      sourceOwnedByHoloScript: texts.source.includes('template "GoldGameLoop"'),
    },
    quest: {
      systemTemplate: 'QuestSystem',
      objectives: ['talk_to_brittney', 'inspect_central_hub', 'grab_interactive_box', 'open_receipt'],
      gameSystemHasQuestActions: includesAll(texts.gameSystems, ['action start_quest', 'action update_objective', 'action complete_quest']),
      legacyLegendsAnchors: includesAll(texts.legends, ['composition "HololandLegends"', 'object "Hero"', 'object "BattleScene"']),
      sourceOwnedByHoloScript: texts.source.includes('template "GoldQuestSystemBinding"'),
    },
    reward: {
      types: ['gold_token', 'xp', 'receipt_badge'],
      systemEmitsRewards: texts.gameSystems.includes('emit "grant_reward"'),
      brittneyRewardsTyped: includesAll(texts.brittneyModule, ['struct QuestReward', 'type: "gold" | "item" | "xp" | "ability"']),
      sourceOwnedByHoloScript: texts.source.includes('rewards: ["gold_token", "xp", "source_receipt_credit"]'),
    },
    uiStatus: {
      statusPanels: ['QuestStatusPanel', 'RewardLedger', 'ReceiptPanel'],
      legacyUiRole: 'adapter_evidence_only',
      sourceOwnedByHoloScript: texts.source.includes('template "GoldUiStatusProjection"'),
    },
    receipt: {
      schemaVersion: SCHEMA_VERSION,
      sourceRequiredBeforeProjection: texts.source.includes('sourceRequiredBeforeProjection: true'),
      receiptRequiredBeforeProjection: texts.source.includes('receiptRequiredBeforeProjection: true'),
      handAuthoredUiMayNotOwnBehavior: texts.source.includes('handAuthoredUiMayNotOwnBehavior: true'),
    },
    evidence: {
      [LEGACY_GOLD_DEMO]: {
        hash: sha256(texts.goldDemo),
        anchors: ['HoloScriptGoldDemo', 'CentralHub', 'BrittneyAgent', 'InteractiveBox'].filter((anchor) => texts.goldDemo.includes(anchor)),
        parserEnforced: true,
      },
      [LEGACY_LEGENDS]: {
        hash: sha256(texts.legends),
        anchors: ['HololandLegends', 'Hero', 'BattleScene', 'encounterTables'].filter((anchor) => texts.legends.includes(anchor)),
        parserEnforced: false,
        parserNote: 'Legacy syntax is evidence-only until upgraded to current HoloScript parser syntax.',
      },
      [GAME_SYSTEMS]: {
        hash: sha256(texts.gameSystems),
        anchors: ['QuestSystem', 'DialogueSystem', 'AchievementSystem', 'SaveSystem'].filter((anchor) => texts.gameSystems.includes(anchor)),
        parserEnforced: true,
      },
      [BRITTNEY_GAME_MODULE]: {
        hash: sha256(texts.brittneyModule),
        anchors: ['BrittneyGameModule', 'generateNPCDialogue', 'generateQuest', 'QuestReward'].filter((anchor) => texts.brittneyModule.includes(anchor)),
        parserEnforced: false,
      },
    },
  };
}

function buildAssertions({ texts, semanticIr, parserReceipts, packageJson, adapterOnlyGate }) {
  return {
    sourceParser: parserReceipts.every((parser) => parser.passed),
    packageScript: packageJson.includes('"check:gold-game-native-fixture": "node scripts/check-gold-game-native-fixture.mjs"'),
    nativeFixtureSource: texts.source.includes('nativeFixtureId: "hololand.gold-game.native-fixture"'),
    semanticIr: semanticIr.fixture.templates.includes('GoldGameSemanticIR'),
    scene: semanticIr.scene.sourceOwnedByHoloScript && semanticIr.scene.legacyGoldAnchors.length >= 3,
    player: semanticIr.player.sourceOwnedByHoloScript,
    brittneyAgent: semanticIr.brittneyAgent.sourceOwnedByHoloScript && semanticIr.brittneyAgent.dialogueSystem && semanticIr.brittneyAgent.generationModule,
    interactiveObject: semanticIr.interactiveObject.sourceOwnedByHoloScript,
    gameLoop: semanticIr.gameLoop.sourceOwnedByHoloScript && semanticIr.gameLoop.phases.length >= 6,
    quest: semanticIr.quest.sourceOwnedByHoloScript && semanticIr.quest.gameSystemHasQuestActions && semanticIr.quest.legacyLegendsAnchors,
    reward: semanticIr.reward.sourceOwnedByHoloScript && semanticIr.reward.systemEmitsRewards && semanticIr.reward.brittneyRewardsTyped,
    uiStatus: semanticIr.uiStatus.sourceOwnedByHoloScript && texts.source.includes('legacyUiRole: "adapter_evidence_only"'),
    receipt: Object.values(semanticIr.receipt).every(Boolean),
    sourceOwnsBehavior: includesAll(texts.source, [
      'sourceRequiredBeforeProjection: true',
      'receiptRequiredBeforeProjection: true',
      'handAuthoredUiMayNotOwnBehavior: true',
      'adapterMayOnlyProject: true',
    ]),
    legacyEvidence: Object.values(semanticIr.evidence).every((entry) => entry.hash && entry.anchors.length > 0),
    adapterOnlyDiffGate: adapterOnlyGate.passed,
  };
}

function assertReceipt(receipt) {
  const failures = [];
  for (const [name, passed] of Object.entries(receipt.assertions || {})) {
    if (!passed) failures.push(`missing gold game semantic: ${name}`);
  }
  for (const parser of receipt.parsers || []) {
    if (!parser.passed) failures.push(`parser failed for ${parser.source}: ${parser.error || parser.stderrTail?.join(' ') || parser.status}`);
  }
  if (!receipt.receipt?.receiptHash) failures.push('missing receipt hash');
  if (!receipt.regressionGate?.passed) {
    failures.push(`${receipt.regressionGate.policy}: ${receipt.regressionGate.adapterSurfaceChanges.join(', ')}`);
  }
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
    source: read(SOURCE),
    goldDemo: read(LEGACY_GOLD_DEMO),
    legends: read(LEGACY_LEGENDS),
    gameSystems: read(GAME_SYSTEMS),
    brittneyModule: read(BRITTNEY_GAME_MODULE),
  };
  const packageJson = read(PACKAGE_JSON);
  const changedFiles = readChangedFiles();
  const adapterOnlyGate = buildAdapterOnlyGate(changedFiles);
  const semanticIr = buildSemanticIr(texts);
  const parsers = [parseWithHoloScript(SOURCE), parseWithHoloScript(LEGACY_GOLD_DEMO), parseWithHoloScript(GAME_SYSTEMS)];
  const assertions = buildAssertions({ texts, semanticIr, parserReceipts: parsers, packageJson, adapterOnlyGate });
  const receiptInput = {
    schemaVersion: SCHEMA_VERSION,
    sourceHash: semanticIr.fixture.sourceHash,
    evidenceHashes: Object.fromEntries(Object.entries(semanticIr.evidence).map(([source, entry]) => [source, entry.hash])),
    semanticIr,
    assertions,
    regressionGate: adapterOnlyGate,
  };
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sources: {
      nativeFixture: SOURCE,
      legacyGoldDemo: LEGACY_GOLD_DEMO,
      legacyLegends: LEGACY_LEGENDS,
      gameSystems: GAME_SYSTEMS,
      brittneyGameModule: BRITTNEY_GAME_MODULE,
    },
    parsers,
    semanticIr,
    assertions,
    regressionGate: adapterOnlyGate,
    policy: {
      sourceOwnedByHoloScript: true,
      handAuthoredUiMayNotOwnBehavior: true,
      typescriptMayOnlyAdapt: true,
      r3fMayOnlyAdapt: true,
      htmlMayOnlyAdapt: true,
      receiptRequiredBeforeProjection: true,
    },
    receipt: {
      receiptHash: sha256(JSON.stringify(receiptInput)),
      rawAdapterCodeIncluded: false,
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
    console.log('[gold-game-native-fixture] ok');
    console.log(`receipt: ${output}`);
    console.log(`source: ${receipt.sources.nativeFixture}`);
    console.log(`templates: ${receipt.semanticIr.fixture.templates.length}`);
    console.log(`legacy evidence: ${Object.keys(receipt.semanticIr.evidence).length}`);
    console.log(`regression gate: ${receipt.regressionGate.enabled ? 'enabled' : 'not enabled'}`);
  }
} catch (error) {
  console.error('[gold-game-native-fixture] failed');
  console.error(error.message || error);
  process.exit(1);
}
