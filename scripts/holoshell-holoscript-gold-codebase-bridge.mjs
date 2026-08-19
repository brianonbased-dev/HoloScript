#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_VERSION = 'hololand.holoshell.holoscript-gold-codebase-bridge.v0.1.0';
const DEFAULT_TMP_DIR = '.tmp/holoshell';
const DEFAULT_OUTPUT = '.tmp/holoshell/holoscript-gold-codebase-bridge.json';
const DEFAULT_JS_OUTPUT = '.tmp/holoshell/holoscript-gold-codebase-bridge.js';
const DEFAULT_HOLOSCRIPT_ROOT = process.env.HOLOSCRIPT_ROOT || path.resolve(REPO_ROOT, '..', 'HoloScript');
const DEFAULT_GOLD_ROOT = process.env.GOLD_ROOT || (process.platform === 'win32' ? 'D:\\GOLD' : path.join(os.homedir(), 'GOLD'));

const goldTierNames = [
  'diamond',
  'platinum',
  'gold',
  'wisdom',
  'patterns',
  'gotchas',
  'protocols',
  'architectures',
  'graduated',
  'silver',
  'bronze',
];

const codebaseContractNames = [
  'holo_graph_status',
  'holo_absorb_repo',
  'holo_query_codebase',
  'holo_ask_codebase',
  'holo_impact_analysis',
  'holo_semantic_search',
  'holo_detect_changes',
  'holo_detect_drift',
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    tmpDir: DEFAULT_TMP_DIR,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    holoscriptRoot: DEFAULT_HOLOSCRIPT_ROOT,
    goldRoot: DEFAULT_GOLD_ROOT,
    maxGoldFiles: 420,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--tmp-dir') args.tmpDir = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--holoscript-root') args.holoscriptRoot = argv[++index];
    else if (arg === '--gold-root') args.goldRoot = argv[++index];
    else if (arg === '--max-gold-files') args.maxGoldFiles = Number(argv[++index] || args.maxGoldFiles);
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
  console.log(`Usage:
  node scripts/holoshell-holoscript-gold-codebase-bridge.mjs [options]

Options:
  --holoscript-root <dir>  HoloScript repository root. Default: sibling ../HoloScript or HOLOSCRIPT_ROOT.
  --gold-root <dir>        GOLD Drive root. Default: GOLD_ROOT or D:\\GOLD on Windows.
  --tmp-dir <dir>          HoloShell temp receipt directory. Default: ${DEFAULT_TMP_DIR}
  --output <file>          JSON output path. Default: ${DEFAULT_OUTPUT}
  --js-output <file>       Browser bootstrap output path. Default: ${DEFAULT_JS_OUTPUT}
  --max-gold-files <n>     Max GOLD files to index lightly. Default: 420
  --json                   Print the full receipt as JSON.
  --self-test              Assert bridge invariants after generating.
`);
}

