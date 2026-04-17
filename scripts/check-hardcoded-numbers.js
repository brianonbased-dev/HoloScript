#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ACTIVE_DOCS_PATTERN = /^(README\.md|FULL_README\.md|docs\/.*\.md)$/;

// Ignore archive and marketing docs per policy
const IGNORE_PATTERNS = [
  /^docs\/archive\//,
  /^docs\/_archive\//,
  /^docs\/marketing\//,
  /^docs\/strategy\//,
  /^docs\/NUMBERS\.md$/
];

// Patterns to search for
const HARDCODED_PATTERNS = [
  /158\s+MCP/i,
  /44\s+compiler/i,
  /1,?800\+?\s+trait/i,
  /3,?300\+?\s+trait/i,
  /44,?000\+?\s+test/i,
];

function checkHardcodedNumbers() {
  const result = spawnSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    console.error('Failed to list git files.');
    return;
  }

  const files = result.stdout.trim().split('\n').filter(Boolean);
  let failed = false;

  for (const file of files) {
    if (!ACTIVE_DOCS_PATTERN.test(file)) continue;
    if (IGNORE_PATTERNS.some(p => p.test(file))) continue;

    const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const pattern of HARDCODED_PATTERNS) {
      if (pattern.test(content)) {
        console.error(`[check-hardcoded-numbers] FAIL: Found hardcoded ecosystem count matching ${pattern} in ${file}`);
        failed = true;
      }
    }
  }

  if (failed) {
    console.error('\nPolicy violation: Active docs must not hardcode ecosystem counts.');
    console.error('Reference docs/NUMBERS.md or use dynamic endpoints instead.');
    process.exit(1);
  } else {
    console.log('[check-hardcoded-numbers] PASS: No hardcoded ecosystem counts found in active docs.');
  }
}

checkHardcodedNumbers();
