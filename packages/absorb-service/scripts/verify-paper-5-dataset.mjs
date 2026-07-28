#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');
const repoRoot = resolve(packageRoot, '../..');

export const DEFAULT_PAPER_5_DATASET = resolve(packageRoot, 'benchmarks/paper-5-retrieval-v1.json');

const REQUIRED_CATEGORIES = ['dependency', 'impact', 'reasoning'];
const MINIMUM_QUERY_COUNT = 50;
const MINIMUM_CATEGORY_COUNT = 15;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizePath(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//u, '');
}

function compactBasename(file) {
  return basename(file, '.ts')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '');
}

function parseArgs(argv) {
  const options = {
    dataset: DEFAULT_PAPER_5_DATASET,
    out: '',
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === '--json') options.json = true;
    if (raw === '--help' || raw === '-h') options.help = true;
    const [flag, inline] = raw.split('=', 2);
    const value = inline ?? argv[index + 1];
    if (inline === undefined && value && !value.startsWith('--')) index += 1;
    if (flag === '--dataset') options.dataset = resolve(repoRoot, value);
    if (flag === '--out') options.out = resolve(repoRoot, value);
  }
  return options;
}

function usage() {
  return [
    'Usage: node packages/absorb-service/scripts/verify-paper-5-dataset.mjs [options]',
    '',
    'Options:',
    '  --dataset=PATH   dataset JSON (default package benchmark corpus)',
    '  --out=PATH       optional audit receipt path',
    '  --json           print the full receipt',
    '  --help           show this message',
  ].join('\n');
}

