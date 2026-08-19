#!/usr/bin/env node
import { execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SCHEMA_VERSION = 'hololand.studio-first-screen-fixture.v0.1.0';
const SOURCE = 'apps/holoshell/source/hololand-studio-first-screen-fixture.hsplus';
const PAGE = 'apps/avatar-studio/src/app/page.tsx';
const DEFAULT_BLUEPRINT = 'apps/avatar-studio/src/lib/defaults.ts';
const COMMAND_REGISTRY = 'apps/avatar-studio/src/lib/commandRegistry.ts';
const BLUEPRINT_STATE = 'apps/avatar-studio/src/hooks/useBlueprint.ts';
const PREVIEW = 'apps/avatar-studio/src/components/preview/AvatarPreview.tsx';
const TAB_BAR = 'apps/avatar-studio/src/components/editor/TabBar.tsx';
const COMMAND_PALETTE = 'apps/avatar-studio/src/components/command-palette/CommandPalette.tsx';
const LEGACY_HOLOSCRIPT_STUDIO = 'examples/holoscript-studio/scene.holo';
const LEGACY_CREATOR_STUDIO = 'packages/playground/creator-studio.html';
const PACKAGE_JSON = 'package.json';
const DEFAULT_OUTPUT = path.join('.tmp', 'studio-first-screen-fixture', 'receipt.json');

const STUDIO_ADAPTER_SURFACE_PATTERNS = [
  /^apps\/avatar-studio\/src\/.*\.(?:css|ts|tsx)$/i,
  /^packages\/playground\/creator-studio\.html$/i,
  /^examples\/holoscript-studio\/.*\.(?:holo|html|js|ts|tsx|css)$/i,
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = { output: DEFAULT_OUTPUT, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') args.output = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Studio first-screen fixture check

Usage:
  node scripts/check-studio-first-screen-fixture.mjs [--output <path>] [--json]

When BASE_REF and HEAD_REF are present, Studio adapter/UI changes require
${SOURCE} to change in the same diff.
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

function isStudioAdapterSurface(file) {
  return STUDIO_ADAPTER_SURFACE_PATTERNS.some((pattern) => pattern.test(file));
}

function buildAdapterOnlyGate(changedFilesInfo) {
  const changedFiles = changedFilesInfo.changedFiles || [];
  const nativeFixtureChanged = changedFiles.includes(SOURCE);
  const adapterSurfaceChanges = changedFiles.filter(isStudioAdapterSurface);
  return {
    enabled: changedFilesInfo.enabled,
    nativeFixtureChanged,
    adapterSurfaceChanges,
    passed: !changedFilesInfo.enabled || adapterSurfaceChanges.length === 0 || nativeFixtureChanged,
    policy: 'Studio adapter/UI changes require native HoloScript fixture updates',
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
    header: {
      brand: 'HOLOLAND',
      surfaceLabel: 'Avatar Studio',
      controls: ['command_palette', 'undo', 'redo', 'dirty_indicator', 'avatar_name'],
      adapterAnchorsPresent: includesAll(texts.page, ['HOLOLAND', 'Avatar Studio', 'palette.open', 'store.undo', 'store.redo', 'store.isDirty', 'store.blueprint.name']),
      sourceOwnedByHoloScript: texts.source.includes('template "StudioHeader"'),
    },
    blueprint: {
      defaultName: 'New Avatar',
      activeTabDefault: 'body',
      defaultAnchorsPresent: includesAll(texts.defaults, ['name: \'New Avatar\'', 'body:', 'face:', 'hair:', 'expressions:', 'vrmMeta:']),
      stateAnchorsPresent: includesAll(texts.blueprintState, ['activeTab: \'body\'', 'undoStack', 'redoStack', 'isDirty', 'createDefaultBlueprint']),
      sourceOwnedByHoloScript: texts.source.includes('template "StudioBlueprintState"'),
    },
    preview: {
      adapterSource: PREVIEW,
      adapterAnchorsPresent: includesAll(texts.page, ['<AvatarPreview blueprint={store.blueprint} />'])
        && includesAll(texts.preview, ['canvasRef', 'blueprint.body.skinColor.hex', 'blueprint.hair.primaryColor.hex', 'blueprint.face.eyes.irisColor.hex']),
      sourceOwnedByHoloScript: texts.source.includes('template "StudioPreviewPane"'),
    },
    editor: {
      adapterSource: TAB_BAR,
      tabs: ['body', 'face', 'hair', 'clothing', 'accessories', 'expressions', 'export'],
      pageImportsPresent: includesAll(texts.page, ['BodyTab', 'FaceTab', 'HairTab', 'ClothingTab', 'AccessoriesTab', 'ExpressionsTab', 'ExportTab']),
      tabBarAnchorsPresent: includesAll(texts.tabBar, ['Body', 'Face', 'Hair', 'Clothing', 'Accessories', 'Expressions', 'Export']),
      sourceOwnedByHoloScript: texts.source.includes('template "StudioEditorPane"'),
    },
    commandPalette: {
      adapterSource: COMMAND_PALETTE,
      registrySource: COMMAND_REGISTRY,
      pageAnchorsPresent: includesAll(texts.page, ['useStudioCommands', 'useCommandPalette', '<CommandPalette palette={palette} />']),
      accessibilityAnchorsPresent: includesAll(texts.commandPalette, ['role="dialog"', 'role="combobox"', 'role="listbox"', 'role="option"']),
      registryAnchorsPresent: includesAll(texts.commandRegistry, ['groupCommands', 'filterCommands', 'CommandIcon']),
      sourceOwnedByHoloScript: texts.source.includes('template "StudioCommandPalette"'),
    },
    adapterProjection: {
      sourceConstant: texts.page.includes(`'${SOURCE}'`),
      schemaConstant: texts.page.includes(SCHEMA_VERSION),
      dataSourceAttribute: texts.page.includes('data-holoscript-source={STUDIO_FIRST_SCREEN_SOURCE}'),
      dataReceiptAttribute: texts.page.includes('data-receipt-schema={STUDIO_FIRST_SCREEN_RECEIPT_SCHEMA}'),
      dataAdapterRole: texts.page.includes('data-adapter-role="projection_only"'),
      sourceOwnedByHoloScript: texts.source.includes('template "StudioAdapterProjection"'),
    },
    receipt: {
      schemaVersion: SCHEMA_VERSION,
      sourceRequiredBeforeProjection: texts.source.includes('sourceRequiredBeforeProjection: true'),
      receiptRequiredBeforeProjection: texts.source.includes('receiptRequiredBeforeProjection: true'),
      handAuthoredUiMayNotOwnBehavior: texts.source.includes('handAuthoredUiMayNotOwnBehavior: true'),
    },
    evidence: {
      [PAGE]: {
        hash: sha256(texts.page),
        anchors: ['StudioPage', 'AvatarPreview', 'TabBar', 'CommandPalette', 'data-holoscript-source'].filter((anchor) => texts.page.includes(anchor)),
        parserEnforced: false,
      },
      [LEGACY_HOLOSCRIPT_STUDIO]: {
        hash: sha256(texts.legacyHoloScriptStudio),
        anchors: ['HoloScript Studio', 'Workspace', 'palette', 'code-output', 'preview'].filter((anchor) => texts.legacyHoloScriptStudio.includes(anchor)),
        parserEnforced: false,
        parserNote: 'Legacy Studio syntax is evidence-only until upgraded to current HoloScript parser syntax.',
      },
      [LEGACY_CREATOR_STUDIO]: {
        hash: sha256(texts.legacyCreatorStudio),
        anchors: ['HoloLand Creator Studio', 'preview-canvas', 'editor-container', 'Template Gallery', 'Share Scene'].filter((anchor) => texts.legacyCreatorStudio.includes(anchor)),
        parserEnforced: false,
      },
    },
  };
}

function buildAssertions({ semanticIr, parserReceipts, packageJson, adapterOnlyGate }) {
  return {
    sourceParser: parserReceipts.every((parser) => parser.passed),
    packageScript: packageJson.includes('"check:studio-first-screen-fixture": "node scripts/check-studio-first-screen-fixture.mjs"'),
    nativeFixtureSource: semanticIr.fixture.sourceOwnedByHoloScript && semanticIr.fixture.templates.includes('StudioFirstScreenSemanticIR'),
    header: semanticIr.header.sourceOwnedByHoloScript && semanticIr.header.adapterAnchorsPresent,
    blueprintState: semanticIr.blueprint.sourceOwnedByHoloScript && semanticIr.blueprint.defaultAnchorsPresent && semanticIr.blueprint.stateAnchorsPresent,
    preview: semanticIr.preview.sourceOwnedByHoloScript && semanticIr.preview.adapterAnchorsPresent,
    editorTabs: semanticIr.editor.sourceOwnedByHoloScript && semanticIr.editor.pageImportsPresent && semanticIr.editor.tabBarAnchorsPresent,
    commandPalette: semanticIr.commandPalette.sourceOwnedByHoloScript && semanticIr.commandPalette.pageAnchorsPresent && semanticIr.commandPalette.accessibilityAnchorsPresent && semanticIr.commandPalette.registryAnchorsPresent,
    adapterProjection: semanticIr.adapterProjection.sourceOwnedByHoloScript && Object.values(semanticIr.adapterProjection).every(Boolean),
    receipt: Object.values(semanticIr.receipt).every(Boolean),
    sourceOwnsBehavior: semanticIr.fixture.policies.includes('StudioFirstScreenSourceOwnsBehavior'),
    legacyEvidence: Object.values(semanticIr.evidence).every((entry) => entry.hash && entry.anchors.length > 0),
    adapterOnlyDiffGate: adapterOnlyGate.passed,
  };
}

function assertReceipt(receipt) {
  const failures = [];
  for (const [name, passed] of Object.entries(receipt.assertions || {})) {
    if (!passed) failures.push(`missing Studio first-screen semantic: ${name}`);
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
    page: read(PAGE),
    defaults: read(DEFAULT_BLUEPRINT),
    commandRegistry: read(COMMAND_REGISTRY),
    blueprintState: read(BLUEPRINT_STATE),
    preview: read(PREVIEW),
    tabBar: read(TAB_BAR),
    commandPalette: read(COMMAND_PALETTE),
    legacyHoloScriptStudio: read(LEGACY_HOLOSCRIPT_STUDIO),
    legacyCreatorStudio: read(LEGACY_CREATOR_STUDIO),
  };
  const packageJson = read(PACKAGE_JSON);
  const changedFiles = readChangedFiles();
  const adapterOnlyGate = buildAdapterOnlyGate(changedFiles);
  const semanticIr = buildSemanticIr(texts);
  const parsers = [parseWithHoloScript(SOURCE)];
  const assertions = buildAssertions({ semanticIr, parserReceipts: parsers, packageJson, adapterOnlyGate });
  const receiptInput = {
    schemaVersion: SCHEMA_VERSION,
    sourceHash: semanticIr.fixture.sourceHash,
    adapterHash: semanticIr.evidence[PAGE].hash,
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
      adapterPage: PAGE,
      defaultBlueprint: DEFAULT_BLUEPRINT,
      commandRegistry: COMMAND_REGISTRY,
      blueprintState: BLUEPRINT_STATE,
      preview: PREVIEW,
      tabBar: TAB_BAR,
      commandPalette: COMMAND_PALETTE,
      legacyHoloScriptStudio: LEGACY_HOLOSCRIPT_STUDIO,
      legacyCreatorStudio: LEGACY_CREATOR_STUDIO,
    },
    parsers,
    semanticIr,
    assertions,
    regressionGate: adapterOnlyGate,
    policy: {
      sourceOwnedByHoloScript: true,
      handAuthoredUiMayNotOwnBehavior: true,
      typescriptMayOnlyProject: true,
      tsxMayOnlyProject: true,
      htmlMayOnlyProject: true,
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
    console.log('[studio-first-screen-fixture] ok');
    console.log(`receipt: ${output}`);
    console.log(`source: ${receipt.sources.nativeFixture}`);
    console.log(`templates: ${receipt.semanticIr.fixture.templates.length}`);
    console.log(`adapter: ${receipt.sources.adapterPage}`);
    console.log(`regression gate: ${receipt.regressionGate.enabled ? 'enabled' : 'not enabled'}`);
  }
} catch (error) {
  console.error('[studio-first-screen-fixture] failed');
  console.error(error.message || error);
  process.exit(1);
}
