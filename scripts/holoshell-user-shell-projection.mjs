#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SCHEMA_VERSION = 'hololand.holoshell.user-shell-projection.v0.1.0';
const DEFAULT_FOUNDER_BOOT = '.tmp/holoshell/founder-boot-preview.json';
const DEFAULT_FORMAT_INVENTORY = '.tmp/holoshell/format-inventory.json';
const DEFAULT_SHELL_OBJECTS = '.tmp/holoshell/shell-objects.json';
const DEFAULT_WORKFLOW = '.tmp/holoshell/workflow-latest.json';
const DEFAULT_SHARD_WORKFLOW = '.tmp/holoshell/shard-workflow-latest.json';
const DEFAULT_OUTPUT = '.tmp/holoshell/user-shell-projection.json';
const DEFAULT_JS_OUTPUT = '.tmp/holoshell/user-shell-projection.js';

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    founderBoot: DEFAULT_FOUNDER_BOOT,
    formatInventory: DEFAULT_FORMAT_INVENTORY,
    shellObjects: DEFAULT_SHELL_OBJECTS,
    workflow: DEFAULT_WORKFLOW,
    shardWorkflow: DEFAULT_SHARD_WORKFLOW,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    json: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--founder-boot') args.founderBoot = argv[++index];
    else if (arg === '--format-inventory') args.formatInventory = argv[++index];
    else if (arg === '--shell-objects') args.shellObjects = argv[++index];
    else if (arg === '--workflow') args.workflow = argv[++index];
    else if (arg === '--shard-workflow') args.shardWorkflow = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`HoloShell user shell projection

Usage:
  node scripts/holoshell-user-shell-projection.mjs [options]

Options:
  --founder-boot <path>       Founder boot preview receipt.
  --format-inventory <path>   Format inventory receipt.
  --shell-objects <path>      Shell object graph receipt.
  --workflow <path>           Room/workflow receipt.
  --shard-workflow <path>     Asset shard workflow receipt.
  --output <path>             JSON output.
  --js-output <path>          Browser bootstrap output.
  --json                      Print JSON.
  --self-test                 Assert projection invariants.
  -h, --help                  Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath, fallback = {}) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (error) {
    return { ...fallback, readError: error.message };
  }
}

function writeText(filePath, text) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, text, 'utf8');
  return resolved;
}

function writeJson(filePath, value) {
  return writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeBrowserBootstrap(filePath, value) {
  const payload = JSON.stringify(value, null, 2).replace(/<\/script/gi, '<\\/script');
  return writeText(filePath, `window.HOLOSHELL_USER_SHELL_PROJECTION = ${payload};\n`);
}

function hashText(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function packFromFounder(pack) {
  const isExcel = pack.id.includes('excel');
  return {
    id: pack.id,
    label: pack.label,
    derivedFrom: pack.derivedFrom || 'founder_surface',
    userSurface: pack.userSurface || 'capability_bubble',
    targetObjectId: pack.targetObjectId || '',
    permissionEnvelope: pack.permissionEnvelope || 'guarded_execute',
    executionDefault: pack.executionDefault || 'staged_not_run',
    steps: pack.steps || [],
    receiptTypes: pack.receiptTypes || ['approval_bundle'],
    modeIds: isExcel ? ['user.daily', 'user.operator'] : ['user.daily'],
    userPhrase: isExcel ? 'Open Excel' : 'Play lofi music',
    brittneyInterpretation: isExcel
      ? 'Find the document app bubble, show a launch approval, then launch after user gesture.'
      : 'Open a browser media portal, navigate to a lofi target, then start playback after user gesture.',
  };
}

function capabilityPacks(founderBoot, workflow, shardWorkflow) {
  const packs = (founderBoot.userCapabilityPacks || []).map(packFromFounder);
  packs.push({
    id: 'user-pack.room-marathon',
    label: 'Start Room Marathon',
    derivedFrom: 'founder.agent_room_orchestration',
    userSurface: 'workflow_bubble',
    targetObjectId: 'room-marathon',
    permissionEnvelope: 'guarded_execute',
    executionDefault: 'staged_not_run',
    steps: ['open_terminal', 'run_sovereign_room_marathon', 'open_browser', 'play_lofi_after_user_gesture'],
    receiptTypes: ['workflow_receipt', 'workflow_approval_bundle', 'brain_intent_gate_receipt'],
    modeIds: ['user.daily', 'user.operator'],
    userPhrase: 'Start a sovereign room marathon for local-tagged tasks',
    brittneyInterpretation: 'Stage the terminal, local room queue, sovereign task claim, browser, and lofi as one approval packet.',
    currentReceiptStatus: workflow.summary?.status || 'unknown',
  });
  packs.push({
    id: 'user-pack.sovereign-room-status',
    label: 'Sovereign Room Status',
    derivedFrom: 'founder.agent_room_orchestration',
    userSurface: 'workflow_bubble',
    targetObjectId: 'workflow.sovereign-room-marathon',
    permissionEnvelope: 'read_only',
    executionDefault: 'inspect_only',
    steps: ['read_sovereign_room_receipt', 'show_task_lane', 'show_selected_task'],
    receiptTypes: ['sovereign_room_marathon_receipt'],
    modeIds: ['user.daily', 'user.operator'],
    userPhrase: 'Check the sovereign room queue',
    brittneyInterpretation: 'Read the latest sovereign room receipt without claiming or marking any task done.',
    currentReceiptStatus: workflow.summary?.sovereignRoomMarathonStatus || 'unknown',
  });
  packs.push({
    id: 'user-pack.asset-shard-preview',
    label: 'Make Playable Shard',
    derivedFrom: 'founder.creator_pipeline',
    userSurface: 'creator_bubble',
    targetObjectId: 'asset-shard',
    permissionEnvelope: 'guarded_execute',
    executionDefault: 'staged_not_run',
    steps: ['choose_local_folder', 'classify_assets', 'generate_preview_holo', 'request_import_approval'],
    receiptTypes: ['asset_shard_workflow_receipt', 'asset_shard_import_approval'],
    modeIds: ['user.creator'],
    userPhrase: 'Turn this folder into a playable HoloLand shard',
    brittneyInterpretation: 'Build a preview from local assets and keep source mutation behind an import approval.',
    currentReceiptStatus: shardWorkflow.summary?.status || 'unknown',
  });
  packs.push({
    id: 'user-pack.format-learning',
    label: 'Learn Source Formats',
    derivedFrom: 'founder.format_inventory',
    userSurface: 'format_lesson_bubble',
    targetObjectId: 'source.format-viewer',
    permissionEnvelope: 'read_only',
    executionDefault: 'inspect_only',
    steps: ['show_holo_world_graphs', 'show_hs_scripts', 'show_hsplus_behavior_contracts'],
    receiptTypes: ['format_inventory'],
    modeIds: ['user.creator', 'user.operator'],
    userPhrase: 'Show me what .holo, .hs, and .hsplus can do',
    brittneyInterpretation: 'Translate source powers into plain shell actions without exposing raw promotion authority.',
  });
  return packs;
}

function formatLessons(formatInventory) {
  const lanes = Array.isArray(formatInventory.formatLanes) ? formatInventory.formatLanes : [];
  return lanes.map((lane) => ({
    id: `format-lesson.${lane.extension}`,
    label: `.${lane.extension}`,
    role: lane.role || '',
    fileCount: lane.totalFileCount || 0,
    featureCount: lane.uniqueFeatureCount || 0,
    topFeature: lane.topFeature || '',
    founderShellUse: lane.founderShellUse || '',
    userShellUse: lane.userShellUse || '',
    userExplanation: lane.extension === 'holo'
      ? 'Worlds, windows, files, agents, and bubbles become spatial objects.'
      : lane.extension === 'hs'
        ? 'Compact scripts drive render slices, pipelines, and action recipes.'
        : 'Behavior contracts bind agents, state, permissions, and runtime policy.',
  }));
}

function modeProfiles(packs) {
  const visibleFor = (modeId) => packs.filter((pack) => pack.modeIds.includes(modeId)).map((pack) => pack.id);
  return [
    {
      id: 'user.daily',
      label: 'Daily Shell',
      audience: 'regular_user',
      defaultSkin: 'liquid',
      visibleBubbleIds: ['assistant.brittney.user-translator', 'user-shell.programs', 'user-shell.files', 'user-shell.browser', ...visibleFor('user.daily')],
      hiddenFounderPowers: ['raw_shell_commands', 'wild_source_promotion', 'process_custody', 'format_rescan'],
      safetyPosture: 'plain_intent_then_approval',
    },
    {
      id: 'user.creator',
      label: 'Creator Shell',
      audience: 'hololand_creator',
      defaultSkin: 'aura',
      visibleBubbleIds: ['assistant.brittney.user-translator', 'user-shell.creator-tools', 'source.format-viewer', ...visibleFor('user.creator')],
      hiddenFounderPowers: ['raw_hardware_action_executor', 'source_mutation_without_import_receipt'],
      safetyPosture: 'preview_first_import_after_approval',
    },
    {
      id: 'user.operator',
      label: 'Operator Shell',
      audience: 'trusted_power_user',
      defaultSkin: 'developer',
      visibleBubbleIds: ['assistant.brittney.user-translator', 'room-marathon', 'user-shell.programs', ...visibleFor('user.operator')],
      hiddenFounderPowers: ['break_glass_actions', 'wild_adapter_promotion_without_review'],
      safetyPosture: 'receipt_visible_guarded_execute',
    },
    {
      id: 'founder.full',
      label: 'Founder Shell',
      audience: 'founder',
      defaultSkin: 'liquid',
      visibleBubbleIds: ['surface.founder-boot-preview', 'source.format-viewer', 'assistant.brittney.operator-bridge', 'hardware-control', 'wild-holoscript'],
      hiddenFounderPowers: [],
      safetyPosture: 'full_surface_with_receipt_bound_mutation',
    },
  ];
}

function founderOnlyPowers() {
  return [
    { id: 'raw_shell_commands', label: 'Raw command custody', source: 'apps/holoshell/source/holoshell-hardware-control.hsplus', userTreatment: 'shown_as_command_bubble_with_approval' },
    { id: 'wild_source_promotion', label: 'Wild HoloScript promotion', source: 'apps/holoshell/source/holoshell-wild-holoscript-intake.hsplus', userTreatment: 'shown_as_format_lesson_until_adapter_receipt_exists' },
    { id: 'process_custody', label: 'Process and build custody', source: 'apps/holoshell/docs/PROCESS_SHELL_RUN_HEALTH.md', userTreatment: 'shown_as_health_state_not_task_manager' },
    { id: 'format_rescan', label: 'Canonical and wild source rescan', source: 'scripts/holoshell-format-inventory.mjs', userTreatment: 'hidden_behind_refresh_receipt' },
    { id: 'break_glass_actions', label: 'Break-glass hardware actions', source: 'scripts/holoshell-action-executor.mjs', userTreatment: 'not_available_in_user_shell' },
  ];
}

function brittneyTranslations(packs, lessons) {
  return [
    ...packs.map((pack) => ({
      id: `translate.${pack.id}`,
      userPhrase: pack.userPhrase,
      targetPackId: pack.id,
      explanation: pack.brittneyInterpretation,
      permissionEnvelope: pack.permissionEnvelope,
    })),
    ...lessons.map((lesson) => ({
      id: `translate.${lesson.id}`,
      userPhrase: `What is ${lesson.label}?`,
      targetPackId: 'user-pack.format-learning',
      explanation: lesson.userExplanation,
      permissionEnvelope: 'read_only',
    })),
  ];
}

function buildUserShellProjection(args) {
  const founderBoot = readJson(args.founderBoot, {});
  const formatInventory = readJson(args.formatInventory, {});
  const shellObjects = readJson(args.shellObjects, {});
  const workflow = readJson(args.workflow, {});
  const shardWorkflow = readJson(args.shardWorkflow, {});
  const packs = capabilityPacks(founderBoot, workflow, shardWorkflow);
  const lessons = formatLessons(formatInventory);
  const modes = modeProfiles(packs);
  const founderOnly = founderOnlyPowers();
  const translations = brittneyTranslations(packs, lessons);
  const founderReady = founderBoot.summary?.status === 'ready';
  const formatsReady = formatInventory.summary?.status === 'scanned';
  const visibleBubbleCount = new Set(modes.flatMap((mode) => mode.visibleBubbleIds)).size;

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    projectionId: `user-shell-${hashText(`${founderBoot.bootId || ''}:${formatInventory.inventoryId || ''}:${packs.length}`)}`,
    source: {
      script: 'scripts/holoshell-user-shell-projection.mjs',
      sourceContract: 'apps/holoshell/source/holoshell-user-shell-projection.hsplus',
      founderBoot: args.founderBoot,
      formatInventory: args.formatInventory,
      shellObjects: args.shellObjects,
      workflow: args.workflow,
      shardWorkflow: args.shardWorkflow,
    },
    host: {
      platform: os.platform(),
      release: os.release(),
      hostname: os.hostname(),
    },
    summary: {
      status: founderReady && formatsReady ? 'ready' : 'partial',
      founderBootStatus: founderBoot.summary?.status || 'unknown',
      formatInventoryStatus: formatInventory.summary?.status || 'unknown',
      shellObjectGraphStatus: shellObjects.summary?.status || 'unknown',
      modeCount: modes.length,
      userModeCount: modes.filter((mode) => mode.id.startsWith('user.')).length,
      capabilityPackCount: packs.length,
      guardedCapabilityPackCount: packs.filter((pack) => pack.permissionEnvelope === 'guarded_execute').length,
      readOnlyPackCount: packs.filter((pack) => pack.permissionEnvelope === 'read_only').length,
      formatLessonCount: lessons.length,
      founderOnlyPowerCount: founderOnly.length,
      brittneyTranslationCount: translations.length,
      visibleBubbleCount,
      nextMove: 'mount_user_shell_mode_switcher_and_brittney_translation_layer',
    },
    modes,
    capabilityPacks: packs,
    formatLessons: lessons,
    founderOnlyPowers: founderOnly,
    brittneyTranslationLayer: {
      status: translations.length ? 'ready' : 'empty',
      actor: 'brittney',
      defaultMode: 'user.daily',
      translations,
    },
    shellDerivation: {
      founderSurface: 'surface.founder-boot-preview',
      userSurface: 'surface.user-shell-projection',
      rule: 'user_shell_is_subset_plus_plain_language_translation',
      hiddenDoesNotMeanUnavailable: true,
      hiddenMeansRequiresFounderModeOrApproval: true,
    },
    invariants: {
      founderShellIsSuperset: true,
      userShellHasNoRawCommands: true,
      userPacksStayStagedByDefault: true,
      formatsVisibleAsLessons: true,
      legacyAppsWrappedAsBubbles: true,
      brittneyTranslatesIntentBeforeAction: true,
    },
  };
}

function assertSelfTest(projection) {
  const failures = [];
  if (projection.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (!['ready', 'partial'].includes(projection.summary.status)) failures.push('unexpected status');
  if (projection.summary.modeCount < 4) failures.push('expected user and founder modes');
  if (projection.summary.capabilityPackCount < 4) failures.push('expected derived capability packs');
  if (projection.summary.formatLessonCount < 3) failures.push('expected format lessons');
  if (!projection.invariants.founderShellIsSuperset) failures.push('expected founder superset invariant');
  if (!projection.invariants.userShellHasNoRawCommands) failures.push('expected raw command guard');
  if (!projection.brittneyTranslationLayer.translations.some((item) => item.userPhrase.includes('Excel'))) failures.push('expected Excel translation');
  if (!projection.brittneyTranslationLayer.translations.some((item) => item.targetPackId === 'user-pack.sovereign-room-status')) failures.push('expected sovereign room status translation');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs();
  const projection = buildUserShellProjection(args);
  const output = writeJson(args.output, projection);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, projection);
  if (args.selfTest) assertSelfTest(projection);

  if (args.json) {
    console.log(JSON.stringify(projection, null, 2));
  } else {
    console.log(`HoloShell user shell projection: ${output}`);
    console.log(`HoloShell user shell bootstrap: ${jsOutput}`);
    console.log(`Projection status: ${projection.summary.status}`);
    console.log(`Modes: ${projection.summary.modeCount}`);
    console.log(`Capability packs: ${projection.summary.capabilityPackCount}`);
    console.log(`Brittney translations: ${projection.summary.brittneyTranslationCount}`);
  }
} catch (error) {
  console.error(`holoshell-user-shell-projection failed: ${error.message}`);
  process.exit(1);
}

export { buildUserShellProjection };
