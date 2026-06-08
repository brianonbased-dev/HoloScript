#!/usr/bin/env node
/**
 * Verify holoshell MCP stdio server tool names match the expected Phase A tool set,
 * and that claude_desktop_config.json registration points to the correct server script.
 *
 * Catches silent breakage: if a refactor renames/removes a tool the Desktop client
 * was relying on, this exits non-zero before the commit lands.
 *
 * Usage: node scripts/verify-holoshell-mcp-registration.mjs
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TAG = '[verify-holoshell-mcp-registration]';

// The 5 stable Phase A tools. Update here when tools are intentionally added/renamed.
const EXPECTED_TOOLS = [
  'holoshell_list_stale_processes',
  'holoshell_preflight_process_cleanup',
  'holoshell_consent_classify',
  'holoshell_consent_issue',
  'holoshell_execute_receipt',
];

const STDIO_SERVER = path.join(__dirname, 'holoshell-mcp-stdio.mjs');
const CONFIG_PATH = path.join(
  os.homedir(),
  'AppData',
  'Roaming',
  'Claude',
  'claude_desktop_config.json'
);

function extractToolNames(source) {
  // Matches name: 'holoshell_foo' or name: "holoshell_foo"
  // Tool names are always snake_case (contain '_'); skip the server-level name: 'holoshell'
  const re = /name:\s*['"]([^'"]+)['"]/g;
  const found = [];
  let m;
  while ((m = re.exec(source)) !== null) {
    if (m[1].includes('_')) found.push(m[1]);
  }
  return found;
}

let failed = false;

// --- 1. Verify server tool list ---
if (!fs.existsSync(STDIO_SERVER)) {
  console.error(`${TAG} ERROR: stdio server not found at ${STDIO_SERVER}`);
  process.exit(1);
}

const source = fs.readFileSync(STDIO_SERVER, 'utf8');
const actualTools = extractToolNames(source);
const actualSet = new Set(actualTools);
const expectedSet = new Set(EXPECTED_TOOLS);

const removed = EXPECTED_TOOLS.filter((t) => !actualSet.has(t));
const added = actualTools.filter((t) => !expectedSet.has(t));

if (removed.length) {
  console.error(`${TAG} REMOVED or RENAMED tools (will silently break Desktop clients):`);
  removed.forEach((t) => console.error(`  - ${t}`));
  failed = true;
}
if (added.length) {
  // New tools are additive — not a breakage, but should be added to EXPECTED_TOOLS when stable
  console.warn(`${TAG} WARN: new tool(s) not yet in EXPECTED_TOOLS:`);
  added.forEach((t) => console.warn(`  + ${t}`));
}

// --- 2. Verify Desktop config registration ---
if (fs.existsSync(CONFIG_PATH)) {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    console.error(`${TAG} ERROR: cannot parse ${CONFIG_PATH}: ${err.message}`);
    failed = true;
  }
  if (config) {
    const reg = config?.mcpServers?.holoshell;
    if (!reg) {
      console.error(`${TAG} ERROR: mcpServers.holoshell absent from ${CONFIG_PATH}`);
      failed = true;
    } else {
      const regPath = (reg.args ?? []).find((a) => a.endsWith('holoshell-mcp-stdio.mjs'));
      if (!regPath) {
        console.error(`${TAG} ERROR: registration args do not reference holoshell-mcp-stdio.mjs`);
        console.error(`  args: ${JSON.stringify(reg.args)}`);
        failed = true;
      } else if (
        path.normalize(regPath).toLowerCase() !== path.normalize(STDIO_SERVER).toLowerCase()
      ) {
        console.error(`${TAG} ERROR: path mismatch — config points to a different copy`);
        console.error(`  config : ${path.normalize(regPath)}`);
        console.error(`  repo   : ${path.normalize(STDIO_SERVER)}`);
        failed = true;
      }
    }
  }
} else {
  console.warn(`${TAG} WARN: Desktop config not found at ${CONFIG_PATH} — skipping (OK in CI)`);
}

if (failed) {
  process.exit(1);
}

console.log(`${TAG} OK — ${actualTools.length} tool(s) verified, Desktop config synchronized`);
EXPECTED_TOOLS.forEach((t) => console.log(`  ✓ ${t}`));
