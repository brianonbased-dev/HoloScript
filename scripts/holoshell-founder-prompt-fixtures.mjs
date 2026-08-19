#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.founder-prompt-fixtures.v0.1.0';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = path.join('.tmp', 'holoshell', 'founder-prompt-fixtures.json');
const DEFAULT_LIMIT = 48;
const DEFAULT_MAX_FILES = 420;
const DEFAULT_MAX_FILE_BYTES = 160_000;

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    limit: DEFAULT_LIMIT,
    maxFiles: DEFAULT_MAX_FILES,
    maxFileBytes: DEFAULT_MAX_FILE_BYTES,
    sourceRoots: [],
    includeKnowledgeSearch: false,
    json: false,
    check: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out' || arg === '--output') args.output = argv[++index];
    else if (arg === '--limit') args.limit = Number(argv[++index]);
    else if (arg === '--max-files') args.maxFiles = Number(argv[++index]);
    else if (arg === '--max-file-bytes') args.maxFileBytes = Number(argv[++index]);
    else if (arg === '--source' || arg === '--source-root') args.sourceRoots.push(argv[++index]);
    else if (arg === '--include-knowledge-search') args.includeKnowledgeSearch = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--check') args.check = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.limit) || args.limit < 1) args.limit = DEFAULT_LIMIT;
  if (!Number.isFinite(args.maxFiles) || args.maxFiles < 1) args.maxFiles = DEFAULT_MAX_FILES;
  if (!Number.isFinite(args.maxFileBytes) || args.maxFileBytes < 1024) args.maxFileBytes = DEFAULT_MAX_FILE_BYTES;
  return args;
}

