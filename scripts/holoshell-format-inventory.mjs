#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIntake } from './holoshell-wild-holoscript-intake.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SCHEMA_VERSION = 'hololand.holoshell.format-inventory.v0.1.0';
const DEFAULT_HOLOSCRIPT_ROOT = path.resolve(REPO_ROOT, '..', 'HoloScript');
const DEFAULT_WILD_ROOT = path.resolve(REPO_ROOT, '..', 'uaa2-service');
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'format-inventory.json');
const DEFAULT_JS_OUTPUT = path.join('.tmp', 'holoshell', 'format-inventory.js');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    holoscriptRoot: process.env.HOLOSCRIPT_ROOT || DEFAULT_HOLOSCRIPT_ROOT,
    wildRoot: process.env.UAA2_SERVICE_ROOT || DEFAULT_WILD_ROOT,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    json: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--holoscript-root') args.holoscriptRoot = argv[++index];
    else if (arg === '--wild-root') args.wildRoot = argv[++index];
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
  console.log(`HoloShell format inventory

Usage:
  node scripts/holoshell-format-inventory.mjs [options]

Options:
  --holoscript-root <path>  HoloScript checkout to scan. Default: ${DEFAULT_HOLOSCRIPT_ROOT}
  --wild-root <path>        Wild uAA2 checkout to scan. Default: ${DEFAULT_WILD_ROOT}
  --output <path>           JSON output. Default: ${DEFAULT_OUTPUT}
  --js-output <path>        Browser bootstrap. Default: ${DEFAULT_JS_OUTPUT}
  --json                    Print JSON.
  --self-test               Assert inventory invariants.
  -h, --help                Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
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
  return writeText(filePath, `window.HOLOSHELL_FORMAT_INVENTORY = ${payload};\n`);
}

function countByFeature(profile) {
  return Object.fromEntries((profile?.featureInventory || []).map((feature) => [feature.id, feature.count]));
}

function mergeFeatureCounts(...profiles) {
  const counts = {};
  for (const profile of profiles) {
    for (const [id, count] of Object.entries(countByFeature(profile))) {
      counts[id] = (counts[id] || 0) + count;
    }
  }
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([id, count]) => ({ id, count }));
}

function profileFor(receipt, extension) {
  return (receipt?.formatProfiles || []).find((profile) => profile.extension === extension) || {
    extension,
    role: '',
    founderShellUse: '',
    userShellUse: '',
    fileCount: 0,
    uniqueFeatureCount: 0,
    topFeature: '',
    featureInventory: [],
    topFiles: [],
  };
}

function topFileRecords(receipt, extension, sourceKind) {
  return profileFor(receipt, extension).topFiles.map((file) => ({
    ...file,
    sourceKind,
    sourceRoot: receipt?.source?.rootName || sourceKind,
  }));
}

function formatLane(canonical, wild, extension) {
  const canonicalProfile = profileFor(canonical, extension);
  const wildProfile = profileFor(wild, extension);
  const featureInventory = mergeFeatureCounts(canonicalProfile, wildProfile);
  return {
    extension,
    role: wildProfile.role || canonicalProfile.role,
    founderShellUse: wildProfile.founderShellUse || canonicalProfile.founderShellUse,
    userShellUse: wildProfile.userShellUse || canonicalProfile.userShellUse,
    canonicalFileCount: canonicalProfile.fileCount || 0,
    wildFileCount: wildProfile.fileCount || 0,
    totalFileCount: (canonicalProfile.fileCount || 0) + (wildProfile.fileCount || 0),
    canonicalUniqueFeatureCount: canonicalProfile.uniqueFeatureCount || 0,
    wildUniqueFeatureCount: wildProfile.uniqueFeatureCount || 0,
    uniqueFeatureCount: featureInventory.length,
    topFeature: featureInventory[0]?.id || '',
    canonicalTopFeature: canonicalProfile.topFeature || '',
    wildTopFeature: wildProfile.topFeature || '',
    featureInventory,
    topFiles: [
      ...topFileRecords(canonical, extension, 'canonical_holoscript'),
      ...topFileRecords(wild, extension, 'wild_uaa2'),
    ].slice(0, 10),
  };
}

function buildFormatInventory(args) {
  const canonical = buildIntake({ uaa2Root: path.resolve(args.holoscriptRoot) });
  const wild = buildIntake({ uaa2Root: path.resolve(args.wildRoot) });
  const lanes = ['holo', 'hs', 'hsplus'].map((extension) => formatLane(canonical, wild, extension));
  const totalFileCount = lanes.reduce((sum, lane) => sum + lane.totalFileCount, 0);
  const totalFeatureFamilies = lanes.reduce((sum, lane) => sum + lane.uniqueFeatureCount, 0);
  const formatViewerCards = lanes.map((lane) => ({
    id: `format.${lane.extension}`,
    label: `.${lane.extension}`,
    role: lane.role,
    files: lane.totalFileCount,
    features: lane.uniqueFeatureCount,
    topFeature: lane.topFeature,
    founderShellUse: lane.founderShellUse,
    userShellUse: lane.userShellUse,
  }));

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    inventoryId: `format-inventory-${Date.now().toString(36)}`,
    source: {
      script: 'scripts/holoshell-format-inventory.mjs',
      holoscriptRoot: path.resolve(args.holoscriptRoot),
      wildRoot: path.resolve(args.wildRoot),
      holoscriptRootExists: existsSync(path.resolve(args.holoscriptRoot)),
      wildRootExists: existsSync(path.resolve(args.wildRoot)),
    },
    host: {
      platform: os.platform(),
      release: os.release(),
      hostname: os.hostname(),
    },
    summary: {
      status: totalFileCount > 0 ? 'scanned' : 'empty',
      canonicalFileCount: canonical.summary?.fileCount || 0,
      wildFileCount: wild.summary?.fileCount || 0,
      totalFileCount,
      totalHoloCount: lanes.find((lane) => lane.extension === 'holo')?.totalFileCount || 0,
      totalHsCount: lanes.find((lane) => lane.extension === 'hs')?.totalFileCount || 0,
      totalHsplusCount: lanes.find((lane) => lane.extension === 'hsplus')?.totalFileCount || 0,
      totalFeatureFamilies,
      formatViewerCardCount: formatViewerCards.length,
      nextMove: 'boot_founder_shell_then_derive_user_capability_packs',
    },
    formatLanes: lanes,
    formatViewerCards,
    sourceReceipts: {
      canonical: {
        schemaVersion: canonical.schemaVersion,
        status: canonical.summary?.status || 'unknown',
        rootName: canonical.source?.rootName || 'HoloScript',
        fileCount: canonical.summary?.fileCount || 0,
      },
      wild: {
        schemaVersion: wild.schemaVersion,
        status: wild.summary?.status || 'unknown',
        rootName: wild.source?.rootName || 'uaa2-service',
        fileCount: wild.summary?.fileCount || 0,
      },
    },
    invariants: {
      holoHsHsplusAreSeparateLanes: true,
      inventoryIsReadOnly: true,
      userVersionDerivedFromFounderVersion: true,
    },
  };
}

function assertSelfTest(inventory) {
  const failures = [];
  if (inventory.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (inventory.summary.status !== 'scanned') failures.push('expected scanned status');
  if (inventory.formatLanes.length !== 3) failures.push('expected three format lanes');
  if (!inventory.formatLanes.some((lane) => lane.extension === 'holo' && lane.uniqueFeatureCount > 0)) failures.push('expected .holo features');
  if (!inventory.formatLanes.some((lane) => lane.extension === 'hs' && lane.uniqueFeatureCount > 0)) failures.push('expected .hs features');
  if (!inventory.formatLanes.some((lane) => lane.extension === 'hsplus' && lane.uniqueFeatureCount > 0)) failures.push('expected .hsplus features');
  if (inventory.summary.formatViewerCardCount !== 3) failures.push('expected format viewer cards');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs();
  const inventory = buildFormatInventory(args);
  const output = writeJson(args.output, inventory);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, inventory);
  if (args.selfTest) assertSelfTest(inventory);

  if (args.json) {
    console.log(JSON.stringify(inventory, null, 2));
  } else {
    console.log(`HoloShell format inventory: ${output}`);
    console.log(`HoloShell format bootstrap: ${jsOutput}`);
    console.log(`Format files: ${inventory.summary.totalFileCount}`);
    console.log(`Feature families: ${inventory.summary.totalFeatureFamilies}`);
  }
} catch (error) {
  console.error(`holoshell-format-inventory failed: ${error.message}`);
  process.exit(1);
}

export { buildFormatInventory };
