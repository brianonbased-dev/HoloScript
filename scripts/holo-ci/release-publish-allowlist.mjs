#!/usr/bin/env node
/**
 * Allowlist gate for the legal `release:publish` path.
 *
 * Changesets CLI 2.31.1 (the version pinned in pnpm-lock.yaml) has no package
 * filter. `publish()` accepts only otp, tag, and gitTag. `publishPackages`
 * ships every non-private workspace package whose package.json version is
 * absent from the npm version list. `.changeset/config.json` `ignore` is not
 * passed into that selection, so ignore cannot hold a package back.
 *
 * Verified against:
 * https://github.com/changesets/changesets/blob/%40changesets/cli%402.31.1/packages/cli/src/commands/publish/index.ts
 * https://github.com/changesets/changesets/blob/%40changesets/cli%402.31.1/packages/cli/src/commands/publish/publishPackages.ts
 *
 * This module does not publish. The legal ship command remains
 * `corepack pnpm release:publish`, which runs the existing gate chain and then
 * `changeset publish`. When RELEASE_PUBLISH_ALLOWLIST (or `--packages`) is
 * set, unpublished packages outside that list are held by snapshotting their
 * package.json version to a version already on npm, the gate is evaluated
 * again, and the snapshots are restored after publish. An empty allowlist
 * fails closed. Unset means full-fleet publish.
 */

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEP_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'];

export function splitPackageList(raw) {
  return String(raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function dedupeNames(names) {
  const seen = new Set();
  const out = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function sameNameSet(left, right) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((name) => rightSet.has(name));
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string[] | null} packageFlag names from `--packages`, or null when the flag is absent
 */
export function combineAllowlist(env, packageFlag) {
  const envSet = Object.prototype.hasOwnProperty.call(env, 'RELEASE_PUBLISH_ALLOWLIST');
  const envNames = envSet ? dedupeNames(splitPackageList(env.RELEASE_PUBLISH_ALLOWLIST)) : null;
  const flagSet = packageFlag != null;
  const flagNames = flagSet ? dedupeNames(packageFlag) : null;

  if (!envSet && !flagSet) {
    return { allowlist: null };
  }
  if (envSet && flagSet && !sameNameSet(envNames, flagNames)) {
    return {
      code: 'allowlist-conflict',
      error:
        'RELEASE_PUBLISH_ALLOWLIST and --packages name different sets. Refusing to guess which packages may publish.',
    };
  }
  const names = flagSet ? flagNames : envNames;
  if (!names || names.length === 0) {
    return {
      code: 'empty-allowlist',
      error:
        'RELEASE_PUBLISH_ALLOWLIST / --packages is empty. Unset it for a full-fleet publish. An empty allowlist does not publish everything.',
    };
  }
  return { allowlist: names };
}

export function scrubSecrets(text) {
  return String(text)
    .replace(/npm_[A-Za-z0-9]+/g, 'npm_[redacted]')
    .replace(/ghp_[A-Za-z0-9]+/g, 'ghp_[redacted]')
    .replace(/_authToken=\S+/g, '_authToken=[redacted]');
}

export function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    String(version).trim()
  );
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ? match[4].split('.') : [],
  };
}

export function compareSemver(a, b) {
  const pa = typeof a === 'string' ? parseSemver(a) : a;
  const pb = typeof b === 'string' ? parseSemver(b) : b;
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0;
  if (pa.pre.length === 0) return 1;
  if (pb.pre.length === 0) return -1;
  const length = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < length; i += 1) {
    if (pa.pre[i] === undefined) return -1;
    if (pb.pre[i] === undefined) return 1;
    const aNum = /^\d+$/.test(pa.pre[i]);
    const bNum = /^\d+$/.test(pb.pre[i]);
    if (aNum && bNum) {
      const diff = Number(pa.pre[i]) - Number(pb.pre[i]);
      if (diff !== 0) return diff;
    } else if (aNum) return -1;
    else if (bNum) return 1;
    else if (pa.pre[i] !== pb.pre[i]) return pa.pre[i] < pb.pre[i] ? -1 : 1;
  }
  return 0;
}

