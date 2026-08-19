#!/usr/bin/env node
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SCHEMA_VERSION = 'hololand.holoshell.wild-holoscript-intake.v0.1.0';
const DEFAULT_UAA2_ROOT = path.resolve(REPO_ROOT, '..', 'uaa2-service');
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'wild-holoscript-intake.json');
const DEFAULT_JS_OUTPUT = path.join('.tmp', 'holoshell', 'wild-holoscript-intake.js');
const DEFAULT_SELF_TEST_DIR = path.join('.tmp', 'holoshell', 'wild-holoscript-intake-self-test');
const HOLOSCRIPT_EXTENSIONS = new Set(['.holo', '.hs', '.hsplus']);
const IGNORE_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '.cache',
  '.tmp',
]);

const SIGNALS = [
  { id: 'import_directive', label: '@import directive', pattern: /(^|\n)\s*@import\b/ },
  { id: 'typescript_runtime_import', label: 'TypeScript or JavaScript runtime import', pattern: /(@import|from)\s+["'][^"']+\.(ts|tsx|js|mjs)["']/ },
  { id: 'holoscript_module_import', label: 'HoloScript module import', pattern: /(@import|from)\s+["'][^"']+\.(holo|hs|hsplus)["']/ },
  { id: 'state_directive', label: '@state directive', pattern: /(^|\n)\s*@state\b/ },
  { id: 'state_machine', label: '@state_machine directive', pattern: /(^|\n)\s*@state_machine\b/ },
  { id: 'agent_directive', label: '@agent directive', pattern: /(^|\n)\s*@agent\b/ },
  { id: 'event_handler', label: '@on_event directive', pattern: /(^|\n)\s*@on_event\b/ },
  { id: 'click_handler', label: '@on_click directive', pattern: /(^|\n)\s*@on_click\b/ },
  { id: 'hoverable', label: '@hoverable directive', pattern: /(^|\n)\s*@hoverable\b/ },
  { id: 'data_binding', label: 'data_binding block', pattern: /\bdata_binding\b/ },
  { id: 'world_block', label: 'world block', pattern: /\bworld\s*\{/ },
  { id: 'composition_block', label: 'composition block', pattern: /\bcomposition\s+["']?[^"'{\n]+/ },
  { id: 'module_block', label: 'module block', pattern: /\bmodule\s+[A-Za-z_][A-Za-z0-9_]*/ },
  { id: 'template_block', label: 'template block', pattern: /\btemplate\s+["']?[^"'{\n]+/ },
  { id: 'object_block', label: 'object block', pattern: /\bobject\s+["']?[^"'{\n]+/ },
  { id: 'child_object', label: 'child object block', pattern: /\bchild\s+object\b/ },
  { id: 'panel_block', label: 'panel block', pattern: /\bpanel\s+["']?[^"'{\n]+/ },
  { id: 'audio_config', label: 'audio_config block', pattern: /\baudio_config\b/ },
  { id: 'emit_call', label: 'emit call', pattern: /\bemit\s*\(/ },
  { id: 'api_call', label: 'API call', pattern: /\bapi\.(get|post|put|patch|delete)\s*\(/ },
  { id: 'for_directive', label: '@for directive', pattern: /(^|\n)\s*@for\b/ },
  { id: 'if_directive', label: '@if directive', pattern: /(^|\n)\s*@if\b/ },
];

const FORMAT_ROLES = {
  holo: {
    role: 'world_graph',
    founderShellUse: 'Founder shell composition: the whole desktop as spatial world, skin, object graph, and embedded module host.',
    userShellUse: 'Curated home surface: programs, files, browser, agent rooms, approvals, and safe skin presets.',
  },
  hs: {
    role: 'core_script',
    founderShellUse: 'Founder control and render slice: compact pipelines, launch plans, geometry proofs, and local-machine receipts.',
    userShellUse: 'Safe automation slice: readable workflows, health checks, import/export jobs, and reversible app actions.',
  },
  hsplus: {
    role: 'behavior_runtime',
    founderShellUse: 'Founder AGI/agent runtime: Brittney state, orchestration, policies, state machines, data binding, and host adapters.',
    userShellUse: 'Product behavior layer: assistant actions, guarded workflows, multiplayer state, avatar behavior, and app wrappers.',
  },
};

const FORMAT_FEATURES = [
  { id: 'composition_root', label: 'composition root', formats: ['holo', 'hsplus'], pattern: /\bcomposition\s+["']?[^"'{\n]+/ },
  { id: 'world_root', label: 'world root', formats: ['holo', 'hsplus'], pattern: /\bworld(?:\s+["'][^"']+["'])?\s*\{/ },
  { id: 'metadata_block', label: 'metadata block', formats: ['holo'], pattern: /\bmetadata\s*\{/ },
  { id: 'environment_block', label: 'environment block', formats: ['holo', 'hs'], pattern: /\benvironment\s*\{/ },
  { id: 'spatial_group', label: 'spatial group', formats: ['holo'], pattern: /\bspatial_group\s+["']?[^"'{\n]+/ },
  { id: 'template_system', label: 'template system', formats: ['holo', 'hsplus', 'hs'], pattern: /\btemplate\s+["']?[^"'{\n]+/ },
  { id: 'object_graph', label: 'object graph', formats: ['holo', 'hsplus', 'hs'], pattern: /\bobject\s+["']?[^"'{\n]+/ },
  { id: 'trait_decorators', label: 'trait decorators', formats: ['holo', 'hsplus'], pattern: /(^|\n)\s*@[A-Za-z][A-Za-z0-9_-]*/ },
  { id: 'state_blocks', label: 'state blocks', formats: ['holo', 'hsplus'], pattern: /\bstate\s*\{/ },
  { id: 'state_machine', label: 'state machine', formats: ['holo', 'hsplus'], pattern: /(^|\n)\s*@state_machine\b|\bstate_machine\s*\{/ },
  { id: 'action_blocks', label: 'action blocks', formats: ['holo', 'hsplus'], pattern: /\baction\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/ },
  { id: 'event_handlers', label: 'event handlers', formats: ['holo', 'hsplus'], pattern: /(^|\n)\s*@on_|(^|\n)\s*on_(click|grab|collision|event|throw|hover)\b/ },
  { id: 'panel_ui', label: 'panel and UI nodes', formats: ['holo', 'hsplus'], pattern: /\b(panel|uiType|ui_type|textinput|slider|toggle|dropdown|modal)\b/ },
  { id: 'inline_pipeline', label: 'inline pipeline', formats: ['holo'], pattern: /\bpipeline\s+["']?[^"'{\n]+/ },
  { id: 'pipeline_root', label: 'pipeline root', formats: ['hs', 'holo'], pattern: /\bpipeline\s+["']?[^"'{\n]+/ },
  { id: 'pipeline_source', label: 'pipeline source', formats: ['hs', 'holo'], pattern: /\bsource\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/ },
  { id: 'pipeline_transform', label: 'pipeline transform', formats: ['hs', 'holo'], pattern: /\btransform\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/ },
  { id: 'pipeline_filter', label: 'pipeline filter', formats: ['hs', 'holo'], pattern: /\bfilter\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/ },
  { id: 'pipeline_validate', label: 'pipeline validate', formats: ['hs', 'holo'], pattern: /\bvalidate\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/ },
  { id: 'pipeline_merge', label: 'pipeline merge', formats: ['hs', 'holo'], pattern: /\bmerge\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/ },
  { id: 'pipeline_branch', label: 'pipeline branch', formats: ['hs', 'holo'], pattern: /\bbranch\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/ },
  { id: 'pipeline_sink', label: 'pipeline sink', formats: ['hs', 'holo'], pattern: /\bsink\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/ },
  { id: 'schedule', label: 'schedule', formats: ['hs', 'holo'], pattern: /\bschedule\s*:/ },
  { id: 'module_system', label: 'module system', formats: ['hs', 'hsplus'], pattern: /\bmodule\s+[A-Za-z_][A-Za-z0-9_]*/ },
  { id: 'light_nodes', label: 'light nodes', formats: ['hs', 'holo'], pattern: /\blight\s+["']?[^"'{\n]+\s*\{/ },
  { id: 'geometry_nodes', label: 'geometry or mesh nodes', formats: ['hs', 'holo', 'hsplus'], pattern: /\b(geometry|mesh)\s*:/ },
  { id: 'material_nodes', label: 'material nodes', formats: ['hs', 'holo', 'hsplus'], pattern: /\bmaterial\s*:/ },
  { id: 'animation_nodes', label: 'animation nodes', formats: ['hs', 'holo', 'hsplus'], pattern: /\b(animate|animation|animSpeed)\s*:/ },
  { id: 'post_processing', label: 'post processing', formats: ['hs', 'holo'], pattern: /\bpost_processing\s*\{/ },
  { id: 'agent_runtime', label: 'agent runtime', formats: ['hsplus'], pattern: /(^|\n)\s*@agent\b|\bagent\s+["']?[^"'{\n]+|brittney/i },
  { id: 'data_binding', label: 'data binding', formats: ['hsplus', 'holo'], pattern: /\bdata_binding\b/ },
  { id: 'control_flow', label: 'control flow directives', formats: ['hsplus', 'holo'], pattern: /(^|\n)\s*@(for|if|while|forEach)\b/ },
  { id: 'networked_object', label: 'networked object', formats: ['hsplus'], pattern: /\bnetworked_object\b/ },
  { id: 'audio_config', label: 'audio config', formats: ['holo', 'hsplus'], pattern: /\baudio_config\b/ },
  { id: 'host_api_bridge', label: 'host API bridge', formats: ['hsplus', 'hs'], pattern: /\bapi\.(get|post|put|patch|delete)\s*\(|\bfetch\s*\(/ },
  { id: 'holoscript_imports', label: 'HoloScript imports', formats: ['*'], pattern: /(@import|from)\s+["'][^"']+\.(holo|hs|hsplus)["']/ },
  { id: 'host_runtime_imports', label: 'host runtime imports', formats: ['*'], pattern: /(@import|from)\s+["'][^"']+\.(ts|tsx|js|mjs)["']/ },
  { id: 'permission_receipts', label: 'permission or receipts', formats: ['hsplus', 'holo', 'hs'], pattern: /\b(permission|receipt|approval|custody|rollback)\b/i },
  { id: 'skin_effects', label: 'skin and effects', formats: ['holo', 'hs', 'hsplus'], pattern: /\b(water|liquid|fire|aura|hologram|particle|ripple|caustic|ember|smoke|portal|bloom|glow)\b/i },
  { id: 'hardware_shell_control', label: 'hardware shell control', formats: ['hsplus', 'hs'], pattern: /\b(terminal|window|program|browser|file|clipboard|keyboard|mouse|excel|youtube|ollama|command)\b/i },
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    uaa2Root: process.env.UAA2_SERVICE_ROOT || DEFAULT_UAA2_ROOT,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    json: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--uaa2-root') args.uaa2Root = argv[++index];
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
  console.log(`HoloShell wild HoloScript intake

Usage:
  node scripts/holoshell-wild-holoscript-intake.mjs [options]

Options:
  --uaa2-root <path>    uaa2-service checkout to scan. Default: ${DEFAULT_UAA2_ROOT}
  --output <path>       JSON output path. Default: ${DEFAULT_OUTPUT}
  --js-output <path>    Browser bootstrap output path. Default: ${DEFAULT_JS_OUTPUT}
  --json                Print the receipt as JSON.
  --self-test           Build a fixture corpus and assert classification.
  -h, --help            Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function resolveInputPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function publicPath(filePath, basePath = REPO_ROOT) {
  return path.relative(basePath, filePath).replace(/\\/g, '/');
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
  return writeText(filePath, `window.HOLOSHELL_WILD_HOLOSCRIPT_INTAKE = ${payload};\n`);
}

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function countLines(text) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

function shouldIgnoreDir(name) {
  return IGNORE_DIRS.has(name) || name.endsWith('.log');
}

function walkHoloScriptFiles(rootPath) {
  const files = [];
  const stack = [rootPath];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!shouldIgnoreDir(entry.name)) stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (HOLOSCRIPT_EXTENSIONS.has(ext)) files.push(fullPath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function inferTitle(relativePath, text) {
  const named =
    text.match(/\bcomposition\s+["']([^"']+)["']/) ||
    text.match(/\bworld\s+["']([^"']+)["']/) ||
    text.match(/\bobject\s+["']([^"']+)["']/) ||
    text.match(/\bmodule\s+([A-Za-z_][A-Za-z0-9_]*)/) ||
    text.match(/\btemplate\s+["']([^"']+)["']/);
  if (named?.[1]) return named[1].replace(/[_-]+/g, ' ').trim();
  return path.basename(relativePath).replace(/\.(holo|hs|hsplus)$/i, '').replace(/[_-]+/g, ' ');
}

function detectedSignals(text) {
  return SIGNALS.filter((signal) => signal.pattern.test(text)).map((signal) => signal.id);
}

function featureAllowedForExtension(feature, extension) {
  const ext = extension.startsWith('.') ? extension.slice(1) : extension;
  return feature.formats.includes('*') || feature.formats.includes(ext);
}

function detectedFormatFeatures(text, extension) {
  return FORMAT_FEATURES
    .filter((feature) => featureAllowedForExtension(feature, extension) && feature.pattern.test(text))
    .map((feature) => feature.id);
}

function classifyPatterns(relativePath, text, extension) {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
  const patterns = [];
  if (normalized.includes('agent-orchestration')) patterns.push('agent_orchestration');
  if (normalized.includes('brittney')) patterns.push('brittney_agent');
  if (normalized.includes('terminal')) patterns.push('terminal_os_object');
  if (normalized.includes('/worlds/')) patterns.push('xr_world');
  if (normalized.includes('healthcare') || normalized.includes('therapy')) patterns.push('healthcare_world');
  if (normalized.includes('master-portal')) patterns.push('master_portal');
  if (normalized.includes('/spatial/') || normalized.includes('spatial')) patterns.push('spatial_service');
  if (normalized.includes('/components/') || normalized.includes('_lib/components') || /\bcomponent\b/.test(text)) patterns.push('visual_component');
  if (normalized.includes('lambda') || /\blambda\b/.test(text)) patterns.push('lambda_agent');
  if (normalized.includes('governance') || /@state_machine\b/.test(text)) patterns.push('governance_state_machine');
  if (normalized.includes('schema') || normalized.includes('contract')) patterns.push('contract_or_schema');
  if (extension === '.holo') patterns.push('holo_world');
  if (!patterns.length) patterns.push('wild_holoscript');
  return [...new Set(patterns)];
}

function compatibilityBand(extension, signals, patterns) {
  const set = new Set(signals);
  const reasons = [];
  if (set.has('typescript_runtime_import')) reasons.push('imports host TypeScript or JavaScript runtime');
  if (set.has('api_call')) reasons.push('calls host API surface');
  if (set.has('data_binding')) reasons.push('uses live data binding');
  if (patterns.includes('terminal_os_object')) reasons.push('targets local hardware shell object');
  const frontierSignalCount = signals.filter((signal) => [
    'state_directive',
    'state_machine',
    'agent_directive',
    'event_handler',
    'click_handler',
    'hoverable',
    'world_block',
    'for_directive',
    'if_directive',
    'audio_config',
    'child_object',
  ].includes(signal)).length;
  if (reasons.length) {
    return { band: 'adapter_needed', reasons };
  }
  if (frontierSignalCount >= 3 || set.has('state_machine')) {
    return { band: 'frontier_syntax', reasons: ['uses frontier HoloScript directives that need parser/runtime coverage'] };
  }
  if (extension === '.holo' || extension === '.hs') {
    return { band: 'canonical_candidate', reasons: ['looks displayable as HoloShell source with current adapters'] };
  }
  return { band: 'frontier_syntax', reasons: ['hsplus behavior source needs promotion policy before execution'] };
}

function promotionFor(patterns, compatibility) {
  if (patterns.includes('terminal_os_object')) return 'promote_into_command_bubble_adapter';
  if (patterns.includes('brittney_agent')) return 'promote_into_brittney_avatar_runtime';
  if (patterns.includes('agent_orchestration')) return 'promote_into_agent_lab_surface';
  if (patterns.includes('visual_component')) return 'promote_into_shell_widget_library';
  if (patterns.includes('holo_world') && compatibility.band === 'canonical_candidate') return 'display_as_holo_world_fixture';
  if (compatibility.band === 'adapter_needed') return 'write_read_only_adapter_before_runtime_use';
  return 'hold_as_frontier_syntax_fixture';
}

function analyzeFile(filePath, rootPath) {
  const extension = path.extname(filePath).toLowerCase();
  const relativePath = publicPath(filePath, rootPath);
  const text = readFileSync(filePath, 'utf8');
  const signals = detectedSignals(text);
  const formatFeatures = detectedFormatFeatures(text, extension);
  const patterns = classifyPatterns(relativePath, text, extension);
  const compatibility = compatibilityBand(extension, signals, patterns);
  const score =
    signals.length * 2 +
    formatFeatures.length +
    patterns.length * 3 +
    (patterns.includes('agent_orchestration') ? 12 : 0) +
    (patterns.includes('brittney_agent') ? 10 : 0) +
    (patterns.includes('terminal_os_object') ? 10 : 0) +
    Math.min(10, Math.floor(text.length / 4000));

  return {
    path: relativePath,
    extension: extension.slice(1),
    title: inferTitle(relativePath, text),
    bytes: Buffer.byteLength(text, 'utf8'),
    lines: countLines(text),
    sha256: hashText(text).slice(0, 16),
    score,
    compatibilityBand: compatibility.band,
    compatibilityReasons: compatibility.reasons,
    patterns,
    signals,
    formatFeatures,
    promotionPath: promotionFor(patterns, compatibility),
  };
}

function countBy(items, keySelector) {
  return items.reduce((counts, item) => {
    const key = keySelector(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function countSignals(files) {
  const counts = {};
  for (const file of files) {
    for (const signal of file.signals) counts[signal] = (counts[signal] || 0) + 1;
  }
  return counts;
}

function countPatterns(files) {
  const counts = {};
  for (const file of files) {
    for (const patternName of file.patterns) counts[patternName] = (counts[patternName] || 0) + 1;
  }
  return counts;
}

function countList(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return counts;
}

function topEntry(counts) {
  const entries = Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries[0] ? { name: entries[0][0], count: entries[0][1] } : { name: '', count: 0 };
}

function featureLabel(id) {
  return FORMAT_FEATURES.find((feature) => feature.id === id)?.label || id;
}

function formatProfilesFrom(files) {
  return ['holo', 'hs', 'hsplus'].map((extension) => {
    const role = FORMAT_ROLES[extension];
    const formatFiles = files.filter((file) => file.extension === extension);
    const featureCounts = countList(formatFiles.flatMap((file) => file.formatFeatures || []));
    const topFeature = topEntry(featureCounts);

    return {
      extension,
      role: role.role,
      founderShellUse: role.founderShellUse,
      userShellUse: role.userShellUse,
      fileCount: formatFiles.length,
      uniqueFeatureCount: Object.keys(featureCounts).length,
      featureHitCount: Object.values(featureCounts).reduce((sum, count) => sum + count, 0),
      topFeature: topFeature.name,
      featureInventory: Object.entries(featureCounts)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([id, count]) => ({ id, label: featureLabel(id), count })),
      topFiles: formatFiles
        .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
        .slice(0, 5)
        .map((file) => ({
          path: file.path,
          title: file.title,
          score: file.score,
          compatibilityBand: file.compatibilityBand,
          formatFeatures: (file.formatFeatures || []).slice(0, 10),
          promotionPath: file.promotionPath,
        })),
    };
  });
}

function intakeMapFrom(files) {
  const byPattern = (patternName) => files.find((file) => file.patterns.includes(patternName));
  const terminal = byPattern('terminal_os_object');
  const orchestration = byPattern('agent_orchestration');
  const brittney = byPattern('brittney_agent');
  const component = byPattern('visual_component');
  const holoWorld = files.find((file) => file.extension === 'holo');
  return [
    {
      id: 'terminal-command-bubble',
      sourcePath: terminal?.path || 'src/services/spatial/scripts/terminal-integration.hsplus',
      targetObject: 'command',
      targetSource: 'apps/holoshell/source/holoshell-shell-render.holo',
      adapter: 'terminal_os_object_adapter',
      nextAction: 'Render terminal_shell as a HoloShell Command bubble with guarded hardware receipts.',
    },
    {
      id: 'agent-lab-surface',
      sourcePath: orchestration?.path || 'src/worlds/innovation/agent-orchestration.hsplus',
      targetObject: 'agent-lab',
      targetSource: 'apps/holoshell/source/holoshell-home.hsplus',
      adapter: 'wild_agent_orchestration_adapter',
      nextAction: 'Promote world/data_binding/@for syntax into the Agent Lab surface without discarding the frontier syntax.',
    },
    {
      id: 'brittney-runtime-state-machine',
      sourcePath: brittney?.path || 'src/holoscript/agents/brittney.hsplus',
      targetObject: 'assistant.brittney',
      targetSource: 'apps/holoshell/source/holoshell-brittney-avatar.hsplus',
      adapter: 'brittney_state_machine_adapter',
      nextAction: 'Map wild Brittney state machine semantics into avatar state, voice, action proposals, and receipts.',
    },
    {
      id: 'shell-widget-library',
      sourcePath: component?.path || 'src/worlds/innovation/_lib/components',
      targetObject: 'shell-widgets',
      targetSource: 'apps/holoshell/source/holoshell-shell-world.holo',
      adapter: 'wild_component_display_adapter',
      nextAction: 'Lift reusable .hs/.hsplus visual components into HoloShell widgets and skin effects.',
    },
    {
      id: 'holo-world-compatibility',
      sourcePath: holoWorld?.path || 'src/worlds/healthcare/therapy_session.holo',
      targetObject: 'world-fixture',
      targetSource: 'apps/holoshell/source/holoshell-shell-world.holo',
      adapter: 'holo_world_display_adapter',
      nextAction: 'Use .holo worlds as compatibility fixtures proving .hs modules can display inside .holo scenes.',
    },
  ];
}

function buildMissingReceipt(rootPath) {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    intakeId: `wild-holoscript-${Date.now().toString(36)}`,
    source: {
      script: 'scripts/holoshell-wild-holoscript-intake.mjs',
      rootName: path.basename(rootPath),
      uaa2Root: rootPath,
      repositoryRelativeHint: '../uaa2-service',
    },
    host: {
      platform: os.platform(),
      release: os.release(),
      hostname: os.hostname(),
    },
    summary: {
      status: 'missing_source',
      fileCount: 0,
      holoCount: 0,
      hsCount: 0,
      hsplusCount: 0,
      frontierSyntaxCount: 0,
      adapterNeededCount: 0,
      canonicalCandidateCount: 0,
      flagshipCount: 0,
      topPattern: '',
      holoFeatureCount: 0,
      hsFeatureCount: 0,
      hsplusFeatureCount: 0,
      holoTopFeature: '',
      hsTopFeature: '',
      hsplusTopFeature: '',
      nextMove: 'attach_or_clone_uaa2_service_then_rerun_intake',
    },
    extensionCounts: { holo: 0, hs: 0, hsplus: 0 },
    formatProfiles: formatProfilesFrom([]),
    syntaxInventory: [],
    patternInventory: [],
    topFlagships: [],
    files: [],
    holoshellIntakeMap: intakeMapFrom([]),
    invariants: {
      readOnlyScan: true,
      sourceFilesMutated: false,
      wildSyntaxPreserved: true,
      adapterRequiredForExecution: true,
    },
  };
}

function buildIntake(args) {
  const rootPath = resolveInputPath(args.uaa2Root);
  if (!existsSync(rootPath)) return buildMissingReceipt(rootPath);
  const files = walkHoloScriptFiles(rootPath).map((filePath) => analyzeFile(filePath, rootPath));
  const extensionCounts = countBy(files, (file) => file.extension);
  const signalCounts = countSignals(files);
  const patternCounts = countPatterns(files);
  const topPattern = topEntry(patternCounts);
  const topFlagships = files
    .filter((file) => file.score >= 12 || ['agent_orchestration', 'brittney_agent', 'terminal_os_object', 'holo_world'].some((patternName) => file.patterns.includes(patternName)))
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, 12);
  const adapterNeededCount = files.filter((file) => file.compatibilityBand === 'adapter_needed').length;
  const frontierSyntaxCount = files.filter((file) => file.compatibilityBand === 'frontier_syntax').length;
  const canonicalCandidateCount = files.filter((file) => file.compatibilityBand === 'canonical_candidate').length;
  const formatProfiles = formatProfilesFrom(files);
  const profileFor = (extension) => formatProfiles.find((profile) => profile.extension === extension) || {};

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    intakeId: `wild-holoscript-${hashText(`${rootPath}:${files.length}:${files.map((file) => file.sha256).join('|')}`).slice(0, 12)}`,
    source: {
      script: 'scripts/holoshell-wild-holoscript-intake.mjs',
      rootName: path.basename(rootPath),
      uaa2Root: rootPath,
      repositoryRelativeHint: publicPath(rootPath, REPO_ROOT),
    },
    host: {
      platform: os.platform(),
      release: os.release(),
      hostname: os.hostname(),
    },
    summary: {
      status: 'scanned',
      fileCount: files.length,
      holoCount: extensionCounts.holo || 0,
      hsCount: extensionCounts.hs || 0,
      hsplusCount: extensionCounts.hsplus || 0,
      frontierSyntaxCount,
      adapterNeededCount,
      canonicalCandidateCount,
      flagshipCount: topFlagships.length,
      topPattern: topPattern.name,
      holoFeatureCount: profileFor('holo').uniqueFeatureCount || 0,
      hsFeatureCount: profileFor('hs').uniqueFeatureCount || 0,
      hsplusFeatureCount: profileFor('hsplus').uniqueFeatureCount || 0,
      holoTopFeature: profileFor('holo').topFeature || '',
      hsTopFeature: profileFor('hs').topFeature || '',
      hsplusTopFeature: profileFor('hsplus').topFeature || '',
      nextMove: adapterNeededCount
        ? 'promote_terminal_and_brittney_modules_with_adapter_receipts'
        : 'promote_canonical_holo_worlds',
    },
    extensionCounts: {
      holo: extensionCounts.holo || 0,
      hs: extensionCounts.hs || 0,
      hsplus: extensionCounts.hsplus || 0,
    },
    formatProfiles,
    syntaxInventory: Object.entries(signalCounts)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([id, count]) => ({ id, label: SIGNALS.find((signal) => signal.id === id)?.label || id, count })),
    patternInventory: Object.entries(patternCounts)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([id, count]) => ({ id, count })),
    topFlagships,
    files,
    holoshellIntakeMap: intakeMapFrom(files),
    invariants: {
      readOnlyScan: true,
      sourceFilesMutated: false,
      wildSyntaxPreserved: true,
      adapterRequiredForExecution: true,
    },
  };
}

function safeRemoveSelfTestDir(dirPath) {
  const resolved = resolveRepoPath(dirPath);
  const allowedRoot = resolveRepoPath(DEFAULT_SELF_TEST_DIR);
  if (!resolved.startsWith(allowedRoot)) {
    throw new Error(`Refusing to remove unexpected self-test path: ${resolved}`);
  }
  rmSync(resolved, { recursive: true, force: true });
}

function writeFixtureFile(rootPath, relativePath, text) {
  const fullPath = path.join(rootPath, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${text.trim()}\n`, 'utf8');
}

function buildFixtureCorpus() {
  const testDir = resolveRepoPath(DEFAULT_SELF_TEST_DIR);
  safeRemoveSelfTestDir(testDir);
  const rootPath = path.join(testDir, 'uaa2-service');
  writeFixtureFile(rootPath, 'src/holoscript/agents/brittney.hsplus', `
composition "Brittney Prime Architect" {
  @state_machine
  @agent
  state { mode: "architect" }
  @on_event("intent.received") { emit("brittney:plan", { mode: state.mode }) }
}
`);
  writeFixtureFile(rootPath, 'src/services/spatial/scripts/terminal-integration.hsplus', `
object "terminal_shell" {
  @state status = "ready"
  child object "reboot_button" { @on_click { emit("terminal:reboot") } }
}
`);
  writeFixtureFile(rootPath, 'src/worlds/innovation/agent-orchestration.hsplus', `
@import "../logic/orchestration.ts"
@import "./_lib/components/agent-station.hs"
world {
  data_binding { agents: api.post("/agents/query") }
  @for agent in agents { object "station" { @hoverable } }
  @if agents.length { audio_config { bus: "ambient" } }
}
`);
  writeFixtureFile(rootPath, 'src/worlds/healthcare/therapy_session.holo', `
composition "Therapy Session" {
  metadata { title: "Therapy Session" }
  environment { skybox: "calm" }
  spatial_group "calm wing" {
    object "calm_room" { kind: "safe_space" }
  }
}
`);
  writeFixtureFile(rootPath, 'src/services/master-portal/orchestration/_lib/lotus-layers.hs', `
module LotusLayers {
  template "Layer" { object "petal" { kind: "geometry" } }
}

pipeline "LotusTelemetry" {
  schedule: "*/5 * * * *"
  source RoomState { type: "mcp" }
  transform MapFields { room -> shellRoom }
  sink Shell { type: "mcp" }
}
`);
  return rootPath;
}

function assertSelfTest() {
  const rootPath = buildFixtureCorpus();
  const output = path.join(DEFAULT_SELF_TEST_DIR, 'wild-holoscript-intake.json');
  const jsOutput = path.join(DEFAULT_SELF_TEST_DIR, 'wild-holoscript-intake.js');
  const receipt = buildIntake({ uaa2Root: rootPath });
  writeJson(output, receipt);
  writeBrowserBootstrap(jsOutput, receipt);

  const failures = [];
  if (receipt.summary.status !== 'scanned') failures.push('expected scanned status');
  if (receipt.summary.fileCount < 5) failures.push('expected at least five fixture files');
  if (receipt.summary.holoCount !== 1) failures.push('expected one .holo fixture');
  if (receipt.summary.hsCount !== 1) failures.push('expected one .hs fixture');
  if (receipt.summary.hsplusCount !== 3) failures.push('expected three .hsplus fixtures');
  if (!receipt.files.some((file) => file.patterns.includes('terminal_os_object'))) failures.push('expected terminal object classification');
  if (!receipt.files.some((file) => file.patterns.includes('brittney_agent'))) failures.push('expected Brittney classification');
  if (!receipt.syntaxInventory.some((item) => item.id === 'data_binding')) failures.push('expected data_binding signal');
  if (!receipt.syntaxInventory.some((item) => item.id === 'typescript_runtime_import')) failures.push('expected TypeScript import signal');
  const holoProfile = receipt.formatProfiles.find((profile) => profile.extension === 'holo');
  const hsProfile = receipt.formatProfiles.find((profile) => profile.extension === 'hs');
  const hsplusProfile = receipt.formatProfiles.find((profile) => profile.extension === 'hsplus');
  if (!holoProfile?.featureInventory.some((item) => item.id === 'spatial_group')) failures.push('expected .holo spatial group feature');
  if (!hsProfile?.featureInventory.some((item) => item.id === 'pipeline_root')) failures.push('expected .hs pipeline feature');
  if (!hsProfile?.featureInventory.some((item) => item.id === 'module_system')) failures.push('expected .hs module feature');
  if (!hsplusProfile?.featureInventory.some((item) => item.id === 'agent_runtime')) failures.push('expected .hsplus agent runtime feature');
  if (!receipt.summary.adapterNeededCount) failures.push('expected adapter-needed files');
  if (!receipt.summary.frontierSyntaxCount) failures.push('expected frontier syntax files');
  if (!receipt.summary.canonicalCandidateCount) failures.push('expected canonical candidates');
  if (receipt.holoshellIntakeMap.length < 5) failures.push('expected HoloShell intake map');
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
  return receipt;
}

function main() {
  const args = parseArgs();
  if (args.selfTest) {
    const receipt = assertSelfTest();
    if (args.json) console.log(JSON.stringify(receipt, null, 2));
    else console.log(`Self-test passed: ${receipt.summary.fileCount} wild HoloScript fixture files`);
    return;
  }
  const receipt = buildIntake(args);
  const output = writeJson(args.output, receipt);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, receipt);
  if (args.json) console.log(JSON.stringify(receipt, null, 2));
  else {
    console.log(`Wrote ${output}`);
    console.log(`Wrote ${jsOutput}`);
    console.log(`Wild HoloScript files: ${receipt.summary.fileCount}`);
    console.log(`Adapter needed: ${receipt.summary.adapterNeededCount}`);
    console.log(`Frontier syntax: ${receipt.summary.frontierSyntaxCount}`);
  }
}

if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/')}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

export { buildIntake, assertSelfTest };
