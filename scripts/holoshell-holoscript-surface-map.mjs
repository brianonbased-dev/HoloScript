#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCHEMA_VERSION = 'hololand.holoshell.holoscript-surface-map.v0.1.0';
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'holoscript-surface-map.json');
const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const HOLOSCRIPT_ROOT = path.resolve(REPO_ROOT, '..', 'HoloScript');
const MCP_BASE = 'https://mcp.holoscript.net';

const SOURCE_ANCHORS = {
  bridgeSource: 'apps/holoshell/source/holoshell-holoscript-bridge.hsplus',
  bridgeDoc: 'apps/holoshell/docs/HOLOSCRIPT_SURFACE_BRIDGE.md',
  roadmap: 'apps/holoshell/docs/PHASE_1_ROADMAP.md',
};

function parseArgs(argv) {
  const args = {
    json: false,
    output: DEFAULT_OUTPUT,
    selfTest: false,
    probeCompile: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--probe-compile') args.probeCompile = true;
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
  console.log(`HoloShell HoloScript surface map

Usage:
  node scripts/holoshell-holoscript-surface-map.mjs [options]

Options:
  --json             Print surface map JSON.
  --output <path>    Write output path. Defaults to .tmp/holoshell/holoscript-surface-map.json.
  --self-test        Assert required surface families are present.
  --probe-compile    Exercise the remote compile REST API with a tiny composition.
  -h, --help         Show this help.
`);
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const env = {};
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function extractJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}

  const firstObject = text.indexOf('{');
  const lastObject = text.lastIndexOf('}');
  if (firstObject !== -1 && lastObject > firstObject) {
    try {
      return JSON.parse(text.slice(firstObject, lastObject + 1));
    } catch {}
  }

  const firstArray = text.indexOf('[');
  const lastArray = text.lastIndexOf(']');
  if (firstArray !== -1 && lastArray > firstArray) {
    try {
      return JSON.parse(text.slice(firstArray, lastArray + 1));
    } catch {}
  }

  return null;
}

function toolNames(tools, limit = 12) {
  if (!Array.isArray(tools)) return undefined;
  return tools.slice(0, limit).map((tool) => (typeof tool === 'string' ? tool : tool.name || 'unknown'));
}

function stripAnsi(text) {
  return String(text || '').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function quoteWindowsArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function run(command, args, options = {}) {
  const spawnOptions = {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    timeout: options.timeoutMs || 15000,
    windowsHide: true,
    shell: false,
  };
  const result = spawnSync(command, args, spawnOptions);

  const needsWindowsShim = process.platform === 'win32'
    && result.error?.code === 'ENOENT'
    && !command.endsWith('.cmd');
  const shimResult = needsWindowsShim
    ? spawnSync(`${command}.cmd`, args, spawnOptions)
    : result;
  const finalResult = process.platform === 'win32' && shimResult.error
    ? spawnSync(process.env.ComSpec || 'cmd.exe', [
        '/d',
        '/s',
        '/c',
        [command, ...args].map(quoteWindowsArg).join(' '),
      ], spawnOptions)
    : shimResult;

  return {
    ok: finalResult.status === 0,
    status: finalResult.status,
    stdout: finalResult.stdout || '',
    stderr: finalResult.stderr || '',
    error: finalResult.error ? finalResult.error.message : undefined,
  };
}

async function fetchText(url, init = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      json: extractJson(text),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: error.message,
      text: '',
      json: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverRestSurfaces(args) {
  const surfaces = [
    {
      id: 'mcp-health',
      name: 'HoloScript MCP health',
      method: 'GET',
      url: `${MCP_BASE}/health`,
      category: 'substrate',
      permissionEnvelope: 'public_read',
    },
    {
      id: 'mcp-api-health',
      name: 'HoloScript API health',
      method: 'GET',
      url: `${MCP_BASE}/api/health`,
      category: 'substrate',
      permissionEnvelope: 'public_read',
    },
    {
      id: 'mcp-discovery',
      name: 'MCP discovery document',
      method: 'GET',
      url: `${MCP_BASE}/.well-known/mcp`,
      category: 'rpc_discovery',
      permissionEnvelope: 'public_read',
    },
    {
      id: 'public-tool-lane',
      name: 'Public tool lane',
      method: 'GET',
      url: `${MCP_BASE}/api/public/tool`,
      category: 'public_tools',
      permissionEnvelope: 'public_read',
    },
    {
      id: 'holomesh-public-space',
      name: 'HoloMesh public space',
      method: 'GET',
      url: `${MCP_BASE}/api/holomesh/space`,
      category: 'coordination',
      permissionEnvelope: 'public_read',
    },
    {
      id: 'absorb-health',
      name: 'Absorb GraphRAG health',
      method: 'GET',
      url: 'https://absorb.holoscript.net/health',
      category: 'codebase_intelligence',
      permissionEnvelope: 'public_read',
    },
    {
      id: 'compile-api',
      name: 'Compile API',
      method: 'POST',
      url: `${MCP_BASE}/api/compile`,
      category: 'runtime_compile',
      permissionEnvelope: 'guarded_execute',
      skipped: !args.probeCompile,
    },
  ];

  const results = [];
  for (const surface of surfaces) {
    if (surface.id === 'compile-api' && !args.probeCompile) {
      results.push({
        ...surface,
        status: 'known_unprobed',
        trustState: 'partial',
        note: 'Known from HoloScript SURFACES.md; pass --probe-compile to exercise it.',
      });
      continue;
    }

    const response = surface.id === 'compile-api'
      ? await fetchText(surface.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: 'composition "HoloShellProbe" { object "ProbeCube" { position: [0,0,0] } }',
            target: 'threejs',
          }),
        }, 20000)
      : await fetchText(surface.url);

    results.push({
      ...surface,
      httpStatus: response.status,
      status: response.ok ? 'reachable' : 'unreachable',
      trustState: response.ok ? 'verified' : 'partial',
      evidence: {
        service: response.json?.service,
        version: response.json?.version,
        toolCount: Array.isArray(response.json?.tools)
          ? response.json.tools.length
          : response.json?.tools,
        toolExamples: toolNames(response.json?.tools),
        keys: response.json ? Object.keys(response.json).slice(0, 12) : undefined,
        textPreview: response.json ? undefined : response.text?.slice(0, 160),
        error: response.error,
      },
    });
  }

  return results;
}