export function pickHoldVersion(registryVersions, registryLatest = null) {
  const versions = registryVersions || [];
  if (registryLatest && versions.includes(registryLatest) && parseSemver(registryLatest)) {
    return registryLatest;
  }
  const parsed = versions.filter((version) => parseSemver(version));
  if (parsed.length === 0) return null;
  return [...parsed].sort(compareSemver).at(-1) ?? null;
}

function fail(code, message, extra = {}) {
  return {
    ok: false,
    code,
    message,
    publishSet: [],
    holdsProposed: [],
    strays: [],
    unholdable: [],
    ...extra,
  };
}

function findStrayDependency(pkg, strayNames) {
  for (const field of DEP_FIELDS) {
    const deps = pkg[field] || {};
    for (const [name, spec] of Object.entries(deps)) {
      if (strayNames.has(name)) return { field, name, spec: String(spec) };
    }
  }
  return null;
}

/**
 * Pure allowlist decision. `allowlist === null` is full fleet.
 * A stray unpublished package fails this gate (`ok: false`) even when a later
 * hold could move it off the publish set. Callers that hold must re-run this
 * function after the snapshot and proceed only when `ok` is true.
 */
export function evaluateReleasePublishAllowlist({ allowlist, packages, groups = [] }) {
  if (allowlist == null) {
    return {
      ok: true,
      code: 'full-fleet',
      message: 'RELEASE_PUBLISH_ALLOWLIST is unset. changeset publish keeps the full unpublished set.',
      publishSet: null,
      holdsProposed: [],
      strays: [],
      unholdable: [],
    };
  }

  const names = dedupeNames(allowlist.map((name) => String(name).trim()).filter(Boolean));
  if (names.length === 0) {
    return fail(
      'empty-allowlist',
      'Allowlist is empty. Unset RELEASE_PUBLISH_ALLOWLIST for a full-fleet publish.'
    );
  }

  const byName = new Map();
  for (const pkg of packages) {
    if (pkg?.name) byName.set(pkg.name, pkg);
  }
  for (const name of names) {
    if (!byName.has(name)) {
      return fail('unknown-package', `${name} is not a workspace package on disk.`);
    }
    if (byName.get(name).private === true) {
      return fail('not-unpublished', `${name} is private, so changeset publish will not ship it.`);
    }
  }

  const allowSet = new Set(names);
  const unpublished = [];
  for (const pkg of byName.values()) {
    if (pkg.private === true) continue;
    if (!Array.isArray(pkg.registryVersions)) {
      return fail(
        'registry-unknown',
        `Registry versions for ${pkg.name} are unknown. Refusing to guess the publish set.`
      );
    }
    if (!pkg.registryVersions.includes(pkg.version)) unpublished.push(pkg);
  }

  const unpublishedNames = new Set(unpublished.map((pkg) => pkg.name));
  for (const name of names) {
    if (!unpublishedNames.has(name)) {
      const pkg = byName.get(name);
      return fail(
        'not-unpublished',
        `${name}@${pkg.version} is not an unpublished tip. The allowlist only publishes packages changeset would have shipped.`
      );
    }
  }

  const strays = unpublished.filter((pkg) => !allowSet.has(pkg.name));
  if (strays.length === 0) {
    return {
      ok: true,
      code: 'allowlist',
      message: `Publish set matches the allowlist: ${names.join(', ')}.`,
      publishSet: names,
      holdsProposed: [],
      strays: [],
      unholdable: [],
    };
  }

  const strayNames = strays.map((pkg) => pkg.name);
  for (const group of groups) {
    const groupSet = new Set(group);
    const allowHit = names.filter((name) => groupSet.has(name));
    const strayHit = strayNames.filter((name) => groupSet.has(name));
    if (allowHit.length > 0 && strayHit.length > 0) {
      return fail(
        'grouped-with-stray',
        `Allowlist package ${allowHit.join(', ')} shares a changeset fixed or linked group with unpublished ${strayHit.join(', ')}. Include the whole group, or run full-fleet release:publish.`,
        { strays: strayNames }
      );
    }
  }

  for (const name of names) {
    const depHit = findStrayDependency(byName.get(name), new Set(strayNames));
    if (depHit) {
      return fail(
        'allowlist-depends-on-stray',
        `${name} depends on unpublished ${depHit.name} via ${depHit.field} (${depHit.spec}). Include that package in the allowlist, or run full-fleet release:publish.`,
        { strays: strayNames }
      );
    }
  }

  const holdsProposed = [];
  const unholdable = [];
  for (const stray of strays) {
    const to = pickHoldVersion(stray.registryVersions, stray.registryLatest);
    if (!to || !stray.filePath) {
      unholdable.push(stray.name);
      continue;
    }
    holdsProposed.push({
      name: stray.name,
      filePath: stray.filePath,
      from: stray.version,
      to,
    });
  }

  return fail(
    'stray-unpublished',
    `Unpublished packages outside the allowlist: ${strayNames.join(', ')}. changeset publish would ship them, so the gate fails until they are held off the publish set.`,
    { strays: strayNames, holdsProposed, unholdable }
  );
}

