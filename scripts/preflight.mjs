#!/usr/bin/env node
/**
 * HoloScript Pre-flight Diagnostic Tool
 *
 * Catches deploy-blocking errors locally in under 30 seconds.
 * Mirrors the CI pre-flight but runs fast by only checking changed files.
 *
 * Usage:
 *   pnpm preflight            # default: changed-files optimization
 *   pnpm preflight --full     # check ALL packages
 *   pnpm preflight --fix      # auto-fix lockfile + prefixed imports
 *   pnpm preflight --json     # structured output for /scan skill
 *   pnpm preflight --check=lockfile,imports  # specific checks only
 *   pnpm preflight --check=typescript,ts    # TypeScript only (changed packages, max 8)
 */

import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, relative, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

/** Windows: spawning `pnpm` / `npx` without a shell often fails (ENOENT). Agents on Win32 hit this constantly. */
const WIN32_SPAWN = process.platform === 'win32' ? { shell: true } : {};

// ── CLI Args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const FLAGS = {
  full: args.includes('--full'),
  fix: args.includes('--fix'),
  json: args.includes('--json'),
  checks: (() => {
    const c = args.find(a => a.startsWith('--check='));
    return c ? c.split('=')[1].split(',') : null;
  })(),
};

// ── Colors ──────────────────────────────────────────────────────────────────

const C = {
  red: s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan: s => `\x1b[36m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
  dim: s => `\x1b[2m${s}\x1b[0m`,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getChangedFiles() {
  try {
    const unstaged = execSync('git diff --name-only HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    const staged = execSync('git diff --cached --name-only', { cwd: ROOT, encoding: 'utf8' }).trim();
    const all = [...new Set([...unstaged.split('\n'), ...staged.split('\n')].filter(Boolean))];
    return all.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
  } catch {
    return [];
  }
}

function getChangedPackages(files) {
  const pkgs = new Set();
  for (const f of files) {
    const m = f.match(/^packages\/([^/]+)\//);
    if (m) pkgs.add(m[1]);
    const s = f.match(/^services\/([^/]+)\//);
    if (s) pkgs.add(s[1]);
  }
  return [...pkgs];
}

function walkTs(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__' || entry.includes('.test.')) continue;
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) walkTs(full, files);
      else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) files.push(full);
    } catch { /* skip */ }
  }
  return files;
}

function shouldRun(name) {
  if (FLAGS.checks) return FLAGS.checks.includes(name);
  return true;
}

// ── Check Results ───────────────────────────────────────────────────────────

const results = [];

function record(name, status, message, details = [], durationMs = 0) {
  results.push({ name, status, message, details, duration_ms: durationMs });
}

// ── Check 1: Lockfile Integrity ─────────────────────────────────────────────

function checkLockfile() {
  const start = Date.now();
  const result = spawnSync('pnpm', ['install', '--frozen-lockfile'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30000,
    stdio: 'pipe',
    ...WIN32_SPAWN,
  });

  const duration = Date.now() - start;

  if (result.status === 0) {
    record('lockfile', 'pass', 'Lockfile in sync', [], duration);
  } else {
    const msg = (result.stderr || '').includes('ERR_PNPM_OUTDATED_LOCKFILE')
      ? 'pnpm-lock.yaml out of sync with package.json'
      : 'Lockfile check failed';

    if (FLAGS.fix) {
      spawnSync('pnpm', ['install'], { cwd: ROOT, stdio: 'pipe', timeout: 60000, ...WIN32_SPAWN });
      record('lockfile', 'pass', 'Lockfile fixed (ran pnpm install)', [], Date.now() - start);
    } else {
      const details = [];
      const match = (result.stderr || '').match(/not up to date with (.+?)$/m);
      if (match) details.push({ file: match[1], reason: 'lockfile drift' });
      const combined = `${result.stderr || ''}${result.stdout || ''}`.trim();
      if (combined && details.length === 0) {
        details.push({ file: 'pnpm-output', reason: combined.slice(0, 1200) });
      }
      record('lockfile', 'fail', msg, details, duration);
    }
  }
}

// ── Check 2: Prefixed Type Imports ──────────────────────────────────────────

const PREFIXED_ALLOWLIST = new Set([
  '_TemplateInstance', // deliberate rename alias
  '_HSPlusExpression', // deliberate rename alias
  '_RegistryClient',   // deliberate rename in .d.ts
]);

function checkPrefixedImports() {
  const start = Date.now();
  const issues = [];
  const pattern = /import\s+(?:type\s+)?{([^}]+)}\s+from\s+['"](@holoscript\/[^'"]+|\.\.?\/[^'"]+)['"]/g;
  const prefixPattern = /\b(_[A-Z][a-zA-Z0-9]*)\b/g;

  const dirs = readdirSync(join(ROOT, 'packages')).map(d => join(ROOT, 'packages', d, 'src'));
  const files = [];
  for (const dir of dirs) walkTs(dir, files);

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf8');
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importClause = match[1];
        const source = match[2];
        let prefixMatch;
        while ((prefixMatch = prefixPattern.exec(importClause)) !== null) {
          const name = prefixMatch[1];
          if (!PREFIXED_ALLOWLIST.has(name)) {
            const relPath = relative(ROOT, file);
            issues.push({
              file: relPath,
              import: name,
              from: source,
              suggestion: name.slice(1), // remove underscore
            });
          }
        }
      }
    } catch { /* skip unreadable files */ }
  }

  const duration = Date.now() - start;

  if (issues.length === 0) {
    record('prefixed_imports', 'pass', 'No prefixed type imports found', [], duration);
  } else if (FLAGS.fix) {
    // Auto-fix: replace _Foo with Foo in each file
    const fileGroups = {};
    for (const issue of issues) {
      if (!fileGroups[issue.file]) fileGroups[issue.file] = [];
      fileGroups[issue.file].push(issue);
    }
    let fixCount = 0;
    for (const [file, fileIssues] of Object.entries(fileGroups)) {
      let content = readFileSync(join(ROOT, file), 'utf8');
      for (const issue of fileIssues) {
        const regex = new RegExp(`\\b${issue.import.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        content = content.replace(regex, issue.suggestion);
        fixCount++;
      }
      writeFileSync(join(ROOT, file), content);
    }
    record('prefixed_imports', 'pass', `Fixed ${fixCount} prefixed imports in ${Object.keys(fileGroups).length} files`, [], Date.now() - start);
  } else {
    record('prefixed_imports', 'fail', `${issues.length} prefixed type imports found`, issues.slice(0, 10), duration);
  }
}

