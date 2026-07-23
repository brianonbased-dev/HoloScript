#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
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
import { arch, cpus, homedir, platform as osPlatform, release, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDeterministicZip } from './lib/deterministic-zip.mjs';
import {
  sha256,
  validateSystemsPlatformBuilderContract,
  validateSystemsPlatformBuilderReceipt,
} from './lib/systems-platform-builder-contract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONTRACT_PATH = join(ROOT, 'scripts', 'holo-ci', 'systems-0.3-macos-builder-contract.json');
const BASELINE_RELEASE_PATH = join(ROOT, 'scripts', 'holo-ci', 'systems-0.2-release-manifest.json');
const META_TEMPLATE = join(ROOT, 'distributions', 'systems-next');
const PREDECESSOR = join(ROOT, 'distributions', 'systems');
const DEFAULT_OUTPUT = join(ROOT, 'artifacts', 'releases', '0.3.0-macos-builder');

function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function run(
  command,
  args,
  { cwd = ROOT, capture = false, timeout = 1_200_000, env = process.env } = {}
) {
  const windowsCommand = process.platform === 'win32' && ['npm', 'npx'].includes(command);
  const result = spawnSync(windowsCommand ? `${command}.cmd` : command, args, {
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
      `${command} ${args.join(' ')} exited ${result.status}${detail ? `: ${detail}` : ''}`
    );
  }
  return capture ? String(result.stdout || '').trim() : '';
}