function resolveRepoPath(filePath) {
  if (!filePath) return '';
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readText(filePath) {
  const resolved = resolveRepoPath(filePath);
  if (!resolved || !existsSync(resolved)) return '';
  try {
    return readFileSync(resolved, 'utf8');
  } catch {
    return '';
  }
}

function readJson(filePath, fallback = {}) {
  const text = readText(filePath);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch (error) {
    return { ...fallback, readError: error.message };
  }
}

function safeDirEntries(dirPath) {
  try {
    return readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function safeStat(filePath) {
  try {
    return statSync(filePath);
  } catch {
    return null;
  }
}

function relativePath(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function shortHash(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 14);
}

function walkFiles(root, options = {}) {
  const {
    maxFiles = 300,
    maxDepth = 4,
    extensions = new Set(['.md', '.json', '.hs', '.holo', '.hsplus']),
  } = options;
  const files = [];
  const skipDirs = new Set(['.git', 'node_modules', 'dist', 'build', '__pycache__', '.venv', '.tmp']);

  function visit(dirPath, depth) {
    if (files.length >= maxFiles || depth > maxDepth) return;
    for (const entry of safeDirEntries(dirPath)) {
      if (files.length >= maxFiles) return;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) visit(fullPath, depth + 1);
      } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }

  if (existsSync(root)) visit(root, 0);
  return files;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => String(left).localeCompare(String(right)));
}

function extractCodebaseToolNames(sourceText) {
  const matches = sourceText.match(/\bholo_[a-z0-9_]+\b/gi) || [];
  return uniqueSorted(matches.map((value) => value.toLowerCase()));
}

function extractCliCommands(guideText) {
  const commands = [];
  for (const match of guideText.matchAll(/\bholoscript\s+([a-z0-9:_-]+)/gi)) {
    commands.push(`holoscript ${match[1].toLowerCase()}`);
  }
  return uniqueSorted(commands);
}

function buildCodebaseIntelligence(holoscriptRoot) {
  const claudePath = path.join(holoscriptRoot, 'CLAUDE.md');
  const agentsPath = path.join(holoscriptRoot, 'AGENTS.md');
  const guidePath = path.join(holoscriptRoot, 'docs', 'guides', 'codebase-intelligence.md');
  const toolsSourcePath = path.join(holoscriptRoot, 'packages', 'absorb-service', 'src', 'mcp', 'codebase-tools.ts');
  const claudeText = readText(claudePath);
  const agentsText = readText(agentsPath);
  const guideText = readText(guidePath);
  const toolsText = readText(toolsSourcePath);
  const sourceText = [claudeText, agentsText, guideText, toolsText].join('\n');
  const toolNames = uniqueSorted([...codebaseContractNames, ...extractCodebaseToolNames(toolsText)]);
  const cliCommands = extractCliCommands(guideText);
  const graphStatusMentioned = /\bholo_graph_status\b/.test(sourceText);
  const absorbMentioned = /\bholo_absorb_repo\b/.test(sourceText);
  const forceFalseMentioned = /force\s*=\s*false/i.test(sourceText) || /force=false/i.test(sourceText);

  return {
    status: guideText && toolsText && toolNames.length ? 'ready' : 'partial',
    sourceAnchors: {
      sharedProtocol: existsSync(claudePath) ? relativePath(holoscriptRoot, claudePath) : '',
      codexProtocol: existsSync(agentsPath) ? relativePath(holoscriptRoot, agentsPath) : '',
      guide: existsSync(guidePath) ? relativePath(holoscriptRoot, guidePath) : '',
      toolsSource: existsSync(toolsSourcePath) ? relativePath(holoscriptRoot, toolsSourcePath) : '',
    },
    guidePresent: Boolean(guideText),
    toolsSourcePresent: Boolean(toolsText),
    toolNames,
    toolCount: toolNames.length,
    cliCommands,
    cliCommandCount: cliCommands.length,
    protocol: {
      cacheFirst: graphStatusMentioned && absorbMentioned,
      graphStatusBeforeAbsorb: graphStatusMentioned,
      absorbRepoAvailable: absorbMentioned,
      forceFalseByDefault: forceFalseMentioned,
      queryTools: toolNames.filter((name) => /query|ask|semantic|impact/.test(name)),
      mutationPolicy: 'read_or_guarded_execute',
    },
    questions: [
      'Do we already have a trait, tool, room, receipt, or doc for this?',
      'What does this codebase mean before Brittney proposes an action?',
      'Which files and contracts are impacted by this shell change?',
      'Is the cached graph fresh enough or does an absorb refresh need approval?',
    ],
  };
}

function classifyGoldTier(relativeFilePath) {
  const first = relativeFilePath.split('/')[0]?.toLowerCase() || '';
  return goldTierNames.includes(first) ? first : 'root';
}

function extractGoldIds(text, filePath) {
  const explicit = text.match(/\b[A-Z]\.(?:GOLD|HW|PATTERN|PROTO|WISDOM)\.\d+\b/g) || [];
  const filename = path.basename(filePath).match(/\b(?:W_|G_)?GOLD[_-]?\d+\b/gi) || [];
  return uniqueSorted([...explicit, ...filename].map((value) => value.replace(/_/g, '.')));
}

function summarizeGoldEntry(root, filePath) {
  const stat = safeStat(filePath);
  const rel = relativePath(root, filePath);
  const text = readText(filePath).slice(0, 8000);
  const titleLine = text.split(/\r?\n/).find((line) => /^#\s+/.test(line));
  return {
    path: rel,
    tier: classifyGoldTier(rel),
    title: titleLine ? titleLine.replace(/^#\s+/, '').trim().slice(0, 140) : path.basename(filePath),
    ids: extractGoldIds(text, filePath).slice(0, 6),
    extension: path.extname(filePath).toLowerCase(),
    size: stat?.size || 0,
    modifiedAt: stat?.mtime ? stat.mtime.toISOString() : '',
  };
}

function buildGoldDrive(goldRoot, maxFiles) {
  const resolvedRoot = resolveRepoPath(goldRoot);
  const rootPresent = Boolean(resolvedRoot && existsSync(resolvedRoot));
  if (!rootPresent) {
    return {
      status: 'missing',
      rootPresent: false,
      root: resolvedRoot,
      envProvided: Boolean(process.env.GOLD_ROOT),
      entryCount: 0,
      tierCount: 0,
      hotEntries: [],
      conflictPolicy: 'diamond_over_platinum_over_gold_over_knowledge_store',
    };
  }

  const topLevelDirs = safeDirEntries(resolvedRoot)
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const files = walkFiles(resolvedRoot, { maxFiles, maxDepth: 4 });
  const entries = files.map((filePath) => summarizeGoldEntry(resolvedRoot, filePath));
  const countByTier = {};
  for (const entry of entries) countByTier[entry.tier] = (countByTier[entry.tier] || 0) + 1;
  const hotTiers = new Set(['diamond', 'platinum', 'gold', 'wisdom', 'patterns', 'gotchas', 'protocols', 'graduated', 'root']);
  const hotEntries = entries
    .filter((entry) => hotTiers.has(entry.tier))
    .sort((left, right) => {
      const tierDelta = goldTierNames.indexOf(left.tier) - goldTierNames.indexOf(right.tier);
      if (tierDelta !== 0) return tierDelta;
      return String(right.modifiedAt).localeCompare(String(left.modifiedAt));
    })
    .slice(0, 24);

  return {
    status: entries.length ? 'indexed' : 'empty',
    rootPresent: true,
    root: resolvedRoot,
    envProvided: Boolean(process.env.GOLD_ROOT),
    indexPresent: existsSync(path.join(resolvedRoot, 'INDEX.md')) || existsSync(path.join(resolvedRoot, 'intake', 'INDEX.md')),
    topLevelDirs,
    tierNames: uniqueSorted(entries.map((entry) => entry.tier)),
    tierCount: Object.keys(countByTier).length,
    countByTier,
    entryCount: entries.length,
    indexedFileCap: maxFiles,
    capped: files.length >= maxFiles,
    hotEntries,
    hotEntryCount: hotEntries.length,
    conflictPolicy: 'diamond_over_platinum_over_gold_over_knowledge_store',
    privacyClass: 'local_private_read_only',
  };
}

function buildBridgeInputs(tmpDir) {
  const dir = resolveRepoPath(tmpDir);
  const surfaceMap = readJson(path.join(dir, 'holoscript-surface-map.json'), {});
  const inventory = readJson(path.join(dir, 'holoscript-inventory.json'), {});
  const formatInventory = readJson(path.join(dir, 'format-inventory.json'), {});
  const wildHoloScript = readJson(path.join(dir, 'wild-holoscript-intake.json'), {});

  return {
    tmpDir: dir,
    surfaceMap: {
      present: Boolean(surfaceMap?.summary),
      status: surfaceMap?.summary ? 'mapped' : 'missing',
      mcpToolCount: surfaceMap?.summary?.mcpToolCount || 0,
      cliCommandCount: surfaceMap?.summary?.cliCommandCount || 0,
      restSurfaceCount: surfaceMap?.summary?.restSurfaceCount || 0,
      holoshellRoomCount: surfaceMap?.summary?.holoshellRoomCount || 0,
    },
    inventory: {
      present: Boolean(inventory?.summary),
      status: inventory?.summary?.status || (inventory?.summary ? 'scanned' : 'missing'),
      traitCount: inventory?.summary?.traitCount || inventory?.traits?.length || 0,
      formatCount: inventory?.summary?.formatCount || inventory?.formats?.length || 0,
      twoDFeatureCount: inventory?.summary?.twoDFeatureCount || inventory?.summary?.render2dFeatureCount || 0,
    },
    formatInventory: {
      present: Boolean(formatInventory?.summary),
      status: formatInventory?.summary?.status || 'missing',
      totalFileCount: formatInventory?.summary?.totalFileCount || 0,
      featureFamilyCount: formatInventory?.summary?.totalFeatureFamilies || 0,
    },
    wildHoloScript: {
      present: Boolean(wildHoloScript?.summary),
      status: wildHoloScript?.summary?.status || 'missing',
      fileCount: wildHoloScript?.summary?.fileCount || 0,
      adapterNeededCount: wildHoloScript?.summary?.adapterNeededCount || 0,
    },
  };
}

function buildCapabilityMap(goldDrive, codebase, bridgeInputs) {
  return [
    {
      id: 'gold.drive.read',
      label: 'GOLD Drive',
      status: goldDrive.status,
      permissionEnvelope: 'read_only',
      provides: ['memory_override', 'gotchas', 'patterns', 'protocols', 'wisdom'],
      counts: { entries: goldDrive.entryCount, tiers: goldDrive.tierCount, hotEntries: goldDrive.hotEntryCount },
    },
    {
      id: 'codebase.graph.status',
      label: 'Graph Status',
      status: codebase.protocol.graphStatusBeforeAbsorb ? 'available' : 'missing',
      permissionEnvelope: 'read_only',
      provides: ['cache_freshness', 'absorb_gate'],
      tool: 'holo_graph_status',
    },
    {
      id: 'codebase.absorb.cache',
      label: 'Absorb Cache',
      status: codebase.protocol.absorbRepoAvailable ? 'available' : 'missing',
      permissionEnvelope: 'guarded_execute',
      provides: ['graph_refresh', 'manifest', 'holo_composition'],
      tool: 'holo_absorb_repo',
      defaultForce: false,
    },
    {
      id: 'codebase.query',
      label: 'Codebase Query',
      status: codebase.toolNames.some((name) => /query|ask/.test(name)) ? 'available' : 'missing',
      permissionEnvelope: 'read_only',
      provides: ['graph_rag', 'impact_questions', 'symbol_context'],
      tools: codebase.protocol.queryTools,
    },
    {
      id: 'source.surface.map',
      label: 'HoloScript Surface Map',
      status: bridgeInputs.surfaceMap.status,
      permissionEnvelope: 'read_only',
      provides: ['rest_surfaces', 'mcp_tools', 'cli_commands', 'tool_rooms'],
      counts: bridgeInputs.surfaceMap,
    },
    {
      id: 'source.format.inventory',
      label: 'HoloScript Format Inventory',
      status: bridgeInputs.formatInventory.status,
      permissionEnvelope: 'read_only',
      provides: ['holo_world_graphs', 'hs_render_slices', 'hsplus_agent_runtime'],
      counts: bridgeInputs.formatInventory,
    },
  ];
}

function buildReceipt(args) {
  const holoscriptRoot = resolveRepoPath(args.holoscriptRoot);
  const holoscriptRootPresent = existsSync(holoscriptRoot);
  const codebase = holoscriptRootPresent
    ? buildCodebaseIntelligence(holoscriptRoot)
    : {
        status: 'missing',
        sourceAnchors: {},
        guidePresent: false,
        toolsSourcePresent: false,
        toolNames: [],
        toolCount: 0,
        cliCommands: [],
        cliCommandCount: 0,
        protocol: { cacheFirst: false, graphStatusBeforeAbsorb: false, absorbRepoAvailable: false, forceFalseByDefault: false, queryTools: [] },
        questions: [],
      };
  const goldDrive = buildGoldDrive(args.goldRoot, args.maxGoldFiles);
  const bridgeInputs = buildBridgeInputs(args.tmpDir);
  const status = !holoscriptRootPresent ? 'blocked' : goldDrive.rootPresent && codebase.status === 'ready' ? 'ready' : 'partial';
  const generatedAt = new Date().toISOString();
  const capabilityMap = buildCapabilityMap(goldDrive, codebase, bridgeInputs);

  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    bridgeId: `gold-codebase-${shortHash(`${holoscriptRoot}|${goldDrive.root}|${generatedAt}`)}`,
    generatedAt,
    title: 'HoloScript GOLD Codebase Bridge',
    summary: {
      status,
      holoscriptRootPresent,
      goldRootPresent: goldDrive.rootPresent,
      goldStatus: goldDrive.status,
      goldEntryCount: goldDrive.entryCount || 0,
      goldTierCount: goldDrive.tierCount || 0,
      goldHotEntryCount: goldDrive.hotEntryCount || 0,
      goldConflictPolicy: goldDrive.conflictPolicy,
      codebaseStatus: codebase.status,
      codebaseGuidePresent: codebase.guidePresent,
      codebaseToolsSourcePresent: codebase.toolsSourcePresent,
      codebaseToolCount: codebase.toolCount,
      codebaseCliCommandCount: codebase.cliCommandCount,
      graphCacheProtocol: codebase.protocol.cacheFirst ? 'cache_first_graph_status_then_absorb' : 'partial',
      forceAbsorbDefault: false,
      surfaceMapStatus: bridgeInputs.surfaceMap.status,
      surfaceMapMcpToolCount: bridgeInputs.surfaceMap.mcpToolCount,
      formatInventoryStatus: bridgeInputs.formatInventory.status,
      wildHoloScriptStatus: bridgeInputs.wildHoloScript.status,
      capabilityMapCount: capabilityMap.length,
      brittneyUseCaseCount: 6,
    },
    sourceAnchors: {
      sourceContract: 'apps/holoshell/source/holoshell-holoscript-gold-codebase-bridge.hsplus',
      adapter: 'scripts/holoshell-holoscript-gold-codebase-bridge.mjs',
      holoscriptRoot,
      goldRoot: goldDrive.root,
      holoscriptBridge: 'apps/holoshell/source/holoshell-holoscript-bridge.hsplus',
      surfaceBridgeDoc: 'apps/holoshell/docs/HOLOSCRIPT_SURFACE_BRIDGE.md',
    },
    goldDrive,
    codebaseIntelligence: codebase,
    bridgeInputs,
    capabilityMap,
    brittneyUseCases: [
      {
        id: 'answer_from_existing_platform',
        label: 'Find What Already Exists',
        prompt: 'Before building a new HoloShell feature, check GOLD, HoloScript codebase tools, surface map, and format inventory.',
        permissionEnvelope: 'read_only',
      },
      {
        id: 'route_to_codebase_room',
        label: 'Route to Codebase Intelligence Room',
        prompt: 'Use graph status, cached absorb, query, ask, and impact tools for codebase questions.',
        permissionEnvelope: 'read_or_guarded_execute',
      },
      {
        id: 'gold_override_context',
        label: 'Apply GOLD Overrides',
        prompt: 'Promote Diamond, Platinum, and GOLD knowledge above stale local guesses when generating an operator plan.',
        permissionEnvelope: 'read_only',
      },
      {
        id: 'prevent_duplicate_builds',
        label: 'Prevent Duplicate Builds',
        prompt: 'Search existing HoloScript traits, docs, CLI tools, and MCP tools before creating a new adapter.',
        permissionEnvelope: 'read_only',
      },
      {
        id: 'trusted_autonomy_memory',
        label: 'Trusted Autonomy Memory',
        prompt: 'Use GOLD gotchas and codebase impact before escalating an approval from manual to trusted autonomous.',
        permissionEnvelope: 'read_only',
      },
      {
        id: 'format_power_router',
        label: 'Format Power Router',
        prompt: 'Pick .holo for worlds, .hs for render/pipeline slices, and .hsplus for behavior/agent runtime.',
        permissionEnvelope: 'read_only',
      },
    ],
    handoffPolicies: {
      goldDrive: 'read_only_by_default_no_auto_mutation',
      codebaseGraph: 'run_holo_graph_status_before_absorb_repo',
      absorbRepo: 'force_false_by_default_escalate_when_cache_stale',
      privateData: 'local_private_no_cloud_extrusion_without_founder_approval',
      toolExecution: 'read_only_or_guarded_execute_with_receipts',
      brittneyPlanning: 'ask_existing_substrate_before_new_build',
    },
    queryTemplates: [
      'What existing HoloScript capability covers this HoloShell request?',
      'Which GOLD entry or gotcha changes the plan?',
      'Is the codebase graph fresh enough for this answer?',
      'Which .holo/.hs/.hsplus format should own this feature?',
      'What shell objects should Brittney surface for this intent?',
      'What must stay behind approval before becoming trusted autonomous?',
    ],
    nextMoves: [
      'Attach this bridge to Brittney context packets so each turn can ask GOLD/codebase first.',
      'Add a guarded daemon route that runs graph-status and cache-first codebase queries.',
      'Promote trusted autonomy thresholds from GOLD gotchas plus observed approval outcomes.',
    ],
    receipt: {
      receiptHash: '',
      localOnly: true,
      mutationExecuted: false,
      privacyClass: 'local_private',
    },
  };
  receipt.receipt.receiptHash = shortHash(JSON.stringify({ summary: receipt.summary, anchors: receipt.sourceAnchors, policies: receipt.handoffPolicies }));
  return receipt;
}

function writeJson(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, receipt) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(receipt, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_HOLOSCRIPT_GOLD_CODEBASE_BRIDGE = ${payload};\n`, 'utf8');
  return resolved;
}

function assertSelfTest(receipt) {
  const failures = [];
  if (receipt.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (!receipt.summary.holoscriptRootPresent) failures.push('expected HoloScript root to exist');
  if (!receipt.summary.goldRootPresent) failures.push('expected GOLD root to exist');
  if (!receipt.summary.codebaseToolCount) failures.push('expected codebase MCP tools to be detected');
  if (!receipt.codebaseIntelligence.protocol.graphStatusBeforeAbsorb) failures.push('expected graph-status protocol');
  if (!receipt.capabilityMap.some((item) => item.id === 'gold.drive.read')) failures.push('expected GOLD capability');
  if (!receipt.capabilityMap.some((item) => item.id === 'codebase.query')) failures.push('expected codebase query capability');
  if (!receipt.handoffPolicies.absorbRepo.includes('force_false')) failures.push('expected force=false absorb policy');
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

try {
  const args = parseArgs();
  const receipt = buildReceipt(args);
  const output = writeJson(args.output, receipt);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, receipt);
  if (args.selfTest) assertSelfTest(receipt);

  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log(`HoloScript GOLD codebase bridge: ${output}`);
    console.log(`HoloShell browser bootstrap: ${jsOutput}`);
    console.log(`Status: ${receipt.summary.status}`);
    console.log(`GOLD entries: ${receipt.summary.goldEntryCount}`);
    console.log(`Codebase tools: ${receipt.summary.codebaseToolCount}`);
    console.log(`Graph cache protocol: ${receipt.summary.graphCacheProtocol}`);
  }
} catch (error) {
  console.error(`holoshell-holoscript-gold-codebase-bridge failed: ${error.message}`);
  process.exit(1);
}
