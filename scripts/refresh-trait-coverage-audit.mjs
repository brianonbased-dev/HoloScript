#!/usr/bin/env node
/**
 * refresh-trait-coverage-audit.mjs
 *
 * Refreshes the trait coverage audit by scanning all constant category files,
 * enumerating the full trait universe, and cross-referencing against:
 *   - handler implementations (packages/core/src/traits/*Trait.ts)
 *   - tests (*.test.ts in traits/ and traits/__tests__/)
 *   - examples (examples/** / *.holo, examples/** / *.hsplus)
 *   - docs (docs/** / *.md)
 *
 * Outputs:
 *   .bench-logs/trait-coverage-audit-<date>.json
 *   docs/audit/trait-coverage-audit-<date>.md
 *   docs/audit/zero-coverage-backlog-<date>.md
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const today = new Date().toISOString().split('T')[0];

// Directories
const CONSTANTS_DIR = resolve(repoRoot, 'packages/core/src/traits/constants');
const TRAITS_DIR = resolve(repoRoot, 'packages/core/src/traits');
const EXAMPLES_DIR = resolve(repoRoot, 'examples');
const DOCS_DIR = resolve(repoRoot, 'docs');
const BENCH_DIR = resolve(repoRoot, '.bench-logs');
const AUDIT_DIR = resolve(repoRoot, 'docs/audit');

mkdirSync(BENCH_DIR, { recursive: true });
mkdirSync(AUDIT_DIR, { recursive: true });

// ─── Helpers ───────────────────────────────────────────────────────────────

function pascalToSnake(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function snakeToPascal(name) {
  return name
    .split('_')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

function* walkDir(dir, predicate) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walkDir(full, predicate);
    } else if (predicate(ent.name)) {
      yield full;
    }
  }
}

function readAll(paths) {
  const out = [];
  for (const p of paths) {
    try {
      out.push(readFileSync(p, 'utf8'));
    } catch {}
  }
  return out;
}

// ─── Step 1: Enumerate traits from constants ──────────────────────────────

const traitMap = new Map(); // trait -> { category, categoryFile }
const categoryFiles = readdirSync(CONSTANTS_DIR)
  .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts') && f !== 'index.ts')
  .sort();

for (const cf of categoryFiles) {
  const content = readFileSync(join(CONSTANTS_DIR, cf), 'utf8');
  // Match export const NAME_TRAITS = [ ... ] as const;
  const match = content.match(/export const (\w+_TRAITS)\s*=\s*\[([\s\S]*?)\]\s+as const;/);
  if (!match) continue;
  const categoryName = cf.replace(/\.ts$/, '');
  const rawList = match[2];
  const names = [...rawList.matchAll(/'([^']+)'/g)].map(m => m[1]);
  for (const name of names) {
    if (!traitMap.has(name)) {
      traitMap.set(name, { category: categoryName, categoryFile: cf, handlers: [], tests: [] });
    }
  }
}

const allTraits = Array.from(traitMap.keys()).sort();

// ─── Step 2: Map handlers and tests from filenames ────────────────────────

const handlerFiles = [...walkDir(TRAITS_DIR, n => n.endsWith('Trait.ts') && !n.includes('.test.'))];
const testFiles = [...walkDir(TRAITS_DIR, n => n.endsWith('.test.ts'))];

const handlerMap = new Map(); // snake_case stem -> full path
const testMap = new Map();    // snake_case stem -> full path

for (const f of handlerFiles) {
  const stem = basename(f, 'Trait.ts');
  const snake = pascalToSnake(stem);
  handlerMap.set(snake, f);
}

for (const f of testFiles) {
  const stem = basename(f, '.test.ts');
  if (stem.endsWith('Trait')) {
    const snake = pascalToSnake(stem.slice(0, -5));
    testMap.set(snake, f);
  } else {
    // tests not named *Trait.test.ts
    const snake = pascalToSnake(stem);
    testMap.set(snake, f);
  }
}

// ─── Step 3: Bulk read examples & docs for substring search ────────────────

const examplePaths = [...walkDir(EXAMPLES_DIR, n => n.endsWith('.holo') || n.endsWith('.hsplus'))];
const docPaths = [...walkDir(DOCS_DIR, n => n.endsWith('.md'))];

// Build a combined string per type for fast membership testing
const exampleChunks = readAll(examplePaths);
const docChunks = readAll(docPaths);

function appearsIn(chunks, name) {
  const needle1 = '@' + name;
  const needle2 = ' ' + name + ' ';
  const needle3 = '\n' + name;
  const needle4 = '"' + name + '"';
  const needle5 = "'" + name + "'";
  for (const chunk of chunks) {
    if (chunk.includes(needle1) || chunk.includes(needle2) || chunk.includes(needle3) || chunk.includes(needle4) || chunk.includes(needle5)) {
      return true;
    }
  }
  return false;
}

// ─── Step 4: Compute coverage per trait ───────────────────────────────────

const results = [];
for (const name of allTraits) {
  const info = traitMap.get(name);
  const pascal = snakeToPascal(name);
  const hasHandler = handlerMap.has(name) || handlerMap.has(name.replace(/_/g, ''));
  const hasTest = testMap.has(name) || testMap.has(name.replace(/_/g, '')) || testMap.has(pascal);
  const hasExample = appearsIn(exampleChunks, name);
  const hasDoc = appearsIn(docChunks, name);

  // Fuzzy fallback: if exact snake not in map, try removing underscores
  let handlerFile = handlerMap.get(name);
  if (!handlerFile) handlerFile = handlerMap.get(name.replace(/_/g, ''));

  let testFile = testMap.get(name);
  if (!testFile) testFile = testMap.get(name.replace(/_/g, ''));

  results.push({
    name,
    category: info.category,
    hasHandler: !!handlerFile,
    handlerFile: handlerFile ? handlerFile.replace(repoRoot + '/', '') : null,
    hasTest: !!testFile,
    testFile: testFile ? testFile.replace(repoRoot + '/', '') : null,
    hasExample,
    hasDoc,
  });
}

// ─── Step 5: Aggregate by category ─────────────────────────────────────────

const categoryStats = new Map();
for (const r of results) {
  if (!categoryStats.has(r.category)) {
    categoryStats.set(r.category, { total: 0, covered: 0, zero: 0, withHandler: 0, withTest: 0, withExample: 0, withDoc: 0 });
  }
  const s = categoryStats.get(r.category);
  s.total++;
  const covered = r.hasHandler || r.hasTest || r.hasExample || r.hasDoc;
  if (covered) s.covered++;
  else s.zero++;
  if (r.hasHandler) s.withHandler++;
  if (r.hasTest) s.withTest++;
  if (r.hasExample) s.withExample++;
  if (r.hasDoc) s.withDoc++;
}

const totalTraits = results.length;
const coveredTraits = results.filter(r => r.hasHandler || r.hasTest || r.hasExample || r.hasDoc).length;
const zeroTraits = totalTraits - coveredTraits;
const overallPct = ((coveredTraits / totalTraits) * 100).toFixed(2);

// ─── Step 6: Write JSON artifact ──────────────────────────────────────────

const jsonOut = {
  generatedAt: new Date().toISOString(),
  source: 'scripts/refresh-trait-coverage-audit.mjs',
  totalTraits,
  coveredTraits,
  zeroTraits,
  overallCoveragePercent: Number(overallPct),
  categories: Object.fromEntries(
    Array.from(categoryStats.entries()).sort((a, b) => b[1].zero - a[1].zero)
  ),
  traits: results,
};

const jsonPath = resolve(BENCH_DIR, `trait-coverage-audit-${today}.json`);
writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2), 'utf8');
console.log(`Wrote JSON: ${jsonPath}`);

// ─── Step 7: Write Markdown audit report ────────────────────────────────────

const mdLines = [
  '# HoloScript Trait Coverage Audit',
  `**Generated:** ${today}`,
  `**Command:** \`node scripts/refresh-trait-coverage-audit.mjs\``,
  '',
  '## Executive Summary',
  '',
  `| Metric | Value |`,
  `|--------|-------|`,
  `| Total Traits | ${totalTraits.toLocaleString()} |`,
  `| Covered Traits | ${coveredTraits.toLocaleString()} (${overallPct}%) |`,
  `| Zero-Coverage Traits | ${zeroTraits.toLocaleString()} |`,
  '',
  '> **Coverage definition:** a trait is "covered" if it has at least one of: a handler implementation (`*Trait.ts`), a test file (`*.test.ts`), an example usage (`.holo`/`.hsplus`), or documentation (`.md`).',
  '',
  '## Coverage by Category (zero-coverage descending)',
  '',
  '| Category | Total | Covered | Zero | Handler | Test | Example | Doc |',
  '|----------|-------|---------|------|---------|------|---------|-----|',
];

const sortedCats = Array.from(categoryStats.entries()).sort((a, b) => b[1].zero - a[1].zero);
for (const [cat, s] of sortedCats) {
  mdLines.push(`| ${cat} | ${s.total} | ${s.covered} | ${s.zero} | ${s.withHandler} | ${s.withTest} | ${s.withExample} | ${s.withDoc} |`);
}

mdLines.push('', '---', '', '## Zero-Coverage Traits Detail', '');
for (const [cat, s] of sortedCats) {
  if (s.zero === 0) continue;
  mdLines.push(`### ${cat} (${s.zero} uncovered)`);
  const uncovered = results.filter(r => r.category === cat && !r.hasHandler && !r.hasTest && !r.hasExample && !r.hasDoc);
  mdLines.push('');
  for (const u of uncovered) {
    mdLines.push(`- \`${u.name}\``);
  }
  mdLines.push('');
}

const mdPath = resolve(AUDIT_DIR, `trait-coverage-audit-${today}.md`);
writeFileSync(mdPath, mdLines.join('\n'), 'utf8');
console.log(`Wrote audit MD: ${mdPath}`);

// ─── Step 8: Write zero-coverage backlog ──────────────────────────────────

const backlogLines = [
  '# Zero-Coverage Trait Backlog',
  `**Generated:** ${today}`,
  `**Total zero-coverage traits:** ${zeroTraits.toLocaleString()}`,
  '',
  'This backlog lists every trait with no detected handler, test, example, or documentation.',
  'Use it to spawn targeted board tasks for backfill.',
  '',
];

for (const [cat, s] of sortedCats) {
  if (s.zero === 0) continue;
  const uncovered = results.filter(r => r.category === cat && !r.hasHandler && !r.hasTest && !r.hasExample && !r.hasDoc);
  backlogLines.push(`## ${cat}`);
  backlogLines.push(`**Count:** ${s.zero}  **Total in category:** ${s.total}`);
  backlogLines.push('');
  backlogLines.push('| Trait | Suggested Action |');
  backlogLines.push('|-------|------------------|');
  for (const u of uncovered) {
    backlogLines.push(`| \`${u.name}\` | Add handler + test + example |`);
  }
  backlogLines.push('');
}

const backlogPath = resolve(AUDIT_DIR, `zero-coverage-backlog-${today}.md`);
writeFileSync(backlogPath, backlogLines.join('\n'), 'utf8');
console.log(`Wrote backlog MD: ${backlogPath}`);

console.log(`\nDone. ${totalTraits} traits scanned, ${zeroTraits} zero-coverage.`);
