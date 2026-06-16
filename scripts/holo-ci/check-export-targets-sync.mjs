#!/usr/bin/env node
/**
 * check-export-targets-sync.mjs — fail loud when compile_holoscript enum drifts from
 * handleListExportTargets.
 *
 * WHY THIS GATE EXISTS: compiler-tools.ts has TWO independent lists of export targets:
 *   1. handleListExportTargets() — the discovery endpoint (now DialectRegistry-driven)
 *   2. compile_holoscript tool definition — a static JSON-Schema enum
 * When a new dialect is added to DialectRegistry it appears in (1) automatically but (2)
 * stays stale, causing the MCP client's enum validation to reject valid targets silently.
 * This gate catches that before push.
 *
 * WHAT IT CHECKS:
 *   - Every non-internal dialect name returned by DialectRegistry.names() + legacy targets
 *     MUST appear in the compile_holoscript enum (or be in the explicit exclusion list).
 *   - No entry in the compile_holoscript enum may reference an internal dialect.
 *
 * Usage:  node scripts/holo-ci/check-export-targets-sync.mjs [--root <dir>]
 * Exit 0 = in sync. 1 = drift detected. 2 = usage error.
 */
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const ROOT = path.resolve(arg('--root', process.env.HOLO_ROOT || process.cwd()));

const COMPILER_TOOLS = path.join(ROOT, 'packages/mcp-server/src/compiler-tools.ts');

if (!fs.existsSync(COMPILER_TOOLS)) {
  console.error(`[export-targets-sync] missing ${path.relative(ROOT, COMPILER_TOOLS)}`);
  process.exit(2);
}

const src = fs.readFileSync(COMPILER_TOOLS, 'utf8');

// ── Extract _INTERNAL_DIALECT_NAMES entries ────────────────────────────────────────────
const internalMatch = src.match(
  /const _INTERNAL_DIALECT_NAMES\s*=\s*new Set\(\[([\s\S]*?)\]\)/,
);
if (!internalMatch) {
  console.error('[export-targets-sync] could not parse _INTERNAL_DIALECT_NAMES — file may have moved');
  process.exit(2);
}
const internalNames = new Set(
  [...internalMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]),
);

// ── Extract _LEGACY_EXPORT_TARGETS entries ─────────────────────────────────────────────
const legacyMatch = src.match(
  /const _LEGACY_EXPORT_TARGETS\s*=\s*\[([\s\S]*?)\]\s*as const/,
);
if (!legacyMatch) {
  console.error('[export-targets-sync] could not parse _LEGACY_EXPORT_TARGETS — file may have moved');
  process.exit(2);
}
const legacyTargets = [...legacyMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

// ── Extract compile_holoscript enum entries ────────────────────────────────────────────
// Find the compile_holoscript tool def block, then extract the target enum within it.
const toolDefIdx = src.indexOf("name: 'compile_holoscript'");
if (toolDefIdx === -1) {
  console.error('[export-targets-sync] could not find compile_holoscript tool definition');
  process.exit(2);
}
// Narrow to the next ~2000 chars to avoid grabbing wrong enum
const toolDefSlice = src.slice(toolDefIdx, toolDefIdx + 3000);
const enumMatch = toolDefSlice.match(/enum:\s*\[([\s\S]*?)\]/);
if (!enumMatch) {
  console.error('[export-targets-sync] could not parse compile_holoscript enum');
  process.exit(2);
}
const enumTargets = new Set(
  [...enumMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]),
);

// ── Resolve expected targets (mirroring handleListExportTargets logic) ─────────────────
// We can't call DialectRegistry at gate time without building the package, so we
// parse the registered dialects directly from registerBuiltinDialects.ts instead.
const REGISTER_FILE = path.join(ROOT, 'packages/core/src/compiler/registerBuiltinDialects.ts');
if (!fs.existsSync(REGISTER_FILE)) {
  console.error(`[export-targets-sync] missing ${path.relative(ROOT, REGISTER_FILE)}`);
  process.exit(2);
}
const regSrc = fs.readFileSync(REGISTER_FILE, 'utf8');
// Extract all name: '...' entries inside dialect registration blocks
const dialectNames = [...regSrc.matchAll(/name:\s*'([^']+)'/g)]
  .map((m) => m[1])
  .filter((n) => !internalNames.has(n));

const expectedTargets = new Set([...dialectNames, ...legacyTargets]);

// ── Compare ─────────────────────────────────────────────────────────────────────────────
let ok = true;

for (const expected of expectedTargets) {
  if (!enumTargets.has(expected)) {
    console.error(
      `[export-targets-sync] MISSING: '${expected}' is in handleListExportTargets but NOT in compile_holoscript enum`,
    );
    ok = false;
  }
}

for (const e of enumTargets) {
  if (internalNames.has(e)) {
    console.error(
      `[export-targets-sync] INTERNAL LEAK: '${e}' is in compile_holoscript enum but is marked internal`,
    );
    ok = false;
  }
}

if (ok) {
  console.log(
    `[export-targets-sync] OK — ${expectedTargets.size} targets in sync with compile_holoscript enum`,
  );
  process.exit(0);
} else {
  process.exit(1);
}
