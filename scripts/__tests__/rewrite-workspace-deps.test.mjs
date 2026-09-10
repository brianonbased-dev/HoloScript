#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  leftoverWorkspaceSpecs,
  rewriteWorkspaceRefs,
  rewriteWorkspaceSpec,
} from '../holo-ci/rewrite-workspace-deps.mjs';

let failures = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`ok   ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${label}\n     ${String(error.message).split('\n')[0]}`);
  }
}

check('workspace:^ becomes a caret semver', () => {
  assert.equal(rewriteWorkspaceSpec('workspace:^', '@holoscript/core', '8.8.0'), '^8.8.0');
});

check('an optional peer leftover is a leak', () => {
  const leftovers = leftoverWorkspaceSpecs({
    name: '@holoscript/snn-webgpu',
    peerDependencies: { '@holoscript/core': 'workspace:^' },
    peerDependenciesMeta: { '@holoscript/core': { optional: true } },
  });
  assert.equal(leftovers.length, 1);
  assert.equal(leftovers[0].field, 'peerDependencies');
  assert.equal(leftovers[0].spec, 'workspace:^');
});

check('rewrite clears optional workspace peers', () => {
  const pkg = {
    name: '@holoscript/snn-webgpu',
    peerDependencies: { '@holoscript/core': 'workspace:^', '@webgpu/types': '>=0.1.40' },
  };
  const rewrites = rewriteWorkspaceRefs(pkg, new Map([['@holoscript/core', '8.8.0']]));
  assert.equal(rewrites.length, 1);
  assert.equal(pkg.peerDependencies['@holoscript/core'], '^8.8.0');
  assert.equal(leftoverWorkspaceSpecs(pkg).length, 0);
});

check('rewrite refuses a workspace spec with no workspace version', () => {
  assert.throws(
    () =>
      rewriteWorkspaceRefs(
        { name: '@holoscript/holoembed', dependencies: { '@holoscript/config': 'workspace:*' } },
        new Map()
      ),
    /no workspace version was found/
  );
});

check('resolveVersion can cap an unpublished local tree to a registry version', () => {
  const pkg = {
    name: '@holoscript/absorb-service',
    dependencies: { '@holoscript/core': 'workspace:^' },
  };
  const rewrites = rewriteWorkspaceRefs(pkg, new Map([['@holoscript/core', '8.8.0']]), {
    resolveVersion: (name, local) => {
      assert.equal(name, '@holoscript/core');
      assert.equal(local, '8.8.0');
      return '8.7.0';
    },
  });
  assert.equal(rewrites.length, 1);
  assert.equal(rewrites[0].to, '^8.7.0');
  assert.equal(rewrites[0].localVersion, '8.8.0');
  assert.equal(rewrites[0].publishVersion, '8.7.0');
  assert.equal(pkg.dependencies['@holoscript/core'], '^8.7.0');
});

if (failures) process.exit(1);
console.log('\nall rewrite-workspace-deps cases passed');
