#!/usr/bin/env node
/**
 * Classify .holo/.hsplus/.hs examples by parser health and public link posture.
 *
 * The matrix keeps README/website examples honest:
 * - supported examples must parse successfully
 * - aspirational/expected-fail examples need a reason
 * - optional --all sweeps classify unlisted parser failures as expected-fail with parser detail
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join, relative, sep } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = join(__dirname, '..');
const MATRIX_PATH = join(ROOT, 'examples', 'examples-health.matrix.json');
const MARKDOWN_PATH = join(ROOT, 'docs', 'examples-health', 'examples-health-matrix.md');
const ALLOWED_STATUSES = new Set([
  'supported',
  'aspirational-grammar',
  'expected-fail',
  'deprecated',
]);

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const shouldWriteMarkdown = args.has('--write-markdown');
const shouldCheck = args.has('--check');
const shouldPrintJson = args.has('--json');
const shouldScanAll = args.has('--all');

const require = createRequire(import.meta.url);

function toRepoPath(filepath) {
  return relative(ROOT, filepath).split(sep).join('/');
}

function fromRepoPath(repoPath) {
  return join(ROOT, ...repoPath.split('/'));
}

function loadCoreParser() {
  const parserPath = join(ROOT, 'packages', 'core', 'dist', 'parser.cjs');
  if (!existsSync(parserPath)) {
    throw new Error(
      `Missing ${toRepoPath(parserPath)}. Run pnpm --filter @holoscript/core build first.`
    );
  }

  const core = require(parserPath);
  const { parseHolo, parse, HoloScriptPlusParser } = core;
  if (!parseHolo || !parse || !HoloScriptPlusParser) {
    throw new Error(`${toRepoPath(parserPath)} does not expose the expected parser APIs.`);
  }

  return {
    parseHolo,
    parseHs: parse,
    parseHsPlus(code) {
      return new HoloScriptPlusParser().parse(code);
    },
  };
}

function collectFiles(searchRoots) {
  const files = [];

  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.(holo|hs|hsplus)$/i.test(entry)) {
        files.push(toRepoPath(full));
      }
    }
  }

  for (const root of searchRoots) {
    const full = fromRepoPath(root);
    if (existsSync(full)) {
      walk(full);
    }
  }

  return [...new Set(files)].sort((a, b) => a.localeCompare(b));
}

function discoverSearchRoots() {
  const roots = ['examples', 'docs/examples', 'samples'];
  const packagesDir = join(ROOT, 'packages');
  if (existsSync(packagesDir)) {
    for (const pkg of readdirSync(packagesDir)) {
      const examplesDir = ['packages', pkg, 'examples'].join('/');
      if (existsSync(fromRepoPath(examplesDir))) {
        roots.push(examplesDir);
      }
    }
  }
  return roots;
}

function normalizeError(error) {
  if (!error) return 'unknown parse error';
  if (typeof error === 'string') return error;
  const message = String(error.message || error.code || JSON.stringify(error));
  const code = error.code ? `${error.code}: ` : '';
  const line = error.line ?? error.loc?.line;
  const location = line ? ` (line ${line})` : '';
  return `${code}${message}${location}`;
}

function parseExampleDirect(repoPath, parsers) {
  try {
    const code = readFileSync(fromRepoPath(repoPath), 'utf8');
    const ext = repoPath.split('.').pop();
    let result;
    if (ext === 'holo') {
      result = parsers.parseHolo(code);
    } else if (ext === 'hsplus') {
      result = parsers.parseHsPlus(code);
    } else {
      result = parsers.parseHs(code);
    }

    const errors = Array.isArray(result?.errors) ? result.errors : [];
    const ok = result?.success !== false && errors.length === 0;
    return {
      ok,
      error: ok ? '' : normalizeError(errors[0]),
      errorCount: errors.length,
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error.message || error).split('\n')[0],
      errorCount: 1,
    };
  }
}

function loadMatrix() {
  const raw = JSON.parse(readFileSync(MATRIX_PATH, 'utf8'));
  const entries = Array.isArray(raw.examples) ? raw.examples : [];
  const problems = [];
  const byPath = new Map();

  for (const entry of entries) {
    if (!entry.path) {
      problems.push('Matrix entry missing path.');
      continue;
    }
    if (!ALLOWED_STATUSES.has(entry.status)) {
      problems.push(`${entry.path} has invalid status ${entry.status}.`);
    }
    if (byPath.has(entry.path)) {
      problems.push(`${entry.path} appears more than once in ${toRepoPath(MATRIX_PATH)}.`);
    }
    byPath.set(entry.path, entry);
  }

  return { raw, byPath, problems };
}

function parseExamples(files) {
  const batchSize = Number.parseInt(process.env.EXAMPLES_HEALTH_BATCH_SIZE || '20', 10);
  const results = new Map();

  function markBatchFailed(batch, error) {
    const stderr = String(error.stderr || '');
    const reason = stderr.includes('JavaScript heap out of memory')
      ? 'parser worker failed: JavaScript heap out of memory'
      : `parser worker failed: ${String(error.message || error).split('\n')[0]}`;
    for (const repoPath of batch) {
      results.set(repoPath, { ok: false, error: reason, errorCount: 1 });
    }
  }

  function parseBatch(batch) {
    try {
      const stdout = execFileSync(process.execPath, [SCRIPT_PATH, '--parse-batch'], {
        cwd: ROOT,
        encoding: 'utf8',
        input: JSON.stringify(batch),
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120000,
      });
      const parsed = JSON.parse(stdout);
      for (const [repoPath, result] of Object.entries(parsed)) {
        results.set(repoPath, result);
      }
    } catch (error) {
      if (batch.length === 1) {
        markBatchFailed(batch, error);
        return;
      }
      const midpoint = Math.ceil(batch.length / 2);
      parseBatch(batch.slice(0, midpoint));
      parseBatch(batch.slice(midpoint));
    }
  }

  for (let index = 0; index < files.length; index += batchSize) {
    parseBatch(files.slice(index, index + batchSize));
  }

  return results;
}

function classifyExamples(files, matrix, parseResults) {
  return files.map((repoPath) => {
    const parse = parseResults.get(repoPath) || {
      ok: false,
      error: 'missing parser worker result',
      errorCount: 1,
    };
    const override = matrix.byPath.get(repoPath);
    const status = override?.status || (parse.ok ? 'supported' : 'expected-fail');
    const reason = override?.reason || (parse.ok ? 'Parser success.' : parse.error);
    const format = `.${repoPath.split('.').pop()}`;

    return {
      path: repoPath,
      format,
      status,
      reason,
      priority: Boolean(override?.priority),
      linkPolicy: override?.linkPolicy || defaultLinkPolicy(status),
      parser: parse.ok ? 'pass' : 'fail',
      parserError: parse.error,
      parserErrorCount: parse.errorCount,
      manual: Boolean(override),
    };
  });
}

function defaultLinkPolicy(status) {
  if (status === 'supported') return 'public-supported';
  if (status === 'aspirational-grammar') return 'public-aspirational-label-required';
  if (status === 'deprecated') return 'archive-only';
  return 'internal-only';
}

function summarize(entries) {
  const summary = {};
  for (const status of ALLOWED_STATUSES) {
    summary[status] = { files: 0, parsePass: 0, parseFail: 0 };
  }
  for (const entry of entries) {
    summary[entry.status] ||= { files: 0, parsePass: 0, parseFail: 0 };
    summary[entry.status].files += 1;
    if (entry.parser === 'pass') summary[entry.status].parsePass += 1;
    else summary[entry.status].parseFail += 1;
  }
  return summary;
}

function validate(entries, matrix, files, renderedMarkdown) {
  const problems = [...matrix.problems];
  const warnings = [];

  for (const [repoPath, entry] of matrix.byPath) {
    if (!existsSync(fromRepoPath(repoPath))) {
      problems.push(`${repoPath} is listed in ${toRepoPath(MATRIX_PATH)} but was not found.`);
    }
    if (entry.status !== 'supported' && !entry.reason) {
      problems.push(`${repoPath} is ${entry.status} but has no reason.`);
    }
  }

  for (const entry of entries) {
    if (entry.status === 'supported' && entry.parser !== 'pass') {
      problems.push(`Supported example does not parse: ${entry.path} :: ${entry.parserError}`);
    }
    if (
      entry.manual &&
      (entry.status === 'aspirational-grammar' || entry.status === 'expected-fail') &&
      entry.parser === 'pass'
    ) {
      warnings.push(`${entry.path} now parses; consider promoting it to supported.`);
    }
  }

  if (shouldCheck) {
    if (!existsSync(MARKDOWN_PATH)) {
      problems.push(`${toRepoPath(MARKDOWN_PATH)} is missing; run with --write-markdown.`);
    } else {
      const current = readFileSync(MARKDOWN_PATH, 'utf8');
      if (current !== renderedMarkdown) {
        problems.push(`${toRepoPath(MARKDOWN_PATH)} is stale; run with --write-markdown.`);
      }
    }
  }

  return { problems, warnings };
}

function linkPolicyLabel(policy) {
  switch (policy) {
    case 'public-supported':
      return 'Public link OK';
    case 'public-aspirational-label-required':
      return 'Public link requires aspirational label';
    case 'archive-only':
      return 'Archive only';
    case 'internal-only':
    default:
      return 'Internal only until promoted';
  }
}

function statusLabel(status) {
  switch (status) {
    case 'supported':
      return 'supported';
    case 'aspirational-grammar':
      return 'aspirational grammar';
    case 'expected-fail':
      return 'expected-fail';
    case 'deprecated':
      return 'deprecated';
    default:
      return status;
  }
}

function md(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function renderMarkdown(entries, scanScope, summary) {
  const totals = entries.reduce(
    (acc, entry) => {
      acc.files += 1;
      if (entry.parser === 'pass') acc.parsePass += 1;
      else acc.parseFail += 1;
      return acc;
    },
    { files: 0, parsePass: 0, parseFail: 0 }
  );
  const priorityEntries = entries.filter((entry) => entry.priority);
  const rows = priorityEntries
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(
      (entry) =>
        `| \`${md(entry.path)}\` | ${entry.format} | ${statusLabel(entry.status)} | ${entry.parser} | ${md(entry.reason)} | ${linkPolicyLabel(entry.linkPolicy)} |`
    )
    .join('\n');

  const summaryRows = [...ALLOWED_STATUSES]
    .map((status) => {
      const item = summary[status] || { files: 0, parsePass: 0, parseFail: 0 };
      return `| ${statusLabel(status)} | ${item.files} | ${item.parsePass} | ${item.parseFail} |`;
    })
    .join('\n');

  return `# Examples Health Matrix

Generated from \`examples/examples-health.matrix.json\` by \`node scripts/examples-health-matrix.mjs --write-markdown\`.

## Status Definitions

| Status | Meaning | README/website posture |
| --- | --- | --- |
| supported | Parser returns \`success: true\` with no errors. | May be linked as a working example. |
| aspirational grammar | High-value story or target syntax ahead of the parser. | May be linked only when labeled aspirational. |
| expected-fail | Known parser failure with a reason. | Keep internal until promoted or explicitly discussed as failing. |
| deprecated | Retained for archive/history. | Do not feature as a current example. |

## Current Inventory

Scope: ${scanScope.map((root) => `\`${root}\``).join(', ')}

| Status | Files | Parse pass | Parse fail |
| --- | ---: | ---: | ---: |
${summaryRows}
| total | ${totals.files} | ${totals.parsePass} | ${totals.parseFail} |

The default gate covers the explicit health inventory. Use \`node scripts/examples-health-matrix.mjs --all --json\` for the expensive whole-corpus stress inventory; unlisted parser failures in that mode are classified as expected-fail with the parser's first error as the reason.

## Priority Matrix

| Example | Format | Status | Parser | Reason | Link posture |
| --- | --- | --- | --- | --- | --- |
${rows}

## Operational Check

\`node scripts/examples-health-matrix.mjs --check\` fails when:

- a supported example does not parse
- a non-supported manual entry has no reason
- a manual path no longer exists
- this generated markdown is stale
`;
}

function printSummary(summary, warnings, problems) {
  console.log('Examples health matrix');
  for (const status of ALLOWED_STATUSES) {
    const item = summary[status] || { files: 0, parsePass: 0, parseFail: 0 };
    console.log(
      `  ${statusLabel(status)}: ${item.files} files (${item.parsePass} parse pass, ${item.parseFail} parse fail)`
    );
  }
  for (const warning of warnings) {
    console.warn(`WARN ${warning}`);
  }
  for (const problem of problems) {
    console.error(`ERROR ${problem}`);
  }
}

function runParseBatch() {
  const parsers = loadCoreParser();
  const batch = JSON.parse(readFileSync(0, 'utf8'));
  const results = {};
  for (const repoPath of batch) {
    results[repoPath] = parseExampleDirect(repoPath, parsers);
  }
  process.stdout.write(`${JSON.stringify(results)}\n`);
}

function runMain() {
  const matrix = loadMatrix();
  const searchRoots = discoverSearchRoots();
  const files = [
    ...new Set([...(shouldScanAll ? collectFiles(searchRoots) : []), ...matrix.byPath.keys()]),
  ].sort((a, b) => a.localeCompare(b));
  const parseResults = parseExamples(files);
  const entries = classifyExamples(files, matrix, parseResults);
  const summary = summarize(entries);
  const scanScope = shouldScanAll ? searchRoots : [toRepoPath(MATRIX_PATH)];
  const renderedMarkdown = renderMarkdown(entries, scanScope, summary);
  const { problems, warnings } = validate(entries, matrix, files, renderedMarkdown);

  if (shouldWriteMarkdown) {
    mkdirSync(dirname(MARKDOWN_PATH), { recursive: true });
    writeFileSync(MARKDOWN_PATH, renderedMarkdown, 'utf8');
  }

  printSummary(summary, warnings, problems);

  if (shouldPrintJson) {
    process.stdout.write(
      `\n__EXAMPLES_HEALTH_MATRIX__\n${JSON.stringify({ summary, entries }, null, 2)}\n`
    );
  }

  process.exit(problems.length > 0 ? 1 : 0);
}

try {
  if (rawArgs[0] === '--parse-batch') {
    runParseBatch();
  } else {
    runMain();
  }
} catch (error) {
  console.error(`ERROR ${error.message || error}`);
  process.exit(1);
}