function toolCategory(name) {
  if (/^(compile|compile_to_|holoscript_compile|list_export_targets|get_compilation_status)/.test(name)) return 'runtime_compile';
  if (/^(holo_absorb|absorb_|holo_query|holo_ask|holo_semantic|holo_impact|holo_graph|holo_detect|holo_resolve|holo_validate|holo_quality|holo_list_type|holo_batch|holo_run|holo_parse|holo_visualize|holo_scaffold|holo_edit|holo_read|holo_write|holo_git)/.test(name)) return 'codebase_intelligence';
  if (/^holomesh/.test(name)) return 'coordination';
  if (/^(holo_protocol|x402|payment)/.test(name)) return 'economic_protocol';
  if (/^(holo_hologram|holo_reconstruct|hologram|holomap)/.test(name)) return 'spatial_media';
  if (/^(generate|validate|suggest|list_traits|explain_trait|parse|hs_ai|holoscript_map|holoscript_compose|holoscript_select)/.test(name)) return 'authoring_language';
  if (/^(get_|check_|admin|telemetry|metrics)/.test(name)) return 'operations_admin';
  return 'orphan_candidate';
}

function groupToolList(tools) {
  const groups = {};
  for (const tool of tools) {
    const name = typeof tool === 'string' ? tool : tool.name || 'unknown';
    const category = toolCategory(name);
    if (!groups[category]) groups[category] = { count: 0, examples: [] };
    groups[category].count += 1;
    if (groups[category].examples.length < 12) groups[category].examples.push(name);
  }
  return groups;
}

