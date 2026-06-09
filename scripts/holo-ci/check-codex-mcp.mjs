#!/usr/bin/env node
/**
 * check-codex-mcp — Verify conformance_* MCP tools are properly wired
 *
 * Checks that all three conformance admission gate tools have:
 *   1. A scope entry in security/tool-scopes.ts (TOOL_SCOPE_MAP)
 *   2. A risk-level entry in security/tool-scopes.ts (TOOL_RISK_MAP)
 *   3. A dispatch case in hololand-mcp-tools.ts
 *   4. A coverage entry in capability-cartographer.mjs
 *
 * Done-when criteria for task_1781033663943_bg9d.
 *
 * Exit 0 = all checks pass.
 * Exit 1 = one or more checks failed (error summary printed to stderr).
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const HOME = process.env.USERPROFILE ?? process.env.HOME ?? '';

const CONFORMANCE_TOOLS = [
  'conformance_list_rules',
  'conformance_check_artifact',
  'conformance_admit_artifact',
];

const ERRORS = [];
const CHECKS_PASSED = [];

function pass(msg) {
  CHECKS_PASSED.push(msg);
  if (!process.env.QUIET) process.stdout.write(`  OK  ${msg}\n`);
}

function fail(msg) {
  ERRORS.push(msg);
  process.stderr.write(`  FAIL  ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Check 1: TOOL_SCOPE_MAP entries
// ---------------------------------------------------------------------------
{
  const scopesPath = resolve(ROOT, 'packages/mcp-server/src/security/tool-scopes.ts');
  let src;
  try {
    src = readFileSync(scopesPath, 'utf-8');
  } catch {
    fail(`Could not read ${scopesPath} — is HoloScript checked out at ${ROOT}?`);
    src = '';
  }

  for (const tool of CONFORMANCE_TOOLS) {
    // Match a line like: `  conformance_list_rules: ['tools:read'],`
    const pattern = new RegExp(`\\b${tool}\\s*:\\s*\\[`);
    if (pattern.test(src)) {
      pass(`TOOL_SCOPE_MAP: ${tool} has a scope entry`);
    } else {
      fail(`TOOL_SCOPE_MAP: ${tool} is MISSING from security/tool-scopes.ts TOOL_SCOPE_MAP`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 2: TOOL_RISK_MAP entries
// ---------------------------------------------------------------------------
{
  const scopesPath = resolve(ROOT, 'packages/mcp-server/src/security/tool-scopes.ts');
  let src;
  try {
    src = readFileSync(scopesPath, 'utf-8');
  } catch {
    src = '';
  }

  // The TOOL_RISK_MAP section starts after TOOL_SCOPE_MAP closes.
  // Look for entries like: `  conformance_admit_artifact: 'high',`
  for (const tool of CONFORMANCE_TOOLS) {
    const pattern = new RegExp(`\\b${tool}\\s*:\\s*'(low|medium|high|critical)'`);
    if (pattern.test(src)) {
      const match = src.match(new RegExp(`\\b${tool}\\s*:\\s*'(low|medium|high|critical)'`));
      pass(`TOOL_RISK_MAP: ${tool} has risk level '${match[1]}'`);
    } else {
      fail(`TOOL_RISK_MAP: ${tool} is MISSING from security/tool-scopes.ts TOOL_RISK_MAP`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 3: dispatch cases in hololand-mcp-tools.ts
// ---------------------------------------------------------------------------
{
  const toolsPath = resolve(ROOT, 'packages/mcp-server/src/hololand-mcp-tools.ts');
  let src;
  try {
    src = readFileSync(toolsPath, 'utf-8');
  } catch {
    fail(`Could not read ${toolsPath}`);
    src = '';
  }

  for (const tool of CONFORMANCE_TOOLS) {
    // Match: `case 'conformance_list_rules':`
    const pattern = new RegExp(`case\\s+'${tool}':`);
    if (pattern.test(src)) {
      pass(`dispatch: ${tool} has a case in hololand-mcp-tools.ts`);
    } else {
      fail(`dispatch: ${tool} is MISSING a case in hololand-mcp-tools.ts`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 4: handler functions defined in hololand-mcp-tools.ts
// ---------------------------------------------------------------------------
{
  const toolsPath = resolve(ROOT, 'packages/mcp-server/src/hololand-mcp-tools.ts');
  let src;
  try {
    src = readFileSync(toolsPath, 'utf-8');
  } catch {
    src = '';
  }

  const handlers = {
    conformance_check_artifact: 'handleConformanceCheckArtifact',
    conformance_admit_artifact: 'handleConformanceAdmitArtifact',
    conformance_list_rules: 'handleConformanceListRules',
  };

  for (const [tool, handler] of Object.entries(handlers)) {
    if (src.includes(`function ${handler}(`)) {
      pass(`handler: ${handler}() defined for ${tool}`);
    } else {
      fail(`handler: ${handler}() is MISSING in hololand-mcp-tools.ts`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 5: MCP tool definition (tool registration object) in hololand-mcp-tools.ts
// ---------------------------------------------------------------------------
{
  const toolsPath = resolve(ROOT, 'packages/mcp-server/src/hololand-mcp-tools.ts');
  let src;
  try {
    src = readFileSync(toolsPath, 'utf-8');
  } catch {
    src = '';
  }

  for (const tool of CONFORMANCE_TOOLS) {
    // Match: `name: 'conformance_list_rules',`
    const pattern = new RegExp(`name:\\s*'${tool}'`);
    if (pattern.test(src)) {
      pass(`tool-def: ${tool} registered in hololand-mcp-tools.ts tool list`);
    } else {
      fail(`tool-def: ${tool} NOT found in hololand-mcp-tools.ts tool list`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 6: capability-cartographer.mjs coverage entry
// ---------------------------------------------------------------------------
{
  const cartPath = resolve(HOME, '.ai-ecosystem/scripts/capability-cartographer.mjs');
  let src;
  try {
    src = readFileSync(cartPath, 'utf-8');
  } catch {
    // Not a hard failure — cartographer lives in ai-ecosystem, not in HoloScript.
    // Some CI environments may only have HoloScript checked out.
    pass(`cartographer: skipped (${cartPath} not found — ok in isolated HoloScript CI)`);
    src = '';
  }

  if (src) {
    if (src.includes("skill: 'conformance'") && src.includes("'conformance_'")) {
      pass("cartographer: 'conformance' skill coverage entry present");
    } else {
      fail(
        "cartographer: 'conformance' skill entry MISSING in capability-cartographer.mjs — " +
          "conformance_* tools will appear as orphaned"
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Check 7: conformance skill SKILL.md exists
// ---------------------------------------------------------------------------
{
  const skillPath = resolve(HOME, '.claude/skills/conformance/SKILL.md');
  try {
    readFileSync(skillPath, 'utf-8');
    pass('skill: ~/.claude/skills/conformance/SKILL.md exists');
  } catch {
    fail('skill: ~/.claude/skills/conformance/SKILL.md is MISSING — conformance HoloGate wrapper not installed');
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const total = CHECKS_PASSED.length + ERRORS.length;
process.stdout.write(
  `\ncheck:codex-mcp — ${CHECKS_PASSED.length}/${total} checks passed` +
    (ERRORS.length ? `, ${ERRORS.length} FAILED` : '') +
    '\n'
);

if (ERRORS.length > 0) {
  process.stderr.write('\nFailed checks:\n');
  for (const e of ERRORS) process.stderr.write(`  - ${e}\n`);
  process.exit(1);
}

process.exit(0);
