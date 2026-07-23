#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateGitHubRelease,
  evaluateRegistryPackage,
} from './check-systems-0.2-public-release.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_MANIFEST = join(
  ROOT,
  'scripts',
  'holo-ci',
  'systems-0.2-release-manifest.json'
);
const WINDOWS_NPM_CLI = join(
  dirname(process.execPath),
  'node_modules',
  'npm',
  'bin',
  'npm-cli.js'
);
const NPM =
  process.platform === 'win32' && existsSync(WINDOWS_NPM_CLI)
    ? { command: process.execPath, prefix: [WINDOWS_NPM_CLI] }
    : { command: 'npm', prefix: [] };
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function digest(path, algorithm, encoding = 'hex') {
  return createHash(algorithm).update(readFileSync(path)).digest(encoding);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      errorMessage(
        result.error ||
          String(result.stderr || result.stdout || `${command} exited ${result.status}`)
      ).slice(0, 3000)
    );
  }
  return String(result.stdout || '').trim();
}

function validateLocalRelease(manifest) {
  const errors = [];
  if (
    manifest.schema !== 'holoscript.systems-platform-public-release/v1' ||
    manifest.version !== '0.2.0' ||
    manifest.channel !== 'next' ||
    manifest.machineContract !== 'hs-machine-v33'
  ) {
    errors.push('release manifest identity mismatch');
  }
  const ordered = [...manifest.packages].sort((left, right) => left.publishOrder - right.publishOrder);
  if (ordered.at(-1)?.id !== 'meta') {
    errors.push('meta package must publish after every platform package');
  }
  for (const expected of manifest.packages) {
    const artifact = join(ROOT, expected.artifact);
    if (!existsSync(artifact) || !statSync(artifact).isFile()) {
      errors.push(`missing artifact ${expected.artifact}`);
      continue;
    }
    if (statSync(artifact).size !== expected.bytes) {
      errors.push(`${expected.artifact} byte-size mismatch`);
    }
    if (digest(artifact, 'sha256') !== expected.sha256) {
      errors.push(`${expected.artifact} sha256 mismatch`);
    }
    if (digest(artifact, 'sha1') !== expected.shasum) {
      errors.push(`${expected.artifact} npm shasum mismatch`);
    }
    if (`sha512-${digest(artifact, 'sha512', 'base64')}` !== expected.integrity) {
      errors.push(`${expected.artifact} npm integrity mismatch`);
    }
  }
  for (const expected of manifest.github.assets) {
    const artifact = join(ROOT, expected.path);
    if (
      !existsSync(artifact) ||
      statSync(artifact).size !== expected.bytes ||
      digest(artifact, 'sha256') !== expected.sha256
    ) {
      errors.push(`GitHub asset identity mismatch for ${expected.path}`);
    }
  }
  if (
    manifest.packages.find((pkg) => pkg.id === 'meta')?.distTags?.latest !==
      manifest.immutability.latestMustRemain ||
    manifest.packages.find((pkg) => pkg.id === 'meta')?.distTags?.preview !==
      manifest.immutability.previewMustRemain
  ) {
    errors.push('0.1 latest/preview immutability fence is missing');
  }
  return { ok: errors.length === 0, errors, ordered };
}

async function fetchJson(url, { allowMissing = false } = {}) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'HoloScript-systems-0.2-publisher/1',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

async function registryState(expected) {
  const packument = await fetchJson(
    `https://registry.npmjs.org/${encodeURIComponent(expected.name)}`,
    { allowMissing: true }
  );
  if (!packument?.versions?.[expected.version]) {
    return { exists: false, exact: false, result: null };
  }
  const result = evaluateRegistryPackage(expected, packument);
  return { exists: true, exact: result.ok, result };
}

async function waitForRegistry(expected, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await registryState(expected);
    if (last.exact) return last.result;
    if (last.exists && !last.exact) break;
    await sleep(3000);
  }
  throw new Error(
    `${expected.name}@${expected.version} did not reach exact public state: ${JSON.stringify(last?.result?.errors || [])}`
  );
}

