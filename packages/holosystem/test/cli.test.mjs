import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(PACKAGE_ROOT, 'bin', 'holosystem.mjs');

function run(args, { cwd, input } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

test('package bin is wired to the executable CLI and help is available', () => {
  const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  const result = run(['--help'], { cwd: PACKAGE_ROOT });

  assert.equal(manifest.bin.holosystem, 'bin/holosystem.mjs');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /holosystem create/u);
  assert.match(result.stdout, /holosystem inspect/u);
});

test('create writes a portable config and inspect emits an agent receipt', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'holosystem-cli-'));
  try {
    const created = run(['create', '--id', 'contoso-founder', '--workspace', 'contoso', '--json'], {
      cwd,
    });
    assert.equal(created.status, 0, created.stderr);
    const createReceipt = JSON.parse(created.stdout);
    assert.equal(createReceipt.ok, true);

    const inspected = run(['inspect', 'holosystem.config.json', '--json'], { cwd });
    assert.equal(inspected.status, 0, inspected.stderr);
    const inspectReceipt = JSON.parse(inspected.stdout);
    assert.equal(inspectReceipt.operation, 'inspect');
    assert.equal(inspectReceipt.report.ready, true);
    assert.equal(inspectReceipt.report.summary.consumer.id, 'contoso-founder');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('create refuses accidental overwrite and inspect fails closed on invalid config', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'holosystem-cli-'));
  try {
    assert.equal(run(['create'], { cwd }).status, 0);
    const overwrite = run(['create', '--json'], { cwd });
    assert.equal(overwrite.status, 1);
    assert.match(overwrite.stderr, /already exists/u);

    writeFileSync(
      join(cwd, 'invalid.json'),
      JSON.stringify({ schema: 'unknown', password: 'private-value-must-not-echo' }),
      'utf8'
    );
    const inspected = run(['inspect', 'invalid.json', '--json'], { cwd });
    assert.equal(inspected.status, 2);
    assert.doesNotMatch(inspected.stdout, /private-value-must-not-echo/u);
    const receipt = JSON.parse(inspected.stdout);
    assert.equal(receipt.ok, false);
    assert.ok(receipt.report.errors.some((error) => error.code === 'embedded-sensitive-field'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('inspect accepts a config over stdin for agent pipelines', () => {
  const created = run(['create', '--stdout'], { cwd: PACKAGE_ROOT });
  assert.equal(created.status, 0, created.stderr);

  const inspected = run(['inspect', '-', '--json'], {
    cwd: PACKAGE_ROOT,
    input: created.stdout,
  });
  assert.equal(inspected.status, 0, inspected.stderr);
  assert.equal(JSON.parse(inspected.stdout).report.ready, true);
});