async function discoverMcpTools() {
  const aiEnv = readEnvFile(path.join(os.homedir(), '.ai-ecosystem', '.env'));
  const apiKey = process.env.HOLOSCRIPT_API_KEY || aiEnv.HOLOSCRIPT_API_KEY || aiEnv.MCP_API_KEY;

  if (!apiKey) {
    return discoverPublicMcpManifest('missing_api_key');
  }

  const response = await fetchText(`${MCP_BASE}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mcp-api-key': apiKey,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'holoshell-surface-map',
      method: 'tools/list',
      params: {},
    }),
  }, 20000);

  const tools = response.json?.result?.tools || [];
  if (!response.ok || tools.length === 0) {
    return discoverPublicMcpManifest(`rpc_${response.status || 'unreachable'}`);
  }

  return {
    status: response.ok ? 'reachable' : 'unreachable',
    trustState: response.ok && tools.length > 0 ? 'verified' : 'partial',
    manifestSource: 'authenticated_rpc',
    httpStatus: response.status,
    toolCount: tools.length,
    groups: groupToolList(tools),
    error: response.error,
  };
}

async function discoverPublicMcpManifest(rpcStatus) {
  const response = await fetchText(`${MCP_BASE}/.well-known/mcp`, {}, 20000);
  const tools = response.json?.tools || [];
  return {
    status: tools.length > 0 ? 'manifest_reachable' : 'manifest_unavailable',
    trustState: tools.length > 0 ? 'manifest_verified_execute_unverified' : 'partial',
    manifestSource: 'public_discovery',
    rpcStatus,
    httpStatus: response.status,
    toolCount: tools.length,
    groups: groupToolList(tools),
    error: response.error,
  };
}

function cliCategory(command) {
  if (['parse', 'run', 'ast', 'repl', 'watch'].includes(command)) return 'language_runtime';
  if (['compile', 'build', 'smoke', 'headless', 'package', 'deploy', 'monitor', 'screenshot', 'pdf', 'prerender'].includes(command)) return 'runtime_compile';
  if (['traits', 'suggest', 'generate', 'templates', 'quickstart', 'init'].includes(command)) return 'authoring_language';
  if (['add', 'remove', 'list', 'publish', 'login', 'logout', 'whoami', 'access', 'org', 'token'].includes(command)) return 'package_identity';
  if (['diff', 'absorb', 'graph-status', 'impact', 'impact-analysis', 'query', 'self-improve'].includes(command)) return 'codebase_intelligence';
  return 'misc';
}

function discoverCliCommands() {
  if (!existsSync(HOLOSCRIPT_ROOT)) {
    return {
      status: 'missing_repo',
      trustState: 'unknown',
      commandCount: 0,
      groups: {},
    };
  }

  const result = run('pnpm', ['exec', 'holoscript', '--help'], {
    cwd: HOLOSCRIPT_ROOT,
    timeoutMs: 60000,
  });
  const text = stripAnsi(result.stdout || result.stderr);
  const commands = new Set();
  let inCommands = false;

  for (const line of text.split(/\r?\n/)) {
    if (line.includes('Commands:')) {
      inCommands = true;
      continue;
    }
    if (line.includes('Options:')) break;
    if (!inCommands) continue;
    const match = line.match(/^\s{2,}([a-z][a-z0-9-]*)\b/);
    if (match) commands.add(match[1]);
  }

  const groups = {};
  for (const command of commands) {
    const category = cliCategory(command);
    if (!groups[category]) groups[category] = { count: 0, commands: [] };
    groups[category].count += 1;
    groups[category].commands.push(command);
  }

  return {
    status: result.ok && commands.size > 0 ? 'reachable' : 'unreachable',
    trustState: result.ok && commands.size > 0 ? 'verified' : 'partial',
    commandCount: commands.size,
    versionLine: text.split(/\r?\n/).find((line) => line.includes('HoloScript CLI')) || null,
    groups,
    error: result.error,
    stderr: result.stderr.slice(-500),
  };
}

function makeHoloShellRooms(restSurfaces, mcpTools, cli) {
  const restByCategory = {};
  for (const surface of restSurfaces) {
    restByCategory[surface.category] = (restByCategory[surface.category] || 0) + 1;
  }

  return [
    {
      id: 'holoscript-source-room',
      displayName: 'HoloScript Source Room',
      purpose: 'Parse, validate, generate, explain traits, and inspect source artifacts.',
      consumes: ['CLI authoring commands', 'MCP authoring_language tools', 'REST public tool lane'],
      permissionEnvelope: 'read_or_guarded_execute',
      receiptTypes: ['validation receipt', 'tool invocation receipt'],
    },
    {
      id: 'holoscript-runtime-machine',
      displayName: 'HoloScript Runtime Machine',
      purpose: 'Compile, run, render, screenshot, package, and deploy HoloScript artifacts.',
      consumes: ['Compile REST API', 'CLI compile/build/run/headless', 'MCP compile tools'],
      permissionEnvelope: 'guarded_execute',
      receiptTypes: ['compile receipt', 'runtime receipt', 'artifact hash'],
    },
    {
      id: 'holoscript-codebase-room',
      displayName: 'HoloScript Codebase Intelligence Room',
      purpose: 'Absorb, query, impact-analyze, and reason over codebases.',
      consumes: ['Absorb REST health', 'CLI absorb/query/impact', 'MCP codebase intelligence tools'],
      permissionEnvelope: 'read_or_guarded_execute',
      receiptTypes: ['absorb receipt', 'query receipt', 'impact receipt'],
    },
    {
      id: 'holomesh-coordination-room',
      displayName: 'HoloMesh Coordination Room',
      purpose: 'Coordinate agents, tasks, room state, knowledge, and social trust.',
      consumes: ['HoloMesh REST', 'MCP holomesh tools'],
      permissionEnvelope: 'team_auth_required',
      receiptTypes: ['heartbeat receipt', 'board receipt', 'knowledge receipt'],
    },
    {
      id: 'holoscript-protocol-machine',
      displayName: 'HoloScript Protocol Machine',
      purpose: 'Expose economic/protocol/payment capabilities as guarded HoloShell operations.',
      consumes: ['MCP protocol tools', 'x402/payment middleware'],
      permissionEnvelope: 'break_glass_for_value_transfer',
      receiptTypes: ['protocol receipt', 'payment receipt'],
    },
  ].map((room) => ({
    ...room,
    evidence: {
      restCategoryCount: restByCategory,
      mcpToolGroups: mcpTools.groups,
      cliGroups: cli.groups,
    },
  }));
}

async function createSurfaceMap(args) {
  const restSurfaces = await discoverRestSurfaces(args);
  const mcpTools = await discoverMcpTools();
  const cli = discoverCliCommands();
  const holoshellRooms = makeHoloShellRooms(restSurfaces, mcpTools, cli);

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors: SOURCE_ANCHORS,
    summary: {
      restSurfaceCount: restSurfaces.length,
      restReachable: restSurfaces.filter((surface) => surface.status === 'reachable').length,
      mcpToolCount: mcpTools.toolCount,
      cliCommandCount: cli.commandCount,
      holoshellRoomCount: holoshellRooms.length,
    },
    restSurfaces,
    rpc: {
      endpoint: `${MCP_BASE}/mcp`,
      protocol: 'jsonrpc',
      mcpTools,
    },
    cli,
    holoshellRooms,
    adaptationRules: [
      'Prefer REST/API health and discovery for passive status.',
      'Prefer MCP/RPC for typed tool manifests and tool calls when auth is available.',
      'Prefer local CLI for offline, hardware-proven, or repo-scoped source operations.',
      'Expose tools as HoloShell rooms/machines; do not expose raw tool lists as the primary UI.',
      'Every mutating tool call needs a receipt and a permission envelope.',
    ],
  };
}

function writeMap(surfaceMap, outputPath) {
  const resolved = path.resolve(REPO_ROOT, outputPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(surfaceMap, null, 2)}\n`, 'utf8');
  return resolved;
}