async function waitForRegistryPresence(expected, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await registryState(expected);
    if (state.exists) return state;
    await sleep(3000);
  }
  throw new Error(`${expected.name}@${expected.version} did not become publicly visible`);
}

function npmPublish(expected, publish) {
  const args = [
    'publish',
    join(ROOT, expected.artifact),
    ...(publish ? [] : ['--dry-run']),
    '--tag',
    'next',
    '--access',
    'public',
    '--ignore-scripts',
    '--json',
  ];
  return run(NPM.command, [...NPM.prefix, ...args], { timeout: 300_000 });
}

function removeForbiddenDistTags(expected, observedTags, publish) {
  const present = (expected.forbiddenDistTags || []).filter(
    (tag) => observedTags?.[tag] !== undefined
  );
  if (publish) {
    for (const tag of present) {
      run(
        NPM.command,
        [...NPM.prefix, 'dist-tag', 'rm', expected.name, tag],
        { timeout: 60_000 }
      );
    }
  }
  return present;
}

async function publicGitHubRelease(manifest) {
  return fetchJson(manifest.github.apiUrl, { allowMissing: true });
}

function releaseNotes(manifest) {
  return [
    `HoloScript Systems ${manifest.version} expands the native preview to Windows x64 and GNU/Linux x64.`,
    '',
    `- Machine contract: ${manifest.machineContract}`,
    `- npm channel: ${manifest.channel}`,
    '- Native binaries are delivered through exact optional platform packages.',
    '- The 0.1.0 WebAssembly validator remains immutable and is reused with recorded provenance.',
    '- `latest` and `preview` remain pinned to 0.1.0.',
    '',
    'This is a prerelease. Stable public compatibility remains reserved for 1.0.0.',
  ].join('\n');
}

function createGitHubRelease(manifest) {
  const args = [
    'release',
    'create',
    manifest.github.tag,
    '--repo',
    manifest.github.repository,
    '--target',
    manifest.github.targetCommit,
    '--title',
    manifest.github.title,
    '--notes',
    releaseNotes(manifest),
    '--prerelease',
    ...manifest.github.assets.map((asset) => join(ROOT, asset.path)),
  ];
  return run('gh', args, { timeout: 300_000 });
}

function uploadMissingGitHubAssets(manifest, release) {
  const existing = new Map((release.assets || []).map((asset) => [asset.name, asset]));
  const missing = manifest.github.assets.filter((asset) => !existing.has(asset.name));
  for (const asset of missing) {
    run(
      'gh',
      [
        'release',
        'upload',
        manifest.github.tag,
        join(ROOT, asset.path),
        '--repo',
        manifest.github.repository,
      ],
      { timeout: 300_000 }
    );
  }
  return missing.map((asset) => asset.name);
}

async function waitForGitHub(manifest, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastErrors = [];
  while (Date.now() < deadline) {
    const release = await publicGitHubRelease(manifest);
    if (release) {
      const result = evaluateGitHubRelease(manifest, release);
      lastErrors = result.errors;
      if (result.ok || (result.needsDownload.length > 0 && result.errors.length === 0)) return result;
    }
    await sleep(3000);
  }
  throw new Error(`GitHub release did not reach exact public state: ${lastErrors.join('; ')}`);
}

