#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { probeHostedCompanions } from './check-systems-preview-release.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, '..', '..');
const DEFAULT_MANIFEST = join(
  DEFAULT_ROOT,
  'scripts',
  'holo-ci',
  'systems-preview-release-manifest.json'
);
const USER_AGENT = 'HoloScript-systems-preview-public-canary/1';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function npmPackumentUrl(packageName) {
  return `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
}

export function githubReleaseApiUrl(releaseUrl) {
  const parsed = new URL(releaseUrl);
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (
    parsed.hostname !== 'github.com' ||
    parts.length !== 5 ||
    parts[2] !== 'releases' ||
    parts[3] !== 'tag'
  ) {
    throw new Error(`unsupported GitHub release URL: ${releaseUrl}`);
  }
  const [owner, repository, , , tag] = parts;
  return `https://api.github.com/repos/${owner}/${repository}/releases/tags/${encodeURIComponent(tag)}`;
}

export function evaluateRegistryState(manifest, packument) {
  const expected = manifest.releaseIdentity.registryPackage;
  const version = packument?.versions?.[expected.version];
  const observedTags = packument?.['dist-tags'] || {};
  const errors = [];

  if (!version) {
    errors.push(`${expected.name}@${expected.version} is absent from the public npm packument`);
  } else {
    if (version.name !== expected.name || version.version !== expected.version) {
      errors.push(
        `npm exact-version identity drift: expected ${expected.name}@${expected.version}, found ${version.name || '<missing>'}@${version.version || '<missing>'}`
      );
    }
    if (version.dist?.integrity !== expected.integrity) {
      errors.push(
        `npm integrity drift: expected ${expected.integrity}, found ${version.dist?.integrity || '<missing>'}`
      );
    }
    if (version.dist?.tarball !== expected.tarballUrl) {
      errors.push(
        `npm tarball URL drift: expected ${expected.tarballUrl}, found ${version.dist?.tarball || '<missing>'}`
      );
    }
  }

  for (const [tag, expectedVersion] of Object.entries(expected.distTags || {})) {
    if (observedTags[tag] !== expectedVersion) {
      errors.push(
        `npm dist-tag drift: expected ${tag} -> ${expectedVersion}, found ${observedTags[tag] || '<missing>'}`
      );
    }
  }

  return {
    schema: 'holoscript.systems-preview-public-canary.npm.v1',
    ok: errors.length === 0,
    package: expected.name,
    version: expected.version,
    observedVersion: version?.version || null,
    integrity: version?.dist?.integrity || null,
    tarballUrl: version?.dist?.tarball || null,
    expectedDistTags: expected.distTags || {},
    observedDistTags: observedTags,
    publishedAt: packument?.time?.[expected.version] || null,
    errors,
  };
}

export function evaluateGitHubRelease(manifest, release) {
  const rail = manifest.rails.find((candidate) => candidate.id === 'native-windows-x64');
  const expectedArtifacts = Object.entries(manifest.candidateEvidence.artifactDigests).map(
    ([path, digest]) => ({ name: basename(path), digest })
  );
  const assetByName = new Map((release?.assets || []).map((asset) => [asset.name, asset]));
  const errors = [];
  const assets = [];
  const assetsNeedingDownload = [];

  if (release?.tag_name !== rail.releaseTag) {
    errors.push(
      `GitHub release tag drift: expected ${rail.releaseTag}, found ${release?.tag_name || '<missing>'}`
    );
  }
  if (release?.draft === true) errors.push(`GitHub release ${rail.releaseTag} became a draft`);
  if (release?.prerelease !== true) {
    errors.push(`GitHub release ${rail.releaseTag} must remain marked as a prerelease`);
  }

  for (const expected of expectedArtifacts) {
    const asset = assetByName.get(expected.name);
    if (!asset) {
      errors.push(`GitHub release is missing asset ${expected.name}`);
      continue;
    }
    if (!Number.isFinite(asset.size) || asset.size <= 0) {
      errors.push(`GitHub release asset ${expected.name} has an invalid size`);
    }
    const apiDigest = String(asset.digest || '').replace(/^sha256:/u, '');
    if (apiDigest && apiDigest !== expected.digest) {
      errors.push(
        `GitHub asset digest drift for ${expected.name}: expected ${expected.digest}, found ${apiDigest}`
      );
    }
    if (!apiDigest) assetsNeedingDownload.push({ ...expected, asset });
    assets.push({
      name: expected.name,
      expectedSha256: expected.digest,
      apiSha256: apiDigest || null,
      size: asset.size || null,
      downloadUrl: asset.browser_download_url || null,
    });
  }

  return {
    schema: 'holoscript.systems-preview-public-canary.github.v1',
    ok: errors.length === 0,
    releaseTag: rail.releaseTag,
    releaseUrl: rail.releaseUrl,
    apiUrl: githubReleaseApiUrl(rail.releaseUrl),
    observedTag: release?.tag_name || null,
    draft: release?.draft ?? null,
    prerelease: release?.prerelease ?? null,
    publishedAt: release?.published_at || null,
    assets,
    assetsNeedingDownload,
    errors,
  };
}