export function resolveFilteredPublishPlan(evaluation) {
  if (evaluation.ok) return { action: 'proceed', holds: [] };
  if (
    evaluation.code === 'stray-unpublished' &&
    Array.isArray(evaluation.unholdable) &&
    evaluation.unholdable.length === 0 &&
    Array.isArray(evaluation.holdsProposed) &&
    Array.isArray(evaluation.strays) &&
    evaluation.holdsProposed.length === evaluation.strays.length &&
    evaluation.holdsProposed.length > 0
  ) {
    return { action: 'hold-then-proceed', holds: evaluation.holdsProposed };
  }
  return { action: 'fail', code: evaluation.code, message: evaluation.message };
}

export function packagesAfterHolds(packages, holds) {
  const nextVersion = new Map(holds.map((hold) => [hold.name, hold.to]));
  return packages.map((pkg) =>
    nextVersion.has(pkg.name) ? { ...pkg, version: nextVersion.get(pkg.name) } : pkg
  );
}

export function readWorkspaceGlobs(yamlText) {
  const globs = [];
  let inPackages = false;
  for (const line of String(yamlText).split(/\r?\n/)) {
    if (!inPackages) {
      if (/^packages:\s*$/.test(line)) inPackages = true;
      continue;
    }
    if (/^\S/.test(line)) break;
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = line.match(/^\s+-\s+(?:'([^']+)'|"([^"]+)"|(\S+))\s*$/);
    if (!match) {
      throw new Error(`unsupported pnpm-workspace packages entry: ${line.trim()}`);
    }
    globs.push(match[1] || match[2] || match[3]);
  }
  if (globs.length === 0) {
    throw new Error('pnpm-workspace.yaml has no packages globs');
  }
  return globs;
}

export function expandWorkspaceGlob(rootDir, glob) {
  if (glob.includes('**') || glob.includes('?') || glob.includes('{')) {
    throw new Error(`unsupported workspace glob: ${glob}`);
  }
  const parts = glob.split('/').filter(Boolean);
  if (parts.filter((part) => part === '*').length !== 1 || parts.at(-1) !== '*') {
    throw new Error(`unsupported workspace glob: ${glob}`);
  }
  const parent = join(rootDir, ...parts.slice(0, -1));
  if (!existsSync(parent)) return [];
  const files = [];
  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    const pkgJson = join(parent, entry.name, 'package.json');
    if (existsSync(pkgJson)) files.push(pkgJson);
  }
  return files;
}

export function loadWorkspacePackages(rootDir) {
  const yamlPath = join(rootDir, 'pnpm-workspace.yaml');
  const globs = readWorkspaceGlobs(readFileSync(yamlPath, 'utf8'));
  const files = [];
  for (const glob of globs) files.push(...expandWorkspaceGlob(rootDir, glob));
  const packages = [];
  for (const filePath of files) {
    const originalBytes = readFileSync(filePath);
    let json;
    try {
      json = JSON.parse(originalBytes.toString('utf8'));
    } catch {
      throw new Error(`Unable to parse ${filePath}`);
    }
    if (!json.name || !json.version) continue;
    packages.push({
      name: json.name,
      version: json.version,
      private: json.private === true,
      dependencies: json.dependencies || {},
      optionalDependencies: json.optionalDependencies || {},
      peerDependencies: json.peerDependencies || {},
      filePath,
    });
  }
  packages.sort((a, b) => a.name.localeCompare(b.name));
  return packages;
}