export function auditPaper5Dataset(datasetPath = DEFAULT_PAPER_5_DATASET) {
  const absoluteDatasetPath = resolve(datasetPath);
  const errors = [];
  const warnings = [];
  let raw = '';
  let dataset = null;

  try {
    raw = readFileSync(absoluteDatasetPath, 'utf8');
    dataset = JSON.parse(raw);
  } catch (error) {
    errors.push(`dataset-unreadable:${error instanceof Error ? error.message : String(error)}`);
  }

  const queries = Array.isArray(dataset?.queries) ? dataset.queries : [];
  if (dataset?.schemaVersion !== 'holoscript.paper5.retrieval-dataset.v1') {
    errors.push('schema-version-mismatch');
  }
  if (typeof dataset?.datasetId !== 'string' || dataset.datasetId.length < 8) {
    errors.push('dataset-id-required');
  }
  if (!/^[a-f0-9]{40}$/u.test(String(dataset?.sourceCommit ?? ''))) {
    errors.push('source-commit-must-be-full-sha1');
  }
  if (dataset?.split?.noTrainingOnEvaluationQueries !== true) {
    errors.push('held-out-split-declaration-required');
  }
  if (dataset?.labeling?.independentExecutableVerification !== true) {
    errors.push('independent-executable-verification-required');
  }
  if (dataset?.labeling?.multiHumanAnnotator !== false) {
    errors.push('multi-human-annotator-boundary-must-be-explicitly-false');
  }
  if (queries.length < MINIMUM_QUERY_COUNT) {
    errors.push(`query-count-below-${MINIMUM_QUERY_COUNT}`);
  }

  const seenIds = new Set();
  const seenQueries = new Set();
  const categoryCounts = Object.fromEntries(REQUIRED_CATEGORIES.map((category) => [category, 0]));
  let goldFileCount = 0;
  let verifiedAnchorCount = 0;

  for (const [queryIndex, query] of queries.entries()) {
    const prefix = `query-${queryIndex + 1}`;
    const id = String(query?.id ?? '');
    const category = String(query?.category ?? '');
    const queryText = String(query?.query ?? '').trim();
    const gold = Array.isArray(query?.gold) ? query.gold : [];

    if (!/^(dependency|impact|reasoning)-\d{2}$/u.test(id)) {
      errors.push(`${prefix}:invalid-id`);
    } else if (seenIds.has(id)) {
      errors.push(`${prefix}:duplicate-id:${id}`);
    }
    seenIds.add(id);

    if (!REQUIRED_CATEGORIES.includes(category)) {
      errors.push(`${prefix}:invalid-category:${category || 'missing'}`);
    } else {
      categoryCounts[category] += 1;
    }

    const normalizedQuery = queryText.toLowerCase().replace(/\s+/gu, ' ');
    if (queryText.length < 24) errors.push(`${prefix}:query-too-short`);
    if (seenQueries.has(normalizedQuery)) errors.push(`${prefix}:duplicate-query`);
    seenQueries.add(normalizedQuery);

    if (gold.length < 2) errors.push(`${prefix}:multi-relevance-needs-two-gold-files`);
    if (gold.length > 5) errors.push(`${prefix}:gold-file-count-exceeds-five`);
    const seenGold = new Set();

    for (const [goldIndex, judgment] of gold.entries()) {
      const goldPrefix = `${prefix}:gold-${goldIndex + 1}`;
      const file = normalizePath(judgment?.file);
      const anchors = Array.isArray(judgment?.anchors)
        ? judgment.anchors.map((anchor) => String(anchor)).filter(Boolean)
        : [];
      const absoluteFile = resolve(packageRoot, file);

      if (
        !file.startsWith('src/') ||
        file.includes('/__tests__/') ||
        /\.(test|spec)\.ts$/u.test(file)
      ) {
        errors.push(`${goldPrefix}:invalid-source-path:${file || 'missing'}`);
      }
      if (seenGold.has(file)) errors.push(`${goldPrefix}:duplicate-gold-file:${file}`);
      seenGold.add(file);
      if (!existsSync(absoluteFile)) errors.push(`${goldPrefix}:missing-file:${file}`);
      if (anchors.length === 0) errors.push(`${goldPrefix}:source-anchor-required:${file}`);

      const compactName = compactBasename(file);
      const compactQuery = normalizedQuery.replace(/[^a-z0-9]+/gu, '');
      if (compactName.length >= 6 && compactQuery.includes(compactName)) {
        errors.push(`${goldPrefix}:query-leaks-gold-basename:${file}`);
      }

      if (existsSync(absoluteFile)) {
        const source = readFileSync(absoluteFile, 'utf8');
        for (const anchor of anchors) {
          if (!source.includes(anchor)) {
            errors.push(`${goldPrefix}:missing-anchor:${file}:${anchor}`);
          } else {
            verifiedAnchorCount += 1;
          }
        }
      }
      goldFileCount += 1;
    }
  }

  for (const category of REQUIRED_CATEGORIES) {
    if ((categoryCounts[category] ?? 0) < MINIMUM_CATEGORY_COUNT) {
      errors.push(`${category}-count-below-${MINIMUM_CATEGORY_COUNT}`);
    }
  }

  if (dataset?.metricProtocol?.precisionAt !== 5) {
    errors.push('metric-protocol-precision-at-must-be-five');
  }
  if ((dataset?.metricProtocol?.bootstrapResamples ?? 0) < 1000) {
    errors.push('metric-protocol-needs-at-least-1000-bootstrap-resamples');
  }
  if (dataset?.claimBoundary?.publicationReady !== false) {
    errors.push('publication-ready-boundary-must-be-false');
  }
  if (!String(dataset?.claimBoundary?.reason ?? '').includes('multi-human')) {
    errors.push('claim-boundary-must-name-multi-human-gap');
  }

  const datasetRelative = relative(repoRoot, absoluteDatasetPath).replace(/\\/g, '/');
  const receipt = {
    schemaVersion: 'holoscript.paper5.retrieval-dataset-audit.v1',
    kind: 'Paper5RetrievalDatasetAudit',
    generatedAt: new Date().toISOString(),
    status: errors.length === 0 ? 'pass' : 'fail',
    dataset: {
      path: datasetRelative,
      sha256: raw ? sha256(raw) : null,
      datasetId: dataset?.datasetId ?? null,
      sourceCommit: dataset?.sourceCommit ?? null,
      frozenAt: dataset?.frozenAt ?? null,
    },
    counts: {
      queries: queries.length,
      categories: categoryCounts,
      goldFiles: goldFileCount,
      verifiedAnchors: verifiedAnchorCount,
    },
    protocol: {
      minimumQueryCount: MINIMUM_QUERY_COUNT,
      minimumCategoryCount: MINIMUM_CATEGORY_COUNT,
      requiredCategories: REQUIRED_CATEGORIES,
      rankingsHiddenFromVerifier: true,
      multiHumanAnnotator: false,
    },
    errors,
    warnings,
  };
  return { dataset, receipt };
}

export function requirePaper5Dataset(datasetPath = DEFAULT_PAPER_5_DATASET) {
  const result = auditPaper5Dataset(datasetPath);
  if (result.receipt.status !== 'pass') {
    throw new Error(`Paper 5 dataset audit failed: ${result.receipt.errors.join(', ')}`);
  }
  return result;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const { receipt } = auditPaper5Dataset(options.dataset);
  if (options.out) {
    mkdirSync(dirname(options.out), { recursive: true });
    writeFileSync(options.out, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  }
  if (options.json) console.log(JSON.stringify(receipt, null, 2));
  else {
    console.log(
      `[paper-5-dataset] ${receipt.status.toUpperCase()} queries=${receipt.counts.queries} ` +
        `gold=${receipt.counts.goldFiles} anchors=${receipt.counts.verifiedAnchors} ` +
        `sha256=${receipt.dataset.sha256 ?? 'unavailable'}`
    );
    for (const error of receipt.errors) console.error(`  error: ${error}`);
  }
  return receipt.status === 'pass' ? 0 : 1;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(`[paper-5-dataset] fatal: ${error instanceof Error ? error.stack : error}`);
      process.exitCode = 1;
    }
  );
}