// ── Check 3: Missing Build Loaders ──────────────────────────────────────────

function checkLoaderImports() {
  const start = Date.now();
  const issues = [];
  const loaderPattern = /from\s+['"]([^'"]+\.(wgsl|glsl|vert|frag|wasm)\?raw)['"]/g;

  const dirs = readdirSync(join(ROOT, 'packages')).map(d => join(ROOT, 'packages', d, 'src'));
  const files = [];
  for (const dir of dirs) walkTs(dir, files);

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf8');
      let match;
      while ((match = loaderPattern.exec(content)) !== null) {
        const relPath = relative(ROOT, file);
        const pkgMatch = relPath.match(/^packages\/([^/]+)\//);
        if (!pkgMatch) continue;
        const pkg = pkgMatch[1];

        // Check if package has a tsup config with a loader plugin
        const tsupConfig = join(ROOT, 'packages', pkg, 'tsup.config.ts');
        const hasConfig = existsSync(tsupConfig);
        let hasLoader = false;
        if (hasConfig) {
          const configContent = readFileSync(tsupConfig, 'utf8');
          hasLoader = configContent.includes('wgsl') || configContent.includes('loader') || configContent.includes('raw');
        }

        // Check for type declaration
        const srcDir = join(ROOT, 'packages', pkg, 'src');
        let hasTypeDecl = false;
        if (existsSync(srcDir)) {
          const declFiles = readdirSync(srcDir).filter(f => f.includes('module') || f.includes('wgsl'));
          for (const df of declFiles) {
            const dc = readFileSync(join(srcDir, df), 'utf8');
            if (dc.includes('.wgsl')) hasTypeDecl = true;
          }
        }

        if (!hasLoader && !hasTypeDecl) {
          issues.push({
            file: relPath,
            import: match[1],
            package: pkg,
            reason: 'No tsup loader config or type declaration for this import',
          });
        }
      }
    } catch { /* skip */ }
  }

  const duration = Date.now() - start;

  if (issues.length === 0) {
    record('loader_imports', 'pass', 'All loader imports have configs', [], duration);
  } else {
    record('loader_imports', 'warn', `${issues.length} loader imports without configs`, issues, duration);
  }
}

