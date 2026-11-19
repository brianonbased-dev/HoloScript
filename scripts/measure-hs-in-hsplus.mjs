#!/usr/bin/env node
/**
 * Read-only: feed unchanged .hs source to the .hsplus reader (`parse` in
 * HoloScriptPlusParser.ts, the entry the grammar router names for .hsplus).
 *
 *   node --import tsx scripts/measure-hs-in-hsplus.mjs
 *   node --import tsx scripts/measure-hs-in-hsplus.mjs \
 *     --parser /path/to/HoloScriptPlusParser.ts \
 *     --spec /path/to/holoscript-spec-v0.1.md \
 *     --label before
 *
 * Does not rewrite source and does not make .hs a subset of .hsplus.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.scratch',
  'target',
  'pkg',
  'pkg-node',
]);

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

const parserPath = resolve(
  arg('--parser', join(repoRoot, 'packages/core/src/parser/HoloScriptPlusParser.ts'))
);
const specPath = resolve(arg('--spec', join(repoRoot, 'docs/spec/holoscript-spec-v0.1.md')));
const label = arg('--label', 'current');

function walkHs(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkHs(full, acc);
    else if (entry.name.endsWith('.hs')) acc.push(full);
  }
}

function extractFences(markdown) {
  const fences = [];
  const tally = {};
  const pattern = /```([^\n]*)\n([\s\S]*?)```/g;
  for (const match of markdown.matchAll(pattern)) {
    const info = (match[1] ?? '').trim();
    tally[info] = (tally[info] ?? 0) + 1;
    const source = (match[2] ?? '').replace(/\n$/, '');
    if (source.trim() === '') continue;
    const allowed = new Set(['hs', 'hsplus', 'holo', 'hs reject', 'hsplus reject', 'holo reject']);
    if (!allowed.has(info)) continue;
    const line = markdown.slice(0, match.index ?? 0).split('\n').length;
    fences.push({
      lang: info.split(' ')[0],
      reject: info.endsWith(' reject'),
      source,
      line,
    });
  }
  return { fences, tally };
}

function lineText(source, line) {
  const rows = source.split('\n');
  const index = Math.max(0, (line || 1) - 1);
  return (rows[index] ?? '').trim().slice(0, 160);
}

async function main() {
  const mod = await import(pathToFileURL(parserPath).href);
  if (typeof mod.parse !== 'function') {
    throw new Error(`parse export missing at ${parserPath}`);
  }
  const parse = mod.parse;

  const files = [];
  walkHs(repoRoot, files);
  files.sort();

  const markdown = readFileSync(specPath, 'utf8');
  const { fences, tally } = extractFences(markdown);
  const hsAccept = fences.filter((fence) => fence.lang === 'hs' && !fence.reject);
  const acceptedAll = fences.filter((fence) => !fence.reject).length;

  const read = (id, source) => {
    try {
      const result = parse(source);
      const ok = result.success === true && (result.errors?.length ?? 0) === 0;
      const first = result.errors?.[0];
      return {
        id,
        ok,
        throw: false,
        code: first?.code ?? '',
        message: first?.message ?? '',
        line: first?.line ?? 0,
        column: first?.column ?? 0,
        lineText: ok ? '' : lineText(source, first?.line ?? 1),
      };
    } catch (error) {
      return {
        id,
        ok: false,
        throw: true,
        code: 'THROW',
        message: error instanceof Error ? error.message : String(error),
        line: 0,
        column: 0,
        lineText: '',
      };
    }
  };

  const corpus = files.map((file) =>
    read(relative(repoRoot, file).split('\\').join('/'), readFileSync(file, 'utf8'))
  );
  const spec = hsAccept.map((fence) => {
    const row = read(`docs/spec/holoscript-spec-v0.1.md:${fence.line}`, fence.source);
    row.fenceLine = fence.line;
    return row;
  });

  const summarize = (rows) => ({
    total: rows.length,
    succeed: rows.filter((row) => row.ok).length,
    fail: rows.filter((row) => !row.ok && !row.throw).length,
    throws: rows.filter((row) => row.throw).length,
    failures: rows
      .filter((row) => !row.ok)
      .map((row) => ({
        id: row.id,
        code: row.code,
        message: row.message,
        line: row.line,
        column: row.column,
        lineText: row.lineText,
      })),
  });

  const payload = {
    label,
    parserPath,
    specPath,
    fenceTally: tally,
    acceptedFencesAllLanguages: acceptedAll,
    hsAcceptFences: hsAccept.length,
    corpus: summarize(corpus),
    spec: summarize(spec),
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

await main();
