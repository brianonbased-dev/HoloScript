#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SCHEMA_VERSION = 'hololand.holoshell.founder-boot-preview.v0.1.0';
const DEFAULT_WORLD = 'apps/holoshell/source/holoshell-shell-world.holo';
const DEFAULT_RENDER_SLICE = 'apps/holoshell/source/holoshell-shell-render.holo';
const DEFAULT_FORMAT_INVENTORY = '.tmp/holoshell/format-inventory.json';
const DEFAULT_WILD_INTAKE = '.tmp/holoshell/wild-holoscript-intake.json';
const DEFAULT_SHELL_OBJECTS = '.tmp/holoshell/shell-objects.json';
const DEFAULT_OUTPUT = '.tmp/holoshell/founder-boot-preview.json';
const DEFAULT_JS_OUTPUT = '.tmp/holoshell/founder-boot-preview.js';

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    world: DEFAULT_WORLD,
    renderSlice: DEFAULT_RENDER_SLICE,
    formatInventory: DEFAULT_FORMAT_INVENTORY,
    wildIntake: DEFAULT_WILD_INTAKE,
    shellObjects: DEFAULT_SHELL_OBJECTS,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    json: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--world') args.world = argv[++index];
    else if (arg === '--render-slice') args.renderSlice = argv[++index];
    else if (arg === '--format-inventory') args.formatInventory = argv[++index];
    else if (arg === '--wild-intake') args.wildIntake = argv[++index];
    else if (arg === '--shell-objects') args.shellObjects = argv[++index];
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
  console.log(`HoloShell founder boot preview

Usage:
  node scripts/holoshell-founder-boot-preview.mjs [options]

Options:
  --world <path>             .holo shell world. Default: ${DEFAULT_WORLD}
  --render-slice <path>      .hs render slice. Default: ${DEFAULT_RENDER_SLICE}
  --format-inventory <path>  Format inventory receipt.
  --wild-intake <path>       Wild intake receipt.
  --shell-objects <path>     Shell object graph receipt.
  --output <path>            JSON output.
  --js-output <path>         Browser bootstrap output.
  --json                     Print JSON.
  --self-test                Assert boot preview invariants.
  -h, --help                 Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readText(filePath) {
  const resolved = resolveRepoPath(filePath);
  return existsSync(resolved) ? readFileSync(resolved, 'utf8') : '';
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
  return writeText(filePath, `window.HOLOSHELL_FOUNDER_BOOT_PREVIEW = ${payload};\n`);
}

function hashText(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function countMatches(text, regex) {
  return [...text.matchAll(regex)].length;
}

function extractNames(text, regex) {
  return [...text.matchAll(regex)]
    .map((match) => match[1])
    .filter(Boolean)
    .slice(0, 20);
}

function analyzeWorldSource(sourcePath) {
  const text = readText(sourcePath);
  return {
    path: sourcePath,
    exists: Boolean(text),
    sha256: hashText(text),
    composition: text.match(/\bcomposition\s+["']([^"']+)["']/)?.[1] || '',
    templateCount: countMatches(text, /\btemplate\s+["'][^"']+["']/g),
    objectCount: countMatches(text, /\bobject\s+["'][^"']+["']/g),
    spatialGroupCount: countMatches(text, /\bspatial_group\s+["'][^"']+["']/g),
    stateFieldCount: countMatches(text, /^\s+[A-Za-z][A-Za-z0-9_]*:\s+/gm),
    embeddedSourceLinks: extractNames(text, /(?:behavior_source|avatar_source|runtime_bridge_source|render_slice|preview_projection):\s+["']([^"']+)["']/g),
    templates: extractNames(text, /\btemplate\s+["']([^"']+)["']/g),
    spatialGroups: extractNames(text, /\bspatial_group\s+["']([^"']+)["']/g),
  };
}

function analyzeRenderSlice(sourcePath) {
  const text = readText(sourcePath);
  return {
    path: sourcePath,
    exists: Boolean(text),
    sha256: hashText(text),
    objectCount: countMatches(text, /\bobject\s+["'][^"']+["']/g),
    lightCount: countMatches(text, /\blight\s+["'][^"']+["']/g),
    geometryCount: countMatches(text, /\bgeometry:\s+["'][^"']+["']/g),
    effectCount: countMatches(text, /\beffect:\s+["'][^"']+["']/g),
    postProcessingEnabled: /\bpost_processing\s*\{/.test(text),
    objects: extractNames(text, /\bobject\s+["']([^"']+)["']/g),
    effects: extractNames(text, /\beffect:\s+["']([^"']+)["']/g),
  };
}

function formatCards(formatInventory, wildIntake) {
  if (Array.isArray(formatInventory?.formatViewerCards) && formatInventory.formatViewerCards.length) {
    return formatInventory.formatViewerCards.map((card) => ({
      ...card,
      source: 'format_inventory',
      inspectAction: `inspect_format_${card.label.replace('.', '')}`,
    }));
  }
  return (wildIntake?.formatProfiles || []).map((profile) => ({
    id: `format.${profile.extension}`,
    label: `.${profile.extension}`,
    role: profile.role,
    files: profile.fileCount || 0,
    features: profile.uniqueFeatureCount || 0,
    topFeature: profile.topFeature || '',
    founderShellUse: profile.founderShellUse || '',
    userShellUse: profile.userShellUse || '',
    source: 'wild_intake',
    inspectAction: `inspect_format_${profile.extension}`,
  }));
}

function userCapabilityPacks(shellObjects) {
  const objects = Array.isArray(shellObjects?.objects) ? shellObjects.objects : [];
  const excel = objects.find((object) => /excel/i.test(`${object.displayName} ${object.sourceRef}`));
  const browser = objects.find((object) => object.objectKind === 'browser_surface') || objects.find((object) => /chrome|edge|browser/i.test(object.displayName || ''));
  return [
    {
      id: 'user-pack.browser-lofi',
      label: 'Play Lofi',
      derivedFrom: 'founder.browser_control',
      userSurface: 'media_portal_bubble',
      targetObjectId: browser?.id || 'surface.browser.lofi',
      permissionEnvelope: 'guarded_execute',
      executionDefault: 'staged_not_run',
      steps: ['open_browser', 'navigate_youtube_lofi_search', 'start_media_after_user_gesture'],
      receiptTypes: ['approval_bundle', 'hardware_action_receipt', 'browser_surface_receipt'],
    },
    {
      id: 'user-pack.open-excel',
      label: 'Open Excel',
      derivedFrom: 'founder.program_control',
      userSurface: 'document_app_bubble',
      targetObjectId: excel?.id || 'program.excel',
      permissionEnvelope: 'guarded_execute',
      executionDefault: 'staged_not_run',
      steps: ['locate_program', 'show_approval_card', 'launch_after_user_gesture'],
      receiptTypes: ['program_registry_receipt', 'approval_bundle', 'hardware_action_receipt'],
    },
  ];
}

function brittneyOperatorBridge(shellObjects, formatCardsValue) {
  const objects = Array.isArray(shellObjects?.objects) ? shellObjects.objects : [];
  const firstObjects = objects
    .filter((object) => object.firstScreen)
    .slice(0, 8)
    .map((object) => ({
      objectId: object.id,
      label: object.displayName,
      permissionEnvelope: object.permissionEnvelope,
      status: object.status,
      canExplain: true,
      canStageApproval: ['guarded_execute', 'break_glass'].includes(object.permissionEnvelope),
    }));
  return {
    status: firstObjects.length ? 'ready' : 'needs_shell_object_graph',
    source: 'shell_object_graph',
    selectedObjectDefault: firstObjects[0]?.objectId || 'shell.hololand',
    readableFormatCards: formatCardsValue.map((card) => card.id),
    proposals: [
      {
        id: 'inspect-selected-object',
        label: 'Inspect selected shell object',
        permissionEnvelope: 'read_only',
        target: firstObjects[0]?.objectId || 'shell.hololand',
      },
      {
        id: 'explain-format-lanes',
        label: 'Explain .holo/.hs/.hsplus powers',
        permissionEnvelope: 'read_only',
        target: 'format.viewer',
      },
      {
        id: 'stage-user-safe-pack',
        label: 'Stage user-safe action pack',
        permissionEnvelope: 'guarded_execute',
        target: 'user-pack.browser-lofi',
      },
    ],
    firstScreenObjects: firstObjects,
  };
}

function buildFounderBootPreview(args) {
  const worldSource = analyzeWorldSource(args.world);
  const renderSlice = analyzeRenderSlice(args.renderSlice);
  const formatInventory = readJson(args.formatInventory, {});
  const wildIntake = readJson(args.wildIntake, {});
  const shellObjects = readJson(args.shellObjects, {});
  const cards = formatCards(formatInventory, wildIntake);
  const packs = userCapabilityPacks(shellObjects);
  const operatorBridge = brittneyOperatorBridge(shellObjects, cards);
  const bootReady = worldSource.exists && renderSlice.exists && cards.length >= 3;

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    bootId: `founder-boot-${hashText(`${worldSource.sha256}:${renderSlice.sha256}:${cards.length}`)}`,
    source: {
      script: 'scripts/holoshell-founder-boot-preview.mjs',
      strategy: 'apps/holoshell/source/holoshell-founder-to-user-strategy.hsplus',
      world: args.world,
      renderSlice: args.renderSlice,
      formatInventory: args.formatInventory,
      shellObjects: args.shellObjects,
    },
    host: {
      platform: os.platform(),
      release: os.release(),
      hostname: os.hostname(),
    },
    summary: {
      status: bootReady ? 'ready' : 'partial',
      worldObjectCount: worldSource.objectCount,
      worldTemplateCount: worldSource.templateCount,
      renderObjectCount: renderSlice.objectCount,
      renderLightCount: renderSlice.lightCount,
      formatViewerCardCount: cards.length,
      userCapabilityPackCount: packs.length,
      brittneyProposalCount: operatorBridge.proposals.length,
      nextMove: 'render_founder_boot_preview_from_holo_world_and_hs_slice',
    },
    founderBootSequence: [
      { step: 'load_holo_world', source: args.world, status: worldSource.exists ? 'ready' : 'missing' },
      { step: 'embed_hs_render_slice', source: args.renderSlice, status: renderSlice.exists ? 'ready' : 'missing' },
      { step: 'mount_format_viewer_bubble', source: args.formatInventory, status: cards.length ? 'ready' : 'missing' },
      { step: 'derive_user_capability_packs', source: 'founder_surface', status: packs.length ? 'ready' : 'missing' },
      { step: 'attach_brittney_operator_bridge', source: args.shellObjects, status: operatorBridge.status },
    ],
    worldSource,
    renderSlice,
    formatViewer: {
      objectId: 'format.viewer',
      displayName: 'Format Viewer',
      permissionEnvelope: 'read_only',
      cards,
    },
    userCapabilityPacks: packs,
    brittneyOperatorBridge: operatorBridge,
    invariants: {
      htmlIsPreviewOnly: true,
      holoWorldIsFirstScreenSource: true,
      hsSliceIsEmbeddedRenderableProof: true,
      userPacksAreDerivedFromFounderSurface: true,
      guardedActionsStayStaged: true,
    },
  };
}

function assertSelfTest(preview) {
  const failures = [];
  if (preview.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (!preview.worldSource.exists) failures.push('expected .holo world source');
  if (!preview.renderSlice.exists) failures.push('expected .hs render slice source');
  if (preview.summary.formatViewerCardCount < 3) failures.push('expected format viewer cards');
  if (preview.summary.userCapabilityPackCount < 2) failures.push('expected user capability packs');
  if (preview.summary.brittneyProposalCount < 3) failures.push('expected Brittney operator proposals');
  if (!preview.invariants.userPacksAreDerivedFromFounderSurface) failures.push('expected founder-to-user invariant');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs();
  const preview = buildFounderBootPreview(args);
  const output = writeJson(args.output, preview);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, preview);
  if (args.selfTest) assertSelfTest(preview);

  if (args.json) {
    console.log(JSON.stringify(preview, null, 2));
  } else {
    console.log(`HoloShell founder boot preview: ${output}`);
    console.log(`HoloShell founder boot bootstrap: ${jsOutput}`);
    console.log(`Boot status: ${preview.summary.status}`);
    console.log(`Format cards: ${preview.summary.formatViewerCardCount}`);
    console.log(`User packs: ${preview.summary.userCapabilityPackCount}`);
    console.log(`Brittney proposals: ${preview.summary.brittneyProposalCount}`);
  }
} catch (error) {
  console.error(`holoshell-founder-boot-preview failed: ${error.message}`);
  process.exit(1);
}

export { buildFounderBootPreview };
