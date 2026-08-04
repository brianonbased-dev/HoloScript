#!/usr/bin/env node

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateGitHubRelease,
  evaluateRegistryState,
  githubReleaseApiUrl,
  parseArgs,
} from '../holo-ci/check-systems-preview-public-canary.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const manifest = JSON.parse(
  readFileSync(resolve(ROOT, 'scripts', 'holo-ci', 'systems-preview-release-manifest.json'), 'utf8')
);
const expectedPackage = manifest.releaseIdentity.registryPackage;
const artifactDigests = manifest.candidateEvidence.artifactDigests;

const packument = {
  name: expectedPackage.name,
  'dist-tags': { ...expectedPackage.distTags },
  versions: {
    [expectedPackage.version]: {
      name: expectedPackage.name,
      version: expectedPackage.version,
      dist: {
        integrity: expectedPackage.integrity,
        tarball: expectedPackage.tarballUrl,
      },
    },
  },
  time: { [expectedPackage.version]: '2026-07-22T00:00:00.000Z' },
};

const release = {
  tag_name: 'v0.1.0',
  draft: false,
  prerelease: true,
  published_at: '2026-07-22T00:00:00.000Z',
  assets: Object.entries(artifactDigests).map(([path, digest], index) => ({
    name: path.split('/').at(-1),
    size: index + 1,
    digest: `sha256:${digest}`,
    browser_download_url: `https://example.invalid/${path.split('/').at(-1)}`,
  })),
};

{
  const result = evaluateRegistryState(manifest, structuredClone(packument));
  assert.equal(result.ok, true, result.errors.join('; '));
}

{
  const drifted = structuredClone(packument);
  drifted['dist-tags'].preview = '0.1.1';
  const result = evaluateRegistryState(manifest, drifted);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /dist-tag drift/u);
}

{
  const drifted = structuredClone(packument);
  drifted.versions['0.1.0'].dist.integrity = 'sha512-drift';
  const result = evaluateRegistryState(manifest, drifted);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /integrity drift/u);
}

{
  const result = evaluateGitHubRelease(manifest, structuredClone(release));
  assert.equal(result.ok, true, result.errors.join('; '));
  assert.equal(result.assetsNeedingDownload.length, 0);
}

{
  const drifted = structuredClone(release);
  drifted.assets[0].digest = `sha256:${'0'.repeat(64)}`;
  const result = evaluateGitHubRelease(manifest, drifted);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /asset digest drift/u);
}

{
  const drifted = structuredClone(release);
  drifted.assets.pop();
  const result = evaluateGitHubRelease(manifest, drifted);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing asset/u);
}

assert.equal(
  githubReleaseApiUrl('https://github.com/brianonbased-dev/HoloScript/releases/tag/v0.1.0'),
  'https://api.github.com/repos/brianonbased-dev/HoloScript/releases/tags/v0.1.0'
);

assert.throws(
  () => githubReleaseApiUrl('https://example.com/not-a-release'),
  /unsupported GitHub release URL/u
);

{
  const options = parseArgs([
    '--scratch-root',
    'D:\\HoloScriptCanaryScratch',
    '--min-free-bytes',
    '26843545600',
    '--timeout-ms',
    '60000',
  ]);
  assert.equal(options.coldScratchRoot, 'D:\\HoloScriptCanaryScratch');
  assert.equal(options.coldMinFreeBytes, 26843545600);
  assert.equal(options.timeoutMs, 60000);
}

console.log('[systems-preview-public-canary] tests PASS');
