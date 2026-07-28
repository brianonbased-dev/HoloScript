#!/usr/bin/env node
/**
 * scripts/check-package-public-consumption.mjs
 *
 * The public-consumption RATCHET (F.147 "easiest failure = packages exist but no
 * ratchet keeps them honest"; D.124 publishing = compounding refinement).
 *
 * The bar: what a competitor actually delivers to users. A public `@holoscript/*`
 * package must (a) NOT leak private process into the published tarball, and (b) be
 * installable by a cold consumer with a real README, license, and clean boundary.
 * This gate is re-runnable, so the leaks we hand-fix once cannot silently creep back.
 *
 * For each package it:
 *   1. resolves the ACTUAL published fileset via `npm pack --dry-run --json`
 *   2. scans every included file's CONTENT for private-process leaks
 *   3. checks package.json completeness (license, access, files, entrypoint, metadata)
 *   4. checks the README carries an install path, usage example, and consumption contract
 *   5. checks the tarball boundary (no ../, no .scratch/, LICENSE present)
 *
 * BLOCKER findings fail the gate (exit 1); WARN findings surface but do not block.
 *
 * Usage:
 *   node scripts/check-package-public-consumption.mjs --package <dir> [--package <dir> ...] [--json]
 *   node scripts/check-package-public-consumption.mjs            # default: configured package set
 *
 * A package dir may be absolute when supplied by --package or env.
 */
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// HoloScript port of ai-ecosystem/scripts/check-package-public-consumption.mjs. Keep the leak
// patterns + secret/README-contract logic in LOCKSTEP with that file (the shared tuned ratchet);
// only the package DISCOVERY below is HoloScript-specific. The gate is at scripts/holo-ci/, so the
// repo root is two levels up.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

function uniqueExisting(paths) {
  return [...new Set(paths.filter(Boolean).map((p) => path.resolve(p)))].filter((p) =>
    fs.existsSync(p)
  );
}

// Every publishable (private !== true) package under packages/* is in scope — a package only
// leaves the public surface by setting `private: true`, so new packages are covered automatically.
function firstPartyNpmPackages() {
  const pkgsDir = path.join(ROOT, 'packages');
  if (!fs.existsSync(pkgsDir)) return [];
  return uniqueExisting(
    fs.readdirSync(pkgsDir).map((name) => {
      const pj = path.join(pkgsDir, name, 'package.json');
      if (!fs.existsSync(pj)) return null;
      try {
        return JSON.parse(fs.readFileSync(pj, 'utf8')).private === true
          ? null
          : path.join(pkgsDir, name);
      } catch {
        return null;
      }
    })
  );
}

function defaultPackages() {
  return firstPartyNpmPackages();
}

function firstPartyPythonPackages() {
  return []; // HoloScript ships no first-party PyPI packages.
}

// Private-process leaks: the F.147 "dangerous failure" class. A published public
// tarball that carries any of these has leaked founder/machine/private-repo context.
const LEAK_PATTERNS = [
  {
    id: 'private-lan-ip',
    re: /\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/u,
    note: 'private LAN IP',
  },
  {
    id: 'founder-host',
    re: /\bholojetson\b|holo-app-pg|holokey-pg/u,
    note: 'founder container/host name',
  },
  // The Windows separator run is [\\/]+ (not a single \\) so an ESCAPED path in a JSON/.holo
  // string literal — where "C:\\Users\\josep" is stored as C:\\\\Users\\\\josep on disk — is
  // still caught. A single-backslash pattern silently missed profiles/laptop-windows.holo.
  {
    id: 'founder-path',
    re: /\/mnt\/nvme|C:[\\/]+Users[\\/]+[Jj]osep|\/home\/(?:username|[Jj]osep)\b/u,
    note: 'founder machine path',
  },
  {
    id: 'private-ops',
    re: /\bsudo\s+docker\b|holoscript_app/u,
    note: 'private operator command / superuser role',
  },
  {
    id: 'private-workspace-default',
    re: /['"`]ai-ecosystem['"`]/u,
    note: "founder workspace ('ai-ecosystem') baked as a value",
  },
  {
    id: 'private-repo-doc-ref',
    re: /ai-ecosystem\/(?:research|docs|memory|config)\//u,
    note: 'private-repo path in shipped docs',
  },
  {
    id: 'founder-port-mapping',
    re: /\b543[34]\b/u,
    note: 'non-standard founder docker port (5433/5434)',
  },
  {
    id: 'secret-literal',
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_-]?key|password|secret|token)\s*[:=]\s*['"][^'"\s]{8,}['"]/iu,
    note: 'possible embedded secret',
  },
];