export function readChangesetGroups(config) {
  const groups = [];
  for (const key of ['fixed', 'linked']) {
    const value = config?.[key];
    if (value == null) continue;
    if (!Array.isArray(value)) throw new Error(`changeset config ${key} is not an array`);
    for (const group of value) {
      if (!Array.isArray(group)) throw new Error(`changeset config ${key} entries must be arrays of package names`);
      groups.push(group.map(String));
    }
  }
  return groups;
}

export function scrubbedNpmError(result) {
  return scrubSecrets(`${result.stderr || ''}\n${result.stdout || ''}`).trim().slice(0, 400);
}

export function versionsFromNpmView(result) {
  return publishedInfoFromNpmView(result).versions;
}

export function publishedInfoFromNpmView(result) {
  const blob = `${result.stderr || ''}\n${result.stdout || ''}`;
  if (result.status !== 0) {
    if (/E404|404 Not Found|is not in this registry/i.test(blob)) {
      return { versions: [], latest: null };
    }
    throw new Error(`registry lookup failed: ${scrubbedNpmError(result)}`);
  }
  const stdout = String(result.stdout || '').trim();
  if (!stdout) throw new Error('registry lookup returned an empty version list');
  const parsed = JSON.parse(stdout);
  if (Array.isArray(parsed)) return { versions: parsed.map(String), latest: null };
  if (typeof parsed === 'string') return { versions: [parsed], latest: parsed };
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.versions)) {
    const latestTag = parsed['dist-tags'] && parsed['dist-tags'].latest;
    return {
      versions: parsed.versions.map(String),
      latest: latestTag ? String(latestTag) : null,
    };
  }
  throw new Error('registry lookup returned an unexpected versions payload');
}