function parseArgs(argv) {
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : null;
  };
  return {
    publish: argv.includes('--publish'),
    json: argv.includes('--json'),
    manifestPath: resolve(valueAfter('--manifest') || DEFAULT_MANIFEST),
    outPath: valueAfter('--out') ? resolve(valueAfter('--out')) : null,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = readJson(options.manifestPath);
  const validation = validateLocalRelease(manifest);
  if (!validation.ok) throw new Error(validation.errors.join('; '));

  const candidate = JSON.parse(
    run(process.execPath, ['scripts/holo-ci/check-systems-0.2-candidate.mjs', '--json'])
  );
  if (!candidate.ok) throw new Error(`candidate gate failed: ${candidate.errors.join('; ')}`);
  run('git', ['merge-base', '--is-ancestor', manifest.github.targetCommit, 'origin/main']);

  const auth = options.publish
    ? {
        npm: run(NPM.command, [...NPM.prefix, 'whoami'], { timeout: 60_000 }),
        github: run('gh', ['api', 'user', '--jq', '.login'], { timeout: 60_000 }),
      }
    : { npm: 'dry-run', github: 'dry-run' };

  const packages = [];
  let publicStateMutated = false;
  for (const expected of validation.ordered) {
    const before = await registryState(expected);
    if (before.exists) {
      if (!before.exact) {
        const forbiddenTags = removeForbiddenDistTags(
          expected,
          before.result.distTags,
          false
        );
        const onlyCorrectableTags =
          forbiddenTags.length > 0 &&
          before.result.errors.every((error) => error.includes('forbidden dist-tag'));
        if (!onlyCorrectableTags) {
          throw new Error(
            `${expected.name}@${expected.version} already exists with non-matching public bytes or tags: ${before.result.errors.join('; ')}`
          );
        }
        if (options.publish) {
          removeForbiddenDistTags(expected, before.result.distTags, true);
          publicStateMutated = true;
          packages.push({
            name: expected.name,
            action: 'removed-forbidden-dist-tags',
            removed: forbiddenTags,
            result: await waitForRegistry(expected),
          });
        } else {
          packages.push({
            name: expected.name,
            action: 'would-remove-forbidden-dist-tags',
            removed: forbiddenTags,
          });
        }
        continue;
      }
      packages.push({ name: expected.name, action: 'already-exact', result: before.result });
      continue;
    }
    npmPublish(expected, options.publish);
    if (options.publish) {
      publicStateMutated = true;
      const initial = await waitForRegistryPresence(expected);
      removeForbiddenDistTags(expected, initial.result?.distTags, true);
      packages.push({
        name: expected.name,
        action: 'published',
        result: await waitForRegistry(expected),
      });
    } else {
      packages.push({ name: expected.name, action: 'dry-run-passed' });
    }
  }

  let github;
  const existingRelease = await publicGitHubRelease(manifest);
  if (!options.publish) {
    github = {
      action: existingRelease ? 'already-exists' : 'would-create',
      tag: manifest.github.tag,
    };
  } else if (!existingRelease) {
    createGitHubRelease(manifest);
    publicStateMutated = true;
    github = { action: 'created', result: await waitForGitHub(manifest) };
  } else {
    const evaluated = evaluateGitHubRelease(manifest, existingRelease);
    const metadataErrors = evaluated.errors.filter(
      (error) => !error.startsWith('GitHub release is missing ')
    );
    if (metadataErrors.length > 0) {
      throw new Error(`existing GitHub release is incompatible: ${metadataErrors.join('; ')}`);
    }
    const uploaded = uploadMissingGitHubAssets(manifest, existingRelease);
    publicStateMutated ||= uploaded.length > 0;
    github = {
      action: uploaded.length > 0 ? 'uploaded-missing-assets' : 'already-exact',
      uploaded,
      result: await waitForGitHub(manifest),
    };
  }

  const receipt = {
    schema: 'holoscript.systems-0.2-publication-receipt/v1',
    generatedAt: new Date().toISOString(),
    ok: true,
    mode: options.publish ? 'publish' : 'dry-run',
    distributionId: manifest.distributionId,
    version: manifest.version,
    channel: manifest.channel,
    machineContract: manifest.machineContract,
    sourceCommit: manifest.sourceCommit,
    candidateCommit: manifest.candidateCommit,
    auth,
    packages,
    github,
    publicStateMutated,
  };
  if (options.outPath) {
    mkdirSync(dirname(options.outPath), { recursive: true });
    writeFileSync(options.outPath, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  if (options.json) console.log(JSON.stringify(receipt, null, 2));
  else {
    for (const row of packages) {
      console.log(`[systems-0.2-publish] ${row.action} ${row.name}@${manifest.version}`);
    }
    console.log(`[systems-0.2-publish] ${github.action} ${manifest.github.tag}`);
  }
}

main().catch((error) => {
  console.error(`[systems-0.2-publish] ${errorMessage(error)}`);
  process.exit(1);
});
