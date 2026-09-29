#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'holo-ci', 'check-package-consumption-matrix.mjs');
const PACKAGE_JSON = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

let testsRun = 0;
let testsFailed = 0;

function assert(condition, name, detail = '') {
  testsRun += 1;
  if (condition) {
    console.log(`  PASS ${name}`);
    return;
  }
  testsFailed += 1;
  console.error(`  FAIL ${name}${detail ? `: ${detail}` : ''}`);
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function buildFixture() {
  const root = mkdtempSync(join(tmpdir(), 'package-consumption-'));
  const pkgDir = join(root, 'packages', 'core');
  const manifestDir = join(root, 'scripts', 'holo-ci');
  mkdirSync(pkgDir, { recursive: true });
  mkdirSync(manifestDir, { recursive: true });
  writeJson(join(pkgDir, 'package.json'), {
    name: '@holoscript/core',
    version: '8.7.0',
    description: 'Fixture core package',
    license: 'MIT',
    repository: { type: 'git', url: 'https://example.test/holoscript.git' },
    main: './index.js',
    files: ['index.js'],
    engines: { node: '>=20.0.0' },
  });
  writeFileSync(join(pkgDir, 'index.js'), 'export const ok = true;\n');
  writeJson(join(manifestDir, 'package-consumption-manifest.json'), {
    schema: 'holoscript.package-consumption-matrix/v1',
    consumers: [
      {
        id: 'laptop-windows',
        os: 'win32',
        cpu: 'x64',
        node: '>=20.0.0',
        python: '>=3.10',
      },
    ],
    npmPackages: [
      {
        name: '@holoscript/core',
        packageDir: 'packages/core',
        requiredBy: ['laptop-windows'],
      },
    ],
  });
  return root;
}

function run(extra = [], opts = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...extra], {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    timeout: opts.timeout || 60_000,
  });
  return {
    code: result.status,
    out: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function parseJson(out) {
  const start = out.indexOf('{');
  if (start < 0) throw new Error(`no JSON in output: ${out.slice(0, 400)}`);
  return JSON.parse(out.slice(start));
}

function writeStub(ok = true) {
  const dir = mkdtempSync(join(tmpdir(), 'consumption-cold-start-'));
  const stub = join(dir, 'stub-registry-cold-start.mjs');
  writeFileSync(
    stub,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
const packageSpec = args[args.indexOf('--package') + 1] || null;
const probe = args[args.indexOf('--probe') + 1] || null;
const ok = ${ok ? 'true' : 'false'} && Boolean(packageSpec && probe);
console.log(JSON.stringify({
  ok,
  package: { spec: packageSpec, installed: { version: '0.0.0-stub' } },
  probeKind: probe,
  finalDisposition: ok ? 'stub_passed' : 'stub_failed',
  failure: ok ? null : { reason: 'stub-failed', detail: packageSpec + ' -> ' + probe },
}));
process.exit(ok ? 0 : 1);
`
  );
  return stub;
}

console.log('check-package-consumption-matrix published bar');

{
  const result = run(['--self-test']);
  assert(result.code === 0, 'self-test exits 0', result.out.slice(0, 400));
  assert(result.out.includes('[package-consumption] self-test PASS'), 'self-test prints PASS');
}

{
  const root = buildFixture();
  const result = run(['--root', root, '--skip-registry-cold-start', '--json']);
  const json = parseJson(result.out);
  assert(result.code === 0, 'skip lane still validates fixture metadata', `exit ${result.code}`);
  assert(json.requireRegistryColdStart === false, 'skip reports requireRegistryColdStart=false');
  assert(json.registryColdStart?.skipped === true, 'skip reports registryColdStart.skipped');
  assert(
    !json.rows.some((row) => row.type === 'registry-cold-start'),
    'skip does not invent registry-cold-start rows'
  );
}

{
  const root = buildFixture();
  const stub = writeStub(true);
  const result = run([
    '--root',
    root,
    '--json',
    '--registry-cold-start-script',
    stub,
  ]);
  const json = parseJson(result.out);
  const probeRows = json.rows.filter((row) => row.type === 'registry-cold-start');
  assert(result.code === 0, 'bar with passing stubs exits 0', result.out.slice(0, 800));
  assert(json.requireRegistryColdStart === true, 'raw invocation requires registry cold-start');
  assert(
    probeRows.map((row) => `${row.name}::${row.probe}`).join(',') ===
      [
        '@holoscript/core@latest::core-holo-webgpu',
        '@holoscript/cli@latest::cli-bin-help',
        '@holoscript/mcp-server@latest::mcp-server-sizing',
      ].join(','),
    'bar invokes the three published probes',
    probeRows.map((row) => `${row.name}::${row.probe}`).join(',')
  );
  assert(
    probeRows.every((row) => row.ok === true),
    'stubbed published probes are recorded as ok'
  );
}

{
  const root = buildFixture();
  const stub = writeStub(false);
  const result = run([
    '--root',
    root,
    '--json',
    '--registry-cold-start-script',
    stub,
  ]);
  const json = parseJson(result.out);
  assert(result.code === 1, 'bar fails when registry cold-start probes fail', `exit ${result.code}`);
  assert(json.ok === false, 'failed probes mark the consumption bar not ok');
  assert(
    json.errors.some((error) => error.includes('cli-bin-help')),
    'failed CLI probe is visible in errors'
  );
}

{
  const root = buildFixture();
  const result = run([
    '--root',
    root,
    '--json',
    '--require-registry-cold-start',
    '--skip-registry-cold-start',
    '--registry-cold-start-script',
    writeStub(true),
  ]);
  const json = parseJson(result.out);
  assert(
    json.requireRegistryColdStart === true,
    'explicit require wins over skip so the wrapper cannot be dropped'
  );
  assert(
    json.rows.filter((row) => row.type === 'registry-cold-start').length === 3,
    'require+skip still invokes the three probes'
  );
}

{
  const consumption = PACKAGE_JSON.scripts['check:package-consumption'];
  const published = PACKAGE_JSON.scripts['check:package-consumption:published'];
  const full = PACKAGE_JSON.scripts['check:package-consumption:full'];
  const pypi = PACKAGE_JSON.scripts['check:pypi-consumption'];
  const coldStart = PACKAGE_JSON.scripts['check:registry-cold-start'];
  const cli = PACKAGE_JSON.scripts['check:registry-cold-start:cli'];
  const releasePublish = PACKAGE_JSON.scripts['release:publish'];
  assert(
    consumption.includes('--require-registry-cold-start'),
    'check:package-consumption is fail-closed'
  );
  assert(
    !consumption.includes('--skip-registry-cold-start'),
    'check:package-consumption cannot skip the published bar'
  );
  assert(
    published.includes('--require-registry-cold-start'),
    'published alias requires registry cold-start'
  );
  assert(
    full.includes('--require-registry-cold-start'),
    'full consumption extras still require the published bar'
  );
  assert(pypi.includes('--skip-registry-cold-start'), 'PyPI lane stays a local/PyPI check');
  assert(
    coldStart.includes('--probe cli-bin-help') &&
      coldStart.includes('@holoscript/cli@latest') &&
      coldStart.includes('core-holo-webgpu') &&
      coldStart.includes('mcp-server-sizing'),
    'check:registry-cold-start wires core, CLI, and mcp probes'
  );
  assert(
    cli.includes('@holoscript/cli@latest') && cli.includes('cli-bin-help'),
    'check:registry-cold-start:cli is wired'
  );
  assert(
    !releasePublish.includes('cli-bin-help') &&
      !releasePublish.includes('@holoscript/cli@latest --probe'),
    'release:publish stays on the previous core+mcp post-publish chain'
  );
}

if (testsFailed) {
  console.error(`\n${testsFailed}/${testsRun} failed`);
  process.exit(1);
}
console.log(`\n${testsRun} passed`);