function printHelp() {
  console.log(`HoloShell founder prompt fixture generator

Usage:
  node scripts/holoshell-founder-prompt-fixtures.mjs [options]

Options:
  --out <path>                    Output JSON. Defaults to .tmp/holoshell/founder-prompt-fixtures.json.
  --source <path>                 Add a source root or file. Repeatable. Defaults to HoloLand, ai-ecosystem, local knowledge, and memory.
  --limit <n>                     Maximum fixture count. Defaults to ${DEFAULT_LIMIT}.
  --max-files <n>                 Maximum Markdown/HoloScript/NDJSON files to scan. Defaults to ${DEFAULT_MAX_FILES}.
  --max-file-bytes <n>            Skip larger files. Defaults to ${DEFAULT_MAX_FILE_BYTES}.
  --include-knowledge-search      Best-effort live HoloMesh knowledge search; local mirrors are always preferred.
  --check                         Validate an existing output path against a freshly generated corpus hash.
  --json                          Print the receipt JSON.
  -h, --help                      Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function normalizePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

function stableId(prefix, text) {
  return `${prefix}_${sha256(text).slice(0, 12)}`;
}

function truncate(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

function fileExists(filePath) {
  try {
    return existsSync(filePath);
  } catch {
    return false;
  }
}

function defaultSources() {
  const home = os.homedir();
  const ecosystemRoot = process.env.AI_ECOSYSTEM_ROOT || path.join(home, '.ai-ecosystem');
  const memoryRoot = process.env.FOUNDER_MEMORY_ROOT || path.join(home, '.claude', 'projects', 'C--Users-josep--ai-ecosystem', 'memory');
  return [
    {
      label: 'hololand',
      kind: 'documentation',
      root: REPO_ROOT,
      include: ['NORTH_STAR.md', 'docs', 'apps/holoshell/source', 'apps/holoshell/docs'],
    },
    {
      label: 'ai-ecosystem-docs',
      kind: 'documentation',
      root: ecosystemRoot,
      include: ['INTENT.md', 'NORTH_STAR.md', 'SYSTEM_MAP.md', 'STRATEGY.md', 'docs', 'registry', 'research', 'memory'],
    },
    {
      label: 'ai-ecosystem-knowledge',
      kind: 'knowledge',
      root: path.join(ecosystemRoot, 'knowledge'),
    },
    {
      label: 'knowledge-mirror',
      kind: 'knowledge',
      root: path.join(ecosystemRoot, '.knowledge-mirror', 'knowledge.ndjson'),
    },
    {
      label: 'founder-memory',
      kind: 'memory',
      root: memoryRoot,
    },
  ];
}

function sourceFromUserPath(sourcePath, index) {
  const resolved = resolveRepoPath(sourcePath);
  const normalized = normalizePath(resolved).toLowerCase();
  const base = path.basename(resolved).toLowerCase();
  let kind = 'documentation';
  if (normalized.includes('/memory/') || base === 'memory') kind = 'memory';
  if (normalized.includes('/knowledge') || base === 'knowledge' || normalized.endsWith('knowledge.ndjson')) kind = 'knowledge';
  return {
    label: `source-${index + 1}`,
    kind,
    root: resolved,
  };
}

function shouldSkipDir(name) {
  return new Set([
    '.git',
    'node_modules',
    'dist',
    'build',
    '.tmp',
    '.scratch',
    '.bench-logs',
    'render-output',
    'screenshots',
    '__pycache__',
  ]).has(name);
}

function shouldReadFile(filePath) {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith('.md') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.json') ||
    lower.endsWith('.ndjson') ||
    lower.endsWith('.holo') ||
    lower.endsWith('.hs') ||
    lower.endsWith('.hsplus')
  );
}

function walkFiles(root, maxFiles, maxFileBytes) {
  const files = [];
  const queue = [root];
  while (queue.length && files.length < maxFiles) {
    const current = queue.shift();
    let stat;
    try {
      stat = statSync(current);
    } catch {
      continue;
    }
    if (stat.isFile()) {
      if (shouldReadFile(current) && stat.size <= maxFileBytes) files.push(current);
      continue;
    }
    if (!stat.isDirectory()) continue;
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isDirectory() && shouldSkipDir(entry.name)) continue;
      queue.push(path.join(current, entry.name));
    }
  }
  return files;
}

function filesForSource(source, args) {
  const root = resolveRepoPath(source.root);
  if (!fileExists(root)) return [];
  if (statSync(root).isFile()) return shouldReadFile(root) ? [root] : [];
  if (!source.include?.length) return walkFiles(root, args.maxFiles, args.maxFileBytes);
  const files = [];
  for (const item of source.include) {
    const target = path.join(root, item);
    if (!fileExists(target)) continue;
    const stat = statSync(target);
    if (stat.isFile() && shouldReadFile(target) && stat.size <= args.maxFileBytes) files.push(target);
    if (stat.isDirectory()) files.push(...walkFiles(target, Math.max(1, args.maxFiles - files.length), args.maxFileBytes));
    if (files.length >= args.maxFiles) break;
  }
  return files.slice(0, args.maxFiles);
}

function isSecretLike(text) {
  return /\b(api[_-]?key|token|secret|password|private key|seed phrase|mnemonic|bearer|authorization|auth\.json|\.env)\b/i.test(text);
}

function isMostlyNoise(text) {
  const clean = String(text || '').trim();
  if (clean.length < 28 || clean.length > 260) return true;
  if (/^[-|:*\s]+$/.test(clean)) return true;
  if (/^(import|export|const|let|function|class)\b/.test(clean)) return true;
  if (/https?:\/\/\S{20,}/i.test(clean)) return true;
  return false;
}

function cleanMarkdownLine(line) {
  return String(line || '')
    .replace(/^\s{0,4}>\s?/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+\.\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[[^\]]+\]\([^)]+\)/g, (match) => match.replace(/\[|\]\([^)]+\)/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractQuotedSegments(line) {
  const segments = [];
  const patterns = [/"([^"]{24,220})"/g, /'([^']{24,220})'/g];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(line))) {
      segments.push(match[1]);
    }
  }
  return segments;
}

function linePriority(text, sourceKind, sourceRef) {
  const haystack = `${text} ${sourceRef}`.toLowerCase();
  let score = 0;
  const weights = [
    ['brittney', 7],
    ['holoshell', 6],
    ['holoscript', 5],
    ['hololand', 4],
    ['founder', 4],
    ['joseph', 4],
    ['verbatim', 4],
    ['vision', 3],
    ['mission', 3],
    ['sovereign', 3],
    ['jetson', 3],
    ['agent', 2],
    ['world', 2],
    ['operate', 2],
    ['receipt', 2],
  ];
  for (const [needle, value] of weights) {
    if (haystack.includes(needle)) score += value;
  }
  if (sourceKind === 'memory') score += 4;
  if (sourceKind === 'knowledge') score += 3;
  if (/\/user_/i.test(sourceRef)) score += 8;
  if (/\/direction_/i.test(sourceRef)) score += 6;
  if (/\/feedback_/i.test(sourceRef)) score += 4;
  if (/^"/.test(text) || /\bfounder[:,]?\b/i.test(text)) score += 3;
  return score;
}

function sourceRefFor(source, filePath) {
  const root = statSync(resolveRepoPath(source.root)).isFile() ? path.dirname(resolveRepoPath(source.root)) : resolveRepoPath(source.root);
  const rel = normalizePath(path.relative(root, filePath));
  return `${source.label}/${rel}`;
}

function extractFromText({ text, source, sourceRef, sourceKind, sourceId = '', startingLine = 1 }) {
  const candidates = [];
  const lines = String(text || '').split(/\r?\n/);
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const quoted = extractQuotedSegments(raw);
    const cleaned = cleanMarkdownLine(raw);
    const lineNo = startingLine + index;
    const sourceText = quoted.length ? quoted : [cleaned];

    for (const segment of sourceText) {
      const excerpt = truncate(cleanMarkdownLine(segment), 220);
      if (isMostlyNoise(excerpt) || isSecretLike(excerpt)) continue;
      const hasFounderSignal =
        /^\s{0,4}>/.test(raw) ||
        /\b(founder|joseph|verbatim|direction|vision|mission|brittney|holoshell|holoscript|sovereign|jetson)\b/i.test(`${raw} ${sourceRef}`);
      if (!hasFounderSignal && sourceKind !== 'memory') continue;

      const score = linePriority(excerpt, sourceKind, sourceRef);
      if (score < 4) continue;
      const fixturePrompt = `Use this founder-language anchor as inspiration, not as copy text: "${excerpt}"\n\nBrittney, answer inside HoloShell with one receipt-aware next step that honors this direction.`;
      candidates.push({
        id: stableId('founder_prompt', `${sourceRef}:${lineNo}:${excerpt}`),
        sourceKind,
        sourceLabel: source.label,
        sourceRef,
        sourceId,
        sourceLine: lineNo,
        quoteHash: sha256(excerpt),
        inspiration: excerpt,
        testPrompt: fixturePrompt,
        priority: score,
      });
    }
  }
  return candidates;
}

function extractNdjson(source, filePath, args) {
  let text = '';
  try {
    const stat = statSync(filePath);
    if (stat.size > Math.max(args.maxFileBytes, 12_000_000)) return [];
    text = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const candidates = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].trim();
    if (!raw) continue;
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch {
      continue;
    }
    const content = String(entry.content || entry.text || entry.summary || '');
    if (!content) continue;
    if (!/\b(founder|joseph|brittney|holoshell|holoscript|hololand|sovereign|jetson|agent|world)\b/i.test(content)) continue;
    const sourceRef = `${source.label}/${entry.id || `line-${index + 1}`}`;
    candidates.push(...extractFromText({
      text: content,
      source,
      sourceRef,
      sourceKind: source.kind,
      sourceId: entry.id || '',
      startingLine: index + 1,
    }));
  }
  return candidates;
}

function extractFromFile(source, filePath, args) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.ndjson')) return extractNdjson(source, filePath, args);
  let text = '';
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  return extractFromText({
    text,
    source,
    sourceRef: sourceRefFor(source, filePath),
    sourceKind: source.kind,
  });
}

function dedupeAndRank(candidates, limit) {
  const byHash = new Map();
  for (const candidate of candidates) {
    const key = candidate.quoteHash;
    const existing = byHash.get(key);
    if (!existing || candidate.priority > existing.priority) byHash.set(key, candidate);
  }
  const ranked = [...byHash.values()].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.sourceRef.localeCompare(b.sourceRef);
    });

  const selected = [];
  const selectedIds = new Set();
  const sourceKinds = [...new Set(ranked.map((candidate) => candidate.sourceKind))].sort();
  const minimumPerKind = Math.min(4, Math.max(1, Math.floor(limit / 12)));
  for (const sourceKind of sourceKinds) {
    for (const candidate of ranked.filter((item) => item.sourceKind === sourceKind).slice(0, minimumPerKind)) {
      if (selected.length >= limit || selectedIds.has(candidate.id)) continue;
      selected.push(candidate);
      selectedIds.add(candidate.id);
    }
  }
  for (const candidate of ranked) {
    if (selected.length >= limit) break;
    if (selectedIds.has(candidate.id)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.id);
  }

  return selected
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.sourceRef.localeCompare(b.sourceRef);
    })
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function runKnowledgeSearchIfRequested(args) {
  if (!args.includeKnowledgeSearch) return { status: 'not_requested', items: [] };
  const script = path.join(os.homedir(), '.ai-ecosystem', 'scripts', 'room-knowledge-search.mjs');
  if (!fileExists(script)) return { status: 'missing_script', items: [] };
  try {
    const stdout = execFileSync(process.execPath, [script, 'Brittney founder HoloShell'], {
      cwd: path.dirname(script),
      encoding: 'utf8',
      timeout: 20_000,
      windowsHide: true,
    });
    return { status: 'ok', items: stdout.split(/\r?\n/).filter(Boolean).slice(0, 20) };
  } catch (error) {
    return { status: `unavailable:${error.status || 'error'}`, items: [] };
  }
}

function buildReceipt(args) {
  const sources = args.sourceRoots.length
    ? args.sourceRoots.map((sourcePath, index) => sourceFromUserPath(sourcePath, index))
    : defaultSources();
  const existingSources = sources.filter((source) => fileExists(resolveRepoPath(source.root)));
  const missingSources = sources.filter((source) => !fileExists(resolveRepoPath(source.root))).map((source) => ({
    label: source.label,
    kind: source.kind,
    root: normalizePath(source.root),
  }));

  const files = [];
  const candidates = [];
  for (const source of existingSources) {
    const sourceFiles = filesForSource(source, args).slice(0, args.maxFiles);
    for (const filePath of sourceFiles) {
      files.push({
        sourceLabel: source.label,
        sourceKind: source.kind,
        sourceRef: sourceRefFor(source, filePath),
      });
      candidates.push(...extractFromFile(source, filePath, args));
    }
  }

  const fixtures = dedupeAndRank(candidates, args.limit);
  const sourceKinds = [...new Set(fixtures.map((item) => item.sourceKind))].sort();
  const corpusHash = sha256(JSON.stringify(fixtures.map((item) => ({
    sourceRef: item.sourceRef,
    sourceLine: item.sourceLine,
    quoteHash: item.quoteHash,
    testPrompt: item.testPrompt,
  }))));
  const knowledgeSearch = runKnowledgeSearchIfRequested(args);

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-founder-prompt-fixtures.hsplus',
      adapterScript: 'scripts/holoshell-founder-prompt-fixtures.mjs',
      runtimeBridge: 'scripts/holoshell-brittney-turn.mjs',
      runtimeFixture: '.tmp/holoshell/founder-prompt-fixtures.json',
    },
    policy: {
      purpose: 'local_brittney_backend_test_prompts',
      trainingCorpus: false,
      rawSecretsIncluded: false,
      deployedToJetson: 'fixture_json_only',
      quoteHandling: 'short_local_excerpts_with_hashes_and_source_refs',
    },
    sourceSummary: {
      configuredSourceCount: sources.length,
      existingSourceCount: existingSources.length,
      missingSources,
      scannedFileCount: files.length,
      candidateCount: candidates.length,
      fixtureCount: fixtures.length,
      sourceKinds,
      corpusHash,
      knowledgeSearchStatus: knowledgeSearch.status,
    },
    fixtures,
  };
}

function writeJson(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return resolved;
}

function checkExisting(outputPath, nextReceipt) {
  const resolved = resolveRepoPath(outputPath);
  if (!fileExists(resolved)) throw new Error(`Fixture output missing: ${resolved}`);
  const existing = JSON.parse(readFileSync(resolved, 'utf8'));
  if (existing.schemaVersion !== SCHEMA_VERSION) throw new Error(`schemaVersion mismatch in ${resolved}`);
  if (!Array.isArray(existing.fixtures) || existing.fixtures.length === 0) throw new Error(`no fixtures in ${resolved}`);
  if (existing.sourceSummary?.corpusHash !== nextReceipt.sourceSummary.corpusHash) {
    throw new Error(`fixture corpus hash is stale: ${existing.sourceSummary?.corpusHash || 'missing'} != ${nextReceipt.sourceSummary.corpusHash}`);
  }
}

export {
  SCHEMA_VERSION,
  buildReceipt,
  cleanMarkdownLine,
  dedupeAndRank,
  extractFromText,
  linePriority,
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const receipt = buildReceipt(args);
    if (args.check) {
      checkExisting(args.output, receipt);
    } else {
      writeJson(args.output, receipt);
    }
    if (args.json) console.log(JSON.stringify(receipt, null, 2));
    else {
      console.log(`HoloShell founder prompt fixtures: ${resolveRepoPath(args.output)}`);
      console.log(`Fixtures: ${receipt.sourceSummary.fixtureCount}`);
      console.log(`Corpus: ${receipt.sourceSummary.corpusHash}`);
    }
    if (receipt.sourceSummary.fixtureCount === 0) {
      throw new Error('No founder prompt fixtures were generated from the configured sources.');
    }
  } catch (error) {
    console.error(`holoshell-founder-prompt-fixtures failed: ${error.message}`);
    process.exit(1);
  }
}
