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
  // Use -z (null-separated) so non-ASCII filenames come through as raw UTF-8
  // bytes instead of being quote-printed as `"docs/knowledge/\342\210\236..."`.
  // Without -z, git ls-files quote-prints any filename containing non-ASCII or
  // special chars; the resulting literal string fails fs.readFileSync ENOENT.
  // See `docs/knowledge/∞.HOLOSCRIPT_LANGUAGE_2026_02_03.md` for a live example.
  const result = spawnSync('git', ['ls-files', '-z', '*.md'], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    console.error('Failed to list git files.');
    return;
  }

  // Null-separated; the last entry may be empty (trailing \0).
  const files = result.stdout.split('\0').filter(Boolean);
  let failed = false;
  let scannedCount = 0;
  let missingCount = 0;

  for (const file of files) {
    if (!ACTIVE_DOCS_PATTERN.test(file)) continue;
    if (IGNORE_PATTERNS.some(p => p.test(file))) continue;

    // Defensive: if a file is tracked but missing from disk (deletion-without-
    // git-rm drift), skip it with a warning instead of crashing. The
    // 2d973ec9c deletion-ledger sweep + e14091e854c2 orphan cleanup closed
    // the known cases; this guard catches any future drift.
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) {
      console.warn(`[check-hardcoded-numbers] SKIP: tracked but missing from disk: ${file}`);
      missingCount += 1;
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    scannedCount += 1;
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
    const tail = missingCount > 0 ? ` (${missingCount} tracked-but-missing skipped)` : '';
    console.log(`[check-hardcoded-numbers] PASS: ${scannedCount} active doc(s) scanned, no hardcoded ecosystem counts found${tail}.`);
  }
}

checkHardcodedNumbers();