export function defaultLookupRegistryVersions(name) {
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmBin, ['view', name, '--json'], {
    encoding: 'utf8',
    timeout: 45_000,
    env: process.env,
    windowsHide: true,
    shell: process.platform === 'win32',
  });
  if (result.error) {
    throw new Error(`registry lookup failed for ${name}: ${scrubSecrets(result.error.message)}`);
  }
  try {
    return publishedInfoFromNpmView(result);
  } catch (error) {
    throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function writeHoldReceipt(snapshots) {
  const file = join(
    tmpdir(),
    `holo-release-publish-allowlist-${process.pid}-${randomBytes(4).toString('hex')}.json`
  );
  const body = {
    createdAt: new Date().toISOString(),
    files: snapshots.map((snapshot) => ({
      path: snapshot.filePath,
      name: snapshot.name,
      from: snapshot.from,
      to: snapshot.to,
      originalBase64: Buffer.from(snapshot.originalBytes).toString('base64'),
    })),
  };
  writeFileSync(file, JSON.stringify(body));
  return file;
}

export function restoreReceipt(file) {
  const body = JSON.parse(readFileSync(file, 'utf8'));
  for (const entry of body.files || []) {
    writeFileSync(entry.path, Buffer.from(entry.originalBase64, 'base64'));
  }
  rmSync(file, { force: true });
}

export function restoreSnapshots(snapshots) {
  for (const snapshot of snapshots || []) {
    writeFileSync(snapshot.filePath, snapshot.originalBytes);
  }
}

export function applyVersionSnapshots(holds) {
  const snapshots = [];
  for (const hold of holds) {
    const originalBytes = readFileSync(hold.filePath);
    const json = JSON.parse(originalBytes.toString('utf8'));
    if (json.version !== hold.from) {
      throw new Error(
        `${hold.name} version on disk is ${json.version}, expected ${hold.from}. Refusing to hold.`
      );
    }
    snapshots.push({
      name: hold.name,
      filePath: hold.filePath,
      from: hold.from,
      to: hold.to,
      originalBytes: Buffer.from(originalBytes),
    });
  }
  const receiptPath = writeHoldReceipt(snapshots);
  try {
    for (const snapshot of snapshots) {
      const json = JSON.parse(snapshot.originalBytes.toString('utf8'));
      json.version = snapshot.to;
      writeFileSync(snapshot.filePath, `${JSON.stringify(json, null, 2)}\n`);
    }
  } catch (error) {
    restoreSnapshots(snapshots);
    throw error;
  }
  return { snapshots, receiptPath };
}

export async function prepareFilteredPublish({
  rootDir,
  allowlist,
  lookupRegistryVersions = defaultLookupRegistryVersions,
  write = true,
  logger = console.log,
}) {
  if (allowlist == null) {
    return {
      ok: true,
      code: 'full-fleet',
      snapshots: [],
      publishSet: null,
      holds: [],
      message: 'RELEASE_PUBLISH_ALLOWLIST is unset. Full-fleet changeset publish.',
    };
  }

  const packages = loadWorkspacePackages(rootDir);
  const configPath = join(rootDir, '.changeset', 'config.json');
  const groups = readChangesetGroups(JSON.parse(readFileSync(configPath, 'utf8')));
  const publicPackages = packages.filter((pkg) => !pkg.private);
  logger(
    `[release-publish-allowlist] checking registry versions for ${publicPackages.length} public workspace packages`
  );

  const infoByName = new Map();
  for (const pkg of publicPackages) {
    let info;
    try {
      info = await lookupRegistryVersions(pkg.name);
    } catch (error) {
      return {
        ok: false,
        code: 'registry-unknown',
        message: error instanceof Error ? error.message : String(error),
        snapshots: [],
        publishSet: [],
        holds: [],
      };
    }
    const versions = Array.isArray(info) ? info : info?.versions;
    const latest = Array.isArray(info) ? null : info?.latest ?? null;
    if (!Array.isArray(versions)) {
      return {
        ok: false,
        code: 'registry-unknown',
        message: `Registry lookup for ${pkg.name} did not return a version list.`,
        snapshots: [],
        publishSet: [],
        holds: [],
      };
    }
    infoByName.set(pkg.name, { versions, latest });
  }

  const withRegistry = packages.map((pkg) => ({
    ...pkg,
    registryVersions: pkg.private ? [] : infoByName.get(pkg.name).versions,
    registryLatest: pkg.private ? null : infoByName.get(pkg.name).latest,
  }));
  const evaluation = evaluateReleasePublishAllowlist({
    allowlist,
    packages: withRegistry,
    groups,
  });
  const decision = resolveFilteredPublishPlan(evaluation);
  if (decision.action === 'fail') {
    return { ...evaluation, snapshots: [], holds: [] };
  }
  if (decision.action === 'proceed') {
    return {
      ok: true,
      code: evaluation.code,
      message: evaluation.message,
      snapshots: [],
      publishSet: evaluation.publishSet,
      holds: [],
    };
  }

  const after = packagesAfterHolds(withRegistry, decision.holds);
  const recheck = evaluateReleasePublishAllowlist({
    allowlist,
    packages: after,
    groups,
  });
  if (!recheck.ok) {
    return {
      ok: false,
      code: 'stray-unpublished',
      message:
        'Holding outsiders would still leave a publish set the allowlist gate rejects. Refusing to run changeset publish.',
      snapshots: [],
      holds: [],
      publishSet: [],
    };
  }

  if (!write) {
    return {
      ok: true,
      code: 'allowlist',
      message: recheck.message,
      snapshots: [],
      publishSet: recheck.publishSet,
      holds: decision.holds,
    };
  }

  try {
    const applied = applyVersionSnapshots(decision.holds);
    logger(
      `[release-publish-allowlist] HOLD receipt ${applied.receiptPath} (restore runs after changeset publish)`
    );
    for (const hold of decision.holds) {
      logger(
        `[release-publish-allowlist] HOLD ${hold.name} ${hold.from} -> ${hold.to} (already on npm; tip restored after publish)`
      );
    }
    return {
      ok: true,
      code: 'allowlist',
      message: recheck.message,
      snapshots: applied.snapshots,
      receiptPath: applied.receiptPath,
      publishSet: recheck.publishSet,
      holds: decision.holds,
    };
  } catch (error) {
    return {
      ok: false,
      code: 'hold-failed',
      message: error instanceof Error ? error.message : String(error),
      snapshots: [],
      holds: [],
      publishSet: [],
    };
  }
}

export function runAllowlistSelfTest() {
  const failures = [];
  function check(name, condition) {
    if (!condition) failures.push(name);
  }

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

  const unset = evaluateReleasePublishAllowlist({ allowlist: null, packages: [llm, core] });
  check('unset allowlist keeps full fleet', unset.ok === true && unset.code === 'full-fleet');

  const empty = evaluateReleasePublishAllowlist({ allowlist: [], packages: [llm] });
  check('empty allowlist', empty.ok === false && empty.code === 'empty-allowlist');

  const one = evaluateReleasePublishAllowlist({ allowlist: ['@holoscript/llm-provider'], packages: [llm] });
  check(
    'one package',
    one.ok === true && one.code === 'allowlist' && one.publishSet.join(',') === '@holoscript/llm-provider'
  );

  const published = evaluateReleasePublishAllowlist({
    allowlist: ['@holoscript/llm-provider'],
    packages: [{ ...llm, registryVersions: ['1.6.1', '1.6.2'] }],
  });
  check('package not in unpublished set', published.ok === false && published.code === 'not-unpublished');

  const stray = evaluateReleasePublishAllowlist({
    allowlist: ['@holoscript/llm-provider'],
    packages: [llm, core],
  });
  check('stray unpublished outside allowlist → fail', stray.ok === false && stray.code === 'stray-unpublished');

  return failures;
}

function invokedAsMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

function printHelp() {
  console.log(`release-publish allowlist gate

Does not publish. The legal ship command is:

  RELEASE_PUBLISH_ALLOWLIST=@holoscript/llm-provider corepack pnpm release:publish

Unset RELEASE_PUBLISH_ALLOWLIST keeps full-fleet changeset publish after the
same gates. An empty allowlist fails closed.

  --self-test
  --check --fixture <file>
  --restore-receipt <file>
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return 0;
  }
  if (args.includes('--self-test')) {
    const failures = runAllowlistSelfTest();
    if (failures.length > 0) {
      console.error(`[release-publish-allowlist] self-test failed: ${failures.join('; ')}`);
      return 1;
    }
    console.log('[release-publish-allowlist] self-test passed');
    return 0;
  }
  const receiptFlag = args.indexOf('--restore-receipt');
  if (receiptFlag >= 0) {
    const file = args[receiptFlag + 1];
    if (!file) {
      console.error('[release-publish-allowlist] --restore-receipt requires a file');
      return 1;
    }
    restoreReceipt(file);
    console.log(`[release-publish-allowlist] restored ${file}`);
    return 0;
  }
  if (args.includes('--check')) {
    const fixtureFlag = args.indexOf('--fixture');
    if (fixtureFlag < 0) {
      console.error('[release-publish-allowlist] --check requires --fixture <file> in this entrypoint');
      return 2;
    }
    const fixture = JSON.parse(readFileSync(args[fixtureFlag + 1], 'utf8'));
    const evaluation = evaluateReleasePublishAllowlist(fixture);
    const decision = resolveFilteredPublishPlan(evaluation);
    console.log(
      JSON.stringify({
        ok: evaluation.ok,
        code: evaluation.code,
        decision: decision.action,
        strays: evaluation.strays,
      })
    );
    return evaluation.ok ? 0 : 1;
  }
  console.error('[release-publish-allowlist] refusing to publish. Use corepack pnpm release:publish.');
  return 1;
}

if (invokedAsMain()) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`[release-publish-allowlist] ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    });
}
