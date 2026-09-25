#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  combineAllowlist,
  evaluateReleasePublishAllowlist,
  packagesAfterHolds,
  prepareFilteredPublish,
  resolveFilteredPublishPlan,
  restoreSnapshots,
  runAllowlistSelfTest,
  scrubSecrets,
  versionsFromNpmView,
} from '../holo-ci/release-publish-allowlist.mjs';
import {
  POST_PUBLISH_ARGS,
  PRE_PUBLISH_ARGS,
  parseReleasePublishArgs,
  runReleasePublish,
} from '../holo-ci/release-publish.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const ALLOWLIST_SCRIPT = resolve(REPO_ROOT, 'scripts/holo-ci/release-publish-allowlist.mjs');

const llm = {
  name: '@holoscript/llm-provider',
  version: '1.6.2',
  registryVersions: ['1.6.1'],
  filePath: '/tmp/llm-provider/package.json',
};
const core = {
  name: '@holoscript/core',
  version: '8.8.0',
  registryVersions: ['8.7.0'],
  filePath: '/tmp/core/package.json',
};

describe('allowlist gate', () => {
  it('self-test covers empty allowlist, one package, missing package, and stray failure', () => {
    const failures = runAllowlistSelfTest();
    assert.deepEqual(failures, []);
  });

  it('empty allowlist', () => {
    const result = evaluateReleasePublishAllowlist({ allowlist: [], packages: [llm] });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'empty-allowlist');
    assert.deepEqual(combineAllowlist({ RELEASE_PUBLISH_ALLOWLIST: '' }, null), {
      code: 'empty-allowlist',
      error:
        'RELEASE_PUBLISH_ALLOWLIST / --packages is empty. Unset it for a full-fleet publish. An empty allowlist does not publish everything.',
    });
  });

  it('one package', () => {
    const result = evaluateReleasePublishAllowlist({
      allowlist: ['@holoscript/llm-provider'],
      packages: [llm],
    });
    assert.equal(result.ok, true);
    assert.equal(result.code, 'allowlist');
    assert.deepEqual(result.publishSet, ['@holoscript/llm-provider']);
    assert.equal(resolveFilteredPublishPlan(result).action, 'proceed');
  });

  it('package not in unpublished set', () => {
    const result = evaluateReleasePublishAllowlist({
      allowlist: ['@holoscript/llm-provider'],
      packages: [{ ...llm, registryVersions: ['1.6.1', '1.6.2'] }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'not-unpublished');
  });

  it('stray unpublished outside allowlist → fail', () => {
    const result = evaluateReleasePublishAllowlist({
      allowlist: ['@holoscript/llm-provider'],
      packages: [llm, core],
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'stray-unpublished');
    assert.deepEqual(result.strays, ['@holoscript/core']);
    const decision = resolveFilteredPublishPlan(result);
    assert.equal(decision.action, 'hold-then-proceed');
    const recheck = evaluateReleasePublishAllowlist({
      allowlist: ['@holoscript/llm-provider'],
      packages: packagesAfterHolds([llm, core], decision.holds),
    });
    assert.equal(recheck.ok, true);
    assert.deepEqual(recheck.publishSet, ['@holoscript/llm-provider']);
  });

  it('holds outsiders at the npm latest tag when a higher version is untagged', () => {
    const result = evaluateReleasePublishAllowlist({
      allowlist: ['@holoscript/llm-provider'],
      packages: [
        llm,
        {
          ...core,
          registryVersions: ['8.7.0', '9.0.0'],
          registryLatest: '8.7.0',
        },
      ],
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'stray-unpublished');
    assert.equal(resolveFilteredPublishPlan(result).holds[0].to, '8.7.0');
  });

  it('never-published stray cannot be held', () => {
    const result = evaluateReleasePublishAllowlist({
      allowlist: ['@holoscript/llm-provider'],
      packages: [llm, { ...core, registryVersions: [] }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'stray-unpublished');
    assert.deepEqual(result.unholdable, ['@holoscript/core']);
    assert.equal(resolveFilteredPublishPlan(result).action, 'fail');
  });

  it('refuses to split a changeset fixed group', () => {
    const cli = {
      name: '@holoscript/cli',
      version: '8.8.0',
      registryVersions: ['8.7.0'],
      filePath: '/tmp/cli/package.json',
    };
    const result = evaluateReleasePublishAllowlist({
      allowlist: ['@holoscript/core'],
      packages: [core, cli],
      groups: [['@holoscript/core', '@holoscript/cli']],
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'grouped-with-stray');
    assert.equal(resolveFilteredPublishPlan(result).action, 'fail');
  });

  it('unset allowlist stays full fleet', () => {
    const result = evaluateReleasePublishAllowlist({ allowlist: null, packages: [llm, core] });
    assert.equal(result.ok, true);
    assert.equal(result.code, 'full-fleet');
    assert.equal(combineAllowlist({}, null).allowlist, null);
  });
});

describe('hold snapshots', () => {
  it('holds stray tip versions and restores the original bytes', async () => {
    const root = makeRepo([
      { dir: 'llm-provider', name: '@holoscript/llm-provider', version: '1.6.2' },
      { dir: 'core', name: '@holoscript/core', version: '8.8.0' },
    ]);
    const corePath = join(root, 'packages', 'core', 'package.json');
    const original = readFileSync(corePath);
    const prepared = await prepareFilteredPublish({
      rootDir: root,
      allowlist: ['@holoscript/llm-provider'],
      logger() {},
      lookupRegistryVersions: async (name) =>
        name === '@holoscript/llm-provider' ? ['1.6.1'] : ['8.7.0', '8.6.0'],
    });
    try {
      assert.equal(prepared.ok, true);
      assert.deepEqual(prepared.publishSet, ['@holoscript/llm-provider']);
      assert.equal(JSON.parse(readFileSync(corePath, 'utf8')).version, '8.7.0');
      assert.equal(JSON.parse(readFileSync(join(root, 'packages', 'llm-provider', 'package.json'), 'utf8')).version, '1.6.2');
    } finally {
      restoreSnapshots(prepared.snapshots);
      if (prepared.receiptPath) rmSync(prepared.receiptPath, { force: true });
    }
    assert.equal(readFileSync(corePath).equals(original), true);
    rmSync(root, { recursive: true, force: true });
  });

  it('leaves the tree untouched when a stray has never been published', async () => {
    const root = makeRepo([
      { dir: 'llm-provider', name: '@holoscript/llm-provider', version: '1.6.2' },
      { dir: 'core', name: '@holoscript/core', version: '8.8.0' },
    ]);
    const corePath = join(root, 'packages', 'core', 'package.json');
    const original = readFileSync(corePath);
    const prepared = await prepareFilteredPublish({
      rootDir: root,
      allowlist: ['@holoscript/llm-provider'],
      logger() {},
      lookupRegistryVersions: async (name) => (name === '@holoscript/llm-provider' ? ['1.6.1'] : []),
    });
    assert.equal(prepared.ok, false);
    assert.equal(prepared.code, 'stray-unpublished');
    assert.equal(readFileSync(corePath).equals(original), true);
    rmSync(root, { recursive: true, force: true });
  });

  it('does not query the registry for full-fleet mode', async () => {
    let lookups = 0;
    const prepared = await prepareFilteredPublish({
      rootDir: REPO_ROOT,
      allowlist: null,
      logger() {},
      lookupRegistryVersions: async () => {
        lookups += 1;
        return [];
      },
    });
    assert.equal(prepared.ok, true);
    assert.equal(prepared.code, 'full-fleet');
    assert.equal(lookups, 0);
  });
});

describe('release:publish wrapper', () => {
  it('keeps the historical gate chain around changeset publish', async () => {
    const calls = [];
    const code = await runReleasePublish({
      argv: ['node', 'release-publish.mjs'],
      env: {},
      rootDir: REPO_ROOT,
      runStep(_cmd, args) {
        calls.push(args.join(' '));
        return 0;
      },
      prepare: async () => ({ ok: true, code: 'full-fleet', snapshots: [], publishSet: null }),
      restore() {
        calls.push('restore');
      },
    });
    assert.equal(code, 0);
    const flat = calls.join('\n');
    for (const args of PRE_PUBLISH_ARGS) {
      assert.equal(flat.includes(args[0]), true, args[0]);
    }
    for (const args of POST_PUBLISH_ARGS) {
      assert.equal(flat.includes(args[0]), true, args[0]);
    }
    const publishAt = calls.findIndex((call) => call.startsWith('publish'));
    const stewardAt = calls.findIndex((call) => call.includes('check-package-stewardship.mjs'));
    const postAt = calls.findIndex((call) => call.includes('check-registry-cold-start.mjs'));
    const restoreAt = calls.indexOf('restore');
    assert.ok(stewardAt < publishAt);
    assert.ok(publishAt < restoreAt);
    assert.ok(restoreAt < postAt);
    assert.equal(calls.filter((call) => call.startsWith('publish')).length, 1);
  });

  it('does not call changeset publish when the allowlist gate fails', async () => {
    const calls = [];
    const code = await runReleasePublish({
      argv: ['node', 'release-publish.mjs', '--packages=@holoscript/llm-provider'],
      env: {},
      rootDir: REPO_ROOT,
      runStep(_cmd, args) {
        calls.push(args.join(' '));
        return 0;
      },
      prepare: async () => ({ ok: false, code: 'stray-unpublished', message: 'stray', snapshots: [] }),
      restore() {
        calls.push('restore');
      },
    });
    assert.equal(code, 1);
    assert.equal(calls.some((call) => call.startsWith('publish')), false);
    assert.equal(calls.at(-1), 'restore');
    assert.equal(calls.some((call) => call.includes('check-registry-cold-start.mjs')), false);
  });

  it('restores holds when changeset publish fails and skips post gates', async () => {
    const calls = [];
    const code = await runReleasePublish({
      argv: ['node', 'release-publish.mjs'],
      env: { RELEASE_PUBLISH_ALLOWLIST: '@holoscript/llm-provider' },
      rootDir: REPO_ROOT,
      runStep(_cmd, args) {
        calls.push(args.join(' '));
        return args[0] === 'publish' ? 1 : 0;
      },
      prepare: async () => ({
        ok: true,
        snapshots: [{ filePath: 'held', originalBytes: Buffer.from('{}') }],
        publishSet: ['@holoscript/llm-provider'],
      }),
      restore(snapshots) {
        calls.push(`restore:${snapshots.length}`);
      },
    });
    assert.equal(code, 1);
    assert.equal(calls.at(-1), 'restore:1');
    assert.equal(calls.some((call) => call.includes('cold-repro-onramp.mjs --published')), false);
  });

  it('fails closed on an empty allowlist before any gate', async () => {
    let steps = 0;
    const code = await runReleasePublish({
      argv: ['node', 'release-publish.mjs', '--packages='],
      env: {},
      runStep() {
        steps += 1;
        return 0;
      },
      prepare: async () => {
        steps += 1;
        return { ok: true, snapshots: [] };
      },
    });
    assert.equal(code, 1);
    assert.equal(steps, 0);
    assert.equal(parseReleasePublishArgs(['node', 'script', '--skip-gates']).error.includes('Unknown argument'), true);
  });
});

describe('repo contract', () => {
  it('points release:publish at the gated wrapper and blocks raw publish aliases', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['release:publish'], 'node scripts/holo-ci/release-publish.mjs');
    assert.match(pkg.scripts.publish, /exit 1/);
    assert.match(pkg.scripts['changeset:publish'], /exit 1/);
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'packages/llm-provider/package.json'), 'utf8'));
    assert.equal(manifest.name, '@holoscript/llm-provider');
    assert.equal(manifest.private, undefined);
    const config = JSON.parse(readFileSync(join(REPO_ROOT, '.changeset/config.json'), 'utf8'));
    const groups = [...(config.fixed || []), ...(config.linked || [])];
    for (const group of groups) {
      assert.equal(group.includes('@holoscript/llm-provider'), false);
    }
  });

  it('cli self-test exits 0', () => {
    const result = spawnSync(process.execPath, [ALLOWLIST_SCRIPT, '--self-test'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });

  it('scrubs registry errors and treats npm 404 as unpublished', () => {
    assert.equal(scrubSecrets('token npm_abc123 and _authToken=sekret'), 'token npm_[redacted] and _authToken=[redacted]');
    assert.deepEqual(
      versionsFromNpmView({ status: 1, stdout: '', stderr: 'npm ERR! code E404\nnpm ERR! 404 Not Found' }),
      []
    );
    assert.deepEqual(versionsFromNpmView({ status: 0, stdout: '"1.6.1"\n', stderr: '' }), ['1.6.1']);
  });
});

function makeRepo(packages, groups = []) {
  const root = mkdtempSync(join(tmpdir(), 'release-allowlist-'));
  writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  mkdirSync(join(root, '.changeset'), { recursive: true });
  writeFileSync(
    join(root, '.changeset', 'config.json'),
    JSON.stringify({ fixed: groups, linked: [] })
  );
  for (const pkg of packages) {
    const dir = join(root, 'packages', pkg.dir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      `${JSON.stringify(
        {
          name: pkg.name,
          version: pkg.version,
          license: 'MIT',
        },
        null,
        2
      )}\n`
    );
  }
  return root;
}
