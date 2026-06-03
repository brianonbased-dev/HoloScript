#!/usr/bin/env node
// @ts-check
/**
 * connect.mjs — Single source of truth for linking external services to the
 * HoloScript ecosystem over MCP (Model Context Protocol).
 *
 * The hosted HoloScript MCP server exposes the full tool surface (parse,
 * validate, generate, compile, codebase intelligence, mesh, x402, …) over
 * Streamable HTTP at https://mcp.holoscript.net/mcp. External clients —
 * Claude Desktop, Claude Code, Cursor, VS Code (Copilot), Windsurf, Zed, or
 * any MCP-capable agent — connect by dropping one config snippet in the right
 * place.
 *
 * The problem this solves: those snippets were drifting across four different
 * docs (three mutually-incompatible shapes). This script is the ONE place the
 * connection facts live; the docs render from the same model. Change the
 * endpoint or transport here and every emitted config stays correct.
 *
 * Usage:
 *   node scripts/connect.mjs list                 # list supported clients
 *   node scripts/connect.mjs <client>             # print config for a client
 *   node scripts/connect.mjs all                  # print config for every client
 *
 * Flags:
 *   --token=<jwt>   Inline a bearer token instead of the ${ENV} placeholder
 *   --local         Emit a local stdio config (npx @holoscript/mcp-server)
 *   --no-auth       Omit auth (public discovery / read-only only)
 *   --json          Emit machine-readable JSON (no prose) — good for piping
 *
 * Examples:
 *   node scripts/connect.mjs cursor
 *   node scripts/connect.mjs claude-desktop --token=eyJ...
 *   node scripts/connect.mjs all --json
 *   node scripts/connect.mjs --self-test
 */

import { pathToFileURL } from 'node:url';

// ─── Canonical connection facts (the single source of truth) ────────────────
export const ENDPOINT = 'https://mcp.holoscript.net/mcp';
export const DISCOVERY = 'https://mcp.holoscript.net/.well-known/mcp.json';
export const HEALTH = 'https://mcp.holoscript.net/health';
export const NPM_PACKAGE = '@holoscript/mcp-server';
export const TOKEN_ENV = 'HOLOSCRIPT_MCP_ACCESS_TOKEN';
export const TOKEN_PLACEHOLDER = `\${${TOKEN_ENV}}`;
export const SERVER_KEY = 'holoscript';

/** @typedef {{ token?: string, local?: boolean, noAuth?: boolean }} BuildOpts */

const authHeaderValue = (/** @type {BuildOpts} */ o) => `Bearer ${o.token ?? TOKEN_PLACEHOLDER}`;

const headersBlock = (/** @type {BuildOpts} */ o) =>
  o.noAuth ? undefined : { Authorization: authHeaderValue(o) };

/** Inner server object for clients that natively speak remote Streamable HTTP. */
function remoteHttp(/** @type {BuildOpts} */ o) {
  const server = /** @type {Record<string, unknown>} */ ({ url: ENDPOINT });
  const headers = headersBlock(o);
  if (headers) server.headers = headers;
  return server;
}

/** Inner server object for stdio-only clients, bridged via `mcp-remote`. */
function stdioBridge(/** @type {BuildOpts} */ o) {
  const args = ['-y', 'mcp-remote', ENDPOINT];
  if (!o.noAuth) args.push('--header', `Authorization: ${authHeaderValue(o)}`);
  return { command: 'npx', args };
}

/** Inner server object for a fully-local install (no network round-trip). */
function localStdio() {
  return { command: 'npx', args: ['-y', NPM_PACKAGE] };
}

/** Pick the right inner-server shape for a transport, honoring --local. */
function serverObject(/** @type {'http'|'bridge'} */ transport, /** @type {BuildOpts} */ o) {
  if (o.local) return localStdio();
  return transport === 'http' ? remoteHttp(o) : stdioBridge(o);
}

// ─── Client registry ────────────────────────────────────────────────────────
/**
 * Each client knows where its config file lives and how to wrap the inner
 * server object. `transport` is the *preferred* remote transport when not
 * running --local.
 * @type {Record<string, {
 *   label: string,
 *   file: string,
 *   docs?: string,
 *   transport: 'http'|'bridge',
 *   shape: 'config'|'shell',
 *   build: (o: BuildOpts) => unknown,
 *   note?: string,
 * }>}
 */
