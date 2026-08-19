#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE_EXTENSIONS = new Set(['.holo', '.hs', '.hsplus']);

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      args.root = argv[index + 1];
      index += 1;
    } else if (arg === '--json') {
      args.json = true;
    }
  }

  return args;
}

function extensionOf(file) {
  const match = file.match(/\.(holo|hs|hsplus)$/i);
  return match ? `.${match[1].toLowerCase()}` : '';
}

function listSourceFiles(sourceRoot) {
  const files = [];

  function visit(dir) {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        visit(full);
        continue;
      }

      if (SOURCE_EXTENSIONS.has(extensionOf(full))) {
        files.push(full);
      }
    }
  }

  visit(sourceRoot);
  return files.sort();
}

function hasAll(content, needles) {
  return needles.every((needle) => content.includes(needle));
}

function checkFile(file, sourceRoot) {
  const rel = relative(sourceRoot, file).split(sep).join('/');
  const content = readFileSync(file, 'utf8');
  const findings = [];

  const requireAll = (label, needles) => {
    for (const needle of needles) {
      if (!content.includes(needle)) {
        findings.push(`${label}: missing ${needle}`);
      }
    }
  };

  if (rel === 'runtime-atlas.holo') {
    requireAll('runtime atlas', ['RuntimeAdmissionGate', 'layers:', 'domains:', 'verticals:', 'surfaces:', 'requiredFields']);
  } else if (rel.startsWith('layers/')) {
    requireAll('layer source', ['layer:', 'place_id:', 'domains:', 'verticals:', 'required_receipts:', 'source:']);
    if (!content.includes('emit("receipt_written"')) {
      findings.push('layer source: missing receipt_written emission');
    }
  } else if (rel.startsWith('domains/')) {
    requireAll('domain source', ['domain:', 'requiredReceipts']);
    if (!hasAll(content, ['policy "']) && !hasAll(content, ['template "'])) {
      findings.push('domain source: missing policy or template contract');
    }
  } else if (rel.startsWith('verticals/')) {
    requireAll('vertical source', ['type: "runtime_vertical"', 'layers:', 'domains:', 'requiredReceipts:', 'failClosedBehavior:']);
  } else if (rel.startsWith('proofs/')) {
    requireAll('proof source', ['type: "runtime_proof"', 'layer:', 'domains:', 'verticals:', 'requiredReceipts:', 'canonicalSource:', 'failClosedBehavior:']);
  }

  return {
    file: rel,
    status: findings.length === 0 ? 'pass' : 'fail',
    findings,
  };
}

export function scanAtlas(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const sourceRoot = resolve(root, 'source');

  if (!existsSync(sourceRoot)) {
    return {
      status: 'fail',
      root,
      sourceRoot,
      checkedFiles: 0,
      failures: [{ file: 'source', findings: ['source directory is missing'] }],
      results: [],
    };
  }

  const files = listSourceFiles(sourceRoot);
  const results = files.map((file) => checkFile(file, sourceRoot));
  const failures = results.filter((result) => result.status === 'fail');

  return {
    status: failures.length === 0 ? 'pass' : 'fail',
    root,
    sourceRoot,
    checkedFiles: results.length,
    failures,
    results,
  };
}

function printHuman(report) {
  if (report.status === 'pass') {
    console.log(`PASS runtime atlas admission: ${report.checkedFiles} source files checked`);
    return;
  }

  console.error(`FAIL runtime atlas admission: ${report.failures.length} files failed`);
  for (const failure of report.failures) {
    console.error(`- ${failure.file}`);
    for (const finding of failure.findings) {
      console.error(`  ${finding}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const report = scanAtlas({ root: args.root });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  process.exit(report.status === 'pass' ? 0 : 1);
}
