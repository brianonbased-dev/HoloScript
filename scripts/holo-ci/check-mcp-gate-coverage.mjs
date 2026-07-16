#!/usr/bin/env node
/**
 * check-mcp-gate-coverage.mjs — every MCP tool-call fold point must route
 * through gateToolCall (WRAP-WITH-RECEIPTS, dependency-sovereignty-ladder,
 * ratified 2026-07-16).
 *
 * WHY THIS GATE EXISTS:
 *   Every agent-visible tool call funnels through the
 *   `setRequestHandler(CallToolRequestSchema, ...)` sites under
 *   packages/mcp-server/src (stdio: index.ts; SSE/HTTP: http-server.ts). The
 *   audit ruled: gate THERE — a single typed gate (`gateToolCall` in
 *   packages/mcp-server/src/tool-call-gate.ts) that emits one NDJSON receipt
 *   per call and hosts the FounderGate / x402 / envelope-validation seam.
 *   This check is the coverage ratchet: a NEW CallToolRequestSchema handler
 *   (or an edit that unroutes an existing one) that does not go through
 *   gateToolCall is a receipt-less fold point — blocked at exit 1.
 *
 * WHAT IT DOES (read-only, no install, no network — modeled on
 * check-render-surface-native.mjs):
 *   - Walks packages/mcp-server/src for .ts/.mts/.cts source files, skipping
 *     tests/fixtures/examples (test servers may legitimately stub handlers)
 *     and build output (dist/node_modules).
 *   - For every `setRequestHandler(CallToolRequestSchema` occurrence, extracts
 *     the full call expression via a string/comment-aware paren balance and
 *     requires `gateToolCall` inside it.
 *   - Ratchet floor: at least one gated handler must exist (so renaming the
 *     schema or deleting the gate cannot silently pass with zero sites).
 *
 * Usage:
 *   node scripts/holo-ci/check-mcp-gate-coverage.mjs           # exit 1 on any ungated site
 *   node scripts/holo-ci/check-mcp-gate-coverage.mjs --root <repo-root>
 *
 * Exit 0 iff every CallToolRequestSchema handler routes through gateToolCall
 * AND at least one such gated handler exists. Exit 1 on violation. Exit 2 on usage.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const args = process.argv.slice(2);
const rootIdx = args.indexOf('--root');
const ROOT = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();
if (!ROOT || !existsSync(ROOT)) {
  console.error('[mcp-gate-coverage] usage: check-mcp-gate-coverage.mjs [--root <repo-root>]');
  process.exit(2);
}

const SCAN_ROOT = join(ROOT, 'packages', 'mcp-server', 'src');
const GATE_TOKEN = 'gateToolCall';
const SITE_RE = /setRequestHandler\s*\(\s*CallToolRequestSchema\b/g;
const SKIP_DIR = /(^|[\\/])(node_modules|dist|coverage|__tests__|__fixtures__|fixtures|__mocks__|examples)([\\/]|$)/i;
const SKIP_FILE = /\.(test|spec|stories|story|example|fixture|mock)\.(ts|mts|cts)$/i;

function toPosix(p) {
  return p.split(sep).join('/');
}

function walkTs(dirAbs, acc) {
  let entries;
  try {
    entries = readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const abs = join(dirAbs, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR.test(abs)) continue;
      walkTs(abs, acc);
    } else if (e.isFile() && /\.(ts|mts|cts)$/.test(e.name) && !SKIP_FILE.test(e.name)) {
      acc.push(abs);
    }
  }
}

/**
 * Mask comments and string-literal CONTENTS with spaces (indices and newlines
 * preserved) so the site regex, the paren balance, and the gateToolCall token
 * search all operate on real code only. Without this, prose like a doc
 * comment or a registry description string containing
 * "setRequestHandler(CallToolRequestSchema)" would count as a fold point, and
 * a string containing "gateToolCall" would count as gated. Template-literal
 * `${...}` interpolations stay UNMASKED (they are real code).
 */