function assertSelfTest(surfaceMap) {
  const failures = [];
  if (surfaceMap.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (surfaceMap.summary.restSurfaceCount < 5) failures.push('expected at least five REST surfaces');
  if (surfaceMap.summary.cliCommandCount < 10) failures.push('expected CLI command discovery');
  if (surfaceMap.summary.holoshellRoomCount < 5) failures.push('expected five HoloShell rooms');
  if (!surfaceMap.holoshellRooms.some((room) => room.id === 'holoscript-runtime-machine')) {
    failures.push('missing runtime machine');
  }
  if (!surfaceMap.restSurfaces.some((surface) => surface.id === 'mcp-health')) {
    failures.push('missing mcp health surface');
  }
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const surfaceMap = await createSurfaceMap(args);
  const output = writeMap(surfaceMap, args.output);
  if (args.selfTest) assertSelfTest(surfaceMap);

  if (args.json) {
    console.log(JSON.stringify(surfaceMap, null, 2));
  } else {
    console.log(`HoloShell HoloScript surface map: ${output}`);
    console.log(`REST: ${surfaceMap.summary.restReachable}/${surfaceMap.summary.restSurfaceCount} reachable`);
    console.log(`MCP tools: ${surfaceMap.summary.mcpToolCount}`);
    console.log(`CLI commands: ${surfaceMap.summary.cliCommandCount}`);
    console.log(`HoloShell rooms: ${surfaceMap.summary.holoshellRoomCount}`);
  }
} catch (error) {
  console.error(`holoshell-holoscript-surface-map failed: ${error.message}`);
  process.exit(1);
}
