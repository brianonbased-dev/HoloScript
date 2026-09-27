/**
 * Assertions for publishing a pre-packed npm tarball.
 *
 * Used by `publish-npm-package.mjs --tarball` so a repaired pack cannot ship
 * unless it is the named package, has no workspace: specs, carries the
 * required registry pins, and (when asked) matches another tarball's files
 * except package.json. Systems stays on its own release script.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const TARBALL_DENY_PACKAGES = Object.freeze(['@holoscript/systems']);

export const FRAMEWORK_617_REPAIR = Object.freeze({
  name: '@holoscript/framework',
  version: '6.1.7',
  sourceName: '@holoscript/framework',
  sourceVersion: '6.1.6',
  deps: Object.freeze([
    Object.freeze({ name: '@holoscript/core', spec: '^8.0.17' }),
    Object.freeze({ name: '@holoscript/llm-provider', spec: '^1.5.0' }),
  ]),
});

export const SNN_873_REPAIR = Object.freeze({
  name: '@holoscript/snn-webgpu',
  version: '8.7.3',
  sourceName: '@holoscript/snn-webgpu',
  sourceVersion: '8.7.2',
  peerDeps: Object.freeze([
    Object.freeze({ name: '@holoscript/core', spec: '^8.7.0' }),
  ]),
});

export function leftoverWorkspaceIn(value) {
  return JSON.stringify(value).includes('workspace:');
}

export function assertAllowedTarballPackage(name) {
  if (TARBALL_DENY_PACKAGES.includes(name) || String(name).startsWith('@holoscript/systems-')) {
    throw new Error(
      `refusing to publish ${name} via --tarball; systems dist-tags stay on the systems release scripts`
    );
  }
}

export function parseRequireDep(raw) {
  const text = String(raw || '');
  const eq = text.indexOf('=');
  if (eq <= 0 || eq === text.length - 1) {
    throw new Error(`--require-dep must be name=spec, got ${JSON.stringify(raw)}`);
  }
  return { name: text.slice(0, eq), spec: text.slice(eq + 1) };
}

export function assertRequiredDeps(pkg, required) {
  const deps = pkg?.dependencies || {};
  for (const { name, spec } of required) {
    if (deps[name] !== spec) {
      throw new Error(
        `${pkg?.name}@${pkg?.version} dependencies.${name} must be ${spec}, found ${deps[name] || '<missing>'}`
      );
    }
  }
}

export function assertFramework617Repair({ tarballPath, sourceTarballPath, packedManifest, sourceManifest }) {
  if (
    packedManifest?.name !== FRAMEWORK_617_REPAIR.name ||
    packedManifest?.version !== FRAMEWORK_617_REPAIR.version
  ) {
    return false;
  }
  if (!sourceTarballPath) {
    throw new Error(
      '@holoscript/framework@6.1.7 requires --same-files-as the published 6.1.6 tarball'
    );
  }
  if (resolve(tarballPath) === resolve(sourceTarballPath)) {
    throw new Error('--same-files-as must be a different tarball than --tarball');
  }
  if (
    sourceManifest?.name !== FRAMEWORK_617_REPAIR.sourceName ||
    sourceManifest?.version !== FRAMEWORK_617_REPAIR.sourceVersion
  ) {
    throw new Error(
      `--same-files-as must be @holoscript/framework@6.1.6, found ${sourceManifest?.name || '<missing>'}@${sourceManifest?.version || '<missing>'}`
    );
  }
  assertRequiredDeps(packedManifest, FRAMEWORK_617_REPAIR.deps);
  return true;
}

export function assertRequiredPeers(pkg, required) {
  const deps = pkg?.peerDependencies || {};
  for (const { name, spec } of required) {
    if (deps[name] !== spec) {
      throw new Error(
        `${pkg?.name}@${pkg?.version} peerDependencies.${name} must be ${spec}, found ${deps[name] || '<missing>'}`
      );
    }
  }
}

export function assertSnn873Repair({ tarballPath, sourceTarballPath, packedManifest, sourceManifest }) {
  if (
    packedManifest?.name !== SNN_873_REPAIR.name ||
    packedManifest?.version !== SNN_873_REPAIR.version
  ) {
    return false;
  }
  if (!sourceTarballPath) {
    throw new Error(
      '@holoscript/snn-webgpu@8.7.3 requires --same-files-as the published 8.7.2 tarball'
    );
  }
  if (resolve(tarballPath) === resolve(sourceTarballPath)) {
    throw new Error('--same-files-as must be a different tarball than --tarball');
  }
  if (
    sourceManifest?.name !== SNN_873_REPAIR.sourceName ||
    sourceManifest?.version !== SNN_873_REPAIR.sourceVersion
  ) {
    throw new Error(
      `--same-files-as must be @holoscript/snn-webgpu@8.7.2, found ${sourceManifest?.name || '<missing>'}@${sourceManifest?.version || '<missing>'}`
    );
  }
  assertRequiredPeers(packedManifest, SNN_873_REPAIR.peerDeps);
  return true;
}

export function listTarballFiles(tarball) {
  return execFileSync('tar', ['-tf', tarball], { encoding: 'utf8', timeout: 30_000 })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.endsWith('/'));
}

export function hashTarballFile(tarball, innerPath) {
  const bytes = execFileSync('tar', ['-xOf', tarball, innerPath], {
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  return createHash('sha256').update(bytes).digest('hex');
}

function extractTarball(tarball, dest) {
  mkdirSync(dest, { recursive: true });
  execFileSync('tar', ['-xzf', tarball, '-C', dest], { timeout: 60_000 });
}

function walkFiles(root, prefix = '') {
  const out = [];
  for (const name of readdirSync(root)) {
    const rel = prefix ? `${prefix}/${name}` : name;
    const abs = join(root, name);
    if (statSync(abs).isDirectory()) out.push(...walkFiles(abs, rel));
    else out.push(rel.replaceAll('\\', '/'));
  }
  return out;
}

function fileSha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function assertSameFilesExcept(tarball, sourceTarball, except = ['package/package.json']) {
  const skip = new Set(except);
  const root = mkdtempSync(join(tmpdir(), 'holo-tarball-compare-'));
  try {
    const leftDir = join(root, 'left');
    const rightDir = join(root, 'right');
    extractTarball(tarball, leftDir);
    extractTarball(sourceTarball, rightDir);
    const left = walkFiles(leftDir).filter((path) => !skip.has(path));
    const right = walkFiles(rightDir).filter((path) => !skip.has(path));
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    const onlyLeft = left.filter((path) => !rightSet.has(path));
    const onlyRight = right.filter((path) => !leftSet.has(path));
    if (onlyLeft.length || onlyRight.length) {
      throw new Error(
        `tarball file list differs from source (except ${[...skip].join(', ')}): ` +
          `only-new=${onlyLeft.slice(0, 8).join(',') || 'none'} ` +
          `only-source=${onlyRight.slice(0, 8).join(',') || 'none'}`
      );
    }
    for (const path of left) {
      const a = fileSha256(join(leftDir, ...path.split('/')));
      const b = fileSha256(join(rightDir, ...path.split('/')));
      if (a !== b) {
        throw new Error(`tarball file drifted from source: ${path}`);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Choose a registry version for a workspace rewrite.
 * Prefer the local version when it exists on npm. Otherwise take the highest
 * published version in the same major — never the latest dist-tag, which can
 * sit below a later published line.
 */
export function pickPublishableVersion(localVersion, { exactExists, versions } = {}) {
  if (exactExists) return localVersion;
  const major = String(localVersion || '').split('.')[0];
  const sameMajor = (versions || []).filter((version) => String(version).split('.')[0] === major);
  if (sameMajor.length === 0) return null;
  return sameMajor.reduce((best, candidate) =>
    compareSemver(String(candidate), String(best)) > 0 ? candidate : best
  );
}

function compareSemver(a, b) {
  const pa = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i += 1) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}
