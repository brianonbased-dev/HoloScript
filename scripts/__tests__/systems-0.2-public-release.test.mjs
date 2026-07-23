import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateGitHubRelease,
  evaluateRegistryPackage,
} from '../holo-ci/check-systems-0.2-public-release.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(
  readFileSync(join(root, 'scripts/holo-ci/systems-0.2-release-manifest.json'), 'utf8')
);
const hash = (path) =>
  createHash('sha256').update(readFileSync(join(root, path))).digest('hex');

assert.equal(manifest.schema, 'holoscript.systems-platform-public-release/v1');
assert.equal(manifest.version, '0.2.0');
assert.equal(manifest.channel, 'next');
assert.equal(manifest.machineContract, 'hs-machine-v33');
assert.equal(manifest.github.prerelease, true);
assert.equal(manifest.packages.at(-1).id, 'meta');
assert.ok(
  manifest.packages
    .filter((pkg) => pkg.id !== 'meta')
    .every((pkg) => pkg.publishOrder < manifest.packages.at(-1).publishOrder)
);
assert.equal(manifest.packages.at(-1).distTags.latest, '0.1.0');
assert.equal(manifest.packages.at(-1).distTags.preview, '0.1.0');
assert.ok(
  manifest.packages
    .filter((pkg) => pkg.id !== 'meta')
    .every((pkg) => pkg.distTags.latest === '0.2.0' && pkg.distTags.next === '0.2.0')
);

for (const expected of [...manifest.packages, ...manifest.github.assets]) {
  const path = expected.artifact || expected.path;
  assert.equal(statSync(join(root, path)).size, expected.bytes);
  assert.equal(hash(path), expected.sha256);
}

const expected = manifest.packages.at(-1);
const packument = {
  'dist-tags': expected.distTags,
  versions: {
    [expected.version]: {
      name: expected.name,
      version: expected.version,
      dist: {
        integrity: expected.integrity,
        shasum: expected.shasum,
        tarball: expected.tarballUrl,
      },
    },
  },
  time: { [expected.version]: '2026-07-23T00:00:00.000Z' },
};
assert.equal(evaluateRegistryPackage(expected, packument).ok, true);
assert.equal(
  evaluateRegistryPackage(expected, {
    ...packument,
    'dist-tags': { ...expected.distTags, latest: '0.2.0' },
  }).ok,
  false
);
const release = {
  tag_name: manifest.github.tag,
  draft: false,
  prerelease: true,
  assets: manifest.github.assets.map((asset) => ({
    name: asset.name,
    size: asset.bytes,
    digest: `sha256:${asset.sha256}`,
    browser_download_url: `https://example.invalid/${asset.name}`,
  })),
};
assert.equal(evaluateGitHubRelease(manifest, release).ok, true);
assert.equal(evaluateGitHubRelease(manifest, { ...release, prerelease: false }).ok, false);
assert.equal(evaluateGitHubRelease(manifest, { ...release, assets: [] }).ok, false);

console.log('[systems-0.2-public-release] tests PASS');