const README_CONSUMPTION_RULES = [
  {
    kind: 'readme-no-consumer-audience',
    note: 'README must name the external/public consumer, operator, founder, or agent-framework audience',
    re: /\b(?:external|public|consumer|operator|founder|agent framework|agent frameworks|agent-family|cold consumer)\b/iu,
  },
  {
    kind: 'readme-no-caller-owned-config',
    note: 'README must state that callers/operators bring their own config, credentials, storage, or adapters',
    re: /\b(?:bring your own|caller[- ]owned|caller[- ]provided|operator[- ]owned|you own|point it at|provided by the caller|from your own|configured by the operator|supplied files|supplied config|environment variables|env)\b/iu,
  },
  {
    kind: 'readme-no-local-boundary',
    note: 'README must separate package contract from founder-local/private/hardware-specific adapters',
    re: /\b(?:does not ship|doesn't ship|not ship|not assume|no .*assumed|no .*default|founder[- ]local|private workspace|private process|private repo|local adapter|package boundary|release boundary|not the package default|not package default)\b/iu,
  },
  {
    kind: 'readme-no-operability-process',
    note: 'README must give an agent/founder-operable process signal such as --json, doctor, validation, receipt, gate, or report',
    re: /\b(?:--json|doctor|validation|validate|receipt|receipts|gate|check:|report|dry-run|dry run)\b/iu,
  },
  {
    kind: 'readme-no-release-risk',
    note: 'README must state release/risk posture: v0/v1 label, support boundary, known limitations, rollback, preview, or unsupported behavior',
    re: /\b(?:v0-preview|v0-internal|v1-public|v1-private|v1-protocol|release boundary|support boundary|known limitation|known limitations|limitation|limitations|rollback|preview|unsupported|not-yet-trusted|not yet trusted)\b/iu,
  },
];

const SECRET_IDENTIFIER_RE = /\b(?:api[_-]?key|apikey|password|secret|token|authorization)\b/iu;
// Matching quote pair (backreference) — a mixed-quote one-liner like a documented shell/node command
// otherwise lets the scanner span mismatched quotes and capture a raw CODE fragment (",c=>b+=c).on(")
// whose operator chars read as entropy. Group 2 is the literal.
const SECRET_LITERAL_RE = /(['"])([^'"\s]{8,})\1/gu;
const SECRET_PLACEHOLDER_RE =
  /^(?:<redacted>|redacted|\$?\d*redacted|process\.env\.[A-Z0-9_]+|[A-Z0-9_]*?(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*|YOUR[_-][A-Z0-9_-]+|example(?:[_-]?(?:key|token|secret|password))?|test(?:[_-]?(?:key|token|secret|password))?|env-or-secret-provider|secret-provider|credential-provider|vault|changeme|placeholder)$/iu;

// Schema ids ("holoscript.secret-store.file.v1") and event names ("secret:added") are lowercase,
// separator-joined readable tokens — not credentials. Case-SENSITIVE on purpose: a mixed-case or
// high-entropy secret (JWT, base64/hex key) has uppercase or non-word chars and never matches, so a
// real leaked secret is still caught. This clears the ratchet's known false-positive on constants
// whose *name* contains "secret"/"token" but whose *value* is a namespace/event identifier.
function isStructuredIdentifier(value) {
  return (
    /^[a-z][a-z0-9_]*(?:\.[a-z0-9_-]+){2,}$/.test(value) || // dotted namespace: a.b.c(.d…)
    /^[a-z][a-z0-9_]*(?::[a-z0-9_]+)+$/.test(value) || // colon event: word:snake_word(:word…)
    /^\.[\w.-]+$/.test(value) // leading-dot filename/dotfile (".holoscript-token"); real secrets never start with "."
  );
}

// A quoted literal that IS a source identifier / name / URL — NOT a credential value. Compiled
// bundles put property names, enum/token-type constants, HTTP header names, event names, URLs, and
// MIME types as string literals right next to the words token/secret/key, which the secret-literal
// SHAPE heuristic otherwise flags (the entire FP class W.808 warns about, and every one of the 26
// hits triaged under task_1783802580085 — e.g. "on_unknown", "X-API-Key", "tokenUrl", "vault_full",
// "/oauth/token", "application/json", "IDENTIFIER", "lm-studio", "mock-key",
// "dev-secret-change-in-production"). Every branch is letter-dominant / structurally recognizable:
// a real leaked credential is high-entropy (mixed case WITH embedded digit runs, base64/hex, or an
// unbroken alnum blob) and matches none of them, so a genuine secret is still caught. The self-test
// (`--self-test`) seeds real secrets (sk-…, ghp_…, AWS AKIA…, mixed-case+digit) that MUST still block.
function isNonSecretToken(value) {
  return (
    isStructuredIdentifier(value) || // dotted namespace / colon event / leading-dot dotfile
    /^[A-Z]+(?:_[A-Z]+)*$/.test(value) || // ALL-CAPS enum/const: IDENTIFIER, STRING, HASH, STATE, STATE_MACHINE
    /^[a-z]+[0-9]*(?:[A-Z][a-z]+[0-9]*)+$/.test(value) || // camelCase name (humps need lowercase): tokenUrl, accessToken — excludes ALL-CAPS blobs (AKIA…7…) and digit-heavy keys
    /^[A-Za-z]+(?:-[A-Za-z]+)+$/.test(value) || // kebab / Train-Case, LETTERS ONLY: X-API-Key, Content-Type, mock-key, lm-studio, dev-secret-change-in-production (a dashed real key carries digits → excluded)
    /^[a-z]+(?:_[a-z0-9]+)+$/.test(value) || // snake_case: on_unknown, vault_full, client_credentials
    /^(?:https?:\/\/|\/)\S*$/.test(value) || // URL or absolute path: https://mcp.holoscript.net/oauth/token, /oauth/token
    /^[a-z][a-z0-9.+-]*(?:\/[a-z0-9.+-]+)+$/.test(value) // MIME / lowercase slash-path: application/json, image/png (base64's uppercase/=/+ never matches)
  );
}

// A quoted literal only carries a leaked CREDENTIAL if it has secret-like ENTROPY — a
// machine-generated key mixes letters WITH digits, or uses base64 padding (+ =), or is a long
// unbroken alnum run. Readable words, enum/keyword constants, single dictionary words used as
// domain/enum values ("container", "undefined"), template fragments (${…}), and URLs/paths carry
// none of that. This is the positive complement to isNonSecretToken: the secret-literal SHAPE
// heuristic runs over COMPILED BUNDLES (dist ships dist/*.js, not src), where codegen templates,
// parser tables, error-message templates, and trait metadata put readable strings next to the words
// token/secret/key. Requiring entropy clears that whole FP class (the 26 hits triaged under
// task_1783802580085) while every real secret format still trips — proven by --self-test.
function looksLikeSecretValue(value) {
  if (value.length < 8) return false;
  if (/[${}]/u.test(value)) return false; // template interpolation / shell fragment, never a literal secret
  if (/^(?:https?:\/\/|\/)/u.test(value)) return false; // URL or absolute path
  const entropyMix = /[A-Za-z]/u.test(value) && /[0-9]/u.test(value); // letters + digits together (sk-…03…, ghp_16…, AKIA…7…)
  const longRun = /[A-Za-z0-9+/]{16,}/u.test(value); // long unbroken alnum/base64 run — also catches base64 blobs (dGhpc…==), which are always long
  return entropyMix || longRun;
}

function hasHardcodedSecretLiteral(line) {
  if (!SECRET_IDENTIFIER_RE.test(line)) return false;
  if (/\bredact(?:ed|ion)?\b|redacted/iu.test(line)) return false;
  // The operator must be a property ':' or a SINGLE assignment '=', never a comparison (==, ===,
  // !==, <=, >=) — `this.password === "function"` is a typeof check, not a secret assignment.
  const OP = '(?::|(?<![=!<>])=(?!=))';
  // Inspect only the bounded assignment segment. A minified bundle can put an innocent
  // `tokens=[]` and an unrelated digest literal on the same physical line; scanning every
  // quoted literal on that line incorrectly joins those distant values into one finding.
  const SECRET_FIELD =
    '(?:api[_-]?key|apikey|password(?:hash|value)?|secret(?:key|value)?|(?:access|refresh|auth|bearer|session|api)?token(?:key|value|secret)?|authorization)';
  const secretAssignmentSegments = new RegExp(
    `\\b${SECRET_FIELD}\\b\\s*${OP}\\s*[^,;\\n]{0,512}`,
    'giu'
  );
  for (const segment of line.matchAll(secretAssignmentSegments)) {
    for (const match of segment[0].matchAll(SECRET_LITERAL_RE)) {
      const literal = match[2];
      if (
        looksLikeSecretValue(literal) &&
        !SECRET_PLACEHOLDER_RE.test(literal) &&
        !isNonSecretToken(literal)
      )
        return true;
    }
  }
  return false;
}

function run(cmd, args, cwd) {
  const onWin = process.platform === 'win32' && cmd === 'npm';
  const exe = onWin ? 'cmd.exe' : cmd;
  const finalArgs = onWin ? ['/d', '/s', '/c', ['npm', ...args].join(' ')] : args;
  const r = childProcess.spawnSync(exe, finalArgs, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  if (r.status !== 0)
    throw new Error(
      `${cmd} ${args.join(' ')} failed (${r.status}): ${(r.stderr || '').slice(0, 400)}`
    );
  return r.stdout || '';
}

function packedFiles(pkgDir) {
  const out = run('npm', ['pack', '--dry-run', '--json'], pkgDir);
  const parsed = JSON.parse(out.trim());
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  return entry;
}

function scanFileForLeaks(abs, relPath) {
  const findings = [];
  let text;
  try {
    const buf = fs.readFileSync(abs);
    // Skip obvious binaries; scan text-ish files only.
    if (buf.includes(0)) return findings;
    text = buf.toString('utf8');
  } catch {
    return findings;
  }
  const lines = text.split(/\r?\n/u);
  for (const pat of LEAK_PATTERNS) {
    // The two SHAPE heuristics (secret-literal, bare 5433/5434) false-positive on generated or
    // compiled-language artifacts: sourcemaps (one giant line that embeds source verbatim), a
    // tree-sitter parser.c (a "5433" there is a parse-table index, not the founder's port), and
    // wasm/rust. Skip those files for these two patterns only — the precise patterns (private LAN
    // IP / founder host / founder path / workspace / repo-ref) still scan every shipped file, and
    // the original TS/JS source is scanned directly so a real secret/port is still caught there.
    if (
      (pat.id === 'secret-literal' || pat.id === 'founder-port-mapping') &&
      /\.(?:map|c|cc|cpp|h|hpp|rs|wasm)$/iu.test(relPath)
    ) {
      continue;
    }
    for (let i = 0; i < lines.length; i += 1) {
      if (pat.id === 'secret-literal') {
        if (/\bredacted\b|<redacted>/u.test(lines[i])) continue;
        if (hasHardcodedSecretLiteral(lines[i])) {
          findings.push({
            level: 'BLOCKER',
            kind: `leak:${pat.id}`,
            file: relPath,
            line: i + 1,
            note: pat.note,
          });
          break;
        }
        continue;
      }
      if (pat.re.test(lines[i])) {
        // founder-path (/mnt/nvme, …) is a BLOCKER in operational source but only a WARN in docs
        // and *.example.* files, where such a path is an illustrative deploy target (audit FP #2).
        // A real internal IP or hostname (private-lan-ip / founder-host) stays a BLOCKER everywhere.
        const isDocOrExample =
          /\.(?:md|markdown)$/iu.test(relPath) || /\.example\./iu.test(relPath);
        const level = pat.id === 'founder-path' && isDocOrExample ? 'WARN' : 'BLOCKER';
        findings.push({
          level,
          kind: `leak:${pat.id}`,
          file: relPath,
          line: i + 1,
          note: pat.note,
        });
        break; // one hit per pattern per file is enough to block
      }
    }
  }
  return findings;
}

function scanPackageTreeForLeaks(pkgDir, includeFiles) {
  const findings = [];
  for (const rel of includeFiles) {
    findings.push(...scanFileForLeaks(path.join(pkgDir, rel), rel));
  }
  return findings;
}

function checkReadmeConsumptionContract(readme, readmeFile, isPublic) {
  const level = isPublic ? 'BLOCKER' : 'WARN';
  const findings = [];
  for (const rule of README_CONSUMPTION_RULES) {
    if (!rule.re.test(readme)) {
      findings.push({ level, kind: rule.kind, file: readmeFile, note: rule.note });
    }
  }
  return findings;
}

function checkPackage(pkgDir) {
  const findings = [];
  const abs = path.resolve(pkgDir);
  const pkgJsonPath = path.join(abs, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    return {
      package: pkgDir,
      ok: false,
      findings: [
        { level: 'BLOCKER', kind: 'no-package-json', file: 'package.json', note: 'missing' },
      ],
    };
  }
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const isPublic = pkg.publishConfig?.access === 'public';

  // package.json completeness (competitor-grade metadata).
  const add = (level, kind, note) => findings.push({ level, kind, file: 'package.json', note });
  if (!pkg.license) add('BLOCKER', 'missing-license', 'no license field');
  if (isPublic && pkg.license && pkg.license !== 'MIT')
    add('WARN', 'non-mit-license', `license=${pkg.license}`);
  if (!pkg.version) add('BLOCKER', 'missing-version', 'no version');
  if (!pkg.description) add('WARN', 'missing-description', 'no description');
  if (!pkg.repository) add('WARN', 'missing-repository', 'no repository field');
  if (!pkg.main && !pkg.exports && !pkg.bin) add('BLOCKER', 'no-entrypoint', 'no main/exports/bin');
  if (!Array.isArray(pkg.files) || pkg.files.length === 0)
    add('WARN', 'no-files-allowlist', 'no files[] allowlist (publishes by .npmignore)');

  // Actual published fileset + content scan (the real leak gate).
  let pack;
  try {
    pack = packedFiles(abs);
  } catch (err) {
    findings.push({ level: 'BLOCKER', kind: 'pack-failed', file: '.', note: err.message });
    return { package: pkgDir, name: pkg.name, ok: false, findings };
  }
  const files = (pack.files || []).map((f) => f.path);
  const hasReadme = files.some((f) => /^README(\.md)?$/iu.test(f));
  const hasLicense = files.some((f) => /^LICENSE/iu.test(f));
  if (!hasReadme) add('BLOCKER', 'no-readme-in-tarball', 'README not in published files');
  if (isPublic && !hasLicense)
    add('WARN', 'no-license-file', 'no LICENSE file in published tarball');
  for (const f of files) {
    if (f.startsWith('../') || f.startsWith('.scratch/')) {
      findings.push({
        level: 'BLOCKER',
        kind: 'tarball-boundary-escape',
        file: f,
        note: 'file escapes package boundary',
      });
    }
  }
  // Content leak scan across every published file.
  for (const rel of files) {
    findings.push(...scanFileForLeaks(path.join(abs, rel), rel));
  }

  // README quality: install path + a usage example.
  if (hasReadme) {
    const readmeRel = files.find((f) => /^README(\.md)?$/iu.test(f));
    const readme = fs.readFileSync(path.join(abs, readmeRel), 'utf8');
    if (!/\b(?:npm install|npm i|pnpm add|pnpm install|yarn add)\b/u.test(readme)) {
      findings.push({
        level: 'WARN',
        kind: 'readme-no-install',
        file: readmeRel,
        note: 'no install command',
      });
    }
    if (!/```/u.test(readme)) {
      findings.push({
        level: 'WARN',
        kind: 'readme-no-example',
        file: readmeRel,
        note: 'no fenced usage example',
      });
    }
    findings.push(...checkReadmeConsumptionContract(readme, readmeRel, isPublic));
  }

  const blockers = findings.filter((f) => f.level === 'BLOCKER');
  return {
    package: pkgDir,
    kind: 'npm',
    name: pkg.name,
    releaseLane: pkg.releaseLane || pkg.holorepo?.supportBoundary?.split(':')[0] || null,
    public: isPublic,
    tarballEntries: pack.entryCount,
    ok: blockers.length === 0,
    findings,
  };
}

function parseProjectToml(text) {
  const project = {};
  const lines = text.split(/\r?\n/u);
  let inProject = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (/^\[project\]\s*$/u.test(trimmed)) {
      inProject = true;
      continue;
    }
    if (/^\[/u.test(trimmed)) {
      inProject = false;
      continue;
    }
    if (!inProject) continue;
    const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/u);
    if (!match) continue;
    const [, key, rawValue] = match;
    const quoted = rawValue.match(/^"([^"]*)"|^'([^']*)'/u);
    if (quoted) project[key] = quoted[1] ?? quoted[2];
    else if (/^\[/u.test(rawValue)) project[key] = rawValue;
    else project[key] = rawValue.trim();
  }
  return project;
}

function pythonPackageFiles(pkgDir) {
  const files = ['pyproject.toml'];
  for (const name of ['README.md', 'README.rst', 'LICENSE', 'LICENSE.md']) {
    if (fs.existsSync(path.join(pkgDir, name))) files.push(name);
  }
  for (const entry of fs.readdirSync(pkgDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name === 'tests' || entry.name === '__pycache__')
      continue;
    const candidate = path.join(pkgDir, entry.name);
    if (fs.existsSync(path.join(candidate, '__init__.py'))) {
      for (const file of walkTextFiles(candidate))
        files.push(path.relative(pkgDir, file).replace(/\\/gu, '/'));
    }
  }
  return [...new Set(files)];
}

function walkTextFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__pycache__' || entry.name.endsWith('.egg-info')) continue;
      out.push(...walkTextFiles(abs));
    } else if (/\.(py|txt|md|toml|json)$/iu.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

function checkPythonPackage(pkgDir) {
  const findings = [];
  const abs = path.resolve(pkgDir);
  const pyprojectPath = path.join(abs, 'pyproject.toml');
  if (!fs.existsSync(pyprojectPath)) {
    return {
      package: pkgDir,
      kind: 'pypi',
      ok: false,
      findings: [
        { level: 'BLOCKER', kind: 'no-pyproject', file: 'pyproject.toml', note: 'missing' },
      ],
    };
  }
  const project = parseProjectToml(fs.readFileSync(pyprojectPath, 'utf8'));
  const add = (level, kind, note, file = 'pyproject.toml') =>
    findings.push({ level, kind, file, note });
  if (!project.name) add('BLOCKER', 'missing-name', 'project.name missing');
  if (!project.version) add('BLOCKER', 'missing-version', 'project.version missing');
  if (!project.description) add('WARN', 'missing-description', 'project.description missing');
  if (!project.readme) add('BLOCKER', 'missing-readme-field', 'project.readme missing');
  if (!project['requires-python'])
    add('WARN', 'missing-python-version', 'project.requires-python missing');
  if (!project.license) add('BLOCKER', 'missing-license', 'project.license missing');

  const readmeFile = project.readme || 'README.md';
  const readmePath = path.join(abs, readmeFile);
  if (!fs.existsSync(readmePath)) {
    add('BLOCKER', 'readme-file-missing', `${readmeFile} missing`, readmeFile);
  } else {
    const readme = fs.readFileSync(readmePath, 'utf8');
    if (!/\b(?:pip install|python -m pip install|uv pip install)\b/u.test(readme)) {
      add('WARN', 'readme-no-install', 'no pip install command', readmeFile);
    }
    if (!/```|::\n/u.test(readme)) {
      add('WARN', 'readme-no-example', 'no fenced or literal usage example', readmeFile);
    }
    findings.push(...checkReadmeConsumptionContract(readme, readmeFile, true));
  }
  if (!fs.existsSync(path.join(abs, 'LICENSE')) && !fs.existsSync(path.join(abs, 'LICENSE.md'))) {
    add('WARN', 'no-license-file', 'no LICENSE file in package directory', 'LICENSE');
  }

  findings.push(...scanPackageTreeForLeaks(abs, pythonPackageFiles(abs)));
  const blockers = findings.filter((f) => f.level === 'BLOCKER');
  return {
    package: pkgDir,
    kind: 'pypi',
    name: project.name || null,
    releaseLane: null,
    public: true,
    tarballEntries: null,
    ok: blockers.length === 0,
    findings,
  };
}

// Deliberately-seeded leak fixtures that MUST be flagged, plus clean values that MUST NOT.
// This is the gate's own regression suite: it proves the scanner still blocks the exact leaks
// we hand-fixed — most importantly the ESCAPED founder path in a .holo/JSON string literal
// ("C:\\Users\\josep" on disk), which a single-backslash pattern silently missed and let
// profiles/laptop-windows.holo ship (task_1783793190251). Run: `--self-test`.
function selfTestFixtures() {
  const BS = '\\'; // one literal backslash
  const esc = BS + BS; // two backslashes — how a Windows path is stored INSIDE a .holo/JSON string
  // High-entropy "real secret" values are ASSEMBLED from fragments (like `esc` above) so THIS source
  // file carries no complete scannable token — the commit-time secret hooks (.githooks/pre-commit +
  // gitleaks) would otherwise flag literal fixtures. Vendor prefixes (sk-…/ghp_/AKIA) are irrelevant
  // to what we test: the gate keys on ENTROPY, so a generic high-entropy value exercises the exact
  // same detection path (looksLikeSecretValue). Each value below is letters+digits mixed and/or a
  // long unbroken run — real credential shapes the tune must STILL block.
  const blobMixed = 'Zx' + '7Qm3Kp9' + 'Rt2Wv5Yn8' + 'Bd4Lf'; // 24 mixed alnum → entropyMix + longRun
  const blobDashed = 'kx7' + '-qm3' + '-rt9' + '-wv5'; // dashed WITH digits, short runs → entropyMix path only
  const blobHex = '0123456789' + 'abcdef' + '01234567'; // 24 hex → letters+digits + longRun
  const blobB64 = 'dGhpc2lz' + 'YXZlcnls' + 'b25nc2Vj' + 'cmV0'; // base64 blob → longRun (also has letters+digits)
  const blobPass = 'hunter' + '2xyz9' + 'AqL'; // human-ish password with a digit → entropyMix
  return [
    // --- MUST be flagged (seeded leaks) ---
    {
      file: 'profile-escaped.holo',
      content: `    executable: "C:${esc}Users${esc}josep${esc}llama.cpp${esc}llama-server.exe"`,
      expect: 'leak:founder-path',
    },
    {
      file: 'profile-single.holo',
      content: `path=C:${BS}Users${BS}Josep${BS}x`,
      expect: 'leak:founder-path',
    },
    {
      file: 'linux-mount.txt',
      content: 'model_path: /mnt/nvme/holo/models/x.gguf',
      expect: 'leak:founder-path',
    },
    {
      file: 'lan.json',
      content: '{ "endpoint": "http://192.168.0.119:18080" }',
      expect: 'leak:private-lan-ip',
    },
    { file: 'host.txt', content: 'container: holo-app-pg', expect: 'leak:founder-host' },
    // --- MUST stay clean (generic deploy roots / placeholders) ---
    {
      file: 'generic-win.holo',
      content: `    executable: "C:${esc}holoscript${esc}llama.cpp${esc}llama-server.exe"`,
      expect: null,
    },
    {
      file: 'generic-linux.holo',
      content: '    executable: "/opt/holoscript/llama.cpp/bin/llama-server"',
      expect: null,
    },
    { file: 'generic-home.holo', content: '    bin: "jetson.local:18080"', expect: null },
    // --- secret-literal FP shapes: quoted NAMES/URLs near token/secret/key words MUST stay clean
    //     (each is a real hit triaged under task_1783802580085) ---
    { file: 'fp-lm-studio.js', content: '      apiKey: "lm-studio",', expect: null },
    { file: 'fp-mock-key.js', content: '      apiKey: config.apiKey ?? "mock-key",', expect: null },
    {
      file: 'fp-event-name.js',
      content: '    const eventName = token?.value || "on_unknown";',
      expect: null,
    },
    {
      file: 'fp-dev-default.js',
      content:
        '    DEFAULT_JWT_SECRET = process.env.AGENT_JWT_SECRET || "dev-secret-change-in-production";',
      expect: null,
    },
    {
      file: 'fp-header-name.js',
      content: '    apiKey: contract.auth?.headers["api_key"] ?? "X-API-Key";',
      expect: null,
    },
    {
      file: 'fp-event-emit.js',
      content: '    context.emit?.("secret:error", { error: "vault_full", secretId: id });',
      expect: null,
    },
    {
      file: 'fp-url-path.js',
      content: '    tokenUrl: this.valueToString(config["tokenUrl"], "/oauth/token");',
      expect: null,
    },
    {
      file: 'fp-enum-compare.js',
      content:
        '    const isKeyToken = token.type === "IDENTIFIER" || token.type === "STATE_MACHINE";',
      expect: null,
    },
    {
      file: 'fp-domain-value.js',
      content: '    secret: { traits: ["@secret"], domain: "container" },',
      expect: null,
    },
    {
      file: 'fp-template-frag.js',
      content: '    const msg = `got ${token?.type || "EOF"} \'${token?.value || ""}\'`;',
      expect: null,
    },
    {
      file: 'fp-typeof-undefined.js',
      content:
        '    const apiKey = config?.apiKey ?? (typeof process !== "undefined" ? process.env.OPENAI_API_KEY : "") ?? "";',
      expect: null,
    },
    // mixed-quote documented one-liner (README OAuth flow): mismatched quotes must NOT let a code
    // fragment (",c=>b+=c).on(") read as a secret — the backreference in SECRET_LITERAL_RE prevents it.
    {
      file: 'fp-mixed-quote-oneliner.md',
      content: `| node -e "let b='';process.stdin.on('data',c=>b+=c).on('end',()=>{const c=JSON.parse(b);fetch('https://mcp.holoscript.net/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',client_secret:c.client_secret})})})"`,
      expect: null,
    },
    // --- real high-entropy credential shapes MUST still block (the tune must not open a false-negative);
    //     values assembled from fragments above so this file carries no scannable token ---
    {
      file: 'real-mixed.js',
      content: `    const apiKey = "${blobMixed}";`,
      expect: 'leak:secret-literal',
    },
    {
      file: 'real-dashed.js',
      content: `    const token = "${blobDashed}";`,
      expect: 'leak:secret-literal',
    },
    {
      file: 'real-hex.js',
      content: `    const secret = "${blobHex}";`,
      expect: 'leak:secret-literal',
    },
    {
      file: 'real-base64.js',
      content: `    const apiKey = "${blobB64}";`,
      expect: 'leak:secret-literal',
    },
    {
      file: 'real-password.js',
      content: `    password: "${blobPass}";`,
      expect: 'leak:secret-literal',
    },
  ];
}

function runSelfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'holo-pubconsume-selftest-'));
  let failures = 0;
  try {
    for (const fx of selfTestFixtures()) {
      const abs = path.join(dir, fx.file);
      fs.writeFileSync(abs, fx.content, 'utf8');
      const findings = scanFileForLeaks(abs, fx.file);
      const kinds = findings.map((f) => f.kind);
      const hit = fx.expect ? kinds.includes(fx.expect) : findings.length === 0;
      if (!hit) {
        failures += 1;
        process.stdout.write(
          `  FAIL ${fx.file}: expected ${fx.expect ? `BLOCKER ${fx.expect}` : 'no findings'}, got [${kinds.join(', ') || 'none'}]\n`
        );
      } else {
        process.stdout.write(`  ok   ${fx.file}: ${fx.expect ? `caught ${fx.expect}` : 'clean'}\n`);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (failures) {
    process.stdout.write(`\nSELF-TEST FAILED: ${failures} case(s)\n`);
    process.exit(1);
  }
  process.stdout.write(
    '\nSELF-TEST PASSED: every seeded leak is blocked and every generic value stays clean.\n'
  );
}

function parseArgs(argv) {
  const packages = [];
  const pyPackages = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--package' && argv[i + 1]) {
      packages.push(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--py-package' && argv[i + 1]) {
      pyPackages.push(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--portfolio') {
      packages.push(...firstPartyNpmPackages());
      pyPackages.push(...firstPartyPythonPackages());
    }
  }
  return {
    packages: packages.length ? uniqueExisting(packages) : defaultPackages(),
    pyPackages: uniqueExisting(pyPackages),
    json: argv.includes('--json'),
    selfTest: argv.includes('--self-test'),
  };
}

function render(report) {
  const lines = ['# Package Public-Consumption Ratchet', ''];
  for (const p of report.packages) {
    const blockers = p.findings.filter((f) => f.level === 'BLOCKER');
    const warns = p.findings.filter((f) => f.level === 'WARN');
    lines.push(
      `## ${p.name || p.package}  ${p.ok ? 'PASS' : 'BLOCKED'}  ${p.kind || 'npm'}  ${p.public ? '(public)' : '(private)'}  ${p.tarballEntries ?? '?'} files`
    );
    for (const f of blockers)
      lines.push(`  BLOCKER ${f.kind} - ${f.file}${f.line ? `:${f.line}` : ''} - ${f.note}`);
    for (const f of warns)
      lines.push(`  WARN ${f.kind} - ${f.file}${f.line ? `:${f.line}` : ''} - ${f.note}`);
    if (!blockers.length && !warns.length) lines.push('  (clean)');
    lines.push('');
  }
  lines.push(`Result: ${report.ok ? 'ALL PASS' : `${report.blocked} package(s) BLOCKED`}`);
  return lines.join('\n') + '\n';
}

function main() {
  const { packages, pyPackages, json, selfTest } = parseArgs(process.argv.slice(2));
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(
      'Usage: node scripts/check-package-public-consumption.mjs [--package <dir> ...] [--py-package <dir> ...] [--portfolio] [--self-test] [--json]\n'
    );
    return;
  }
  if (selfTest) {
    process.stdout.write('# Public-Consumption Ratchet self-test (seeded leaks)\n');
    runSelfTest();
    return;
  }
  const results = [...packages.map(checkPackage), ...pyPackages.map(checkPythonPackage)];
  const report = {
    schema: 'holoscript.package-public-consumption.v1',
    ok: results.every((r) => r.ok),
    blocked: results.filter((r) => !r.ok).length,
    packages: results,
  };
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : render(report));
  if (!report.ok) process.exit(1);
}

main();
