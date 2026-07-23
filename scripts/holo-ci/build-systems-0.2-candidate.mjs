#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERSION = '0.2.0';
const MACHINE_CONTRACT = 'hs-machine-v33';
const META_TEMPLATE = join(ROOT, 'distributions', 'systems-next');
const PREDECESSOR = join(ROOT, 'distributions', 'systems');
const CANDIDATE_MANIFEST = join(ROOT, 'scripts', 'holo-ci', 'systems-0.2-candidate-manifest.json');
const ARTIFACT_DIR = join(ROOT, 'artifacts', 'releases', '0.2.0-candidate');
const SOURCE_PATHS = [
  'Cargo.toml',
  'Cargo.lock',
  'packages/compiler-native/Cargo.toml',
  'packages/compiler-native/src',
  'packages/compiler-wasm/Cargo.toml',
  'packages/compiler-wasm/src',
  'examples/native',
  'distributions/systems',
  'distributions/systems-next',
  'scripts/holo-ci/build-systems-0.2-candidate.mjs',
  'scripts/holo-ci/check-systems-0.2-candidate.mjs',
  'scripts/holo-ci/systems-0.2-candidate-manifest.json',
];
const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const sourceCommitIndex = args.indexOf('--source-commit');

function fail(message) {
  if (jsonOutput) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  else console.error(`[systems-0.2-build] ${message}`);
  process.exit(1);
}

