import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

export const HOLOSYSTEM_SOURCE_CANON_SCHEMA = 'holoscript.holosystem.source-canon.v1';
export const HOLOSCRIPT_CANONICAL_SOURCE_EXTENSIONS = Object.freeze([
  '.holo',
  '.hs',
  '.hsplus',
]);

const KNOWN_OPTIONS = new Set(['repository', 'trackedFiles', 'now']);
const PORTABLE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/iu;

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireKnownOptions(value) {
  for (const key of Object.keys(value)) {
    if (!KNOWN_OPTIONS.has(key)) throw new TypeError(`Unknown source-canon option ${key}.`);
  }
}

function normalizeRepository(value = {}) {
  if (!isRecord(value)) throw new TypeError('repository must be an object.');
  const id = value.id ?? 'workspace';
  const head = value.head ?? null;
  if (!PORTABLE_ID.test(id)) throw new TypeError('repository.id must be a portable identifier.');
  if (head !== null && (typeof head !== 'string' || !/^[a-f0-9]{7,64}$/iu.test(head))) {
    throw new TypeError('repository.head must be a Git object id or null.');
  }
  return { id, head };
}

function normalizeTrackedPath(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 512 ||
    /[\0-\x1f\x7f]/u.test(value) ||
    /^[A-Za-z]:[\\/]/u.test(value) ||
    /^(?:[\\/]{1,2}|~[\\/])/u.test(value)
  ) {
    throw new TypeError(`${String(value)} is not a portable repository-relative path.`);
  }
  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (
    segments.some((segment) => segment === '' || segment === '.' || segment === '..') ||
    normalized.startsWith('.//')
  ) {
    throw new TypeError(`${value} is not a portable repository-relative path.`);
  }
  return normalized;
}

function sourceExtension(path) {
  return HOLOSCRIPT_CANONICAL_SOURCE_EXTENSIONS.find((extension) => path.endsWith(extension)) ?? null;
}

function foreignExtension(path) {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const index = name.lastIndexOf('.');
  return index <= 0 ? '<none>' : name.slice(index).toLowerCase();
}

function buildSourceCanonReport(options, { sources = {}, parser = null } = {}) {
  const repository = normalizeRepository(options.repository);
  if (options.trackedFiles !== undefined && !Array.isArray(options.trackedFiles)) {
    throw new TypeError('trackedFiles must be an array.');
  }

  const files = (options.trackedFiles ?? []).map(normalizeTrackedPath).sort();
  if (new Set(files).size !== files.length) throw new TypeError('trackedFiles must be unique.');

  const generatedAt = new Date(options.now ?? Date.now());
  if (Number.isNaN(generatedAt.getTime())) throw new TypeError('now must be a valid date.');

  const holoScriptFiles = [];
  const foreignFiles = [];
  const byFormat = Object.fromEntries(
    HOLOSCRIPT_CANONICAL_SOURCE_EXTENSIONS.map((extension) => [extension, 0])
  );
  const foreignByFormat = {};

  for (const path of files) {
    const extension = sourceExtension(path);
    if (extension) {
      holoScriptFiles.push(path);
      byFormat[extension] += 1;
      continue;
    }
    foreignFiles.push(path);
    const foreign = foreignExtension(path);
    foreignByFormat[foreign] = (foreignByFormat[foreign] ?? 0) + 1;
  }

  const issues = foreignFiles.map((path) => ({
    code: 'foreign-source-format',
    path,
    message: 'Git-tracked canon must be authored in a parser-owned HoloScript source format.',
  }));
  if (holoScriptFiles.length === 0) {
    issues.unshift({
      code: 'holoscript-source-missing',
      path: '$',
      message: 'At least one Git-tracked .holo, .hs, or .hsplus source file is required.',
    });
  }

  for (const path of Object.keys(sources)) {
    const normalized = normalizeTrackedPath(path);
    if (!holoScriptFiles.includes(normalized)) {
      throw new TypeError(`Source ${path} is not a tracked canonical HoloScript path.`);
    }
    if (typeof sources[path] !== 'string') {
      throw new TypeError(`Source ${path} must be a string.`);
    }
  }

  const parseChecks = holoScriptFiles.map((path) => {
    const source = sources[path];
    if (typeof parser !== 'function' || typeof source !== 'string') {
      issues.push({
        code: 'holoscript-parse-evidence-missing',
        path,
        message:
          'Canonical source requires repository-owned bytes and a real @holoscript/core parse result.',
      });
      return {
        path,
        status: 'not-run',
        sourceDigest: typeof source === 'string' ? sha256(source) : null,
        errors: [],
      };
    }
    let parsed;
    try {
      parsed = parser(source);
    } catch (error) {
      parsed = {
        success: false,
        errors: [{ code: 'parser-threw', message: error?.message ?? String(error) }],
      };
    }
    const errors = (Array.isArray(parsed?.errors) ? parsed.errors : []).slice(0, 8).map((error) => ({
      code: error?.code ?? null,
      message: error?.message ?? String(error),
      line: Number.isInteger(error?.line) ? error.line : null,
      column: Number.isInteger(error?.column) ? error.column : null,
    }));
    const passed = parsed?.success === true && errors.length === 0;
    if (!passed) {
      issues.push({
        code: 'holoscript-source-invalid',
        path,
        message: 'Canonical source did not pass @holoscript/core.parse.',
      });
    }
    return {
      path,
      status: passed ? 'passed' : 'failed',
      sourceDigest: sha256(source),
      errors,
    };
  });

  const formatVerified = holoScriptFiles.length > 0 && foreignFiles.length === 0;
  const parserVerified =
    holoScriptFiles.length > 0 && parseChecks.every((item) => item.status === 'passed');
  const verified = formatVerified && parserVerified && issues.length === 0;
  const stableReceipt = {
    schema: HOLOSYSTEM_SOURCE_CANON_SCHEMA,
    scope: 'git-tracked-canon',
    repository,
    formatRegistry: [...HOLOSCRIPT_CANONICAL_SOURCE_EXTENSIONS],
    trackedFiles: files,
    holoScriptFiles,
    foreignFiles,
    parseChecks,
    formatVerified,
    parserVerified,
  };

  return {
    schema: HOLOSYSTEM_SOURCE_CANON_SCHEMA,
    generatedAt: generatedAt.toISOString(),
    status: verified ? 'verified' : 'blocked',
    verified,
    formatVerified,
    parserVerified,
    scope: 'git-tracked-canon',
    repository,
    formatRegistry: {
      owner: '@holoscript/holosystem',
      extensions: [...HOLOSCRIPT_CANONICAL_SOURCE_EXTENSIONS],
      callerExtensionsAccepted: false,
      rule: 'New canonical extensions require a parser-owned HoloScript release; callers cannot widen the registry.',
    },
    summary: {
      trackedFiles: files.length,
      holoScriptFiles: holoScriptFiles.length,
      foreignFiles: foreignFiles.length,
      parsePassed: parseChecks.filter((item) => item.status === 'passed').length,
      parseFailed: parseChecks.filter((item) => item.status === 'failed').length,
      parseMissing: parseChecks.filter((item) => item.status === 'not-run').length,
      byFormat,
      foreignByFormat: Object.fromEntries(Object.entries(foreignByFormat).sort()),
    },
    holoScriptFiles,
    foreignFiles,
    parseChecks,
    issues,
    boundaries: {
      untrackedRuntimeIsCanon: false,
      dependencyCachesAreCanon: false,
      generatedArtifactsAreCanonOnlyWhenTracked: true,
      extensionOnlyClaimsAccepted: false,
    },
    receiptHash: sha256(JSON.stringify(stableReceipt)),
  };
}