export const CLIENTS = {
  'claude-desktop': {
    label: 'Claude Desktop',
    file: 'claude_desktop_config.json (Settings → Developer → Edit Config)',
    docs: 'docs/guides/mcp-server.md',
    // Claude Desktop's config file is stdio-only; remote servers are reached
    // through the `mcp-remote` bridge. (Pro/Max can also add the raw URL via
    // Settings → Connectors without editing the file.)
    transport: 'bridge',
    shape: 'config',
    build: (o) => ({ mcpServers: { [SERVER_KEY]: serverObject('bridge', o) } }),
    note: 'Restart Claude Desktop after editing. Pro/Max users can instead paste the URL under Settings → Connectors.',
  },
  'claude-code': {
    label: 'Claude Code (CLI)',
    file: 'run the command, or commit .mcp.json to the repo',
    docs: 'docs/guides/mcp-server.md',
    transport: 'http',
    shape: 'shell',
    build: (o) => {
      const parts = ['claude', 'mcp', 'add', '--transport', 'http', SERVER_KEY, ENDPOINT];
      if (!o.noAuth) parts.push('--header', `"Authorization: ${authHeaderValue(o)}"`);
      return parts.join(' ');
    },
    note: 'Use `--scope project` to share via .mcp.json, or `--scope user` for all your repos.',
  },
  cursor: {
    label: 'Cursor',
    file: '.cursor/mcp.json (project) or ~/.cursor/mcp.json (global)',
    docs: 'docs/guides/cursor-holoscript.md',
    transport: 'http',
    shape: 'config',
    build: (o) => ({ mcpServers: { [SERVER_KEY]: serverObject('http', o) } }),
    note: 'Cursor reads both .cursor/mcp.json and .vscode/mcp.json. Restart the MCP panel after saving.',
  },
  vscode: {
    label: 'VS Code (GitHub Copilot, agent mode)',
    file: '.vscode/mcp.json (workspace) or user settings.json',
    docs: 'docs/guides/vscode.md',
    transport: 'http',
    shape: 'config',
    // VS Code uses `servers` (not `mcpServers`) and a required `type` field.
    build: (o) => {
      const inner = o.local ? localStdio() : remoteHttp(o);
      const server = o.local ? { type: 'stdio', ...inner } : { type: 'http', ...inner };
      return { servers: { [SERVER_KEY]: server } };
    },
    note: 'Requires Copilot agent mode. Enable with the "MCP: Add Server" command or edit the file directly.',
  },
  windsurf: {
    label: 'Windsurf (Codeium)',
    file: '~/.codeium/windsurf/mcp_config.json',
    transport: 'http',
    shape: 'config',
    // Windsurf uses `serverUrl` for remote MCP servers.
    build: (o) => {
      if (o.local) return { mcpServers: { [SERVER_KEY]: localStdio() } };
      const server = /** @type {Record<string, unknown>} */ ({ serverUrl: ENDPOINT });
      const headers = headersBlock(o);
      if (headers) server.headers = headers;
      return { mcpServers: { [SERVER_KEY]: server } };
    },
    note: 'Press the refresh icon in the Windsurf Cascade MCP panel after saving.',
  },
  zed: {
    label: 'Zed',
    file: 'settings.json (Zed → Settings)',
    transport: 'bridge',
    shape: 'config',
    // Zed wraps the launch command under context_servers.<name>.command.
    build: (o) => {
      const inner = o.local ? localStdio() : stdioBridge(o);
      return {
        context_servers: {
          [SERVER_KEY]: { command: { path: inner.command, args: inner.args } },
        },
      };
    },
  },
  'generic-http': {
    label: 'Generic MCP client (remote Streamable HTTP)',
    file: "your client's MCP config",
    transport: 'http',
    shape: 'config',
    build: (o) => ({ mcpServers: { [SERVER_KEY]: serverObject('http', o) } }),
    note: 'For any client that speaks remote Streamable HTTP MCP natively (CrewAI, LangGraph, custom agents).',
  },
  'generic-stdio': {
    label: 'Generic MCP client (stdio, via mcp-remote bridge)',
    file: "your client's MCP config",
    transport: 'bridge',
    shape: 'config',
    build: (o) => ({ mcpServers: { [SERVER_KEY]: serverObject('bridge', o) } }),
    note: 'For stdio-only clients. The `mcp-remote` npm package bridges stdio ↔ the hosted HTTP endpoint.',
  },
};

// ─── Rendering ──────────────────────────────────────────────────────────────
/** Build the structured result for a single client. */
export function buildClient(/** @type {string} */ id, /** @type {BuildOpts} */ opts = {}) {
  const client = CLIENTS[id];
  if (!client) throw new Error(`Unknown client "${id}". Try: ${Object.keys(CLIENTS).join(', ')}`);
  return {
    id,
    label: client.label,
    file: client.file,
    transport: opts.local
      ? 'stdio (local install)'
      : client.transport === 'http'
        ? 'remote Streamable HTTP'
        : 'stdio → mcp-remote bridge',
    shape: client.shape,
    config: client.build(opts),
    note: client.note,
    docs: client.docs,
  };
}

