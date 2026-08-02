#!/usr/bin/env node
/**
 * Validate build baselines that are easy to regress and expensive to diagnose.
 *
 * The default audit is deterministic and local: it scans effective tsconfig
 * inheritance for the TS5096-invalid combination. Pass --build to additionally
 * run the repository root build and capture its result as evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const IGNORED_DIRS = new Set(['.git', '.holorepo', 'node_modules', 'dist']);

function stripJsonComments(text) {
  let output = '';
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        output += char;
      } else {
        output += ' ';
      }
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        output += '  ';
        i += 1;
      } else {
        output += char === '\n' ? '\n' : ' ';
      }
      continue;
    }
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      output += char;
    } else if (char === '/' && next === '/') {
      inLineComment = true;
      output += '  ';
      i += 1;
    } else if (char === '/' && next === '*') {
      inBlockComment = true;
      output += '  ';
      i += 1;
    } else {
      output += char;
    }
  }
  return output.replace(/,\s*([}\]])/g, '$1');
}

export function readJsonConfig(filePath) {
  return JSON.parse(stripJsonComments(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')));
}

function resolveExtendsPath(configPath, extendsValue) {
  if (typeof extendsValue !== 'string') return null;
  const requested = extendsValue.endsWith('.json') ? extendsValue : `${extendsValue}.json`;
  return path.resolve(path.dirname(configPath), requested);
}

function mergeCompilerOptions(parent, child) {
  return { ...(parent ?? {}), ...(child ?? {}) };
}

export function resolveCompilerOptions(configPath, seen = new Set()) {
  const absolutePath = path.resolve(configPath);
  if (seen.has(absolutePath)) {
    throw new Error(`Circular tsconfig extends chain at ${absolutePath}`);
  }
  seen.add(absolutePath);
  const config = readJsonConfig(absolutePath);
  const parentPath = resolveExtendsPath(absolutePath, config.extends);
  const parent = parentPath && fs.existsSync(parentPath)
    ? resolveCompilerOptions(parentPath, seen)
    : {};
  return mergeCompilerOptions(parent, config.compilerOptions);
}

function listTsconfigs(root) {
  const found = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name)) {
        visit(path.join(directory, entry.name));
      } else if (entry.isFile() && /^tsconfig(?:\.[^/\\]+)?\.json$/.test(entry.name)) {
        found.push(path.join(directory, entry.name));
      }
    }
  }
  visit(root);
  return found.sort();
}

export function validateCompilerOptions(configPath, compilerOptions) {
  const allowImportingTsExtensions = compilerOptions.allowImportingTsExtensions === true;
  const emitsJavaScript = compilerOptions.noEmit !== true && compilerOptions.emitDeclarationOnly !== true;
  if (!allowImportingTsExtensions || !emitsJavaScript) return null;
  return {
    code: 'TS5096',
    config: path.relative(ROOT, configPath).replaceAll(path.sep, '/'),
    message: "allowImportingTsExtensions requires noEmit or emitDeclarationOnly for an emitting project",
  };
}

export function auditTsconfigs(root = ROOT) {
  const violations = [];
  const unreadable = [];
  const configPaths = listTsconfigs(root);
  for (const configPath of configPaths) {
    try {
      const violation = validateCompilerOptions(configPath, resolveCompilerOptions(configPath));
      if (violation) violations.push(violation);
    } catch (error) {
      unreadable.push({
        config: path.relative(root, configPath).replaceAll(path.sep, '/'),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { scanned: configPaths.length, violations, unreadable };
}

export function runBuild(root = ROOT) {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? 'cmd.exe' : 'corepack';
  const commandArgs = isWindows
    ? ['/d', '/s', '/c', 'corepack pnpm run build']
    : ['pnpm', 'run', 'build'];
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
    windowsHide: true,
  });
  return {
    command: isWindows ? 'cmd.exe /d /s /c corepack pnpm run build' : 'corepack pnpm run build',
    status: result.status,
    signal: result.signal ?? null,
    ok: result.status === 0,
    error: result.error?.message ?? null,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.slice(-12000),
  };
}

export function createReport({ root = ROOT, includeBuild = false } = {}) {
  const configs = auditTsconfigs(root);
  const report = {
    schema: 'holoscript.baseline-audit.v1',
    generatedAt: new Date().toISOString(),
    root,
    configs,
    build: includeBuild ? runBuild(root) : { requested: false },
  };
  report.ok = configs.violations.length === 0 && configs.unreadable.length === 0 &&
    (!includeBuild || report.build.ok);
  return report;
}

function parseArgs(argv) {
  return { build: argv.includes('--build'), json: argv.includes('--json') };
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const report = createReport({ includeBuild: args.build });
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Baseline audit: ${report.ok ? 'PASS' : 'FAIL'}`);
    console.log(`  tsconfigs scanned: ${report.configs.scanned}`);
    console.log(`  TS5096 violations: ${report.configs.violations.length}`);
    for (const violation of report.configs.violations) console.log(`    - ${violation.config}`);
    if (args.build) console.log(`  root build: ${report.build.ok ? 'PASS' : `FAIL (exit ${report.build.status ?? 'unknown'})`}`);
  }
  return report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main();
}
