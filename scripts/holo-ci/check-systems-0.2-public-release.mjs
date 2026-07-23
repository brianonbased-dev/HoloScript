#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_MANIFEST = join(
  ROOT,
  'scripts',
  'holo-ci',
  'systems-0.2-release-manifest.json'
);
const USER_AGENT = 'HoloScript-systems-0.2-public-release/1';
const WINDOWS_NPM_CLI = join(
  dirname(process.execPath),
  'node_modules',
  'npm',
  'bin',
  'npm-cli.js'
);
const NPM_COMMAND =
  process.platform === 'win32' && existsSync(WINDOWS_NPM_CLI)
    ? { command: process.execPath, prefix: [WINDOWS_NPM_CLI] }
    : { command: 'npm', prefix: [] };

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function npmPackumentUrl(packageName) {
  return `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
}

async function fetchResponse(fetchImpl, url, timeoutMs, accept) {
  const response = await fetchImpl(url, {
    headers: { accept, 'user-agent': USER_AGENT },
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

export function evaluateRegistryPackage(expected, packument) {
  const version = packument?.versions?.[expected.version];
  const tags = packument?.['dist-tags'] || {};
  const errors = [];
  if (!version) {
    errors.push(`${expected.name}@${expected.version} is absent from npm`);
  } else {
    if (version.name !== expected.name || version.version !== expected.version) {
      errors.push(`identity drift for ${expected.name}@${expected.version}`);
    }
    if (version.dist?.integrity !== expected.integrity) {
      errors.push(
        `${expected.name} integrity drift: expected ${expected.integrity}, found ${version.dist?.integrity || '<missing>'}`
      );
    }
    if (version.dist?.shasum !== expected.shasum) {
      errors.push(
        `${expected.name} shasum drift: expected ${expected.shasum}, found ${version.dist?.shasum || '<missing>'}`
      );
    }
    if (version.dist?.tarball !== expected.tarballUrl) {
      errors.push(
        `${expected.name} tarball drift: expected ${expected.tarballUrl}, found ${version.dist?.tarball || '<missing>'}`
      );
    }
  }
  for (const [tag, value] of Object.entries(expected.distTags || {})) {
    if (tags[tag] !== value) {
      errors.push(
        `${expected.name} dist-tag drift: expected ${tag} -> ${value}, found ${tags[tag] || '<missing>'}`
      );
    }
  }
  return {
    schema: 'holoscript.systems-0.2-public-release.npm-package/v1',
    ok: errors.length === 0,
    name: expected.name,
    version: expected.version,
    observedVersion: version?.version || null,
    integrity: version?.dist?.integrity || null,
    shasum: version?.dist?.shasum || null,
    tarballUrl: version?.dist?.tarball || null,
    distTags: tags,
    publishedAt: packument?.time?.[expected.version] || null,
    errors,
  };
}

export function evaluateGitHubRelease(manifest, release) {
  const expected = manifest.github;
  const byName = new Map((release?.assets || []).map((asset) => [asset.name, asset]));
  const errors = [];
  const assets = [];
  const needsDownload = [];
  if (release?.tag_name !== expected.tag) {
    errors.push(`GitHub tag drift: expected ${expected.tag}, found ${release?.tag_name || '<missing>'}`);
  }
  if (release?.draft === true) errors.push(`${expected.tag} must not be a draft`);
  if (release?.prerelease !== true) errors.push(`${expected.tag} must remain a prerelease`);
  for (const artifact of expected.assets) {
    const asset = byName.get(artifact.name);
    if (!asset) {
      errors.push(`GitHub release is missing ${artifact.name}`);
      continue;
    }
    if (asset.size !== artifact.bytes) {
      errors.push(
        `${artifact.name} byte-size drift: expected ${artifact.bytes}, found ${asset.size ?? '<missing>'}`
      );
    }
    const apiSha256 = String(asset.digest || '').replace(/^sha256:/u, '');
    if (apiSha256 && apiSha256 !== artifact.sha256) {
      errors.push(
        `${artifact.name} digest drift: expected ${artifact.sha256}, found ${apiSha256}`
      );
    }
    if (!apiSha256) needsDownload.push({ artifact, asset });
    assets.push({
      name: artifact.name,
      bytes: asset.size ?? null,
      expectedSha256: artifact.sha256,
      apiSha256: apiSha256 || null,
      downloadUrl: asset.browser_download_url || null,
    });
  }
  return {
    schema: 'holoscript.systems-0.2-public-release.github/v1',
    ok: errors.length === 0,
    tag: expected.tag,
    url: expected.releaseUrl,
    draft: release?.draft ?? null,
    prerelease: release?.prerelease ?? null,
    publishedAt: release?.published_at || null,
    assets,
    needsDownload,
    errors,
  };
}

async function verifyGitHubDownloads(result, fetchImpl, timeoutMs) {
  for (const { artifact, asset } of result.needsDownload) {
    try {
      const response = await fetchResponse(
        fetchImpl,
        asset.browser_download_url,
        timeoutMs,
        'application/octet-stream'
      );
      const digest = sha256(Buffer.from(await response.arrayBuffer()));
      const row = result.assets.find((candidate) => candidate.name === artifact.name);
      if (row) row.downloadedSha256 = digest;
      if (digest !== artifact.sha256) {
        result.errors.push(
          `${artifact.name} downloaded digest drift: expected ${artifact.sha256}, found ${digest}`
        );
      }
    } catch (error) {
      result.errors.push(`${artifact.name} download failed: ${errorMessage(error)}`);
    }
  }
  delete result.needsDownload;
  result.ok = result.errors.length === 0;
  return result;
}

function anonymousNpmEnv(userConfig) {
  const env = { ...process.env, NPM_CONFIG_USERCONFIG: userConfig };
  delete env.NODE_AUTH_TOKEN;
  delete env.NPM_TOKEN;
  delete env.npm_config__authToken;
  return env;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
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

function readInstalledVersion(root, packageName) {
  return readJson(join(root, 'node_modules', ...packageName.split('/'), 'package.json')).version;
}

function runWindowsColdConsumer(manifest, timeoutMs) {
  const temp = mkdtempSync(join(tmpdir(), 'holoscript-systems-0.2-windows-'));
  const anonymousConfig = join(temp, 'anonymous.npmrc');
  const env = anonymousNpmEnv(anonymousConfig);
  const identity = `@holoscript/systems@${manifest.version}`;
  try {
    writeFileSync(join(temp, 'package.json'), '{"private":true}\n');
    run(
      NPM_COMMAND.command,
      [
        ...NPM_COMMAND.prefix,
        'install',
        '--ignore-scripts',
        '--package-lock=false',
        '--no-audit',
        '--no-fund',
        identity,
      ],
      { cwd: temp, env, timeout: Math.max(timeoutMs, 300_000) }
    );
    const systemsRoot = join(temp, 'node_modules', '@holoscript', 'systems');
    const output = join(temp, 'module-exit-five.exe');
    run(
      process.execPath,
      [
        join(systemsRoot, 'bin', 'holoscriptc.cjs'),
        join(systemsRoot, 'conformance', 'multi-file-modules', 'entry.hs'),
        '-o',
        output,
      ],
      { cwd: temp, env, timeout: Math.max(timeoutMs, 300_000) }
    );
    const executed = spawnSync(output, [], { cwd: temp, windowsHide: true });
    if (executed.error || executed.status !== 5) {
      throw new Error(`compiled Windows program exited ${executed.status}; expected 5`);
    }
    return {
      schema: 'holoscript.systems-0.2-public-release.cold-consumer/v1',
      ok: true,
      platform: 'win32-x64',
      metaVersion: readInstalledVersion(temp, '@holoscript/systems'),
      platformVersion: readInstalledVersion(temp, '@holoscript/systems-win32-x64'),
      exitCode: 5,
    };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function runLinuxColdConsumer(manifest, timeoutMs) {
  const shell = [
    'set -eu',
    'mkdir -p /consumer',
    'cd /consumer',
    'printf "{\\"private\\":true}\\n" > package.json',
    `npm install --ignore-scripts --package-lock=false --no-audit --no-fund @holoscript/systems@${manifest.version} >/dev/null`,
    'node node_modules/@holoscript/systems/bin/holoscriptc.cjs node_modules/@holoscript/systems/conformance/multi-file-modules/entry.hs -o /consumer/module-exit-five',
    'set +e',
    '/consumer/module-exit-five',
    'code=$?',
    'set -e',
    'test "$code" -eq 5',
    "node -e \"const fs=require('fs'); const v=p=>JSON.parse(fs.readFileSync(p,'utf8')).version; console.log(JSON.stringify({metaVersion:v('node_modules/@holoscript/systems/package.json'),platformVersion:v('node_modules/@holoscript/systems-linux-x64/package.json'),exitCode:5}))\"",
  ].join('; ');
  const output = run(
    'docker',
    [
      'run',
      '--rm',
      '--platform',
      'linux/amd64',
      'node:22-bookworm',
      'bash',
      '-lc',
      shell,
    ],
    { timeout: Math.max(timeoutMs, 600_000) }
  );
  const detail = JSON.parse(output.split(/\r?\n/u).at(-1));
  return {
    schema: 'holoscript.systems-0.2-public-release.cold-consumer/v1',
    ok: detail.exitCode === 5,
    platform: 'linux-x64',
    image: 'node:22-bookworm',
    ...detail,
  };
}

export async function checkSystems02PublicRelease({
  manifest,
  fetchImpl = globalThis.fetch,
  timeoutMs = 60_000,
  downloadAssets = true,
  coldConsume = true,
  linuxColdConsume = true,
} = {}) {
  const errors = [];
  const registry = [];
  for (const expected of manifest.packages) {
    try {
      const packument = await fetchJson(fetchImpl, npmPackumentUrl(expected.name), timeoutMs);
      const result = evaluateRegistryPackage(expected, packument);
      registry.push(result);
      errors.push(...result.errors);
    } catch (error) {
      const message = `${expected.name} public readback failed: ${errorMessage(error)}`;
      registry.push({ ok: false, name: expected.name, version: expected.version, errors: [message] });
      errors.push(message);
    }
  }

  let github;
  try {
    const release = await fetchJson(fetchImpl, manifest.github.apiUrl, timeoutMs);
    github = evaluateGitHubRelease(manifest, release);
    if (downloadAssets) {
      github = await verifyGitHubDownloads(github, fetchImpl, timeoutMs);
    } else {
      delete github.needsDownload;
    }
    errors.push(...github.errors);
  } catch (error) {
    const message = `GitHub public readback failed: ${errorMessage(error)}`;
    github = { ok: false, errors: [message] };
    errors.push(message);
  }

  const coldConsumers = [];
  if (coldConsume) {
    try {
      coldConsumers.push(runWindowsColdConsumer(manifest, timeoutMs));
    } catch (error) {
      const message = `Windows cold consumer failed: ${errorMessage(error)}`;
      coldConsumers.push({ ok: false, platform: 'win32-x64', error: message });
      errors.push(message);
    }
    if (linuxColdConsume) {
      try {
        coldConsumers.push(runLinuxColdConsumer(manifest, timeoutMs));
      } catch (error) {
        const message = `Linux cold consumer failed: ${errorMessage(error)}`;
        coldConsumers.push({ ok: false, platform: 'linux-x64', error: message });
        errors.push(message);
      }
    }
  }

  return {
    schema: 'holoscript.systems-0.2-public-release-receipt/v1',
    generatedAt: new Date().toISOString(),
    ok: errors.length === 0,
    distributionId: manifest.distributionId,
    version: manifest.version,
    channel: manifest.channel,
    machineContract: manifest.machineContract,
    sourceCommit: manifest.sourceCommit,
    candidateCommit: manifest.candidateCommit,
    checks: { registry, github, coldConsumers },
    errors,
    publicStateReadAnonymously: true,
  };
}

function parseArgs(argv) {
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : null;
  };
  return {
    manifestPath: resolve(valueAfter('--manifest') || DEFAULT_MANIFEST),
    outPath: valueAfter('--out') ? resolve(valueAfter('--out')) : null,
    json: argv.includes('--json'),
    coldConsume: !argv.includes('--no-cold-consume'),
    linuxColdConsume: !argv.includes('--no-linux'),
    downloadAssets: !argv.includes('--no-asset-downloads'),
    timeoutMs: Number(valueAfter('--timeout-ms') || 60_000),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(options.manifestPath)) {
    console.error(`[systems-0.2-public-release] missing manifest ${options.manifestPath}`);
    process.exit(1);
  }
  const manifest = readJson(options.manifestPath);
  const result = await checkSystems02PublicRelease({
    manifest,
    timeoutMs: options.timeoutMs,
    downloadAssets: options.downloadAssets,
    coldConsume: options.coldConsume,
    linuxColdConsume: options.linuxColdConsume,
  });
  if (options.outPath) {
    mkdirSync(dirname(options.outPath), { recursive: true });
    writeFileSync(options.outPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    for (const row of result.checks.registry) {
      console.log(`[systems-0.2-public-release] ${row.ok ? 'PASS' : 'FAIL'} npm ${row.name}`);
    }
    console.log(
      `[systems-0.2-public-release] ${result.checks.github.ok ? 'PASS' : 'FAIL'} GitHub ${manifest.github.tag}`
    );
    for (const row of result.checks.coldConsumers) {
      console.log(
        `[systems-0.2-public-release] ${row.ok ? 'PASS' : 'FAIL'} cold ${row.platform}`
      );
    }
    for (const error of result.errors) {
      console.error(`[systems-0.2-public-release] FAIL: ${error}`);
    }
  }
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