function git(args) {
  return run('git', args, { capture: true });
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function posixRelative(root, path) {
  return relative(root, path).split(sep).join('/');
}

function listFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
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

function ensureSourceAtCommit(sourceCommit, sourcePaths) {
  if (git(['rev-parse', 'HEAD']) !== sourceCommit) {
    throw new Error(`source commit ${sourceCommit} must equal current HEAD`);
  }
  for (const mode of [[], ['--cached']]) {
    const result = spawnSync('git', ['diff', '--quiet', ...mode, '--', ...sourcePaths], {
      cwd: ROOT,
      stdio: 'ignore',
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw new Error(
        `builder source paths have ${mode.length ? 'staged' : 'working-tree'} changes`
      );
    }
  }
  const result = spawnSync('git', ['diff', '--quiet', sourceCommit, '--', ...sourcePaths], {
    cwd: ROOT,
    stdio: 'ignore',
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`builder source paths do not match ${sourceCommit}`);
}

function assertSafeOutputDirectory(outputDirectory) {
  const artifactRoot = resolve(ROOT, 'artifacts', 'releases');
  const resolvedOutput = resolve(outputDirectory);
  if (
    resolvedOutput === artifactRoot ||
    !resolvedOutput.startsWith(`${artifactRoot}${sep}`) ||
    basename(resolvedOutput).length < 8
  ) {
    throw new Error(`refusing unsafe builder output directory: ${resolvedOutput}`);
  }
  return resolvedOutput;
}

function createPlatformPackage(stagingRoot, contract, binary, sourceCommit) {
  const spec = contract.platform;
  const packageRoot = join(stagingRoot, `systems-${spec.id}`);
  const binaryPath = join(packageRoot, 'bin', 'holoscriptc');
  mkdirSync(dirname(binaryPath), { recursive: true });
  copyFileSync(binary, binaryPath);
  chmodSync(binaryPath, 0o755);
  writeJson(join(packageRoot, 'package.json'), {
    name: spec.package,
    version: contract.releaseVersion,
    description: `HoloScript native systems compiler for ${spec.id}`,
    type: 'commonjs',
    sideEffects: false,
    exports: {
      './holoscriptc': './bin/holoscriptc',
      './release-manifest': './release-manifest.json',
    },
    bin: { [`holoscriptc-${spec.id}`]: './bin/holoscriptc' },
    files: ['bin', 'release-manifest.json', 'SHA256SUMS', 'README.md', 'LICENSE'],
    os: [spec.os],
    cpu: [spec.cpu],
    engines: { node: '>=20.0.0' },
    publishConfig: { access: 'public', tag: contract.channel },
    keywords: ['holoscript', 'systems-programming', 'compiler', 'native', spec.id],
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
    distributionId: contract.distributionId,
    package: spec.package,
    version: contract.releaseVersion,
    machineContract: contract.machineContract,
    hostPlatform: spec.id,
    rustTarget: spec.rustTarget,
    sourceCommit,
    binary: 'bin/holoscriptc',
    binarySha256: sha256File(binaryPath),
    builderContract: 'scripts/holo-ci/systems-0.3-macos-builder-contract.json',
  });
  writeFileSync(
    join(packageRoot, 'README.md'),
    `# ${spec.package}\n\nNative ${spec.id} compiler package for \`@holoscript/systems@${contract.releaseVersion}\`. Install the meta package instead of depending on this package directly.\n`
  );
  copyFileSync(join(PREDECESSOR, 'LICENSE'), join(packageRoot, 'LICENSE'));
  writeChecksums(packageRoot, [
    join(packageRoot, 'package.json'),
    join(packageRoot, 'release-manifest.json'),
    join(packageRoot, 'README.md'),
    join(packageRoot, 'LICENSE'),
    binaryPath,
  ]);
  return { packageRoot, binaryPath, binarySha256: sha256File(binaryPath) };
}

function createMetaPackage(stagingRoot, contract, sourceCommit, binarySha256) {
  const packageRoot = join(stagingRoot, 'systems');
  cpSync(META_TEMPLATE, packageRoot, { recursive: true });
  cpSync(join(PREDECESSOR, 'wasm'), join(packageRoot, 'wasm'), { recursive: true });
  cpSync(join(PREDECESSOR, 'conformance'), join(packageRoot, 'conformance'), {
    recursive: true,
  });
  cpSync(
    join(ROOT, 'examples', 'native', 'multi-file-modules'),
    join(packageRoot, 'conformance', 'multi-file-modules'),
    { recursive: true }
  );
  copyFileSync(join(PREDECESSOR, 'LICENSE'), join(packageRoot, 'LICENSE'));

  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  manifest.version = contract.releaseVersion;
  manifest.optionalDependencies = {
    [contract.platform.package]: contract.releaseVersion,
    ...contract.baselinePlatformPackages,
  };
  writeJson(join(packageRoot, 'package.json'), manifest);

  const baselineRelease = JSON.parse(readFileSync(BASELINE_RELEASE_PATH, 'utf8'));
  const baseline = Object.fromEntries(
    baselineRelease.packages
      .filter((entry) => entry.id !== 'meta')
      .map((entry) => [
        entry.id,
        {
          package: `${entry.name}@${entry.version}`,
          sourceRelease: baselineRelease.github.tag,
          tarballSha256: entry.sha256,
        },
      ])
  );
  writeJson(join(packageRoot, 'release-manifest.json'), {
    schema: 'holoscript.systems-artifact-envelope/v3',
    distributionId: contract.distributionId,
    version: contract.releaseVersion,
    channel: contract.channel,
    machineContract: contract.machineContract,
    sourceCommit,
    platformPackages: {
      [contract.platform.id]: {
        package: `${contract.platform.package}@${contract.releaseVersion}`,
        sourceCommit,
        binarySha256,
      },
      ...baseline,
    },
    portableArtifactProvenance: {
      sourceRelease: '@holoscript/systems@0.1.0',
      policy: 'immutable-artifact-reuse',
    },
  });
  writeChecksums(packageRoot, [
    join(packageRoot, 'package.json'),
    join(packageRoot, 'index.mjs'),
    join(packageRoot, 'index.d.ts'),
    join(packageRoot, 'README.md'),
    join(packageRoot, 'LICENSE'),
    join(packageRoot, 'release-manifest.json'),
    ...listFiles(join(packageRoot, 'bin')),
    ...listFiles(join(packageRoot, 'conformance')),
    ...listFiles(join(packageRoot, 'wasm')),
  ]);
  return packageRoot;
}

function packTwice(packageRoot, packRoot, outputDirectory) {
  const firstDir = join(packRoot, `${basename(packageRoot)}-first`);
  const secondDir = join(packRoot, `${basename(packageRoot)}-second`);
  mkdirSync(firstDir, { recursive: true });
  mkdirSync(secondDir, { recursive: true });
  const pack = (destination) => {
    const result = JSON.parse(
      run('npm', ['pack', '--json', '--pack-destination', destination], {
        cwd: packageRoot,
        capture: true,
      })
    );
    if (!Array.isArray(result) || result.length !== 1 || !result[0].filename) {
      throw new Error(`npm pack returned an unexpected receipt for ${packageRoot}`);
    }
    return join(destination, result[0].filename);
  };
  const first = pack(firstDir);
  const second = pack(secondDir);
  const firstSha256 = sha256File(first);
  const secondSha256 = sha256File(second);
  if (firstSha256 !== secondSha256) {
    throw new Error(`npm pack was not deterministic for ${packageRoot}`);
  }
  const output = join(outputDirectory, basename(first));
  copyFileSync(first, output);
  return {
    file: basename(output),
    bytes: statSync(output).size,
    sha256: firstSha256,
    deterministicRepackSha256: secondSha256,
  };
}

function runCompiledExecutable(executable, cwd) {
  const result = spawnSync(executable, [], { cwd, windowsHide: true });
  if (result.error) throw result.error;
  return result.status;
}

function proveRepoLessColdConsumer(contract, metaTarball, platformTarball, tempRoot) {
  const consumer = join(tempRoot, 'repo-less-consumer');
  mkdirSync(consumer, { recursive: true });
  run('npm', ['init', '-y'], { cwd: consumer, capture: true });
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--omit=optional',
      '--package-lock=false',
      '--no-audit',
      '--no-fund',
      metaTarball,
      platformTarball,
    ],
    { cwd: consumer, capture: true }
  );
  const packagedEntry = join(
    consumer,
    'node_modules',
    '@holoscript',
    'systems',
    'conformance',
    'multi-file-modules',
    'entry.hs'
  );
  const output = join(consumer, 'module-exit-five');
  run(
    process.execPath,
    [
      join(consumer, 'node_modules', '@holoscript', 'systems', 'bin', 'holoscriptc.cjs'),
      packagedEntry,
      '-o',
      output,
    ],
    { cwd: consumer }
  );
  const exitCode = runCompiledExecutable(output, consumer);
  if (exitCode !== 5) {
    throw new Error(`repo-less npm cold consumer exited ${exitCode}; expected 5`);
  }
  return {
    ok: true,
    repoLess: true,
    inputOrigin: 'packaged-conformance',
    installedMeta: `@holoscript/systems@${contract.releaseVersion}`,
    installedPlatform: `${contract.platform.package}@${contract.releaseVersion}`,
    exitCode,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const contractBytes = readFileSync(CONTRACT_PATH);
  const contract = JSON.parse(contractBytes.toString('utf8'));
  const contractValidation = validateSystemsPlatformBuilderContract(contract);
  if (!contractValidation.ok) throw new Error(contractValidation.errors.join('; '));

  const actualHost = `${osPlatform()}-${arch()}`;
  if (actualHost !== contract.platform.id) {
    throw new Error(
      `compatible builder required: expected ${contract.platform.id}, running on ${actualHost}`
    );
  }
  const sourceCommit = valueAfter(args, '--source-commit') || git(['rev-parse', 'HEAD']);
  if (!/^[0-9a-f]{40}$/u.test(sourceCommit)) {
    throw new Error('--source-commit must resolve to a full 40-character Git commit');
  }
  ensureSourceAtCommit(sourceCommit, contract.sourcePaths);

  const outputDirectory = assertSafeOutputDirectory(valueAfter(args, '--out') || DEFAULT_OUTPUT);
  rmSync(outputDirectory, { recursive: true, force: true });
  mkdirSync(outputDirectory, { recursive: true });
  const temp = mkdtempSync(join(tmpdir(), 'holoscript-systems-0.3-macos-'));
  try {
    const cargo = resolveRustTool('cargo');
    const rustc = resolveRustTool('rustc');
    const targetDirectory = join(temp, 'target');
    const sourceDateEpoch = git(['show', '-s', '--format=%ct', sourceCommit]);
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
        'test',
        '--locked',
        '-p',
        'holoscript-native',
        '--test',
        'multi_file_modules',
        '--target',
        contract.platform.rustTarget,
        '--target-dir',
        targetDirectory,
      ],
      { env: releaseEnv }
    );
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
        '--target',
        contract.platform.rustTarget,
        '--target-dir',
        targetDirectory,
      ],
      { env: releaseEnv }
    );
    const binary = join(targetDirectory, contract.platform.rustTarget, 'release', 'holoscriptc');
    if (!existsSync(binary)) throw new Error('darwin-arm64 native compiler output is missing');

    const nativeOutput = join(temp, 'native-module-exit-five');
    run(
      binary,
      [join(ROOT, 'examples', 'native', 'multi-file-modules', 'entry.hs'), '-o', nativeOutput],
      { cwd: temp }
    );
    const nativeExitCode = runCompiledExecutable(nativeOutput, temp);
    if (nativeExitCode !== 5) {
      throw new Error(`native multi-file executable exited ${nativeExitCode}; expected 5`);
    }

    const stagingRoot = join(temp, 'packages');
    const packRoot = join(temp, 'packs');
    mkdirSync(stagingRoot, { recursive: true });
    mkdirSync(packRoot, { recursive: true });
    const platformPackage = createPlatformPackage(stagingRoot, contract, binary, sourceCommit);
    const metaPackage = createMetaPackage(
      stagingRoot,
      contract,
      sourceCommit,
      platformPackage.binarySha256
    );
    const platformArtifact = packTwice(platformPackage.packageRoot, packRoot, outputDirectory);
    const metaArtifact = packTwice(metaPackage, packRoot, outputDirectory);
    if (
      platformArtifact.file !== contract.outputs.platformTarball ||
      metaArtifact.file !== contract.outputs.metaTarball
    ) {
      throw new Error('npm pack filenames do not match the builder contract');
    }
    const coldConsumer = proveRepoLessColdConsumer(
      contract,
      join(outputDirectory, metaArtifact.file),
      join(outputDirectory, platformArtifact.file),
      temp
    );

    ensureSourceAtCommit(sourceCommit, contract.sourcePaths);
    const receipt = {
      schema: 'holoscript.systems-compatible-builder-receipt/v1',
      generatedAt: new Date().toISOString(),
      ok: true,
      distributionId: contract.distributionId,
      releaseVersion: contract.releaseVersion,
      channel: contract.channel,
      machineContract: contract.machineContract,
      platform: contract.platform.id,
      sourceCommit,
      contractSha256: sha256(Buffer.from(`${JSON.stringify(contract, null, 2)}\n`)),
      source: {
        head: git(['rev-parse', 'HEAD']),
        cleanAtCommit: true,
        sourceDateEpoch,
      },
      builder: {
        kind: 'compatible-host',
        actualHost,
        os: osPlatform(),
        arch: arch(),
        rustTarget: contract.platform.rustTarget,
        osRelease: release(),
        cpuModel: cpus()[0]?.model || 'unknown',
        hardwareFingerprint: sha256(
          JSON.stringify({
            actualHost,
            osRelease: release(),
            cpuModel: cpus()[0]?.model || 'unknown',
          })
        ),
        node: process.version,
        npm: run('npm', ['--version'], { capture: true }),
        cargo: run(cargo, ['--version'], { capture: true }),
        rustc: run(rustc, ['--version', '--verbose'], { capture: true }),
      },
      baselinePlatformPackages: contract.baselinePlatformPackages,
      binary: {
        file: 'holoscriptc',
        bytes: statSync(platformPackage.binaryPath).size,
        sha256: platformPackage.binarySha256,
      },
      artifacts: {
        meta: metaArtifact,
        platform: platformArtifact,
      },
      proofs: {
        nativeCompile: {
          ok: true,
          entry: 'examples/native/multi-file-modules/entry.hs',
          exitCode: nativeExitCode,
        },
        npmColdConsumer: coldConsumer,
      },
      postPublicationGate: contract.postPublicationGate,
      publicStateMutated: false,
    };
    const files = new Map([
      [metaArtifact.file, readFileSync(join(outputDirectory, metaArtifact.file))],
      [platformArtifact.file, readFileSync(join(outputDirectory, platformArtifact.file))],
    ]);
    const receiptValidation = validateSystemsPlatformBuilderReceipt(receipt, {
      contract,
      files,
      expectedSourceCommit: sourceCommit,
    });
    if (!receiptValidation.ok) throw new Error(receiptValidation.errors.join('; '));

    const receiptPath = join(outputDirectory, contract.outputs.receipt);
    writeJson(receiptPath, receipt);
    const bundlePath = join(outputDirectory, contract.outputs.bundle);
    const bundle = createDeterministicZip([
      { name: metaArtifact.file, data: files.get(metaArtifact.file) },
      { name: platformArtifact.file, data: files.get(platformArtifact.file) },
      { name: contract.outputs.receipt, data: readFileSync(receiptPath) },
    ]);
    writeFileSync(bundlePath, bundle);
    const result = {
      ...receipt,
      outputDirectory: posixRelative(ROOT, outputDirectory),
      receipt: posixRelative(ROOT, receiptPath),
      receiptSha256: sha256File(receiptPath),
      bundle: posixRelative(ROOT, bundlePath),
      bundleSha256: sha256(bundle),
    };
    if (jsonOutput) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`[systems-0.3-macos-builder] PASS ${sourceCommit}`);
      console.log(`[systems-0.3-macos-builder] bundle ${result.bundleSha256}  ${result.bundle}`);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[systems-0.3-macos-builder] ${error.message}`);
  process.exitCode = 1;
});
