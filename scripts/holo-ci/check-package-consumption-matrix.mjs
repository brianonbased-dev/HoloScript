#!/usr/bin/env node
/**
 * Verifies that laptop, Jetson, and Vast fleet lanes can consume the npm/PyPI
 * package artifacts they are expected to install.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const PACK_NPM = args.includes('--pack-npm');
const SMOKE_PYTHON_ARTIFACTS = args.includes('--smoke-python-artifacts');
const SMOKE_PYPI_INSTALL = args.includes('--smoke-pypi-install');
const BUILD_PYTHON = args.includes('--build-python') || SMOKE_PYTHON_ARTIFACTS;
const INSPECT_PYTHON_ARTIFACTS = args.includes('--inspect-python-artifacts');
const RESOLVE_PYPI_EXTRAS = args.includes('--resolve-pypi-extras');
const AUDIT_PYPI = args.includes('--audit-pypi') || RESOLVE_PYPI_EXTRAS;
const SELF_TEST = args.includes('--self-test');
const PYPI_LIFECYCLE_FLAGS = {
  'build-python': () => BUILD_PYTHON,
  'inspect-python-artifacts': () => INSPECT_PYTHON_ARTIFACTS,
  'smoke-python-artifacts': () => SMOKE_PYTHON_ARTIFACTS,
  'smoke-pypi-install': () => SMOKE_PYPI_INSTALL,
  'audit-pypi': () => AUDIT_PYPI,
  'resolve-pypi-extras': () => RESOLVE_PYPI_EXTRAS,
};
const rootIdx = args.indexOf('--root');
const manifestIdx = args.indexOf('--manifest');
const outIdx = args.indexOf('--out-dir');
const ROOT = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : resolve(__dirname, '..', '..');
const MANIFEST =
  manifestIdx >= 0
    ? resolve(args[manifestIdx + 1])
    : join(ROOT, 'scripts', 'holo-ci', 'package-consumption-manifest.json');
const OUT_DIR =
  outIdx >= 0 ? resolve(args[outIdx + 1]) : join(ROOT, '.scratch', 'package-consumption-matrix');
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const PYTHON_BIN = process.env.PYTHON || 'python';
const PYPI_EXTRAS_RESOLUTION_TIMEOUT_MS = Number(
  process.env.HOLOSCRIPT_PYPI_EXTRAS_TIMEOUT_MS || 180_000
);

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function run(cmd, cmdArgs, opts = {}) {
  const exe = cmd === 'npm' ? NPM_BIN : cmd;
  return execFileSync(exe, cmdArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: cmd === 'npm' && process.platform === 'win32',
    ...opts,
  });
}

function safeName(name) {
  return String(name || 'package').replace(/[^\w.-]+/g, '_');
}

function truncateForError(value, max = 800) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function formatRunError(error) {
  return truncateForError(error.stderr || error.stdout || error.message || error);
}

function venvPython(venvDir) {
  return join(venvDir, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
}

function venvScript(venvDir, scriptName) {
  const binDir = join(venvDir, process.platform === 'win32' ? 'Scripts' : 'bin');
  const candidates =
    process.platform === 'win32'
      ? [
          join(binDir, `${scriptName}.exe`),
          join(binDir, `${scriptName}.cmd`),
          join(binDir, scriptName),
        ]
      : [join(binDir, scriptName)];
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

function supportsNpmSelector(selectors, value) {
  if (!Array.isArray(selectors) || selectors.length === 0) return true;
  const positives = selectors.filter((item) => !String(item).startsWith('!'));
  const negatives = selectors
    .filter((item) => String(item).startsWith('!'))
    .map((item) => String(item).slice(1));
  if (negatives.includes(value)) return false;
  return positives.length === 0 || positives.includes(value);
}

function normalizePackPath(path) {
  return String(path || '')
    .replace(/^package\//, '')
    .replace(/^\.\//, '')
    .replace(/\\/g, '/');
}

function archiveNameSet(names) {
  const out = new Set();
  for (const name of names || []) {
    const normalized = normalizePackPath(name);
    out.add(normalized);
    const parts = normalized.split('/');
    if (parts.length > 1) out.add(parts.slice(1).join('/'));
  }
  return out;
}

function parsePyprojectValue(text, key) {
  const match = text.match(new RegExp(`^${key}\\s*=\\s*\"([^\"]+)\"`, 'm'));
  return match ? match[1] : null;
}

function parseProjectScripts(text) {
  const scripts = new Set();
  const block = text.match(/^\[project\.scripts\]\s*$(?<body>[\s\S]*?)(?:^\[|\z)/m);
  if (!block?.groups?.body) return scripts;
  for (const line of block.groups.body.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=/);
    if (match) scripts.add(match[1]);
  }
  return scripts;
}

function parseProjectOptionalDependencyGroups(text) {
  const groups = new Set();
  const block = text.match(/^\[project\.optional-dependencies\]\s*$(?<body>[\s\S]*?)(?:^\[|\z)/m);
  if (!block?.groups?.body) return groups;
  for (const line of block.groups.body.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*\[/);
    if (match) groups.add(match[1]);
  }
  return groups;
}

function normalizeExtraName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[-_.]+/g, '-');
}

function laneExtrasFromPackage(pkg) {
  const byConsumer = {};
  const extras = new Set();
  for (const [consumerId, requestedExtras] of Object.entries(pkg.extrasByConsumer || {})) {
    const normalized = [...new Set((requestedExtras || []).map(normalizeExtraName))].filter(
      Boolean
    );
    if (normalized.length === 0) continue;
    byConsumer[consumerId] = normalized;
    for (const extra of normalized) extras.add(extra);
  }
  return { byConsumer, extras: [...extras].sort() };
}

function providesExtrasFromMetadata(text) {
  const extras = new Set();
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^Provides-Extra:\s*(.+?)\s*$/i);
    if (match) extras.add(normalizeExtraName(match[1]));
  }
  return extras;
}

function assertProvidedExtras(pkgName, scope, providedExtras, requiredExtras, errors) {
  for (const extra of requiredExtras || []) {
    if (!providedExtras.has(normalizeExtraName(extra))) {
      errors.push(`${pkgName}: ${scope} metadata missing requested extra '${extra}'`);
    }
  }
}

function parseDistInfoFromBuildOutput(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.match(/Successfully built (?<files>.+)$/)?.groups?.files)
    .filter(Boolean)
    .flatMap((files) => files.split(/\s+/).filter((file) => file && file !== 'and'));
}

function minimumVersionFromRange(range) {
  const match = String(range || '').match(/>=\s*(\d+(?:\.\d+){0,2})/);
  return match ? match[1] : null;
}

function pythonVersionForConsumer(consumer) {
  const minimum = minimumVersionFromRange(consumer?.python);
  const match = String(minimum || '').match(/^(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}` : null;
}

function pythonAbiForVersion(version) {
  const match = String(version || '').match(/^(\d+)\.(\d+)/);
  return match ? `cp${match[1]}${match[2]}` : null;
}

function pipPlatformForConsumer(consumer) {
  if (consumer?.os === 'win32' && consumer?.cpu === 'x64') return 'win_amd64';
  if (consumer?.os === 'linux' && consumer?.cpu === 'x64') return 'manylinux2014_x86_64';
  if (consumer?.os === 'linux' && consumer?.cpu === 'arm64') return 'manylinux2014_aarch64';
  return null;
}

function pypiExtraSpec(pkgName, version, extras) {
  const normalized = [...new Set((extras || []).map(normalizeExtraName))].filter(Boolean).sort();
  return normalized.length
    ? `${pkgName}[${normalized.join(',')}]==${version}`
    : `${pkgName}==${version}`;
}

function compareDottedVersions(a, b) {
  const left = String(a)
    .split('.')
    .map((part) => Number(part));
  const right = String(b)
    .split('.')
    .map((part) => Number(part));
  const length = Math.max(left.length, right.length, 3);
  for (let i = 0; i < length; i += 1) {
    const l = Number.isFinite(left[i]) ? left[i] : 0;
    const r = Number.isFinite(right[i]) ? right[i] : 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

function inspectPythonArtifacts(pkg, artifacts, errors) {
  const script = String.raw`
import json
import sys
import tarfile
import zipfile

out = {}
for path in sys.argv[1:]:
    if path.endswith(".whl"):
        with zipfile.ZipFile(path) as wheel:
            files = wheel.namelist()
            texts = {}
            for name in files:
                if name.endswith(("/METADATA", "/WHEEL", "/entry_points.txt")):
                    texts[name] = wheel.read(name).decode("utf-8", "replace")
            out[path] = {"kind": "wheel", "files": files, "texts": texts}
    elif path.endswith(".tar.gz"):
        with tarfile.open(path, "r:*") as sdist:
            files = sdist.getnames()
            texts = {}
            for member in sdist.getmembers():
                if member.name.endswith(("pyproject.toml", "PKG-INFO")):
                    extracted = sdist.extractfile(member)
                    if extracted is not None:
                        texts[member.name] = extracted.read().decode("utf-8", "replace")
            out[path] = {"kind": "sdist", "files": files, "texts": texts}
print(json.dumps(out))
`;
  const inspected = JSON.parse(run(PYTHON_BIN, ['-c', script, ...artifacts], { cwd: ROOT }));
  const wheels = Object.entries(inspected).filter(([, value]) => value.kind === 'wheel');
  const sdists = Object.entries(inspected).filter(([, value]) => value.kind === 'sdist');
  const laneExtras = laneExtrasFromPackage(pkg);
  if (wheels.length === 0) errors.push(`${pkg.name}: artifact inspection found no wheel`);
  if (sdists.length === 0) errors.push(`${pkg.name}: artifact inspection found no sdist`);

  for (const [, wheel] of wheels) {
    const files = archiveNameSet(wheel.files);
    if (![...files].some((file) => file.endsWith('.dist-info/METADATA'))) {
      errors.push(`${pkg.name}: wheel missing dist-info/METADATA`);
    }
    if (![...files].some((file) => file.endsWith('.dist-info/WHEEL'))) {
      errors.push(`${pkg.name}: wheel missing dist-info/WHEEL`);
    }
    for (const importName of pkg.imports || []) {
      const importPath = `${importName.replace(/\./g, '/')}/__init__.py`;
      if (!files.has(importPath))
        errors.push(`${pkg.name}: wheel missing import package ${importPath}`);
    }
    const entryPointText = Object.entries(wheel.texts || {})
      .filter(([name]) => name.endsWith('/entry_points.txt'))
      .map(([, text]) => text)
      .join('\n');
    for (const scriptName of pkg.consoleScripts || []) {
      if (!entryPointText.includes(`${scriptName} =`)) {
        errors.push(`${pkg.name}: wheel missing console script entry point ${scriptName}`);
      }
    }
    const metadataText = Object.entries(wheel.texts || {})
      .filter(([name]) => name.endsWith('/METADATA'))
      .map(([, text]) => text)
      .join('\n');
    assertProvidedExtras(
      pkg.name,
      'wheel',
      providesExtrasFromMetadata(metadataText),
      laneExtras.extras,
      errors
    );
  }

  for (const [, sdist] of sdists) {
    const files = archiveNameSet(sdist.files);
    if (!files.has('pyproject.toml')) errors.push(`${pkg.name}: sdist missing pyproject.toml`);
    if (!files.has('README.md')) errors.push(`${pkg.name}: sdist missing README.md`);
    for (const importName of pkg.imports || []) {
      const importPath = `${importName.replace(/\./g, '/')}/__init__.py`;
      if (!files.has(importPath))
        errors.push(`${pkg.name}: sdist missing import package ${importPath}`);
    }
    const pkgInfoText = Object.entries(sdist.texts || {})
      .filter(([name]) => name.endsWith('/PKG-INFO'))
      .map(([, text]) => text)
      .join('\n');
    assertProvidedExtras(
      pkg.name,
      'sdist',
      providesExtrasFromMetadata(pkgInfoText),
      laneExtras.extras,
      errors
    );
  }
}

function smokePythonInstall(pkg, row, scope, installArgs, errors) {
  const venvDir = join(OUT_DIR, '_venvs', `${safeName(pkg.name)}-${scope}`);
  row[scope === 'artifact' ? 'artifactSmoke' : 'pypiSmoke'] = {
    scope,
    imports: pkg.imports || [],
    consoleScripts: pkg.consoleScripts || [],
  };

  try {
    rmSync(venvDir, { recursive: true, force: true });
    mkdirSync(dirname(venvDir), { recursive: true });
    run(PYTHON_BIN, ['-m', 'venv', venvDir], { cwd: ROOT, timeout: 60_000 });
    const python = venvPython(venvDir);
    if (!existsSync(python)) {
      errors.push(`${pkg.name}: ${scope} smoke venv did not create ${python}`);
      return;
    }

    run(
      python,
      ['-m', 'pip', 'install', '--disable-pip-version-check', '--no-deps', ...installArgs],
      { cwd: ROOT, timeout: 120_000 }
    );

    const importScript = `
import importlib
import json
modules = ${JSON.stringify(pkg.imports || [])}
for module in modules:
    importlib.import_module(module)
print(json.dumps({"imports": modules}))
`;
    run(python, ['-c', importScript], { cwd: ROOT, timeout: 30_000 });

    for (const scriptName of pkg.consoleScripts || []) {
      const script = venvScript(venvDir, scriptName);
      if (!existsSync(script)) {
        errors.push(`${pkg.name}: ${scope} smoke missing console script ${scriptName}`);
        continue;
      }
      run(script, ['--help'], { cwd: ROOT, timeout: 30_000 });
    }
  } catch (error) {
    errors.push(`${pkg.name}: ${scope} smoke failed: ${formatRunError(error)}`);
  }
}

function resolvePyPiExtras(pkg, row, consumer, extras, version, errors, warnings) {
  const pythonVersion = pythonVersionForConsumer(consumer);
  const pythonAbi = pythonAbiForVersion(pythonVersion);
  const platform = pipPlatformForConsumer(consumer);
  const spec = pypiExtraSpec(pkg.name, version, extras);
  row.extraResolution[consumer.id] = {
    spec,
    python: pythonVersion,
    abi: pythonAbi,
    platform,
    status: 'pending',
  };

  if (!pythonVersion || !pythonAbi || !platform) {
    warnings.push(
      `${pkg.name}: ${consumer.id} extra resolution skipped; unsupported Python/platform lane`
    );
    row.extraResolution[consumer.id].status = 'skipped';
    return;
  }

  if (row.pypi?.status && row.pypi.status !== 'current') {
    errors.push(
      `${pkg.name}: ${consumer.id} extra resolution requires current PyPI package, got ${row.pypi.status}`
    );
    row.extraResolution[consumer.id].status = 'blocked';
    return;
  }

  const reportPath = join(
    OUT_DIR,
    'pypi-extra-resolution',
    safeName(pkg.name),
    `${safeName(consumer.id)}.json`
  );
  mkdirSync(dirname(reportPath), { recursive: true });

  try {
    run(
      PYTHON_BIN,
      [
        '-m',
        'pip',
        'install',
        '--dry-run',
        '--ignore-installed',
        '--disable-pip-version-check',
        '--only-binary=:all:',
        '--python-version',
        pythonVersion,
        '--implementation',
        'cp',
        '--abi',
        pythonAbi,
        '--platform',
        platform,
        '--report',
        reportPath,
        spec,
      ],
      { cwd: ROOT, timeout: PYPI_EXTRAS_RESOLUTION_TIMEOUT_MS }
    );
    const report = existsSync(reportPath) ? readJson(reportPath) : null;
    row.extraResolution[consumer.id] = {
      ...row.extraResolution[consumer.id],
      status: 'resolved',
      report: reportPath,
      plannedInstalls: Array.isArray(report?.install) ? report.install.length : null,
    };
  } catch (error) {
    row.extraResolution[consumer.id].status = 'failed';
    errors.push(`${pkg.name}: ${consumer.id} extra resolution failed: ${formatRunError(error)}`);
  }
}

async function auditPyPiPackage(pkg, localVersion, row, errors, warnings) {
  const url = `https://pypi.org/pypi/${encodeURIComponent(pkg.name)}/json`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'holoscript-package-consumption-matrix/1.0' },
    });
    if (res.status === 404) {
      row.pypi = {
        status: 'publish-new',
        localVersion,
        publishedVersion: null,
        url: `https://pypi.org/project/${pkg.name}/`,
      };
      return;
    }
    if (!res.ok) {
      warnings.push(`${pkg.name}: PyPI registry audit returned HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    const publishedVersion = data?.info?.version;
    if (typeof publishedVersion !== 'string' || publishedVersion.length === 0) {
      warnings.push(`${pkg.name}: PyPI registry audit did not return info.version`);
      return;
    }
    const cmp = compareDottedVersions(localVersion, publishedVersion);
    const publishedExtras = new Set((data?.info?.provides_extra || []).map(normalizeExtraName));
    const laneExtras = laneExtrasFromPackage(pkg);
    row.pypi = {
      status: cmp === 0 ? 'current' : cmp > 0 ? 'publish-update' : 'local-behind',
      localVersion,
      publishedVersion,
      providesExtra: [...publishedExtras].sort(),
      url: `https://pypi.org/project/${pkg.name}/`,
    };
    assertProvidedExtras(pkg.name, 'PyPI', publishedExtras, laneExtras.extras, errors);
    if (cmp < 0) {
      errors.push(`${pkg.name}: local version ${localVersion} is behind PyPI ${publishedVersion}`);
    }
  } catch (error) {
    warnings.push(
      `${pkg.name}: PyPI registry audit failed: ${String(error.message || error).slice(0, 240)}`
    );
  }
}

function checkRuntimeMinimum(
  pkgName,
  runtimeName,
  packageRange,
  consumerId,
  consumerRange,
  errors,
  warnings
) {
  const packageMin = minimumVersionFromRange(packageRange);
  const consumerMin = minimumVersionFromRange(consumerRange);
  if (!packageMin) {
    warnings.push(`${pkgName}: cannot parse ${runtimeName} requirement '${packageRange}'`);
    return;
  }
  if (!consumerMin) {
    errors.push(`${pkgName}: cannot parse ${consumerId} ${runtimeName} runtime '${consumerRange}'`);
    return;
  }
  if (compareDottedVersions(packageMin, consumerMin) > 0) {
    errors.push(
      `${pkgName}: requires ${runtimeName} ${packageRange}, but ${consumerId} is declared as ${consumerRange}`
    );
  }
}

function checkConsumerShape(manifest, errors) {
  const consumers = new Map();
  for (const consumer of manifest.consumers || []) {
    if (!consumer.id) errors.push('consumer missing id');
    if (!consumer.os) errors.push(`${consumer.id || '<unknown>'}: consumer missing os`);
    if (!consumer.cpu) errors.push(`${consumer.id || '<unknown>'}: consumer missing cpu`);
    if (!consumer.node) errors.push(`${consumer.id || '<unknown>'}: consumer missing node`);
    if (!consumer.python) errors.push(`${consumer.id || '<unknown>'}: consumer missing python`);
    consumers.set(consumer.id, consumer);
  }
  return consumers;
}

function assertConsumersKnown(pkg, consumers, errors) {
  for (const id of pkg.requiredBy || []) {
    if (!consumers.has(id)) errors.push(`${pkg.name}: unknown consumer '${id}'`);
  }
}

function lifecycleFlagActive(flag) {
  return Boolean(PYPI_LIFECYCLE_FLAGS[flag]?.());
}

function validatePyPiFleetLifecycle(pkg, row, consumers, errors) {
  const lifecycle = pkg.fleetLifecycle;
  row.lifecycleChecks = [];
  if (!lifecycle || typeof lifecycle !== 'object') {
    errors.push(`${pkg.name}: missing fleetLifecycle receipt contract`);
    return;
  }
  if (!lifecycle.receiptScope) errors.push(`${pkg.name}: fleetLifecycle missing receiptScope`);
  if (!lifecycle.staleTelemetryPolicy) {
    errors.push(`${pkg.name}: fleetLifecycle missing staleTelemetryPolicy`);
  }
  if (!Array.isArray(lifecycle.checks) || lifecycle.checks.length === 0) {
    errors.push(`${pkg.name}: fleetLifecycle.checks[] is empty`);
    return;
  }

  const seen = new Set();
  for (const check of lifecycle.checks) {
    const id = String(check.id || '');
    const consumerLanes = check.consumerLanes || pkg.requiredBy || [];
    const requiredFlags = check.requiredFlags || [];
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      errors.push(`${pkg.name}: invalid fleetLifecycle check id '${id || '<missing>'}'`);
    }
    if (seen.has(id)) errors.push(`${pkg.name}: duplicate fleetLifecycle check '${id}'`);
    seen.add(id);
    if (!check.description) errors.push(`${pkg.name}: fleetLifecycle '${id}' missing description`);
    if (!check.evidence) errors.push(`${pkg.name}: fleetLifecycle '${id}' missing evidence`);
    if (!Array.isArray(consumerLanes) || consumerLanes.length === 0) {
      errors.push(`${pkg.name}: fleetLifecycle '${id}' missing consumerLanes[]`);
    }
    for (const lane of consumerLanes) {
      if (!consumers.has(lane)) {
        errors.push(`${pkg.name}: fleetLifecycle '${id}' unknown consumer '${lane}'`);
      }
      if (!pkg.requiredBy?.includes(lane)) {
        errors.push(`${pkg.name}: fleetLifecycle '${id}' covers non-required lane '${lane}'`);
      }
    }
    if (!Array.isArray(requiredFlags) || requiredFlags.length === 0) {
      errors.push(`${pkg.name}: fleetLifecycle '${id}' missing requiredFlags[]`);
    }
    for (const flag of requiredFlags) {
      if (!Object.hasOwn(PYPI_LIFECYCLE_FLAGS, flag)) {
        errors.push(`${pkg.name}: fleetLifecycle '${id}' unknown required flag '${flag}'`);
      }
    }
    row.lifecycleChecks.push({
      id,
      consumerLanes,
      requiredFlags,
      status: requiredFlags.length && requiredFlags.every(lifecycleFlagActive)
        ? 'verified'
        : 'declared',
    });
  }
}

function checkNpmPackage(pkg, consumers, errors, warnings, rows, type = 'npm') {
  assertConsumersKnown(pkg, consumers, errors);
  const dir = resolve(ROOT, pkg.packageDir || '');
  const manifestPath = join(dir, 'package.json');
  if (!existsSync(manifestPath)) {
    errors.push(`${pkg.name}: package.json not found at ${pkg.packageDir}`);
    return;
  }
  const json = readJson(manifestPath);
  const row = { type, name: pkg.name, requiredBy: pkg.requiredBy || [], packEntries: null };
  rows.push(row);

  if (json.name !== pkg.name) errors.push(`${pkg.name}: package.json name is ${json.name}`);
  if (json.private === true) errors.push(`${pkg.name}: package is private`);
  if (!json.version || !/^\d+\.\d+\.\d+(?:-.+)?$/.test(json.version)) {
    errors.push(`${pkg.name}: version is not semver-ish (${json.version || 'missing'})`);
  }
  for (const field of ['description', 'license', 'repository']) {
    if (!json[field]) errors.push(`${pkg.name}: missing npm metadata field '${field}'`);
  }
  if (!Array.isArray(json.files) || json.files.length === 0) {
    errors.push(`${pkg.name}: missing files[] package allowlist`);
  }
  if (!json.main && !json.exports && !json.bin) {
    errors.push(`${pkg.name}: no main, exports, or bin entrypoint`);
  }
  if (!json.engines?.node) {
    warnings.push(`${pkg.name}: no package-level engines.node; relying on root/fleet Node policy`);
  }
  for (const id of pkg.requiredBy || []) {
    const consumer = consumers.get(id);
    if (!consumer) continue;
    if (json.engines?.node) {
      checkRuntimeMinimum(pkg.name, 'node', json.engines.node, id, consumer.node, errors, warnings);
    }
    if (!supportsNpmSelector(json.os, consumer.os)) {
      errors.push(`${pkg.name}: os field does not support ${id} (${consumer.os})`);
    }
    if (!supportsNpmSelector(json.cpu, consumer.cpu)) {
      errors.push(`${pkg.name}: cpu field does not support ${id} (${consumer.cpu})`);
    }
  }
  for (const binName of pkg.requireBins || []) {
    if (!json.bin?.[binName]) errors.push(`${pkg.name}: missing required bin '${binName}'`);
  }
  for (const file of pkg.requireFiles || []) {
    if (!existsSync(join(dir, file)))
      errors.push(`${pkg.name}: required artifact missing before pack: ${file}`);
  }

  if (!PACK_NPM) return;
  const packOut = run('npm', ['pack', '--dry-run', '--json'], { cwd: dir });
  const parsed = JSON.parse(packOut);
  const files = new Set((parsed[0]?.files || []).map((entry) => normalizePackPath(entry.path)));
  row.packEntries = files.size;
  for (const file of pkg.requireFiles || []) {
    if (!files.has(file)) errors.push(`${pkg.name}: npm pack does not include ${file}`);
  }
  for (const binPath of Object.values(json.bin || {})) {
    const normalized = normalizePackPath(binPath);
    if (!files.has(normalized))
      errors.push(`${pkg.name}: npm pack does not include bin target ${normalized}`);
  }
  if (pkg.forbidBundledNativeAddons) {
    const nativeAddons = [...files].filter((file) => file.endsWith('.node'));
    if (nativeAddons.length) {
      errors.push(
        `${pkg.name}: npm pack includes native addon(s) despite fleet consumption: ${nativeAddons.join(', ')}`
      );
    }
  }
}

async function checkPyPackage(pkg, consumers, errors, warnings, rows) {
  assertConsumersKnown(pkg, consumers, errors);
  const dir = resolve(ROOT, pkg.packageDir || '');
  const pyproject = join(dir, 'pyproject.toml');
  if (!existsSync(pyproject)) {
    errors.push(`${pkg.name}: pyproject.toml not found at ${pkg.packageDir}`);
    return;
  }
  const text = readFileSync(pyproject, 'utf8');
  const row = {
    type: 'pypi',
    name: pkg.name,
    requiredBy: pkg.requiredBy || [],
    laneExtras: laneExtrasFromPackage(pkg).byConsumer,
    built: [],
    inspected: false,
    artifactSmoke: null,
    pypiSmoke: null,
    pypi: null,
    extraResolution: {},
    lifecycleChecks: [],
  };
  rows.push(row);
  validatePyPiFleetLifecycle(pkg, row, consumers, errors);

  const projectName = parsePyprojectValue(text, 'name');
  const version = parsePyprojectValue(text, 'version');
  const requiresPython = parsePyprojectValue(text, 'requires-python');
  if (projectName !== pkg.name)
    errors.push(`${pkg.name}: pyproject name is ${projectName || 'missing'}`);
  if (!version || !/^\d+\.\d+\.\d+(?:-.+)?$/.test(version)) {
    errors.push(`${pkg.name}: version is not semver-ish (${version || 'missing'})`);
  }
  if (!requiresPython) errors.push(`${pkg.name}: missing requires-python`);
  if (requiresPython) {
    for (const id of pkg.requiredBy || []) {
      const consumer = consumers.get(id);
      if (!consumer) continue;
      checkRuntimeMinimum(
        pkg.name,
        'python',
        requiresPython,
        id,
        consumer.python,
        errors,
        warnings
      );
    }
  }
  if (!/^license\s*=\s*"[^"]+"/m.test(text)) {
    errors.push(`${pkg.name}: license must use SPDX string form, e.g. license = "MIT"`);
  }
  if (!text.includes('[build-system]')) errors.push(`${pkg.name}: missing [build-system]`);
  for (const importName of pkg.imports || []) {
    const importPath = join(dir, ...importName.split('.'), '__init__.py');
    if (!existsSync(importPath)) errors.push(`${pkg.name}: missing import package ${importName}`);
  }
  const scripts = parseProjectScripts(text);
  for (const script of pkg.consoleScripts || []) {
    if (!scripts.has(script)) errors.push(`${pkg.name}: missing console script ${script}`);
  }
  const extras = parseProjectOptionalDependencyGroups(text);
  for (const [consumerId, requestedExtras] of Object.entries(pkg.extrasByConsumer || {})) {
    if (!consumers.has(consumerId))
      errors.push(`${pkg.name}: extrasByConsumer references unknown consumer '${consumerId}'`);
    for (const extra of requestedExtras || []) {
      if (!extras.has(extra))
        errors.push(`${pkg.name}: missing optional dependency extra '${extra}' for ${consumerId}`);
    }
  }

  if (AUDIT_PYPI && version) await auditPyPiPackage(pkg, version, row, errors, warnings);

  if (SMOKE_PYPI_INSTALL && version) {
    smokePythonInstall(
      pkg,
      row,
      'pypi',
      ['--only-binary=:all:', `${pkg.name}==${version}`],
      errors
    );
  }

  if (RESOLVE_PYPI_EXTRAS && version) {
    for (const [consumerId, requestedExtras] of Object.entries(row.laneExtras || {})) {
      const consumer = consumers.get(consumerId);
      if (!consumer) continue;
      resolvePyPiExtras(pkg, row, consumer, requestedExtras, version, errors, warnings);
    }
  }

  if (!BUILD_PYTHON) return;
  const outDir = join(OUT_DIR, pkg.name.replace(/[^\w.-]+/g, '_'));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const stdout = run(PYTHON_BIN, ['-m', 'build', '--outdir', outDir, dir], { cwd: ROOT });
  row.built = parseDistInfoFromBuildOutput(stdout);
  const artifacts = readdirSync(outDir).filter(
    (file) => file.endsWith('.whl') || file.endsWith('.tar.gz')
  );
  if (!artifacts.some((file) => file.endsWith('.whl')))
    errors.push(`${pkg.name}: build produced no wheel`);
  if (!artifacts.some((file) => file.endsWith('.tar.gz')))
    errors.push(`${pkg.name}: build produced no sdist`);
  const artifactPaths = artifacts.map((file) => join(outDir, file));
  if (INSPECT_PYTHON_ARTIFACTS) {
    inspectPythonArtifacts(pkg, artifactPaths, errors);
    row.inspected = true;
  }
  if (SMOKE_PYTHON_ARTIFACTS) {
    const wheel = artifactPaths.find((file) => file.endsWith('.whl'));
    if (!wheel) {
      errors.push(`${pkg.name}: artifact smoke found no wheel to install`);
    } else {
      smokePythonInstall(pkg, row, 'artifact', [wheel], errors);
    }
  }
  try {
    run(PYTHON_BIN, ['-m', 'twine', 'check', ...artifactPaths], {
      cwd: ROOT,
    });
  } catch (error) {
    errors.push(
      `${pkg.name}: twine check failed: ${String(error.stderr || error.message).slice(0, 800)}`
    );
  }

}

function runSelfTest() {
  const errors = [];
  if (!supportsNpmSelector(undefined, 'linux')) errors.push('empty selector should allow linux');
  if (!supportsNpmSelector(['linux'], 'linux')) errors.push('positive selector should allow match');
  if (supportsNpmSelector(['linux'], 'win32')) errors.push('positive selector should reject miss');
  if (supportsNpmSelector(['!linux'], 'linux'))
    errors.push('negative selector should reject match');
  if (normalizePackPath('package/bin/x.cjs') !== 'bin/x.cjs')
    errors.push('pack path normalization failed');
  const scripts = parseProjectScripts(
    '[project.scripts]\ntrait-inference = "trait_inference.cli:main"\n\n[tool.x]\n'
  );
  if (!scripts.has('trait-inference')) errors.push('project script parser failed');
  const extras = parseProjectOptionalDependencyGroups(
    '[project.optional-dependencies]\nmodel = [\n  "torch"\n]\n\n[tool.x]\n'
  );
  if (!extras.has('model')) errors.push('optional dependency parser failed');
  if (minimumVersionFromRange('>=3.10') !== '3.10') errors.push('version range parser failed');
  if (compareDottedVersions('20.0.0', '18.0.0') <= 0) errors.push('version comparator failed');
  if (normalizeExtraName('Robotics_GPU') !== 'robotics-gpu')
    errors.push('extra name normalization failed');
  if (pythonVersionForConsumer({ python: '>=3.10' }) !== '3.10')
    errors.push('consumer Python version parser failed');
  if (pythonAbiForVersion('3.10') !== 'cp310') errors.push('Python ABI parser failed');
  if (pipPlatformForConsumer({ os: 'linux', cpu: 'arm64' }) !== 'manylinux2014_aarch64')
    errors.push('pip platform mapper failed');
  if (pypiExtraSpec('holoscript', '1.2.3', ['Scientific', 'robotics']) !==
    'holoscript[robotics,scientific]==1.2.3')
    errors.push('PyPI extra spec formatter failed');
  const provided = providesExtrasFromMetadata('Metadata-Version: 2.4\nProvides-Extra: Scientific\n');
  if (!provided.has('scientific')) errors.push('metadata extra parser failed');
  const laneExtras = laneExtrasFromPackage({
    extrasByConsumer: { jetson: ['Robotics', 'scientific', 'robotics'] },
  });
  if (laneExtras.extras.join(',') !== 'robotics,scientific')
    errors.push('lane extras collector failed');
  const lifecycleRow = {};
  validatePyPiFleetLifecycle(
    {
      name: 'holoscript',
      requiredBy: ['laptop-windows'],
      fleetLifecycle: {
        receiptScope: 'fresh venv',
        staleTelemetryPolicy: 'do not reuse historical install logs',
        checks: [
          {
            id: 'artifact-smoke',
            description: 'Install a built wheel in a fresh venv.',
            evidence: 'smoke-python-artifacts',
            requiredFlags: ['smoke-python-artifacts'],
            consumerLanes: ['laptop-windows'],
          },
        ],
      },
    },
    lifecycleRow,
    new Map([['laptop-windows', { id: 'laptop-windows' }]]),
    errors
  );
  if (lifecycleRow.lifecycleChecks?.[0]?.status !== 'declared') {
    errors.push('PyPI lifecycle declared status failed');
  }
  validatePyPiFleetLifecycle(
    {
      name: 'broken',
      requiredBy: ['laptop-windows'],
      fleetLifecycle: {
        receiptScope: 'fresh venv',
        staleTelemetryPolicy: 'do not reuse historical install logs',
        checks: [
          {
            id: 'bad-flag',
            description: 'Bad flag.',
            evidence: 'bad flag',
            requiredFlags: ['missing-flag'],
            consumerLanes: ['laptop-windows'],
          },
        ],
      },
    },
    {},
    new Map([['laptop-windows', { id: 'laptop-windows' }]]),
    errors
  );
  if (!errors.some((error) => error.includes("unknown required flag 'missing-flag'"))) {
    errors.push('PyPI lifecycle unknown flag should fail');
  } else {
    const idx = errors.findIndex((error) => error.includes("unknown required flag 'missing-flag'"));
    errors.splice(idx, 1);
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('[package-consumption] self-test PASS');
}

async function main() {
  if (SELF_TEST) return runSelfTest();
  const errors = [];
  const warnings = [];
  const rows = [];
  const manifest = readJson(MANIFEST);
  const consumers = checkConsumerShape(manifest, errors);
  for (const pkg of manifest.npmPackages || [])
    checkNpmPackage(pkg, consumers, errors, warnings, rows);
  for (const pkg of manifest.candidateNpmPackages || [])
    checkNpmPackage(pkg, consumers, errors, warnings, rows, 'npm-candidate');
  for (const pkg of manifest.pypiPackages || [])
    await checkPyPackage(pkg, consumers, errors, warnings, rows);

  const output = {
    ok: errors.length === 0,
    packNpm: PACK_NPM,
    buildPython: BUILD_PYTHON,
    inspectPythonArtifacts: INSPECT_PYTHON_ARTIFACTS,
    smokePythonArtifacts: SMOKE_PYTHON_ARTIFACTS,
    smokePyPiInstall: SMOKE_PYPI_INSTALL,
    resolvePyPiExtras: RESOLVE_PYPI_EXTRAS,
    auditPyPi: AUDIT_PYPI,
    consumers: [...consumers.keys()],
    rows,
    warnings,
    errors,
  };
  if (JSON_OUT) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    for (const row of rows) {
      const detail =
        (row.type === 'npm' || row.type === 'npm-candidate') && row.packEntries !== null
          ? ` packEntries=${row.packEntries}`
          : row.type === 'pypi'
            ? `${row.built.length ? ` built=${row.built.join(',')}` : ''}${
                row.inspected ? ' inspected=true' : ''
              }${row.artifactSmoke ? ' artifactSmoke=true' : ''}${
                row.pypiSmoke ? ' pypiSmoke=true' : ''
              }${
                Object.keys(row.laneExtras || {}).length ? ' laneExtras=true' : ''
              }${
                Object.keys(row.extraResolution || {}).length ? ' extraResolution=true' : ''
              }${
                row.lifecycleChecks?.length
                  ? ` lifecycle=${row.lifecycleChecks.filter((check) => check.status === 'verified').length}/${row.lifecycleChecks.length}`
                  : ''
              }${row.pypi ? ` pypi=${row.pypi.status}` : ''}`
            : '';
      console.log(
        `[package-consumption] ${row.type} ${row.name} -> ${row.requiredBy.join(',')}${detail}`
      );
    }
    for (const warning of warnings) console.warn(`[package-consumption] WARN: ${warning}`);
    if (errors.length) {
      console.error(`[package-consumption] FAIL: ${errors.length} issue(s)`);
      for (const error of errors) console.error(`  - ${error}`);
    } else {
      console.log('[package-consumption] PASS: package consumption matrix is valid.');
    }
  }
  process.exit(errors.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`[package-consumption] FAIL: ${String(error.stack || error)}`);
  process.exit(1);
});
