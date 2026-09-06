/**
 * Rewrite workspace: dependency specs to registry semver, then prove none remain.
 *
 * Optional peerDependencies with leftover workspace:^ still crash a cold
 * `npm install` of the parent (EUNSUPPORTEDPROTOCOL), even when the peer is
 * marked optional. Measured 2026-09-05 on @holoscript/snn-webgpu@8.7.1
 * blocking @holoscript/holoembed@6.1.4.
 */

export const WORKSPACE_DEP_FIELDS = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'devDependencies',
];

export function rewriteWorkspaceSpec(spec, depName, depVersion) {
  const raw = String(spec || '');
  if (!raw.startsWith('workspace:')) return raw;
  const range = raw.slice('workspace:'.length);
  if (range === '*' || range === '^' || range === '') return `^${depVersion}`;
  if (range === '~') return `~${depVersion}`;
  if (/^\d+\.\d+\.\d+/.test(range)) return range;
  throw new Error(`Unsupported workspace spec for ${depName}: ${raw}`);
}

export function leftoverWorkspaceSpecs(pkg) {
  const leftovers = [];
  for (const field of WORKSPACE_DEP_FIELDS) {
    const deps = pkg?.[field] || {};
    for (const [depName, spec] of Object.entries(deps)) {
      if (String(spec).includes('workspace:')) {
        leftovers.push({ field, depName, spec: String(spec) });
      }
    }
  }
  return leftovers;
}

export function assertNoWorkspaceSpecs(pkg, options = {}) {
  const leftovers = leftoverWorkspaceSpecs(pkg);
  if (leftovers.length === 0) return leftovers;
  const label = options.label || pkg?.name || 'package';
  throw new Error(
    `${label} still has workspace: specs after rewrite:\n` +
      leftovers.map((row) => `- ${row.field}.${row.depName}: ${row.spec}`).join('\n')
  );
}

export function rewriteWorkspaceRefs(pkg, versionMap, options = {}) {
  const resolveVersion =
    typeof options.resolveVersion === 'function'
      ? options.resolveVersion
      : (_name, localVersion) => localVersion;
  const rewrites = [];
  for (const field of WORKSPACE_DEP_FIELDS) {
    const deps = pkg[field] || {};
    for (const [depName, spec] of Object.entries(deps)) {
      if (!String(spec).startsWith('workspace:')) continue;
      const localVersion = versionMap.get(depName);
      if (!localVersion) {
        throw new Error(
          `${pkg.name}: ${field}.${depName} uses ${spec}, but no workspace version was found`
        );
      }
      const depVersion = resolveVersion(depName, localVersion);
      if (!depVersion) {
        throw new Error(
          `${pkg.name}: ${field}.${depName} resolved to an empty registry version (local ${localVersion})`
        );
      }
      const rewritten = rewriteWorkspaceSpec(spec, depName, depVersion);
      deps[depName] = rewritten;
      rewrites.push({
        field,
        depName,
        from: spec,
        to: rewritten,
        localVersion,
        publishVersion: String(depVersion),
      });
    }
  }
  assertNoWorkspaceSpecs(pkg, { label: pkg?.name });
  return rewrites;
}