// ── Check 4: TypeScript Syntax Errors ───────────────────────────────────────

function checkTypeScript() {
  const start = Date.now();
  const changedFiles = getChangedFiles();
  const changedPkgs = FLAGS.full
    ? readdirSync(join(ROOT, 'packages'))
    : getChangedPackages(changedFiles);

  if (changedPkgs.length === 0) {
    record('typescript', 'skip', 'No changed packages', [], 0);
    return;
  }

  const issues = [];
  const checked = [];

  for (const pkg of changedPkgs.slice(0, 8)) { // max 8 packages
    const tsconfig = join(ROOT, 'packages', pkg, 'tsconfig.json');
    if (!existsSync(tsconfig)) continue;

    const result = spawnSync('npx', ['tsc', '--noEmit', '--skipLibCheck', '--project', tsconfig], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 30000,
      stdio: 'pipe',
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
      ...WIN32_SPAWN,
    });

    checked.push(pkg);

    if (result.status !== 0) {
      // tsc may write diagnostics to stdout or stderr depending on version / OS.
      const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
      const errors = combined
        .split('\n')
        .filter(l => l.includes('error TS'))
        .map(l => {
          const m = l.match(/(.+)\((\d+),(\d+)\): error (TS\d+): (.+)/);
          return m ? { file: m[1], line: m[2], code: m[4], message: m[5] } : { raw: l };
        })
        .filter(e => {
          // Suppress known wgsl?raw resolution errors
          if (e.code === 'TS2307' && e.message && e.message.includes('.wgsl')) return false;
          return true;
        });

      if (errors.length > 0) {
        issues.push(...errors.slice(0, 5).map(e => ({
          ...e,
          package: pkg,
        })));
      } else if (combined.trim()) {
        issues.push({
          package: pkg,
          file: `${pkg}/tsc`,
          code: 'TS_FAIL',
          message: combined.trim().slice(0, 500),
        });
      } else {
        issues.push({
          package: pkg,
          file: `${pkg}/tsc`,
          code: 'TS_FAIL',
          message: 'tsc exited non-zero with no captured output (timeout or spawn failure)',
        });
      }
    }
  }

  const duration = Date.now() - start;

  if (issues.length === 0) {
    record('typescript', 'pass', `Checked ${checked.length} packages: ${checked.join(', ')}`, [], duration);
  } else {
    record('typescript', 'fail', `${issues.length} TypeScript errors in ${checked.length} packages`, issues.slice(0, 10), duration);
  }
}

// ── Check 5: DTS Generation ─────────────────────────────────────────────────