function renderHuman(/** @type {ReturnType<typeof buildClient>} */ r) {
  const lines = [];
  lines.push('');
  lines.push(`  ▸ ${r.label}  (${r.id})`);
  lines.push(`    transport : ${r.transport}`);
  lines.push(`    config in : ${r.file}`);
  lines.push('');
  if (r.shape === 'shell') {
    lines.push('    ' + String(r.config));
  } else {
    const json = JSON.stringify(r.config, null, 2)
      .split('\n')
      .map((l) => '    ' + l)
      .join('\n');
    lines.push(json);
  }
  lines.push('');
  if (r.note) lines.push(`    note: ${r.note}`);
  if (r.docs) lines.push(`    docs: ${r.docs}`);
  return lines.join('\n');
}

function parseArgs(/** @type {string[]} */ argv) {
  const positional = [];
  const opts = /** @type {BuildOpts & { json?: boolean }} */ ({});
  for (const a of argv) {
    if (a === '--local') opts.local = true;
    else if (a === '--no-auth') opts.noAuth = true;
    else if (a === '--json') opts.json = true;
    else if (a.startsWith('--token=')) opts.token = a.slice('--token='.length);
    else if (a.startsWith('--')) {
      /* ignore unknown flags */
    } else positional.push(a);
  }
  return { command: positional[0], opts };
}

function listClients() {
  console.log('\nHoloScript — external client connectors\n');
  console.log(`  endpoint  : ${ENDPOINT}`);
  console.log(`  discovery : ${DISCOVERY}`);
  console.log(`  health    : ${HEALTH}\n`);
  console.log('  supported clients:');
  for (const [id, c] of Object.entries(CLIENTS)) {
    console.log(`    ${id.padEnd(15)} ${c.label}`);
  }
  console.log(
    '\n  usage: node scripts/connect.mjs <client> [--token=… | --local | --no-auth | --json]\n'
  );
}

// ─── Self-test (node scripts/connect.mjs --self-test) ───────────────────────
function selfTest() {
  const assert = (/** @type {boolean} */ cond, /** @type {string} */ msg) => {
    if (!cond) throw new Error(`SELF-TEST FAIL: ${msg}`);
  };
  // Every client builds without throwing, in every mode.
  for (const id of Object.keys(CLIENTS)) {
    for (const opts of [{}, { local: true }, { noAuth: true }, { token: 'TESTJWT' }]) {
      const r = buildClient(id, opts);
      assert(!!r.config, `${id} produced config (${JSON.stringify(opts)})`);
      const blob = JSON.stringify(r.config);
      // No mode should ever emit a literal "undefined".
      assert(!blob.includes('undefined'), `${id} has no undefined (${JSON.stringify(opts)})`);
      // Token injection must land in the output (unless noAuth/local).
      if (opts.token && !opts.local && !opts.noAuth) {
        assert(blob.includes('TESTJWT'), `${id} inlines --token`);
      }
      // noAuth must strip every Authorization header.
      if (opts.noAuth) {
        assert(!blob.includes('Authorization'), `${id} --no-auth omits Authorization`);
      }
      // Default (no token) must use the env placeholder, not a blank.
      if (!opts.token && !opts.local && !opts.noAuth) {
        assert(blob.includes(TOKEN_ENV), `${id} default uses ${TOKEN_ENV} placeholder`);
      }
    }
  }
  // Unknown client must throw.
  let threw = false;
  try {
    buildClient('does-not-exist');
  } catch {
    threw = true;
  }
  assert(threw, 'unknown client throws');
  // The endpoint is the canonical one everywhere.
  assert(
    JSON.stringify(buildClient('cursor').config).includes(ENDPOINT),
    'cursor uses canonical endpoint'
  );
  console.log(`✓ connect.mjs self-test passed (${Object.keys(CLIENTS).length} clients × 4 modes)`);
}

// ─── Entry point ────────────────────────────────────────────────────────────
function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) return selfTest();

  const { command, opts } = parseArgs(argv);

  if (!command || command === 'help' || command === '--help') {
    listClients();
    return;
  }
  if (command === 'list') return listClients();

  const ids = command === 'all' ? Object.keys(CLIENTS) : [command];
  const results = ids.map((id) => buildClient(id, opts));

  if (opts.json) {
    console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
    return;
  }
  for (const r of results) console.log(renderHuman(r));
  console.log('');
}

// Only run main() when invoked directly, not when imported by tests.
// Use pathToFileURL so the comparison holds on Windows too — a bare
// `file://${argv[1]}` builds `file://C:\…` which never equals Node's
// `file:///C:/…` import.meta.url, silently no-opping the CLI on Windows.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    main();
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
