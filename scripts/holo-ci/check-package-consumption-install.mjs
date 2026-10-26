#!/usr/bin/env node
/**
 * check-package-consumption-install — prove a public package installs and imports for a
 * real npm consumer, from the packed tarball, under several npm majors.
 *
 * For --package <name>:
 *   1. collect the package plus its workspace @holoscript closure (dependencies,
 *      optionalDependencies, peerDependencies that point at workspace packages);
 *   2. `pnpm pack` each one (workspace:/catalog: ranges are rewritten exactly as on publish);
 *   3. for each npm version: fresh empty temp dir + fresh empty npm cache,
 *      `npx -y npm@<v> install <all tarballs> --cache <empty>` must exit 0;
 *   4. dynamic-import every JS entry in the target's "exports" from the consumer dir.
 * Writes a receipt (git HEAD, tarball sha256s, npm versions, exit codes, per-export result).
 * Any failure exits 1. Packages must be built first (pnpm --filter "<name>..." build).
 *
 *   node scripts/holo-ci/check-package-consumption-install.mjs --package @holoscript/absorb-service \
 *     [--npm 10.9.2,11.6.2] [--receipt <path>]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[consumption-install]';
const IS_WIN = process.platform === 'win32';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
}

const target = arg('package');
const npmVersions = arg('npm', '10.9.2,11.6.2')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (!target) {
  console.error(`${TAG} usage: --package <name> [--npm 10.9.2,11.6.2] [--receipt <path>]`);
  process.exit(2);
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', shell: IS_WIN, maxBuffer: 1 << 28, ...opts });
}

function workspacePackages() {
  const map = new Map();
  for (const base of ['packages', 'packages/plugins', 'services', 'benchmarks']) {
    const abs = path.join(ROOT, base);
    if (!fs.existsSync(abs)) continue;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const pj = path.join(abs, e.name, 'package.json');
      if (!e.isDirectory() || !fs.existsSync(pj)) continue;
      const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
      if (j.name) map.set(j.name, { dir: path.dirname(pj), manifest: j });
    }
  }
  return map;
}

function closure(ws, name) {
  const seen = new Set();
  const stack = [name];
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n)) continue;
    const pkg = ws.get(n);
    if (!pkg) throw new Error(`${n} is not a workspace package`);
    seen.add(n);
    const m = pkg.manifest;
    const isOptionalPeer = (d) => m.peerDependenciesMeta?.[d]?.optional;
    for (const [d, range] of [
      ...Object.entries(m.dependencies ?? {}),
      ...Object.entries(m.optionalDependencies ?? {}),
      ...Object.entries(m.peerDependencies ?? {}).filter(([d]) => !isOptionalPeer(d)),
    ]) {
      if (ws.has(d) && String(range).startsWith('workspace:')) stack.push(d);
    }
  }
  return [...seen];
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function exportEntries(manifest) {
  const ex = manifest.exports;
  if (!ex || typeof ex === 'string') return ['.'];
  return Object.entries(ex)
    .filter(([sub, v]) => sub !== './package.json' && !sub.includes('*'))
    .filter(([, v]) => typeof v === 'string' || v?.import || v?.default || v?.node)
    .map(([sub]) => sub);
}

const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const ws = workspacePackages();
const names = closure(ws, target);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'holo-consume-'));
const tgzDir = path.join(work, 'tgz');
fs.mkdirSync(tgzDir);
console.log(`${TAG} HEAD ${head}`);
console.log(`${TAG} target ${target}; closure (${names.length}): ${names.join(', ')}`);

const tarballs = [];
for (const n of names) {
  const { dir, manifest } = ws.get(n);
  const r = run(
    'corepack', // --ignore-scripts: packages are pre-built; publish-time prepack probes (e.g. secrets-broker
    // repository-identity check) are not part of consumer installability.
    ['pnpm', 'pack', '--config.ignore-scripts=true', '--pack-destination', tgzDir],
    { cwd: dir }
  );
  if (r.status !== 0) {
    console.error(`${TAG} FAIL: pnpm pack ${n}\n${r.stdout}\n${r.stderr}`);
    process.exit(1);
  }
  const file = fs
    .readdirSync(tgzDir)
    .map((f) => path.join(tgzDir, f))
    .find((f) => !tarballs.some((t) => t.file === f));
  tarballs.push({ name: n, version: manifest.version, file, sha256: sha256(file) });
}

const targetManifest = ws.get(target).manifest;
const entries = exportEntries(targetManifest);
const results = [];
let ok = true;
for (const v of npmVersions) {
  const consumer = path.join(work, `npm-${v}`);
  const cache = path.join(work, `cache-${v}`);
  fs.mkdirSync(consumer);
  fs.mkdirSync(cache);
  fs.writeFileSync(
    path.join(consumer, 'package.json'),
    JSON.stringify({ name: 'holo-consumer', private: true, type: 'module' }, null, 2)
  );
  const ver = run('npx', ['-y', `npm@${v}`, '--version'], { cwd: consumer });
  const install = run(
    'npx',
    [
      '-y',
      `npm@${v}`,
      'install',
      ...tarballs.map((t) => t.file),
      '--cache',
      cache,
      '--no-audit',
      '--no-fund',
      '--loglevel=error',
    ],
    { cwd: consumer }
  );
  const res = {
    npm: v,
    npmReported: (ver.stdout || '').trim(),
    installExit: install.status,
    installTail: (install.stderr || install.stdout || '').trim().split('\n').slice(-15).join('\n'),
    imports: [],
  };
  if (install.status === 0) {
    for (const sub of entries) {
      const spec = sub === '.' ? target : `${target}/${sub.replace(/^\.\//, '')}`;
      const imp = run(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import(${JSON.stringify(spec)}).then(()=>process.exit(0),(e)=>{console.error(e?.stack||e);process.exit(1)})`,
        ],
        { cwd: consumer, shell: false, timeout: 120000 }
      );
      res.imports.push({
        spec,
        exit: imp.status,
        error:
          imp.status === 0
            ? undefined
            : (imp.stderr || '').trim().split('\n').slice(0, 6).join('\n'),
      });
    }
  }
  const pass = res.installExit === 0 && res.imports.every((i) => i.exit === 0);
  res.verdict = pass ? 'PASS' : 'FAIL';
  ok &&= pass;
  results.push(res);
  console.log(
    `${TAG} npm ${v} (${res.npmReported}): install exit ${res.installExit}; imports ${
      res.imports.filter((i) => i.exit === 0).length
    }/${entries.length} -> ${res.verdict}`
  );
  if (res.installExit !== 0) console.log(res.installTail);
  for (const i of res.imports.filter((x) => x.exit !== 0))
    console.log(`  import ${i.spec} FAILED\n${i.error}`);
}

const receipt = {
  check: 'package-consumption-install',
  head,
  target: `${target}@${targetManifest.version}`,
  node: process.version,
  tarballs: tarballs.map(({ name, version, file, sha256: h }) => ({
    name,
    version,
    file: path.basename(file),
    sha256: h,
  })),
  exportsChecked: entries,
  results,
  verdict: ok ? 'PASS' : 'FAIL',
  at: new Date().toISOString(),
};
const receiptPath = arg(
  'receipt',
  path.join(
    ROOT,
    '.scratch',
    'receipts',
    `consumption-${target.replace(/[@/]/g, '_')}-${head.slice(0, 10)}.json`
  )
);
fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
console.log(`${TAG} receipt ${receiptPath} sha256 ${sha256(receiptPath)}`);
console.log(`${TAG} ${receipt.verdict}`);
process.exit(ok ? 0 : 1);
