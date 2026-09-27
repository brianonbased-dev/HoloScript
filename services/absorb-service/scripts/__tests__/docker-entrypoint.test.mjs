import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRYPOINT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docker-entrypoint.sh');
const HOST_PACKAGE_JSON = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
const DATABASE_URL = 'postgres://absorb_user:super-secret@db.internal:5432/absorb';

function nonCommentLines(source) {
  return source.split('\n').filter((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith('#');
  });
}

function pushHits(source) {
  return nonCommentLines(source).filter(
    (line) => line.includes('drizzle-kit push') || line.includes('push --force')
  );
}

test('docker-entrypoint.sh has no drizzle-kit push fallback outside comments', () => {
  const source = readFileSync(ENTRYPOINT, 'utf8');
  const hits = pushHits(source);
  console.log(`non-comment drizzle-kit push / push --force lines: ${hits.length}`);
  assert.deepEqual(hits, []);
  const bypass = nonCommentLines(source).filter((line) => line.includes('ABSORB_REQUIRE_DB_SCHEMA'));
  assert.deepEqual(bypass, []);
  const fetchers = nonCommentLines(source).filter((line) => /\bnpx\b/.test(line));
  assert.deepEqual(fetchers, []);
});

test('absorb start script does not push schema or call npx', () => {
  const pkg = JSON.parse(readFileSync(HOST_PACKAGE_JSON, 'utf8'));
  const start = pkg.scripts?.start ?? '';
  const pushHits = start.includes('drizzle-kit push') ? 1 : 0;
  const npxHits = start.includes('npx') ? 1 : 0;
  console.log(`absorb start drizzle-kit push hits: ${pushHits}`);
  console.log(`absorb start npx hits: ${npxHits}`);
  console.log(`absorb start script: ${start}`);
  assert.equal(pkg.name, '@holoscript/absorb-service-host');
  assert.equal(pushHits, 0);
  assert.equal(npxHits, 0);
  assert.equal(pkg.scripts['db:push'], 'drizzle-kit push');
  assert.equal(pkg.scripts['db:migrate'], 'drizzle-kit migrate');
});

function writeExecutable(path, body) {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

function layout(label) {
  const root = mkdtempSync(join(tmpdir(), `absorb-entrypoint-${label}-`));
  const binDir = join(root, 'bin');
  const log = join(root, 'stub.log');
  mkdirSync(binDir);
  writeFileSync(log, '');
  const app = join(root, 'app');
  mkdirSync(join(app, 'node_modules', '.pnpm', 'drizzle-kit@0.31.10', 'node_modules', 'drizzle-kit'), {
    recursive: true,
  });
  writeFileSync(
    join(app, 'node_modules', '.pnpm', 'drizzle-kit@0.31.10', 'node_modules', 'drizzle-kit', 'bin.cjs'),
    ''
  );
  mkdirSync(join(app, 'services', 'absorb-service', 'dist'), { recursive: true });
  writeFileSync(join(app, 'services', 'absorb-service', 'dist', 'server.js'), '');

  writeExecutable(
    join(binDir, 'node'),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$STUB_LOG"
case "$*" in
  *push*)
    printf '%s\\n' "PUSH $*" >> "$STUB_LOG"
    exit 99
    ;;
esac
case "$1" in
  --input-type=module)
    exit "\${STUB_VERIFY_EXIT:-0}"
    ;;
esac
case "$*" in
  *bin.cjs*)
    exit "\${STUB_MIGRATE_EXIT:-0}"
    ;;
esac
exit 0
`
  );
  writeExecutable(
    join(binDir, 'npx'),
    `#!/bin/sh
printf '%s\\n' "NPX $*" >> "$STUB_LOG"
printf '%s\\n' "PUSH $*" >> "$STUB_LOG"
exit 99
`
  );
  writeExecutable(
    join(binDir, 'drizzle-kit'),
    `#!/bin/sh
printf '%s\\n' "DRIZZLE_KIT $*" >> "$STUB_LOG"
printf '%s\\n' "PUSH $*" >> "$STUB_LOG"
exit 99
`
  );
  return { root, app, binDir, log };
}

function runEntrypoint(fixture, env) {
  return spawnSync('sh', [ENTRYPOINT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.binDir}:${process.env.PATH}`,
      ABSORB_APP_ROOT: fixture.app,
      DATABASE_URL,
      STUB_LOG: fixture.log,
      ...env,
    },
  });
}

