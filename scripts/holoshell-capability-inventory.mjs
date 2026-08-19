#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCHEMA_VERSION = 'hololand.holoshell.capability-inventory.v0.1.0';
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'capability-inventory.json');
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const SOURCE_ANCHORS = {
  composition: 'apps/holoshell/source/holoshell-home.hsplus',
  spec: 'docs/specs/HOLOSHELL_HARDWARE_NATIVE_SURFACE.md',
  appReadme: 'apps/holoshell/README.md',
};

function parseArgs(argv) {
  const args = {
    json: false,
    output: DEFAULT_OUTPUT,
    noHardwareAudit: false,
    selfTest: false,
    redactPrivate: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--no-hardware-audit') args.noHardwareAudit = true;
    else if (arg === '--redact-private') args.redactPrivate = true;
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
  console.log(`HoloShell capability inventory

Usage:
  node scripts/holoshell-capability-inventory.mjs [options]

Options:
  --json                 Print inventory JSON.
  --output <path>        Write inventory path. Defaults to .tmp/holoshell/capability-inventory.json.
  --no-hardware-audit    Skip scripts/hardware-audit.mjs integration.
  --redact-private       Redact local paths and app names for portable examples.
  --self-test            Assert inventory shape and required capability families.
  -h, --help             Show this help.
`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    timeout: options.timeoutMs || 10000,
    windowsHide: true,
    shell: false,
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    error: result.error ? result.error.message : undefined,
  };
}

function getVersion(command, args = ['--version']) {
  const result = run(command, args, { timeoutMs: 7000 });
  if (result.ok || result.stdout || result.stderr) return result.stdout || result.stderr;

  if (os.platform() === 'win32') {
    const shellResult = spawnSync('cmd.exe', ['/d', '/s', '/c', `${command} ${args.join(' ')}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 7000,
      windowsHide: true,
    });
    if (shellResult.status === 0 || shellResult.stdout || shellResult.stderr) {
      return (shellResult.stdout || shellResult.stderr || '').trim();
    }
  }

  return null;
}

function stableId(...parts) {
  return parts
    .join(':')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function classifyTrust(ok, fallback = 'unknown') {
  if (ok === true) return 'verified';
  if (ok === false) return 'partial';
  return fallback;
}

function capability({
  id,
  displayName,
  category,
  sourceKind,
  trustState = 'unknown',
  permissionEnvelope = 'read_only',
  inputs = [],
  outputs = [],
  receiptTypes = [],
  visualForm = 'glyph',
  adapter = 'unclassified',
  replacementPath = 'wrap_then_reimagine',
  evidence = {},
}) {
  return {
    id,
    displayName,
    category,
    sourceKind,
    trustState,
    permissionEnvelope,
    inputs,
    outputs,
    receiptTypes,
    visualForm,
    adapter,
    replacementPath,
    evidence,
  };
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const env = {};
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    env[key] = value;
  }
  return env;
}

function firstExisting(paths) {
  return paths.find((candidate) => candidate && existsSync(candidate)) || null;
}

function discoverBrowser() {
  const candidates = [
    process.env.HOLOSHELL_BROWSER,
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return firstExisting(candidates);
}

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {}

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {}
  }

  const firstArray = text.indexOf('[');
  const lastArray = text.lastIndexOf(']');
  if (firstArray !== -1 && lastArray !== -1 && lastArray > firstArray) {
    try {
      return JSON.parse(text.slice(firstArray, lastArray + 1));
    } catch {}
  }

  return null;
}

function runHardwareAudit(args) {
  if (args.noHardwareAudit) {
    return {
      ok: null,
      skipped: true,
      reason: 'Skipped by --no-hardware-audit',
    };
  }

  const result = run(process.execPath, ['scripts/hardware-audit.mjs', '--json'], {
    timeoutMs: 90000,
  });
  const receipt = extractJson(result.stdout);
  return {
    ok: result.ok && Boolean(receipt),
    skipped: false,
    receipt,
    status: result.status,
    stderr: result.stderr.slice(-1000),
  };
}

async function fetchJson(url, init = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      json: extractJson(text),
      text: text.slice(0, 1000),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverHoloMesh() {
  const aiEnv = readEnvFile(path.join(os.homedir(), '.ai-ecosystem', '.env'));
  const apiKey = process.env.HOLOMESH_KEY || process.env.HOLOMESH_API_KEY || aiEnv.HOLOMESH_KEY || aiEnv.HOLOMESH_API_KEY;
  const teamId = process.env.HOLOMESH_TEAM_ID || aiEnv.HOLOMESH_TEAM_ID || 'team_bfe0bd952f327631';

  if (!apiKey || !teamId) {
    return {
      ok: null,
      reason: 'Missing HOLOMESH key or team id',
    };
  }

  return fetchJson(`https://mcp.holoscript.net/api/holomesh/team/${teamId}/board`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

function discoverProjects(args) {
  const projects = [
    ['HoloLand', REPO_ROOT],
    ['HoloScript', path.resolve(REPO_ROOT, '..', 'HoloScript')],
    ['ai-ecosystem', path.join(os.homedir(), '.ai-ecosystem')],
  ];

  return projects.map(([name, projectPath]) => ({
    name: args.redactPrivate ? name : name,
    path: args.redactPrivate ? '[redacted-local-path]' : projectPath,
    exists: existsSync(projectPath),
    git: existsSync(path.join(projectPath, '.git')),
  }));
}

function discoverLegacyPrograms(args) {
  if (os.platform() !== 'win32') {
    return {
      ok: null,
      reason: 'Legacy program discovery currently targets Windows registry surfaces.',
      programs: [],
    };
  }

  const ps = [
    '$paths = @(',
    '"HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",',
    '"HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",',
    '"HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"',
    ');',
    '$items = foreach ($p in $paths) { Get-ItemProperty $p -ErrorAction SilentlyContinue };',
    '$items | Where-Object { $_.DisplayName } |',
    'Select-Object -First 40 DisplayName, Publisher, DisplayVersion, InstallLocation |',
    'ConvertTo-Json -Depth 3',
  ].join(' ');

  const result = run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    timeoutMs: 15000,
  });
  const parsed = extractJson(result.stdout) || [];
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const programs = list
    .filter((item) => item && item.DisplayName)
    .map((item) => ({
      name: args.redactPrivate ? '[redacted-program]' : String(item.DisplayName),
      publisher: args.redactPrivate ? undefined : item.Publisher || undefined,
      version: args.redactPrivate ? undefined : item.DisplayVersion || undefined,
      installLocation: args.redactPrivate
        ? undefined
        : item.InstallLocation || undefined,
      archetype: classifyLegacyProgram(String(item.DisplayName), String(item.Publisher || '')),
    }));

  return {
    ok: result.ok || programs.length > 0,
    status: result.status,
    programs,
    stderr: result.stderr.slice(-1000),
  };
}

function classifyLegacyProgram(name, publisher) {
  const s = `${name} ${publisher}`.toLowerCase();
  if (/chrome|edge|firefox|brave|browser/.test(s)) return 'browser_web_app';
  if (/office|excel|word|powerpoint|adobe|pdf|notepad/.test(s)) return 'document_workbench';
  if (/node|git|python|rust|visual studio|powershell|terminal|docker/.test(s)) return 'cli_dev_stack';
  if (/steam|unity|unreal|blender|nvidia|oculus|meta quest/.test(s)) return 'creative_runtime';
  if (/driver|intel|realtek|windows|microsoft visual c\+\+/.test(s)) return 'system_component';
  return 'unclassified_program';
}

function summarizeLegacyArchetypes(programs) {
  const counts = {};
  for (const program of programs) {
    counts[program.archetype] = (counts[program.archetype] || 0) + 1;
  }
  return counts;
}

async function createInventory(args) {
  const hardwareAudit = runHardwareAudit(args);
  const mcpHealth = await fetchJson('https://mcp.holoscript.net/health');
  const mcpDiscovery = await fetchJson('https://mcp.holoscript.net/.well-known/mcp');
  const holomesh = await discoverHoloMesh();
  const browserPath = discoverBrowser();
  const projects = discoverProjects(args);
  const legacy = discoverLegacyPrograms(args);
  const legacyArchetypes = summarizeLegacyArchetypes(legacy.programs || []);

  const nodeVersion = process.version;
  const pnpmVersion = getVersion('pnpm') || getVersion('pnpm.cmd') || 'unknown';
  const gitVersion = getVersion('git') || 'unknown';

  const capabilities = [
    capability({
      id: 'hardware-proof',
      displayName: 'Hardware Proof',
      category: 'hardware',
      sourceKind: 'hardware',
      trustState: classifyTrust(hardwareAudit.ok, hardwareAudit.skipped ? 'unknown' : 'partial'),
      permissionEnvelope: 'read_only',
      inputs: ['local runtime', 'browser hardware APIs', 'WASM SIMD probe'],
      outputs: ['hardware receipt'],
      receiptTypes: ['hololand.hardware-receipt.v1'],
      visualForm: 'glyph',
      adapter: 'node_hardware_audit',
      replacementPath: 'preserve_as_truth_source',
      evidence: {
        skipped: hardwareAudit.skipped,
        summary: hardwareAudit.receipt?.summary,
        output: hardwareAudit.receipt?.output,
      },
    }),
    capability({
      id: 'holoscript-mcp',
      displayName: 'HoloScript MCP',
      category: 'source_substrate',
      sourceKind: 'mcp',
      trustState: classifyTrust(mcpHealth.ok && mcpDiscovery.ok, 'partial'),
      permissionEnvelope: 'network_read_then_tool_auth',
      inputs: ['HoloScript source', 'tool requests'],
      outputs: ['validation', 'compilation', 'tool manifests'],
      receiptTypes: ['mcp health response', 'tool invocation receipt'],
      visualForm: 'room',
      adapter: 'https_json',
      replacementPath: 'source_layer',
      evidence: {
        healthStatus: mcpHealth.status,
        service: mcpHealth.json?.service,
        version: mcpHealth.json?.version,
        tools: mcpHealth.json?.tools,
        discoveryStatus: mcpDiscovery.status,
      },
    }),
    capability({
      id: 'holomesh-team',
      displayName: 'HoloMesh Agent Team',
      category: 'coordination',
      sourceKind: 'holomesh',
      trustState: classifyTrust(holomesh.ok, holomesh.reason ? 'unknown' : 'partial'),
      permissionEnvelope: 'team_auth_required',
      inputs: ['team id', 'agent identity', 'board state'],
      outputs: ['team slots', 'tasks', 'messages', 'knowledge'],
      receiptTypes: ['team heartbeat', 'board task receipt'],
      visualForm: 'room',
      adapter: 'holomesh_http',
      replacementPath: 'coordinate_agents',
      evidence: {
        status: holomesh.status,
        reason: holomesh.reason,
        openTasks: holomesh.json?.board?.open?.length,
        claimedTasks: holomesh.json?.board?.claimed?.length ?? holomesh.json?.board?.inProgress?.length,
        mode: holomesh.json?.mode,
      },
    }),
    capability({
      id: 'browser-operator',
      displayName: 'Browser Operator',
      category: 'browser',
      sourceKind: 'browser',
      trustState: browserPath ? 'partial' : 'unknown',
      permissionEnvelope: 'guarded_write',
      inputs: ['URL', 'profile/session boundary', 'intent'],
      outputs: ['web action result', 'screenshot', 'DOM witness'],
      receiptTypes: ['browser action receipt', 'visual witness'],
      visualForm: 'machine',
      adapter: browserPath ? 'local_browser_executable' : 'missing_browser_path',
      replacementPath: 'wrap_then_reimagine',
      evidence: {
        browserPath: args.redactPrivate ? (browserPath ? '[redacted-browser-path]' : null) : browserPath,
      },
    }),
    capability({
      id: 'local-projects',
      displayName: 'Local Projects',
      category: 'filesystem',
      sourceKind: 'filesystem',
      trustState: projects.some((project) => project.exists) ? 'partial' : 'unknown',
      permissionEnvelope: 'guarded_write',
      inputs: ['project path', 'task intent'],
      outputs: ['file edits', 'build receipts', 'git commits'],
      receiptTypes: ['git diff', 'build/test receipt'],
      visualForm: 'room',
      adapter: 'filesystem_git',
      replacementPath: 'preserve_as_work_substrate',
      evidence: { projects },
    }),
    capability({
      id: 'cli-dev-stack',
      displayName: 'CLI Dev Stack',
      category: 'cli',
      sourceKind: 'cli',
      trustState: nodeVersion && pnpmVersion !== 'unknown' ? 'partial' : 'unknown',
      permissionEnvelope: 'guarded_execute',
      inputs: ['command plan', 'working directory', 'timeout'],
      outputs: ['stdout', 'stderr', 'exit code'],
      receiptTypes: ['command receipt'],
      visualForm: 'machine',
      adapter: 'process_spawn',
      replacementPath: 'hide_under_intent_flow',
      evidence: { nodeVersion, pnpmVersion, gitVersion },
    }),
    capability({
      id: 'process-run-custody',
      displayName: 'Process & Run Custody',
      category: 'hardware_health',
      sourceKind: 'process_table',
      trustState: 'partial',
      permissionEnvelope: 'read_only_then_break_glass',
      inputs: ['process table', 'shell/dev run hints', 'run registry', 'hardware pressure thresholds'],
      outputs: ['process health receipt', 'run receipt', 'stop plan'],
      receiptTypes: ['hololand.holoshell.process-health.v0.1.0', 'hololand.holoshell.run-receipt.v0.1.0', 'process stop approval receipt'],
      visualForm: 'room',
      adapter: 'holoshell_process_health',
      replacementPath: 'preserve_as_hardware_guardian',
      evidence: {
        adapterScript: 'scripts/holoshell-process-health.mjs',
        runWrapperScript: 'scripts/holoshell-run.mjs',
        automaticTerminationAllowed: false,
      },
    }),
    capability({
      id: 'legacy-apps',
      displayName: 'Legacy Apps',
      category: 'legacy',
      sourceKind: 'app',
      trustState: legacy.programs?.length ? 'partial' : 'unknown',
      permissionEnvelope: 'classified_per_app',
      inputs: ['program manifest', 'operation intent'],
      outputs: ['wrapped app action', 'legacy witness'],
      receiptTypes: ['legacy app action receipt', 'manual witness when automation unavailable'],
      visualForm: 'machine_gallery',
      adapter: 'windows_registry_inventory',
      replacementPath: 'wrap_then_reimagine',
      evidence: {
        status: legacy.status,
        count: legacy.programs?.length || 0,
        archetypes: legacyArchetypes,
        programs: args.redactPrivate ? undefined : legacy.programs?.slice(0, 12),
      },
    }),
  ];

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors: SOURCE_ANCHORS,
    host: args.redactPrivate
      ? { platform: os.platform(), arch: os.arch(), release: '[redacted-release]' }
      : {
          platform: os.platform(),
          arch: os.arch(),
          release: os.release(),
          hostname: os.hostname(),
        },
    summary: {
      capabilityCount: capabilities.length,
      verified: capabilities.filter((item) => item.trustState === 'verified').length,
      partial: capabilities.filter((item) => item.trustState === 'partial').length,
      unknown: capabilities.filter((item) => item.trustState === 'unknown').length,
      legacyProgramCount: legacy.programs?.length || 0,
      legacyArchetypes,
    },
    capabilities,
    upstreamGaps: [
      {
        id: 'holoscript-capability-object-schema',
        layer: 'HoloScript',
        need: 'Canonical Capability object schema and validator for sourceKind, trustState, permissionEnvelope, receiptTypes, and visualForm.',
      },
      {
        id: 'holoscript-legacy-adapter-contract',
        layer: 'HoloScript',
        need: 'Reusable contract for API, CLI, browser, UI Automation, and vision fallback adapters.',
      },
      {
        id: 'holoscript-receipt-linker',
        layer: 'HoloScript',
        need: 'Cross-receipt relation model that links hardware, tool, browser, and legacy app witnesses into one HoloShell timeline.',
      },
      {
        id: 'holoscript-process-custody-schema',
        layer: 'HoloScript',
        need: 'Canonical ProcessHealthReceipt, ShellRun, RunCustody, and StopPlan schemas so agents can manage hardware pressure safely.',
      },
    ],
  };
}

function writeInventory(inventory, outputPath) {
  const resolved = path.resolve(REPO_ROOT, outputPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeReceipt(inventory, outputPath, error) {
  const receipt = {
    schemaVersion: 'hololand.holoshell.capability-inventory-receipt.v0.1.0',
    generatedAt: new Date().toISOString(),
    inventoryPath: outputPath,
    status: error ? 'failed' : 'succeeded',
    capabilityCount: inventory?.summary?.capabilityCount || 0,
    verifiedCount: inventory?.summary?.verified || 0,
    partialCount: inventory?.summary?.partial || 0,
    unknownCount: inventory?.summary?.unknown || 0,
    upstreamGapCount: (inventory?.upstreamGaps || []).length,
    error: error || undefined,
  };
  const receiptPath = path.resolve(REPO_ROOT, '.tmp', 'holoshell', 'capability-inventory-receipt.json');
  mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return receiptPath;
}

function assertSelfTest(inventory) {
  const failures = [];
  if (inventory.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (!Array.isArray(inventory.capabilities) || inventory.capabilities.length < 6) {
    failures.push('expected at least six capabilities');
  }
  const ids = new Set(inventory.capabilities.map((item) => item.id));
  for (const required of ['hardware-proof', 'holoscript-mcp', 'holomesh-team', 'browser-operator', 'local-projects', 'legacy-apps']) {
    if (!ids.has(required)) failures.push(`missing capability ${required}`);
  }
  for (const item of inventory.capabilities) {
    for (const field of ['id', 'displayName', 'category', 'sourceKind', 'trustState', 'permissionEnvelope', 'receiptTypes', 'visualForm']) {
      if (!(field in item)) failures.push(`${item.id || 'unknown'} missing ${field}`);
    }
  }
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const inventory = await createInventory(args);
  const outputPath = writeInventory(inventory, args.output);
  const receiptPath = writeReceipt(inventory, outputPath);
  if (args.selfTest) assertSelfTest(inventory);

  if (args.json) {
    console.log(JSON.stringify(inventory, null, 2));
  } else {
    console.log(`HoloShell capability inventory: ${outputPath}`);
    console.log(`HoloShell capability inventory receipt: ${receiptPath}`);
    console.log(`Capabilities: ${inventory.summary.capabilityCount}`);
    console.log(`Trust: ${inventory.summary.verified} verified, ${inventory.summary.partial} partial, ${inventory.summary.unknown} unknown`);
    console.log(`Legacy programs classified: ${inventory.summary.legacyProgramCount}`);
  }
} catch (error) {
  writeReceipt(null, args.output, error.message);
  console.error(`holoshell-capability-inventory failed: ${error.message}`);
  process.exit(1);
}