export function inspectSourceCanon(options = {}) {
  if (!isRecord(options)) throw new TypeError('source-canon options must be an object.');
  requireKnownOptions(options);
  return buildSourceCanonReport(options);
}

function runGit(rootDirectory, args) {
  const result = spawnSync('git', ['-C', rootDirectory, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`Git ${args.join(' ')} failed: ${String(result.stderr || '').trim()}`);
  }
  return result.stdout;
}

export async function inspectGitTrackedSourceCanon({ rootDirectory = process.cwd(), now } = {}) {
  const root = resolve(rootDirectory);
  const repositoryRoot = resolve(runGit(root, ['rev-parse', '--show-toplevel']).trim());
  if (repositoryRoot.toLowerCase() !== root.toLowerCase()) {
    throw new Error('source-canon must run from the repository root.');
  }
  const idCandidate = basename(root).toLowerCase();
  const repository = {
    id: PORTABLE_ID.test(idCandidate) ? idCandidate : 'workspace',
    head: runGit(root, ['rev-parse', 'HEAD']).trim(),
  };
  const trackedFiles = runGit(root, ['ls-files', '-z'])
    .split('\0')
    .filter(Boolean);
  const sources = Object.fromEntries(
    trackedFiles
      .map(normalizeTrackedPath)
      .filter((path) => sourceExtension(path))
      .map((path) => [path, readFileSync(resolve(root, path), 'utf8')])
  );
  let parser = null;
  try {
    const core = await import('@holoscript/core');
    if (typeof core.parse === 'function') parser = core.parse;
  } catch {
    // The report fails closed with parse-evidence-missing issues below.
  }
  return buildSourceCanonReport({ repository, trackedFiles, now }, { sources, parser });
}

export function renderSourceCanonProjection(report) {
  if (!isRecord(report) || report.schema !== HOLOSYSTEM_SOURCE_CANON_SCHEMA) {
    throw new TypeError(`Expected ${HOLOSYSTEM_SOURCE_CANON_SCHEMA}.`);
  }
  return `composition "HoloSystemSourceCanon" {
  state {
    status: "${report.status}"
    verified: ${report.verified}
    formatVerified: ${report.formatVerified}
    parserVerified: ${report.parserVerified}
    scope: "${report.scope}"
    trackedFiles: ${report.summary.trackedFiles}
    holoScriptFiles: ${report.summary.holoScriptFiles}
    foreignFiles: ${report.summary.foreignFiles}
    holoFiles: ${report.summary.byFormat['.holo']}
    hsFiles: ${report.summary.byFormat['.hs']}
    hsplusFiles: ${report.summary.byFormat['.hsplus']}
    parsePassed: ${report.summary.parsePassed}
    parseFailed: ${report.summary.parseFailed}
    parseMissing: ${report.summary.parseMissing}
    receiptHash: "${report.receiptHash}"
  }

  object "LanguageSovereignty" {
    canonicalFormats: ".holo,.hs,.hsplus"
    callerExtensionsAccepted: false
    migrationRequired: ${!report.verified}
  }
}
`;
}