function countPush(log) {
  return readFileSync(log, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('PUSH ') || line.startsWith('NPX ') || line.startsWith('DRIZZLE_KIT ')).length;
}

test('migrate failure exits non-zero and never invokes push', () => {
  const fixture = layout('migrate-fail');
  try {
    const result = runEntrypoint(fixture, { STUB_MIGRATE_EXIT: '1', STUB_VERIFY_EXIT: '0' });
    const pushCount = countPush(fixture.log);
    const log = readFileSync(fixture.log, 'utf8');
    console.log(`migrate-failure exit: ${result.status} push invocations: ${pushCount}`);
    console.log(`migrate-failure stub log lines: ${log.trim().split('\n').filter(Boolean).length}`);
    assert.notEqual(result.status, 0);
    assert.equal(result.status, 1);
    assert.equal(pushCount, 0);
    assert.match(result.stdout, /ERROR: drizzle-kit migrate failed/);
    assert.match(result.stdout, /DATABASE_URL host: db\.internal:5432/);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /super-secret/);
    assert.doesNotMatch(log, /server\.js/);
    assert.doesNotMatch(log, /--input-type=module/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('missing tables after a successful migrate exit non-zero and never invoke push', () => {
  const fixture = layout('verify-fail');
  try {
    const result = runEntrypoint(fixture, { STUB_MIGRATE_EXIT: '0', STUB_VERIFY_EXIT: '1' });
    const pushCount = countPush(fixture.log);
    console.log(`missing-tables exit: ${result.status} push invocations: ${pushCount}`);
    assert.equal(result.status, 1);
    assert.equal(pushCount, 0);
    assert.match(result.stdout, /ERROR: verify_required_schema failed/);
    assert.match(result.stdout, /DATABASE_URL host: db\.internal:5432/);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /super-secret/);
    assert.doesNotMatch(readFileSync(fixture.log, 'utf8'), /server\.js/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('pnpm cmd-shim relative path doubles node_modules through the workspace symlink', () => {
  const root = mkdtempSync(join(tmpdir(), 'absorb-shim-'));
  try {
    const realBinDir = join(root, 'services', 'absorb-service', 'node_modules', '.bin');
    const storeBin = join(
      root,
      'node_modules',
      '.pnpm',
      'drizzle-kit@0.31.10',
      'node_modules',
      'drizzle-kit'
    );
    mkdirSync(realBinDir, { recursive: true });
    mkdirSync(storeBin, { recursive: true });
    writeFileSync(join(storeBin, 'bin.cjs'), 'process.stdout.write("kit-ok\\n");\n');
    writeExecutable(
      join(realBinDir, 'drizzle-kit'),
      `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")
exec node "$basedir/../../../../node_modules/.pnpm/drizzle-kit@0.31.10/node_modules/drizzle-kit/bin.cjs" "$@"
`
    );
    mkdirSync(join(root, 'node_modules', '@holoscript'), { recursive: true });
    symlinkSync(
      '../../services/absorb-service',
      join(root, 'node_modules', '@holoscript', 'absorb-service-host')
    );

    const real = spawnSync(join(realBinDir, 'drizzle-kit'), ['--help'], { encoding: 'utf8' });
    const viaSymlink = spawnSync(
      join(root, 'node_modules', '@holoscript', 'absorb-service-host', 'node_modules', '.bin', 'drizzle-kit'),
      ['--help'],
      { encoding: 'utf8' }
    );
    assert.equal(real.status, 0);
    assert.match(real.stdout, /kit-ok/);
    assert.notEqual(viaSymlink.status, 0);
    const doubled = `${root}/node_modules/node_modules/.pnpm/drizzle-kit@0.31.10/node_modules/drizzle-kit/bin.cjs`;
    assert.match(`${viaSymlink.stderr}`, new RegExp(doubled.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    console.log(`shim real-path exit: ${real.status}; symlink-path exit: ${viaSymlink.status}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