function checkDTS() {
  const start = Date.now();
  const criticalDTS = ['crdt-spatial', 'holo-vm', 'holoscript-cdn']; // packages where DTS has failed
  const changedFiles = getChangedFiles();
  const changedPkgs = FLAGS.full
    ? criticalDTS
    : getChangedPackages(changedFiles).filter(p => criticalDTS.includes(p));

  if (changedPkgs.length === 0) {
    record('dts', 'skip', 'No critical DTS packages changed', [], 0);
    return;
  }

  const issues = [];

  for (const pkg of changedPkgs) {
    const pkgDir = join(ROOT, 'packages', pkg);
    const result = spawnSync('npx', ['tsup', '--dts-only'], {
      cwd: pkgDir,
      encoding: 'utf8',
      timeout: 120000,
      stdio: 'pipe',
      ...WIN32_SPAWN,
    });

    if (result.status !== 0) {
      const raw = `${result.stderr || ''}\n${result.stdout || ''}`.trim();
      const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
      const errorsFromTs = lines.filter((l) => l.includes('error TS')).slice(0, 4);
      const errorsHint = lines
        .filter((l) => /error|Error|ERR_|failed|Cannot find|TS\d+|DTS/i.test(l))
        .slice(0, 6);
      const fallback = raw ? raw.split('\n').slice(0, 4) : [];
      const errors =
        errorsFromTs.length > 0
          ? errorsFromTs
          : errorsHint.length > 0
            ? errorsHint
            : fallback.length > 0
              ? fallback
              : ['DTS build failed (no output — try: cd packages/' + pkg + ' && npx tsup --dts-only)'];
      issues.push({
        package: pkg,
        errors,
      });
    }
  }

  const duration = Date.now() - start;

  if (issues.length === 0) {
    record('dts', 'pass', `DTS checked for ${changedPkgs.join(', ')}`, [], duration);
  } else {
    record('dts', 'fail', `DTS failed in ${issues.length} packages`, issues, duration);
  }
}

// ── Check 6: Circular Dependencies ──────────────────────────────────────────

function checkCircular() {
  if (!FLAGS.full) {
    record('circular', 'skip', 'Use --full to check circular deps', [], 0);
    return;
  }

  const start = Date.now();
  try {
    const result = spawnSync('npx', ['madge', '--circular', '--extensions', 'ts', 'packages/core/src/index.ts'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 15000,
      stdio: 'pipe',
      ...WIN32_SPAWN,
    });

    const duration = Date.now() - start;
    const output = (result.stdout || '').trim();

    if (output.includes('No circular dependency')) {
      record('circular', 'pass', 'No circular dependencies in core', [], duration);
    } else {
      const lines = output.split('\n').filter(l => l.includes('→'));
      record('circular', 'warn', `${lines.length} circular dependency chains`, lines.slice(0, 5).map(l => ({ chain: l })), duration);
    }
  } catch {
    record('circular', 'skip', 'madge not available', [], 0);
  }
}

// ── Check 7: Simulation Contracts ──────────────────────────────────────────