async function fetchResponse(fetchImpl, url, timeoutMs, accept) {
  const response = await fetchImpl(url, {
    headers: {
      accept,
      'user-agent': USER_AGENT,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
}

async function fetchJson(fetchImpl, url, timeoutMs) {
  const response = await fetchResponse(fetchImpl, url, timeoutMs, 'application/json');
  return response.json();
}

async function verifyDownloadedGitHubAssets(github, { fetchImpl, timeoutMs }) {
  for (const expected of github.assetsNeedingDownload) {
    if (!expected.asset.browser_download_url) {
      github.errors.push(`GitHub asset ${expected.name} has no public download URL`);
      continue;
    }
    try {
      const response = await fetchResponse(
        fetchImpl,
        expected.asset.browser_download_url,
        timeoutMs,
        'application/octet-stream'
      );
      const bytes = Buffer.from(await response.arrayBuffer());
      const digest = sha256(bytes);
      const row = github.assets.find((asset) => asset.name === expected.name);
      if (row) row.downloadedSha256 = digest;
      if (digest !== expected.digest) {
        github.errors.push(
          `GitHub downloaded asset digest drift for ${expected.name}: expected ${expected.digest}, found ${digest}`
        );
      }
    } catch (error) {
      github.errors.push(`GitHub asset ${expected.name} download failed: ${errorMessage(error)}`);
    }
  }
  delete github.assetsNeedingDownload;
  github.ok = github.errors.length === 0;
  return github;
}

function runColdConsumer(rootDir, manifest, timeoutMs) {
  const packageIdentity = `${manifest.releaseIdentity.registryPackage.name}@${manifest.releaseIdentity.registryPackage.version}`;
  const result = spawnSync(
    process.execPath,
    [
      'scripts/holo-ci/check-registry-cold-start.mjs',
      '--package',
      packageIdentity,
      '--probe',
      'systems-toolchain',
      '--json',
    ],
    {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: Math.max(timeoutMs, 300_000),
      windowsHide: true,
    }
  );

  let receipt = null;
  try {
    receipt = JSON.parse(String(result.stdout || '').trim());
  } catch {
    receipt = null;
  }
  const ok = !result.error && result.status === 0 && receipt?.ok === true;
  return {
    schema: 'holoscript.systems-preview-public-canary.cold-consumer.v1',
    ok,
    package: packageIdentity,
    installedVersion: receipt?.package?.installed?.version || null,
    installedIntegrity: receipt?.package?.installed?.integrity || null,
    wasmPrograms: receipt?.probe?.wasm?.programCount || null,
    nativePrograms: receipt?.probe?.native?.programCount || null,
    finalDisposition: receipt?.finalDisposition || null,
    error: ok
      ? null
      : errorMessage(
          result.error ||
            String(result.stderr || result.stdout || `cold consumer exited ${result.status}`)
        ).slice(0, 2000),
  };
}

export async function runSystemsPreviewPublicCanary({
  rootDir = DEFAULT_ROOT,
  manifest = readJson(DEFAULT_MANIFEST),
  fetchImpl = globalThis.fetch,
  timeoutMs = 60_000,
  downloadGitHubAssets = true,
  coldConsume = true,
} = {}) {
  const errors = [];
  const warnings = [];
  let registry;
  let github;
  let services;
  let coldConsumer = null;

  try {
    const packageName = manifest.releaseIdentity.registryPackage.name;
    const packument = await fetchJson(fetchImpl, npmPackumentUrl(packageName), timeoutMs);
    registry = evaluateRegistryState(manifest, packument);
  } catch (error) {
    registry = {
      schema: 'holoscript.systems-preview-public-canary.npm.v1',
      ok: false,
      errors: [`npm public readback failed: ${errorMessage(error)}`],
    };
  }

  try {
    const releaseRail = manifest.rails.find((rail) => rail.id === 'native-windows-x64');
    const release = await fetchJson(
      fetchImpl,
      githubReleaseApiUrl(releaseRail.releaseUrl),
      timeoutMs
    );
    github = evaluateGitHubRelease(manifest, release);
    if (downloadGitHubAssets) {
      github = await verifyDownloadedGitHubAssets(github, { fetchImpl, timeoutMs });
    } else {
      delete github.assetsNeedingDownload;
    }
  } catch (error) {
    github = {
      schema: 'holoscript.systems-preview-public-canary.github.v1',
      ok: false,
      errors: [`GitHub public readback failed: ${errorMessage(error)}`],
    };
  }

  try {
    services = await probeHostedCompanions(manifest, {
      rootDir,
      fetchImpl,
      timeoutMs,
    });
  } catch (error) {
    services = {
      schema: 'holoscript.systems-preview-service-readback/v1',
      ok: false,
      rows: [],
      errors: [`hosted companion readback failed: ${errorMessage(error)}`],
      warnings: [],
    };
  }

  if (coldConsume) coldConsumer = runColdConsumer(rootDir, manifest, timeoutMs);

  errors.push(...(registry.errors || []), ...(github.errors || []), ...(services.errors || []));
  warnings.push(...(services.warnings || []));
  if (coldConsumer && !coldConsumer.ok) {
    errors.push(`cold public consumer failed: ${coldConsumer.error || 'unknown failure'}`);
  }

  return {
    schema: 'holoscript.systems-preview-public-canary/v1',
    generatedAt: new Date().toISOString(),
    ok: errors.length === 0,
    distributionId: manifest.releaseIdentity.distributionId,
    version: manifest.releaseIdentity.version,
    checks: {
      registry,
      github,
      services,
      coldConsumer,
    },
    errors,
    warnings,
  };
}

function parseArgs(argv) {
  const args = [...argv];
  const valueAfter = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };
  const rootDir = resolve(valueAfter('--root') || DEFAULT_ROOT);
  return {
    rootDir,
    manifestPath: resolve(valueAfter('--manifest') || DEFAULT_MANIFEST),
    outPath: valueAfter('--out') ? resolve(valueAfter('--out')) : null,
    json: args.includes('--json'),
    coldConsume: !args.includes('--no-cold-consume'),
    downloadGitHubAssets: !args.includes('--no-asset-downloads'),
    timeoutMs: Number(valueAfter('--timeout-ms') || 60_000),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(options.manifestPath)) {
    console.error(`[systems-preview-public-canary] missing manifest: ${options.manifestPath}`);
    process.exit(1);
  }
  const manifest = readJson(options.manifestPath);
  const result = await runSystemsPreviewPublicCanary({
    rootDir: options.rootDir,
    manifest,
    timeoutMs: options.timeoutMs,
    downloadGitHubAssets: options.downloadGitHubAssets,
    coldConsume: options.coldConsume,
  });
  if (options.outPath) {
    mkdirSync(dirname(options.outPath), { recursive: true });
    writeFileSync(options.outPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const [name, check] of Object.entries(result.checks)) {
      if (!check) continue;
      console.log(`[systems-preview-public-canary] ${check.ok ? 'PASS' : 'FAIL'} ${name}`);
    }
    for (const warning of result.warnings) {
      console.warn(`[systems-preview-public-canary] WARN: ${warning}`);
    }
    for (const error of result.errors) {
      console.error(`[systems-preview-public-canary] FAIL: ${error}`);
    }
  }
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
