#!/usr/bin/env node
/**
 * harvest-corpus-production — Paper-19 production trait-inference corpus.
 *
 * Harvests real natural-language -> .hsplus-trait-annotation pairs from:
 *   - packages/core/src/__tests__/fixtures
 *   - .scratch
 *   - benchmarks/scenarios
 *   - benchmarks/cross-compilation
 *   - examples
 *   - bio-demo
 *   - test
 *   - packages/* /test & packages/* /fixtures
 *   - .bench-logs/format-stress (logged trait-authoring sessions)
 *
 * For each source file, extracts the leading comment block as the NL
 * description. Parses object/template blocks via a structural balanced-brace
 * walker. Extracts @trait gold labels. Dedups by SHA-256 snippet hash.
 * Assigns combination-aware train/dev/test splits with novel-combination
 * hold-out. Writes JSONL + manifest.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const FAMILY_MAP_PATH = join(
  REPO_ROOT,
  'research',
  'paper-19',
  'datasets',
  'trait-family-map-v1.json'
);
const OUT_PATH = join(
  REPO_ROOT,
  'research',
  'paper-19',
  'datasets',
  'phase-3-trait-inference-production.jsonl'
);
const MANIFEST_PATH = join(
  REPO_ROOT,
  'research',
  'paper-19',
  'datasets',
  'phase-3-trait-inference-production.README.md'
);

const SOURCE_GLOBS = [
  'packages/core/src/__tests__/fixtures',
  '.scratch',
  'benchmarks/scenarios',
  'benchmarks/cross-compilation',
  'examples',
  'bio-demo',
  'test',
  '.bench-logs/format-stress',
];

const NOVEL_COMBO_TEST_TARGET = 300;

// ---------------------------------------------------------------------------
// File gathering
// ---------------------------------------------------------------------------

function listFilesRec(dir, exts) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
      out.push(...listFilesRec(p, exts));
    } else if (st.isFile()) {
      if (exts.some((e) => name.endsWith(e))) out.push(p);
    }
  }
  return out;
}

function gatherSources() {
  const exts = ['.holo', '.hsplus'];
  const files = [];
  for (const sub of SOURCE_GLOBS) {
    const dir = join(REPO_ROOT, sub);
    if (existsSync(dir)) files.push(...listFilesRec(dir, exts));
  }
  // packages/*/test/ and packages/*/fixtures/
  const pkgs = join(REPO_ROOT, 'packages');
  if (existsSync(pkgs)) {
    for (const pkg of readdirSync(pkgs)) {
      const testDir = join(pkgs, pkg, 'test');
      if (existsSync(testDir)) files.push(...listFilesRec(testDir, exts));
      const fixturesDir = join(pkgs, pkg, 'fixtures');
      if (existsSync(fixturesDir)) files.push(...listFilesRec(fixturesDir, exts));
    }
  }
  return [...new Set(files)].sort();
}

// ---------------------------------------------------------------------------
// Leading-comment extraction
// ---------------------------------------------------------------------------

function extractLeadingComment(src) {
  let i = 0;
  const N = src.length;
  const parts = [];
  while (i < N) {
    // skip whitespace
    while (i < N && /\s/.test(src[i])) i++;
    if (i >= N) break;
    if (src[i] === '/' && src[i + 1] === '/') {
      let j = i + 2;
      while (j < N && src[j] !== '\n') j++;
      parts.push(src.slice(i + 2, j).trim());
      i = j + 1;
    } else if (src[i] === '/' && src[i + 1] === '*') {
      let j = i + 2;
      while (j < N - 1 && !(src[j] === '*' && src[j + 1] === '/')) j++;
      let block = src.slice(i + 2, j);
      // strip leading ` * ` lines common in JSDoc
      block = block
        .split('\n')
        .map((l) => l.replace(/^\s*\*\s?/, '').trim())
        .join('\n')
        .trim();
      parts.push(block);
      i = j + 2;
    } else {
      break;
    }
  }
  const combined = parts.join('\n').trim();
  return combined || null;
}

// ---------------------------------------------------------------------------
// Structural block parser (balanced brace)
// ---------------------------------------------------------------------------

function parseBlocks(src) {
  const blocks = [];
  let i = 0;
  const N = src.length;

  function lineNumberAt(idx) {
    let n = 1;
    for (let k = 0; k < idx; k++) if (src[k] === '\n') n++;
    return n;
  }

  while (i < N) {
    while (i < N && /\s/.test(src[i])) i++;
    if (i >= N) break;
    if (src[i] === '/' && src[i + 1] === '/') {
      while (i < N && src[i] !== '\n') i++;
      continue;
    }
    if (src[i] === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < N && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    const head = src.slice(i, i + 12);
    let kind = null;
    let kindLen = 0;
    if (/^object[\s\(]/.test(head) || /^object\s/.test(head)) {
      kind = 'object';
      kindLen = 'object'.length;
    } else if (/^template[\s\(]/.test(head) || /^template\s/.test(head)) {
      kind = 'template';
      kindLen = 'template'.length;
    }

    if (!kind) {
      i++;
      continue;
    }

    const blockStart = i;
    let p = i + kindLen;
    while (p < N && /\s/.test(src[p])) p++;
    if (src[p] !== '"') {
      i++;
      continue;
    }
    const nameStart = p + 1;
    p++;
    while (p < N && src[p] !== '"') {
      if (src[p] === '\\') p++;
      p++;
    }
    const name = src.slice(nameStart, p);
    p++; // past closing quote
    while (p < N && src[p] !== '{') p++;
    if (p >= N) {
      i = blockStart + 1;
      continue;
    }
    let depth = 1;
    let q = p + 1;
    while (q < N && depth > 0) {
      const ch = src[q];
      if (ch === '/' && src[q + 1] === '/') {
        while (q < N && src[q] !== '\n') q++;
        continue;
      }
      if (ch === '/' && src[q + 1] === '*') {
        q += 2;
        while (q < N && !(src[q] === '*' && src[q + 1] === '/')) q++;
        q += 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        q++;
        while (q < N && src[q] !== quote) {
          if (src[q] === '\\') q++;
          q++;
        }
        q++;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      q++;
    }
    if (depth !== 0) {
      i = blockStart + 1;
      continue;
    }
    const blockEnd = q;
    const snippet = src.slice(blockStart, blockEnd).trim();
    blocks.push({
      kind,
      name,
      snippet,
      startLine: lineNumberAt(blockStart),
      endLine: lineNumberAt(blockEnd),
    });
    i = blockEnd;
  }
  return blocks;
}

function extractTraitTokens(snippet) {
  const lines = snippet.split('\n');
  let headerIdx = lines.findIndex((l) => /(?:object|template)\s+"[^"]+"[^{]*\{/.test(l));
  if (headerIdx === -1) return { traits: [], traitArgs: [] };
  let i = headerIdx + 1;
  const traits = [];
  const traitArgs = [];
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith('//')) {
      i++;
      continue;
    }
    if (!trimmed.startsWith('@')) break;
    const m = /^(@[A-Za-z_][A-Za-z0-9_]*)/.exec(trimmed);
    if (m) {
      traits.push(m[1]);
      traitArgs.push(trimmed);
    }
    i++;
  }
  return { traits, traitArgs };
}

// ---------------------------------------------------------------------------
// Dedup + split
// ---------------------------------------------------------------------------

function snippetHash(s) {
  return createHash('sha256').update(s.trim(), 'utf-8').digest('hex');
}

function splitFromHash(s) {
  const h = snippetHash(s);
  const slot = parseInt(h.slice(0, 8), 16) % 100;
  if (slot < 70) return 'train';
  if (slot < 85) return 'dev';
  return 'test';
}

function assignSplits(rows) {
  const byCombo = new Map();
  for (const r of rows) {
    const key = r.gold_traits.slice().sort().join('|');
    if (!byCombo.has(key)) byCombo.set(key, []);
    byCombo.get(key).push(r);
  }

  const heldOut = new Set();
  let heldOutRowCount = 0;
  const orderedCombos = [...byCombo.entries()]
    .filter(([key]) => key !== '')
    .sort((a, b) => {
      if (a[1].length !== b[1].length) return a[1].length - b[1].length;
      return createHash('sha256')
        .update(a[0])
        .digest('hex')
        .localeCompare(createHash('sha256').update(b[0]).digest('hex'));
    });
  for (const [key, group] of orderedCombos) {
    if (heldOutRowCount >= NOVEL_COMBO_TEST_TARGET) break;
    heldOut.add(key);
    heldOutRowCount += group.length;
  }

  const out = new Map();
  for (const r of rows) {
    const key = r.gold_traits.slice().sort().join('|');
    if (heldOut.has(key)) {
      out.set(r, { split: 'test', splitRole: 'novel-combination-test' });
    } else {
      const s = splitFromHash(r.snippet);
      const role = s === 'test' ? 'in-distribution-test' : s;
      out.set(r, { split: s, splitRole: role });
    }
  }
  return { assignments: out, heldOutCombos: heldOut.size, heldOutRows: heldOutRowCount };
}

// ---------------------------------------------------------------------------
// Family map
// ---------------------------------------------------------------------------

function loadFamilyMap() {
  const raw = readFileSync(FAMILY_MAP_PATH, 'utf-8');
  return JSON.parse(raw);
}

function familiesForTraits(goldTraits, familyMap) {
  const fams = new Set();
  const uncategorized = [];
  for (const t of goldTraits) {
    const bare = t.startsWith('@') ? t.slice(1) : t;
    const flist = familyMap.trait_to_families[bare];
    if (flist && flist.length > 0) {
      for (const f of flist) fams.add(f);
    } else {
      uncategorized.push(bare);
    }
  }
  return { families: [...fams].sort(), uncategorized };
}

function bucketize(traitCount) {
  if (traitCount === 0) return 'zero';
  if (traitCount === 1) return 'solo';
  if (traitCount <= 3) return 'two-to-three';
  return 'four-plus';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const familyMap = loadFamilyMap();
  console.log(
    `Loaded family map: ${familyMap.family_count} families, ${familyMap.distinct_trait_count} distinct traits`
  );

  const sourceFiles = gatherSources();
  console.log(`Source files: ${sourceFiles.length}`);

  const verbatimRows = [];
  let totalBlocks = 0;
  let blocksWithTraits = 0;
  let filesWithDescription = 0;
  let filesWithoutDescription = 0;

  for (const fpath of sourceFiles) {
    let src;
    try {
      src = readFileSync(fpath, 'utf-8');
    } catch {
      continue;
    }
    const rel = relative(REPO_ROOT, fpath).split('\\').join('/');
    const fileDescription = extractLeadingComment(src);
    if (fileDescription) filesWithDescription++;
    else filesWithoutDescription++;

    const blocks = parseBlocks(src);
    totalBlocks += blocks.length;
    for (const b of blocks) {
      const { traits, traitArgs } = extractTraitTokens(b.snippet);
      if (traits.length > 0) blocksWithTraits++;
      const goldTraits = traits;
      const { families, uncategorized } = familiesForTraits(goldTraits, familyMap);
      verbatimRows.push({
        kind: b.kind,
        name: b.name,
        description: fileDescription,
        snippet: b.snippet,
        gold_traits: goldTraits,
        traitArgs,
        provenance: {
          source: rel,
          lines: `${b.startLine}-${b.endLine}`,
          kind: 'verbatim',
        },
        metadata: {
          trait_families: families,
          uncategorized_traits: uncategorized,
          snippet_size_bucket: bucketize(goldTraits.length),
          block_kind: b.kind,
        },
      });
    }
  }

  console.log(`Verbatim blocks parsed: ${totalBlocks}`);
  console.log(`Verbatim blocks with >=1 trait: ${blocksWithTraits}`);
  console.log(`Files with description: ${filesWithDescription}`);
  console.log(`Files without description: ${filesWithoutDescription}`);

  // Dedup verbatim by snippet hash.
  const seen = new Map();
  const verbatimUnique = [];
  for (const row of verbatimRows) {
    const h = snippetHash(row.snippet);
    if (seen.has(h)) continue;
    seen.set(h, row);
    verbatimUnique.push(row);
  }
  console.log(`Verbatim unique after SHA-256 dedup: ${verbatimUnique.length}`);

  // Only keep rows that have a description (the production NL requirement).
  const productionRows = verbatimUnique.filter((r) => r.description);
  console.log(`Production rows (with description): ${productionRows.length}`);

  // Split assignment.
  const splitInfo = assignSplits(productionRows);
  console.log(
    `Held-out combinations for novel-combo test: ${splitInfo.heldOutCombos} (${splitInfo.heldOutRows} rows)`
  );

  const finalRows = productionRows.map((r, i) => {
    const a = splitInfo.assignments.get(r);
    const pad = String(i + 1).padStart(5, '0');
    const id = r.id ? r.id : `row-${pad}`;
    const { traitArgs: _ta, ...rest } = r;
    return {
      id,
      split: a.split,
      ...rest,
      metadata: { ...rest.metadata, split_role: a.splitRole },
    };
  });

  // Novel-combination flag verification.
  const trainCombos = new Set();
  for (const r of finalRows) {
    if (r.split === 'train') trainCombos.add(r.gold_traits.slice().sort().join('|'));
  }
  let novelCount = 0;
  for (const r of finalRows) {
    const key = r.gold_traits.slice().sort().join('|');
    const isNovel =
      (r.split === 'test' || r.split === 'dev') &&
      r.gold_traits.length > 0 &&
      !trainCombos.has(key);
    r.metadata.novel_combination = isNovel;
    if (isNovel && r.split === 'test') novelCount++;
  }

  // Write JSONL.
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const lines = finalRows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  writeFileSync(OUT_PATH, lines, 'utf-8');

  // Stats.
  const splits = { train: 0, dev: 0, test: 0 };
  for (const r of finalRows) splits[r.split]++;
  const fams = new Set();
  for (const r of finalRows) for (const f of r.metadata.trait_families) fams.add(f);
  const uncategorized = new Set();
  for (const r of finalRows)
    for (const t of r.metadata.uncategorized_traits || []) uncategorized.add(t);

  const stats = {
    total: finalRows.length,
    train: splits.train,
    dev: splits.dev,
    test: splits.test,
    novelCombinationTest: novelCount,
    distinctGoldTraits: new Set(finalRows.flatMap((r) => r.gold_traits)).size,
    familyCount: fams.size,
    uncategorizedCount: uncategorized.size,
    sourceFiles: sourceFiles.length,
    filesWithDescription,
    filesWithoutDescription,
    totalBlocks,
    blocksWithTraits,
    dedupedBlocks: verbatimUnique.length,
  };

  console.log('');
  console.log(`OK: wrote ${stats.total} rows to ${OUT_PATH.replace(REPO_ROOT, '.')}`);
  console.log(`  splits: train=${stats.train} dev=${stats.dev} test=${stats.test}`);
  console.log(`  novel-combination test rows: ${stats.novelCombinationTest}`);
  console.log(`  trait families covered: ${stats.familyCount}`);
  console.log(`  uncategorized traits: ${stats.uncategorizedCount}`);

  // Write manifest.
  const manifest = generateManifest(stats, finalRows, splitInfo);
  writeFileSync(MANIFEST_PATH, manifest, 'utf-8');
  console.log(`  manifest: ${MANIFEST_PATH.replace(REPO_ROOT, '.')}`);
}

function generateManifest(stats, rows, splitInfo) {
  const corpusHash = createHash('sha256')
    .update(rows.map((r) => r.id).join('\n'), 'utf-8')
    .digest('hex');

  return `# Paper-19 Production Trait-Inference Corpus

**File**: \`phase-3-trait-inference-production.jsonl\`
**Generator**: \`scripts/paper-19/harvest-corpus-production.mjs\`
**Corpus SHA-256 (id-list hash)**: \`${corpusHash}\`
**Generated**: ${new Date().toISOString()}

## What this corpus is

Real natural-language -> .hsplus-trait-annotation pairs harvested from production source files and logged trait-authoring sessions. Each row carries a \`description\` extracted from the leading comment block of the source file, paired with a structurally extracted \`snippet\` (object or template block) and its \`gold_traits\`.

## Schema

| Field | Type | Description |
|-------|------|-------------|
| \`id\` | \`"row-NNNNN"\` | Stable identifier |
| \`split\` | \`"train" \| "dev" \| "test"\` | Frozen split |
| \`description\` | \`string \| null\` | Leading-comment NL description from the source file |
| \`snippet\` | \`string\` | Structurally extracted object/template block |
| \`gold_traits\` | \`string[]\` | Bare \`@trait\` tokens (args stripped) |
| \`provenance.source\` | \`string\` | Repo-relative path |
| \`provenance.lines\` | \`string\` | Line range |
| \`provenance.kind\` | \`"verbatim"\` | Always verbatim in this production corpus |
| \`metadata.*\` | \`various\` | Same as v2: trait_families, snippet_size_bucket, split_role, novel_combination |

## Live statistics

| Metric | Value |
|---|---|
| Total rows | ${stats.total} |
| Train | ${stats.train} |
| Dev | ${stats.dev} |
| Test | ${stats.test} |
| Novel-combination test rows | ${stats.novelCombinationTest} |
| Distinct gold traits | ${stats.distinctGoldTraits} |
| Trait families covered | ${stats.familyCount} |
| Uncategorized traits | ${stats.uncategorizedCount} |
| Source files scanned | ${stats.sourceFiles} |
| Files with description | ${stats.filesWithDescription} |
| Files without description | ${stats.filesWithoutDescription} |
| Total blocks parsed | ${stats.totalBlocks} |
| Blocks with traits | ${stats.blocksWithTraits} |
| After snippet dedup | ${stats.dedupedBlocks} |
| Production rows (with description) | ${stats.total} |

## Sourcing

Roots scanned (recursive):

${SOURCE_GLOBS.map((g) => `- \`${g}\``).join('\n')}
- \`packages/*/test\` and \`packages/*/fixtures\` (auto-discovered)
- \`.bench-logs/format-stress\` (logged trait-authoring sessions)

## Split methodology

Same combination-aware split as the v2 corpus:

1. Group rows by sorted trait-combination key.
2. Hold out combinations deterministically until >= ${NOVEL_COMBO_TEST_TARGET} test rows.
3. Remaining rows → hash-mod 70/15/15.

Held-out combinations: ${splitInfo.heldOutCombos}
Held-out rows: ${splitInfo.heldOutRows}

## Determinism

Re-running the generator on the same git tree produces byte-identical output (modulo file-system order). The split is derived from the SHA-256 of each snippet; the novel-combination selection is derived from the sorted combo-key hash.

## Re-generation

\`\`\`bash
node scripts/paper-19/harvest-corpus-production.mjs
\`\`\`
`;
}

main();
