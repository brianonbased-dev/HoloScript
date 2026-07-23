import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const meta = readJson('distributions/systems-next/package.json');
const candidate = readJson('scripts/holo-ci/systems-0.2-candidate-manifest.json');
const wrapper = readFileSync(
  resolve(root, 'distributions/systems-next/bin/holoscriptc.cjs'),
  'utf8'
);
const builder = readFileSync(
  resolve(root, 'scripts/holo-ci/build-systems-0.2-candidate.mjs'),
  'utf8'
);

assert.equal(meta.name, '@holoscript/systems');
assert.equal(meta.version, '0.2.0');
assert.equal(meta.os, undefined);
assert.equal(meta.cpu, undefined);
assert.deepEqual(meta.optionalDependencies, {
  '@holoscript/systems-linux-x64': '0.2.0',
  '@holoscript/systems-win32-x64': '0.2.0',
});
assert.equal(meta.publishConfig.tag, 'next');

assert.equal(candidate.schema, 'holoscript.systems-platform-release-candidate/v1');
assert.equal(candidate.version, '0.2.0');
assert.equal(candidate.machineContract, 'hs-machine-v33');
assert.equal(candidate.immutablePredecessor.package, '@holoscript/systems@0.1.0');
assert.equal(candidate.promotionPolicy.latestMutationAllowed, false);
assert.equal(candidate.platformPackages['linux-x64'].name, '@holoscript/systems-linux-x64');
assert.equal(candidate.platformPackages['win32-x64'].name, '@holoscript/systems-win32-x64');

assert.match(wrapper, /@holoscript\/systems-linux-x64/u);
assert.match(wrapper, /@holoscript\/systems-win32-x64/u);
assert.match(wrapper, /reinstall without omitting optional dependencies/u);
assert.doesNotMatch(wrapper, /native[\\/]win32-x64/u);

assert.match(builder, /rust:1\.91-bookworm/u);
assert.match(builder, /node:22-bookworm/u);
assert.match(builder, /deterministicRepackSha256/u);
assert.match(builder, /Windows cold consumer executable exited/u);
assert.match(builder, /linux-consumer/u);

console.log('[systems-0.2-candidate-source] tests PASS');