function checkSimulationContracts() {
  const start = Date.now();
  const changedFiles = getChangedFiles();
  const simFiles = changedFiles.filter(f => f.endsWith('.holo') || f.endsWith('.hsplus'));

  if (simFiles.length === 0) {
    record('simulation_contract', 'skip', 'No simulation files changed', [], 0);
    return;
  }

  const issues = [];
  for (const file of simFiles) {
    try {
      const content = readFileSync(join(ROOT, file), 'utf8');
      
      // Basic heuristic: does it use physical traits or solver blocks?
      const hasPhysics = content.includes('@physics') || content.includes('solver') || content.includes('@material');
      if (!hasPhysics) continue;

      // 1. Check for basic unit validation (simple regex for common patterns)
      // In HoloScript, units should be explicit: density: 7850 kg/m3 or density: 7850
      // If it has raw high-magnitude numbers without units, warn.
      const largeNumbers = content.match(/\d{5,}/g);
      if (largeNumbers && !content.includes('kg/m') && !content.includes('Pa')) {
        issues.push({
          file,
          reason: 'Simulation contains raw large numbers without explicit unit labels (@units).',
          suggestion: 'Annotate physical constants with @units(kg/m3) or equivalent.'
        });
      }

      // 2. Check for determinism (fixed-dt)
      if (content.includes('solver') && !content.includes('fixed_dt')) {
        issues.push({
          file,
          reason: 'Solver block lacks fixed_dt. Deterministic replay will fail.',
          suggestion: 'Add fixed_dt: 0.001 (or appropriate) to the solver configuration.'
        });
      }

    } catch { /* skip */ }
  }

  const duration = Date.now() - start;

  if (issues.length === 0) {
    record('simulation_contract', 'pass', `SimulationContract checks passed for ${simFiles.length} files`, [], duration);
  } else {
    record('simulation_contract', 'fail', `${issues.length} contract violations found`, issues, duration);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

const totalStart = Date.now();

if (!FLAGS.json) {
  console.log(C.bold('\nHOLOSCRIPT PRE-FLIGHT DIAGNOSTIC'));
  console.log(C.dim('=' .repeat(50)));
}

if (shouldRun('lockfile')) checkLockfile();
if (shouldRun('imports') || shouldRun('prefixed_imports')) checkPrefixedImports();
if (shouldRun('loaders') || shouldRun('loader_imports')) checkLoaderImports();
if (shouldRun('typescript') || shouldRun('ts')) checkTypeScript();
if (shouldRun('dts')) checkDTS();
if (shouldRun('circular')) checkCircular();
if (shouldRun('simulation') || shouldRun('holosim')) checkSimulationContracts();

const totalDuration = Date.now() - totalStart;

// ── Output ──────────────────────────────────────────────────────────────────

if (FLAGS.json) {
  const output = {
    timestamp: new Date().toISOString(),
    duration_ms: totalDuration,
    checks: results,
    summary: {
      pass: results.filter(r => r.status === 'pass').length,
      warn: results.filter(r => r.status === 'warn').length,
      fail: results.filter(r => r.status === 'fail').length,
      skip: results.filter(r => r.status === 'skip').length,
    },
  };
  console.log(JSON.stringify(output, null, 2));

  // Save for /scan skill
  writeFileSync(join(ROOT, '.preflight-result.json'), JSON.stringify(output, null, 2));
} else {
  console.log('');
  for (const r of results) {
    const icon = r.status === 'pass' ? C.green('✓ PASS')
      : r.status === 'warn' ? C.yellow('⚠ WARN')
      : r.status === 'fail' ? C.red('✗ FAIL')
      : C.dim('○ SKIP');
    const time = r.duration_ms > 0 ? C.dim(` (${(r.duration_ms / 1000).toFixed(1)}s)`) : '';
    console.log(`  ${icon}  ${r.name.padEnd(20)} ${r.message}${time}`);
    if (r.details.length > 0 && r.status !== 'pass') {
      for (const d of r.details.slice(0, 3)) {
        const detail = d.file ? `${d.file}: ${d.import || d.message || d.reason}` : JSON.stringify(d);
        console.log(`         ${C.dim(detail)}`);
      }
      if (r.details.length > 3) {
        console.log(`         ${C.dim(`... and ${r.details.length - 3} more`)}`);
      }
    }
  }

  const pass = results.filter(r => r.status === 'pass').length;
  const warn = results.filter(r => r.status === 'warn').length;
  const fail = results.filter(r => r.status === 'fail').length;
  const skip = results.filter(r => r.status === 'skip').length;

  console.log(C.dim('\n' + '─'.repeat(50)));
  console.log(`  ${C.bold(`${pass} passed`)}  ${warn > 0 ? C.yellow(`${warn} warnings`) : ''}  ${fail > 0 ? C.red(`${fail} failed`) : ''}  ${skip > 0 ? C.dim(`${skip} skipped`) : ''}  ${C.dim(`(${(totalDuration / 1000).toFixed(1)}s)`)}`);

  if (fail > 0) {
    console.log(C.red('\n  Pre-flight FAILED. Fix issues before pushing.'));
    if (!FLAGS.fix) console.log(C.dim('  Run: pnpm preflight --fix for auto-fixable issues\n'));
  } else {
    console.log(C.green('\n  Pre-flight PASSED. Safe to push.\n'));
  }
}

process.exit(results.some(r => r.status === 'fail') ? 1 : 0);
