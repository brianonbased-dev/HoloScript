#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();

const filesToCheck = [
  'README.md',
  'CONTRIBUTING.md',
  'docs/academy/index.md',
  'docs/compilers/index.md',
  'docs/getting-started/index.md',
  'docs/getting-started/quickstart.md',
  'docs/guides/index.md',
  'docs/guides/quick-start.md',
  'docs/guides/installation.md',
  'docs/guides/mcp-server.md',
  'docs/packages/core.md',
  'docs/packages/compiler.md',
  'docs/packages/mcp-server.md',
  'docs/packages/wasm.md',
  'docs/traits/index.md',
  '.claude/skills/holoscript-absorb/SKILL.md',
  '.claude/skills/holoscript-video/SKILL.md',
];

const suspicious = /\b\d+\+?\s*(tools|traits|compilers|targets|entries)\b/i;
const inlineListSuspicious = /\b(any of the\s+\d+\s+targets|all\s+\d+\+?\s+targets)\b/i;
const allowHint = /(verify|live|ssot|from \/health|health endpoint|authoritative|pricing\.ts|historical|example)/i;

const violations = [];

for (const rel of filesToCheck) {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) continue;

  const content = readFileSync(abs, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, i) => {
    if ((suspicious.test(line) || inlineListSuspicious.test(line)) && !allowHint.test(line)) {
      violations.push({ file: rel, line: i + 1, text: line.trim() });
    }
  });
}

if (violations.length > 0) {
  console.error('\n[docs-count-drift] Found hardcoded ecosystem count claims in key docs:');
  for (const v of violations) {
    console.error(`- ${v.file}:${v.line} -> ${v.text}`);
  }
  console.error('\nUse SSOT phrasing with verification links/commands instead of hardcoded mutable counts.');
  process.exit(1);
}

console.log('[docs-count-drift] OK: no hardcoded mutable ecosystem count claims in key docs.');
