#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', 'security-audit-io-network.mjs');

let testsRun = 0;
let testsFailed = 0;

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertMatch(text, pattern, name) {
  testsRun += 1;
  if (pattern.test(text)) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: ${pattern} not found in output:\n${text}`);
  }
}

function setup(files) {
  const root = mkdtempSync(join(tmpdir(), 'security-audit-io-network-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, ...rel.split('/'));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

function run(root, extra = []) {
  const result = spawnSync(process.execPath, [SCRIPT, '--root', root, ...extra], {
    cwd: root,
    encoding: 'utf8',
  });
  return { code: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
}

function git(root, args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' });
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

const cleanAbsorbRoute =
  "export function registerAbsorbProxy(app, deps) {\n" +
  "  app.post('/api/absorb/:tool', (req, res) => {\n" +
  "    const callerKey = req.headers.authorization || req.headers['x-api-key'];\n" +
  "    if (!callerKey) return res.status(401).json({ error: 'auth required' });\n" +
  "    return deps.proxy(req, res, { callerKey });\n" +
  "  });\n" +
  "}\n";

console.log('security-audit-io-network.test.mjs');

{
  const root = setup({
    'packages/mcp-server/src/absorb/http-routes.ts': cleanAbsorbRoute,
    'packages/studio/src/legacy.ts': "export const risky = eval('1 + 1');\n",
  });
  try {
    const result = run(root, ['--files', 'packages/mcp-server/src/absorb/http-routes.ts']);
    assertEq(result.code, 0, 'explicit clean target passes despite residual backlog');
    assertMatch(result.out, /Blocking findings on target files: 0/, 'reports no target findings');
    assertMatch(result.out, /Residual backlog findings \(non-blocking\): 1/, 'reports residual backlog count');
  } finally {
    cleanup(root);
  }
}

{
  const root = setup({
    'packages/mcp-server/src/absorb/http-routes.ts': "export const unsafe = eval('caller');\n",
  });
  try {
    git(root, ['init']);
    const result = run(root, ['--changed-files']);
    assertEq(result.code, 1, 'changed target findings fail');
    assertMatch(result.out, /Changed-file gate: 1 target file\(s\)/, 'reports changed target count');
    assertMatch(result.out, /Findings detected on target files/, 'prints target failure reason');
  } finally {
    cleanup(root);
  }
}

if (testsFailed > 0) {
  console.error(`security-audit-io-network.test.mjs: ${testsFailed}/${testsRun} failed`);
  process.exit(1);
}

console.log(`security-audit-io-network.test.mjs: ${testsRun}/${testsRun} passed`);
