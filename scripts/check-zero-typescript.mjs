#!/usr/bin/env node

import { readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const json = args.has('--json');
const root = process.cwd();
const ignoredDirs = new Set([
  '.git',
  '.next',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);
const blockedExtensions = new Set(['.ts', '.tsx']);

function normalize(path) {
  return path.replace(/\\/g, '/');
}

function isDeclarationFile(path) {
  return path.endsWith('.d.ts');
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    const relativePath = normalize(relative(root, fullPath));
    if (entry.isFile() && blockedExtensions.has(extname(entry.name)) && !isDeclarationFile(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

const files = walk(root).sort();
const groups = new Map();

for (const file of files) {
  const parts = file.split('/');
  const key = parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
  groups.set(key, (groups.get(key) ?? 0) + 1);
}

const grouped = [...groups.entries()]
  .map(([name, count]) => ({ name, count }))
  .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

if (json) {
  console.log(JSON.stringify({ ok: files.length === 0, count: files.length, groups: grouped, files }, null, 2));
} else {
  console.log('HoloLand zero-TypeScript audit');
  console.log(`Found ${files.length} .ts/.tsx source file(s), excluding .d.ts.`);

  if (grouped.length > 0) {
    console.log('');
    for (const group of grouped) {
      console.log(`${String(group.count).padStart(4, ' ')}  ${group.name}`);
    }
  }

  if (strict && files.length > 0) {
    console.error('');
    console.error('Zero-TypeScript rule failed. Convert source to .holo/.hs/.hsplus, move runtime/tooling upstream, or generate it outside tracked source.');
    process.exit(1);
  }
}