function run(
  command,
  commandArgs,
  { cwd = ROOT, capture = false, timeout = 1_200_000, env = process.env } = {}
) {
  const windowsCommand = process.platform === 'win32' && ['npm', 'npx'].includes(command);
  const executable = windowsCommand ? `${command}.cmd` : command;
  const result = spawnSync(executable, commandArgs, {
    cwd,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: windowsCommand,
    timeout,
    windowsHide: true,
    env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? String(result.stderr || result.stdout || '').trim() : '';
    throw new Error(
      `${command} ${commandArgs.join(' ')} exited ${result.status}${detail ? `: ${detail}` : ''}`
    );
  }
  return capture ? String(result.stdout || '').trim() : '';
}

function git(commandArgs) {
  return run('git', commandArgs, { capture: true });
}

function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function listFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function posixRelative(root, path) {
  return relative(root, path).split(sep).join('/');
}

function writeChecksums(packageRoot, paths) {
  const lines = paths
    .filter((path) => existsSync(path) && statSync(path).isFile())
    .map((path) => ({ path, relative: posixRelative(packageRoot, path) }))
    .sort((left, right) => left.relative.localeCompare(right.relative, 'en'))
    .map((entry) => `${sha256File(entry.path)}  ${entry.relative}`)
    .join('\n');
  writeFileSync(join(packageRoot, 'SHA256SUMS'), `${lines}\n`);
}

function resolveRustTool(name) {
  const candidate = join(
    homedir(),
    '.cargo',
    'bin',
    `${name}${process.platform === 'win32' ? '.exe' : ''}`
  );
  return existsSync(candidate) ? candidate : name;
}

function ensureCleanSource() {
  for (const mode of [[], ['--cached']]) {
    const result = spawnSync('git', ['diff', '--quiet', ...mode, '--', ...SOURCE_PATHS], {
      cwd: ROOT,
      stdio: 'ignore',
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw new Error(
        `release source paths have ${mode.length ? 'staged' : 'working-tree'} changes; commit source before assembly`
      );
    }
  }
}

function ensureSourceMatchesCommit(sourceCommit) {
  ensureCleanSource();
  const result = spawnSync('git', ['diff', '--quiet', sourceCommit, '--', ...SOURCE_PATHS], {
    cwd: ROOT,
    stdio: 'ignore',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `release source paths changed after build start and no longer match ${sourceCommit}`
    );
  }
}

function createPlatformPackage(stagingRoot, platform, binarySource, binarySha256, sourceCommit) {
  const id = `${platform.os}-${platform.cpu}`;
  const packageRoot = join(stagingRoot, `systems-${id}`);
  const binaryName = platform.os === 'win32' ? 'holoscriptc.exe' : 'holoscriptc';
  const packageName = `@holoscript/systems-${id}`;
  const binaryPath = join(packageRoot, 'bin', binaryName);
  mkdirSync(dirname(binaryPath), { recursive: true });
  copyFileSync(binarySource, binaryPath);
  if (platform.os !== 'win32') chmodSync(binaryPath, 0o755);

  writeJson(join(packageRoot, 'package.json'), {
    name: packageName,
    version: VERSION,
    description: `HoloScript native systems compiler for ${id}`,
    type: 'commonjs',
    sideEffects: false,
    exports: {
      './holoscriptc': `./bin/${binaryName}`,
      './release-manifest': './release-manifest.json',
    },
    bin: {
      [`holoscriptc-${id}`]: `./bin/${binaryName}`,
    },
    files: ['bin', 'release-manifest.json', 'SHA256SUMS', 'README.md', 'LICENSE'],
    os: [platform.os],
    cpu: [platform.cpu],
    engines: { node: '>=20.0.0' },
    publishConfig: { access: 'public', tag: 'next' },
    keywords: ['holoscript', 'systems-programming', 'compiler', 'native', id],
    author: 'HoloScript Team',
    license: 'MIT',
    repository: {
      type: 'git',
      url: 'https://github.com/brianonbased-dev/HoloScript.git',
      directory: 'distributions/systems-next',
    },
  });
  writeJson(join(packageRoot, 'release-manifest.json'), {
    schema: 'holoscript.systems-platform-package/v1',
    distributionId: 'holoscript-systems-toolchain',
    package: packageName,
    version: VERSION,
    machineContract: MACHINE_CONTRACT,
    hostPlatform: id,
    rustTarget: platform.rustTarget,
    sourceCommit,
    binary: `bin/${binaryName}`,
    binarySha256,
  });
  writeFileSync(
    join(packageRoot, 'README.md'),
    `# ${packageName}\n\nNative ${id} compiler package for \`@holoscript/systems@${VERSION}\`. Install the meta package instead of depending on this package directly.\n`
  );
  copyFileSync(join(PREDECESSOR, 'LICENSE'), join(packageRoot, 'LICENSE'));
  writeChecksums(packageRoot, [
    join(packageRoot, 'package.json'),
    join(packageRoot, 'release-manifest.json'),
    join(packageRoot, 'README.md'),
    join(packageRoot, 'LICENSE'),
    binaryPath,
  ]);
  return { id, packageName, packageRoot, binaryName, binaryPath, binarySha256 };
}

function createMetaPackage(stagingRoot, platforms, sourceCommit) {
  const packageRoot = join(stagingRoot, 'systems');
  cpSync(META_TEMPLATE, packageRoot, { recursive: true });
  cpSync(join(PREDECESSOR, 'wasm'), join(packageRoot, 'wasm'), { recursive: true });
  cpSync(join(PREDECESSOR, 'conformance'), join(packageRoot, 'conformance'), { recursive: true });
  cpSync(
    join(ROOT, 'examples', 'native', 'multi-file-modules'),
    join(packageRoot, 'conformance', 'multi-file-modules'),
    { recursive: true }
  );
  copyFileSync(join(PREDECESSOR, 'LICENSE'), join(packageRoot, 'LICENSE'));

  const wasmBinary = join(packageRoot, 'wasm', 'holoscript_wasm_bg.wasm');
  const platformPackages = Object.fromEntries(
    platforms.map((platform) => [
      platform.id,
      {
        package: `${platform.packageName}@${VERSION}`,
        binarySha256: platform.binarySha256,
      },
    ])
  );
  writeJson(join(packageRoot, 'release-manifest.json'), {
    schema: 'holoscript.systems-artifact-envelope/v2',
    distributionId: 'holoscript-systems-toolchain',
    version: VERSION,
    channel: 'next',
    machineContract: MACHINE_CONTRACT,
    sourceCommit,
    components: {
      'npm-core': '@holoscript/core@8.0.17',
      'npm-cli': '@holoscript/cli@8.0.11',
      'native-compiler': 'holoscript-native@3.0.0',
      'wasm-validation-runtime': 'holoscript-wasm@3.0.0',
    },
    platformPackages,
    embeddedArtifactDigests: {
      'wasm/holoscript_wasm_bg.wasm': sha256File(wasmBinary),
    },
    portableArtifactProvenance: {
      sourceRelease: '@holoscript/systems@0.1.0',
      policy: 'immutable-artifact-reuse',
    },
  });

  const checksumPaths = [
    join(packageRoot, 'package.json'),
    join(packageRoot, 'index.mjs'),
    join(packageRoot, 'index.d.ts'),
    join(packageRoot, 'README.md'),
    join(packageRoot, 'LICENSE'),
    join(packageRoot, 'release-manifest.json'),
    ...listFiles(join(packageRoot, 'bin')),
    ...listFiles(join(packageRoot, 'conformance')),
    ...listFiles(join(packageRoot, 'wasm')),
  ];
  writeChecksums(packageRoot, checksumPaths);
  return packageRoot;
}

function packTwice(packageRoot, packRoot) {
  const firstDir = join(packRoot, `${basename(packageRoot)}-first`);
  const secondDir = join(packRoot, `${basename(packageRoot)}-second`);
  mkdirSync(firstDir, { recursive: true });
  mkdirSync(secondDir, { recursive: true });
  const pack = (destination) => {
    const output = JSON.parse(
      run('npm', ['pack', '--json', '--pack-destination', destination], {
        cwd: packageRoot,
        capture: true,
      })
    );
    if (!Array.isArray(output) || output.length !== 1 || !output[0].filename) {
      throw new Error(`npm pack returned an unexpected receipt for ${packageRoot}`);
    }
    return join(destination, output[0].filename);
  };
  const first = pack(firstDir);
  const second = pack(secondDir);
  const firstDigest = sha256File(first);
  const secondDigest = sha256File(second);
  if (firstDigest !== secondDigest) {
    throw new Error(`npm pack is not deterministic for ${packageRoot}`);
  }
  const artifactPath = join(ARTIFACT_DIR, basename(first));
  copyFileSync(first, artifactPath);
  return {
    path: artifactPath,
    sha256: firstDigest,
    bytes: statSync(first).size,
    deterministicRepackSha256: secondDigest,
  };
}

function verifyWindowsColdInstall(metaArtifact, windowsArtifact, tempRoot) {
  const consumer = join(tempRoot, 'windows-consumer');
  mkdirSync(consumer, { recursive: true });
  run('npm', ['init', '-y'], { cwd: consumer, capture: true });
  run('npm', ['install', '--ignore-scripts', '--omit=optional', metaArtifact, windowsArtifact], {
    cwd: consumer,
    capture: true,
  });
  const output = join(consumer, 'module-exit-five.exe');
  run(
    process.execPath,
    [
      join(consumer, 'node_modules', '@holoscript', 'systems', 'bin', 'holoscriptc.cjs'),
      join(ROOT, 'examples', 'native', 'multi-file-modules', 'entry.hs'),
      '-o',
      output,
    ],
    { cwd: consumer }
  );
  const result = spawnSync(output, [], { cwd: consumer, windowsHide: true });
  if (result.status !== 5) {
    throw new Error(`Windows cold consumer executable exited ${result.status}; expected 5`);
  }
  return { ok: true, exitCode: result.status };
}

function verifyLinuxColdInstall(metaArtifact, linuxArtifact, tempRoot) {
  const consumer = join(tempRoot, 'linux-consumer');
  mkdirSync(consumer, { recursive: true });
  const artifactMount = resolve(ARTIFACT_DIR);
  const consumerMount = resolve(consumer);
  const sourceMount = resolve(ROOT);
  const shell = [
    'set -eu',
    'cd /consumer',
    'npm init -y >/dev/null',
    `npm install --ignore-scripts --omit=optional /artifacts/${basename(metaArtifact)} /artifacts/${basename(linuxArtifact)} >/dev/null`,
    'node node_modules/@holoscript/systems/bin/holoscriptc.cjs /source/examples/native/multi-file-modules/entry.hs -o /consumer/module-exit-five',
    'set +e',
    '/consumer/module-exit-five',
    'code=$?',
    'set -e',
    'test "$code" -eq 5',
  ].join('; ');
  run(
    'docker',
    [
      'run',
      '--rm',
      '--platform',
      'linux/amd64',
      '-v',
      `${artifactMount}:/artifacts:ro`,
      '-v',
      `${consumerMount}:/consumer`,
      '-v',
      `${sourceMount}:/source:ro`,
      'node:22-bookworm',
      'bash',
      '-lc',
      shell,
    ],
    { timeout: 600_000 }
  );
  return { ok: true, exitCode: 5, image: 'node:22-bookworm' };
}

let sourceCommit;
try {
  sourceCommit = sourceCommitIndex >= 0 ? args[sourceCommitIndex + 1] : git(['rev-parse', 'HEAD']);
  if (!/^[0-9a-f]{40}$/u.test(String(sourceCommit || ''))) {
    throw new Error('--source-commit must resolve to a full 40-character Git commit');
  }
  if (sourceCommit !== git(['rev-parse', 'HEAD'])) {
    throw new Error(`source commit ${sourceCommit} must equal current HEAD`);
  }
  ensureCleanSource();
} catch (error) {
  fail(error.message);
}

const temp = mkdtempSync(join(tmpdir(), 'holoscript-systems-0.2-'));
const windowsTarget = join(temp, 'windows-target');
const linuxTarget = join(temp, 'linux-target');
const stagingRoot = join(temp, 'packages');
const packRoot = join(temp, 'packs');
mkdirSync(windowsTarget, { recursive: true });
mkdirSync(linuxTarget, { recursive: true });
mkdirSync(stagingRoot, { recursive: true });
mkdirSync(packRoot, { recursive: true });

try {
  const sourceDateEpoch = git(['show', '-s', '--format=%ct', sourceCommit]);
  const cargo = resolveRustTool('cargo');
  const releaseEnv = {
    ...process.env,
    CARGO_INCREMENTAL: '0',
    SOURCE_DATE_EPOCH: sourceDateEpoch,
    RUSTFLAGS: [process.env.RUSTFLAGS, `--remap-path-prefix=${ROOT}=/holoscript/source`]
      .filter(Boolean)
      .join(' '),
  };

  run(
    cargo,
    [
      'build',
      '--locked',
      '--release',
      '-p',
      'holoscript-native',
      '--bin',
      'holoscriptc',
      '--target-dir',
      windowsTarget,
    ],
    { env: releaseEnv }
  );
  const windowsBinary = join(windowsTarget, 'release', 'holoscriptc.exe');
  if (!existsSync(windowsBinary)) throw new Error('Windows native compiler output is missing');

  run(
    'docker',
    [
      'run',
      '--rm',
      '--platform',
      'linux/amd64',
      '-e',
      'CARGO_INCREMENTAL=0',
      '-e',
      `SOURCE_DATE_EPOCH=${sourceDateEpoch}`,
      '-e',
      'RUSTFLAGS=--remap-path-prefix=/src=/holoscript/source',
      '-v',
      `${resolve(ROOT)}:/src:ro`,
      '-v',
      `${resolve(linuxTarget)}:/target`,
      '-w',
      '/src',
      'rust:1.91-bookworm',
      'cargo',
      'build',
      '--locked',
      '--release',
      '-p',
      'holoscript-native',
      '--bin',
      'holoscriptc',
      '--target-dir',
      '/target',
    ],
    { timeout: 1_200_000 }
  );
  const linuxBinary = join(linuxTarget, 'release', 'holoscriptc');
  if (!existsSync(linuxBinary)) throw new Error('Linux native compiler output is missing');

  const platformSpecs = [
    {
      os: 'linux',
      cpu: 'x64',
      rustTarget: 'x86_64-unknown-linux-gnu',
      binary: linuxBinary,
    },
    {
      os: 'win32',
      cpu: 'x64',
      rustTarget: 'x86_64-pc-windows-msvc',
      binary: windowsBinary,
    },
  ];
  const platforms = platformSpecs.map((platform) =>
    createPlatformPackage(
      stagingRoot,
      platform,
      platform.binary,
      sha256File(platform.binary),
      sourceCommit
    )
  );
  const metaRoot = createMetaPackage(stagingRoot, platforms, sourceCommit);

  rmSync(ARTIFACT_DIR, { recursive: true, force: true });
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const metaArtifact = packTwice(metaRoot, packRoot);
  const platformArtifacts = Object.fromEntries(
    platforms.map((platform) => [platform.id, packTwice(platform.packageRoot, packRoot)])
  );

  const windowsColdInstall = verifyWindowsColdInstall(
    metaArtifact.path,
    platformArtifacts['win32-x64'].path,
    temp
  );
  const linuxColdInstall = verifyLinuxColdInstall(
    metaArtifact.path,
    platformArtifacts['linux-x64'].path,
    temp
  );
  ensureSourceMatchesCommit(sourceCommit);

  const receipt = {
    schema: 'holoscript.systems-0.2-build-receipt/v1',
    generatedAt: new Date().toISOString(),
    ok: true,
    distributionId: 'holoscript-systems-toolchain',
    version: VERSION,
    channel: 'next',
    machineContract: MACHINE_CONTRACT,
    sourceCommit,
    candidateManifest: posixRelative(ROOT, CANDIDATE_MANIFEST),
    builders: {
      'win32-x64': {
        kind: 'owned-host',
        binarySha256: platforms.find((platform) => platform.id === 'win32-x64').binarySha256,
      },
      'linux-x64': {
        kind: 'docker',
        image: 'rust:1.91-bookworm',
        binarySha256: platforms.find((platform) => platform.id === 'linux-x64').binarySha256,
      },
    },
    artifacts: {
      meta: {
        ...metaArtifact,
        path: posixRelative(ROOT, metaArtifact.path),
      },
      platforms: Object.fromEntries(
        Object.entries(platformArtifacts).map(([id, artifact]) => [
          id,
          { ...artifact, path: posixRelative(ROOT, artifact.path) },
        ])
      ),
    },
    coldConsumers: {
      'win32-x64': windowsColdInstall,
      'linux-x64': linuxColdInstall,
    },
    immutablePredecessor: '@holoscript/systems@0.1.0',
    publicStateMutated: false,
  };
  const receiptPath = join(ARTIFACT_DIR, 'systems-0.2-build-receipt.json');
  writeJson(receiptPath, receipt);
  const output = {
    ...receipt,
    receipt: posixRelative(ROOT, receiptPath),
    receiptSha256: sha256File(receiptPath),
  };
  if (jsonOutput) console.log(JSON.stringify(output, null, 2));
  else {
    console.log(`[systems-0.2-build] PASS ${sourceCommit}`);
    console.log(`[systems-0.2-build] receipt ${output.receiptSha256}  ${output.receipt}`);
  }
} catch (error) {
  fail(error.message);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