function maskCommentsAndStrings(src) {
  const out = src.split('');
  const n = src.length;
  const blank = (idx) => {
    if (out[idx] !== '\n') out[idx] = ' ';
  };
  let i = 0;
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '/' && next === '/') {
      while (i < n && src[i] !== '\n') {
        blank(i);
        i += 1;
      }
      continue;
    }
    if (ch === '/' && next === '*') {
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        blank(i);
        i += 1;
      }
      if (i < n) {
        blank(i);
        blank(i + 1);
        i += 2;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      blank(i);
      i += 1;
      while (i < n) {
        if (src[i] === '\\') {
          blank(i);
          blank(i + 1);
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          blank(i);
          i += 1;
          break;
        }
        if (quote === '`' && src[i] === '$' && src[i + 1] === '{') {
          // Interpolation is code: leave it unmasked, brace-balanced.
          let braces = 1;
          i += 2;
          while (i < n && braces > 0) {
            if (src[i] === '{') braces += 1;
            else if (src[i] === '}') braces -= 1;
            i += 1;
          }
          continue;
        }
        blank(i);
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/**
 * From `openParenIdx` (index of the `(` opening the setRequestHandler call) in
 * MASKED source, return the index just past the matching `)`. Returns -1 when
 * unbalanced (treated as a violation — an unparseable fold point cannot be
 * verified as gated).
 */
function findCallEnd(masked, openParenIdx) {
  let depth = 0;
  for (let i = openParenIdx; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function lineOf(src, idx) {
  let line = 1;
  for (let i = 0; i < idx; i++) {
    if (src[i] === '\n') line += 1;
  }
  return line;
}

// ── Scan ──────────────────────────────────────────────────────────────────────

if (!existsSync(SCAN_ROOT) || !statSync(SCAN_ROOT).isDirectory()) {
  console.error(`[mcp-gate-coverage] scan root missing: ${SCAN_ROOT}`);
  process.exit(2);
}

const files = [];
walkTs(SCAN_ROOT, files);

const errors = [];
let gatedSites = 0;
let totalSites = 0;

for (const abs of files) {
  let src;
  try {
    src = readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  if (!src.includes('CallToolRequestSchema')) continue;

  const rel = toPosix(relative(ROOT, abs));
  // Scan MASKED source only: prose in comments/strings that merely mentions
  // setRequestHandler(CallToolRequestSchema) or gateToolCall must not count.
  const masked = maskCommentsAndStrings(src);
  SITE_RE.lastIndex = 0;
  let m;
  while ((m = SITE_RE.exec(masked)) !== null) {
    totalSites += 1;
    const line = lineOf(masked, m.index);
    const openParen = masked.indexOf('(', m.index);
    const end = findCallEnd(masked, openParen);
    if (end === -1) {
      errors.push(
        `GATE-UNPARSEABLE  ${rel}:${line} — setRequestHandler(CallToolRequestSchema) call could not be ` +
          `delimited; cannot verify it routes through ${GATE_TOKEN}.`
      );
      continue;
    }
    const body = masked.slice(m.index, end);
    if (body.includes(GATE_TOKEN)) {
      gatedSites += 1;
    } else {
      errors.push(
        `GATE-BYPASS  ${rel}:${line} — setRequestHandler(CallToolRequestSchema) does not route through ` +
          `${GATE_TOKEN}. Wrap the dispatch: gateToolCall({ name, args }, { transport, callerId }, (env) => <dispatch>) ` +
          `(see packages/mcp-server/src/tool-call-gate.ts).`
      );
    }
  }
}

// Ratchet floor: zero sites means the schema was renamed or the fold point moved —
// the coverage claim would be vacuous. Fail loud instead of passing silently.
if (totalSites === 0) {
  errors.push(
    `GATE-FLOOR  no setRequestHandler(CallToolRequestSchema) sites found under packages/mcp-server/src — ` +
      `the tool-call fold point moved or was renamed; update this check so coverage stays verifiable.`
  );
} else if (gatedSites === 0) {
  errors.push(
    `GATE-FLOOR  ${totalSites} CallToolRequestSchema handler(s) found but none route through ${GATE_TOKEN}.`
  );
}

if (errors.length) {
  console.error(`[mcp-gate-coverage] ${errors.length} issue(s):`);
  for (const e of errors) console.error('  ' + e);
  console.error(
    `\n[mcp-gate-coverage] WRAP-WITH-RECEIPTS: every MCP tool-call fold point must route through ` +
      `gateToolCall (typed check seam + one NDJSON receipt per call, sha256 of canonical-JSON args).`
  );
  process.exit(1);
}

console.log(
  `[mcp-gate-coverage] OK — ${gatedSites}/${totalSites} CallToolRequestSchema handler(s) route through ` +
    `${GATE_TOKEN} (scanned ${files.length} source files under packages/mcp-server/src).`
);
process.exit(0);
