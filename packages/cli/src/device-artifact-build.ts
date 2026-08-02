import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import AdmZip from 'adm-zip';

import {
  materializeDevicePackage,
  type AndroidUpdateContract,
  type DevicePackageMaterialization,
} from './device-package-materialization';
import type { DeviceReleasePlanInput } from './device-release-plan';

export const DEVICE_ARTIFACT_BUILD_SCHEMA = 'holoscript-device-artifact-build/v0.1.0';
export const ANDROID_DEVICE_ARTIFACT_BUILD_SCHEMA =
  'holoscript-android-device-artifact-build/v0.1.0';

const NODE_BASE_IMAGE = 'node:20-alpine';
const SOURCE_DATE_EPOCH = '0';
const FIXED_ZIP_TIME = new Date('1980-01-01T00:00:00.000Z');

export interface DeviceArtifactCommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

export type DeviceArtifactCommandRunner = (
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env?: Readonly<Record<string, string>> }
) => DeviceArtifactCommandResult;

export interface DeviceArtifactReceipt {
  readonly schema: typeof DEVICE_ARTIFACT_BUILD_SCHEMA;
  readonly phase: 'artifact-built';
  readonly profileId: 'jetson-orin' | 'linux-arm64' | 'linux-x64';
  readonly materializationSha256: string;
  readonly inputTreeSha256: string;
  readonly baseImage: {
    readonly reference: typeof NODE_BASE_IMAGE;
    readonly digest: string;
  };
  readonly reproducibility: {
    readonly sourceDateEpoch: typeof SOURCE_DATE_EPOCH;
    readonly ociSha256: string;
    readonly repeatedOciSha256: string;
    readonly systemdBundleSha256: string;
    readonly repeatedSystemdBundleSha256: string;
    readonly byteIdentical: true;
  };
  readonly artifacts: readonly {
    readonly format: 'oci' | 'systemd-bundle';
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
  readonly gates: readonly {
    readonly id: string;
    readonly status: 'passed' | 'required';
  }[];
}

export interface DeviceArtifactBuildResult {
  readonly outputDirectory: string;
  readonly receipt: DeviceArtifactReceipt | AndroidDeviceArtifactReceipt;
}

export interface AndroidDeviceArtifactReceipt {
  readonly schema: typeof ANDROID_DEVICE_ARTIFACT_BUILD_SCHEMA;
  readonly phase: 'artifact-built';
  readonly profileId: 'android-arm64';
  readonly materializationSha256: string;
  readonly inputTreeSha256: string;
  readonly toolchain: {
    readonly gradleCommand: string;
    readonly compileSdk: 36;
    readonly targetSdk: 36;
    readonly abi: 'arm64-v8a';
  };
  readonly release: AndroidUpdateContract['release'];
  readonly rollback: AndroidUpdateContract['rollback'];
  readonly reproducibility: {
    readonly sourceDateEpoch: typeof SOURCE_DATE_EPOCH;
    readonly apkSha256: string;
    readonly repeatedApkSha256: string;
    readonly aabSha256: string;
    readonly repeatedAabSha256: string;
    readonly byteIdentical: true;
  };
  readonly artifacts: readonly {
    readonly format: 'apk' | 'aab';
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly signing: 'unsigned';
  }[];
  readonly gates: readonly {
    readonly id: string;
    readonly status: 'passed' | 'required';
  }[];
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function defaultCommandRunner(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env?: Readonly<Record<string, string>> }
): DeviceArtifactCommandResult {
  const useWindowsCommandShell =
    process.platform === 'win32' &&
    (command === 'npm' || command === 'gradle' || /\.(?:bat|cmd)$/i.test(command));
  const executable = useWindowsCommandShell ? (process.env.ComSpec ?? 'cmd.exe') : command;
  const commandArgs = useWindowsCommandShell
    ? ['/d', '/s', '/c', command === 'npm' ? 'npm.cmd' : command, ...args]
    : [...args];
  const result = spawnSync(executable, commandArgs, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit ${String(result.status)}: ${result.stderr || result.stdout}`
    );
  }
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function assertEmptyOutputDirectory(outputDirectory: string): void {
  if (existsSync(outputDirectory) && readdirSync(outputDirectory).length > 0) {
    throw new Error(`Output directory is not empty: ${outputDirectory}`);
  }
  mkdirSync(outputDirectory, { recursive: true });
}

function writeMaterialization(
  materialization: DevicePackageMaterialization,
  outputDirectory: string
): void {
  const prefix = `${outputDirectory}${sep}`;
  for (const [relativePath, contents] of Object.entries(materialization.files)) {
    const outputPath = resolve(outputDirectory, relativePath);
    if (!outputPath.startsWith(prefix)) {
      throw new Error(`Materialized file escaped output directory: ${relativePath}`);
    }
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, contents, 'utf8');
  }
}

function resolveBaseImageDigest(runner: DeviceArtifactCommandRunner, cwd: string): string {
  const result = runner(
    'docker',
    ['buildx', 'imagetools', 'inspect', NODE_BASE_IMAGE, '--format', '{{json .Manifest}}'],
    { cwd }
  );
  const manifest = JSON.parse(result.stdout) as { digest?: unknown };
  if (typeof manifest.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(manifest.digest)) {
    throw new Error(`Docker did not resolve a valid digest for ${NODE_BASE_IMAGE}`);
  }
  return manifest.digest;
}

function pinAndHardenDockerfile(appDirectory: string, digest: string): void {
  const dockerfilePath = join(appDirectory, 'Dockerfile');
  let dockerfile = readFileSync(dockerfilePath, 'utf8');
  dockerfile = dockerfile.replace(
    /^FROM node:20-alpine(?=\s|$)/gm,
    `FROM ${NODE_BASE_IMAGE}@${digest}`
  );
  dockerfile = dockerfile.replace(
    'COPY --from=builder /app/package*.json ./',
    'COPY --from=builder --chown=node:node /app/package*.json ./'
  );
  dockerfile = dockerfile.replace(
    'COPY --from=builder /app/dist ./dist',
    'COPY --from=builder --chown=node:node /app/dist ./dist'
  );
  dockerfile = dockerfile.replace('EXPOSE 3000', 'USER node\nEXPOSE 3000');
  if (!dockerfile.includes(`@${digest}`) || !dockerfile.includes('USER node')) {
    throw new Error('Generated Dockerfile could not be pinned and hardened');
  }
  writeFileSync(dockerfilePath, dockerfile, 'utf8');
}

function listFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory).sort()) {
      const absolute = join(directory, entry);
      const stats = statSync(absolute);
      if (stats.isDirectory()) visit(absolute);
      else if (stats.isFile()) files.push(absolute);
    }
  };
  visit(root);
  return files;
}

function stableTreeHash(outputDirectory: string): string {
  const files = listFiles(outputDirectory).filter(
    (file) => !relative(outputDirectory, file).replace(/\\/g, '/').startsWith('artifacts/')
  );
  return sha256(
    files
      .map((file) => {
        const path = relative(outputDirectory, file).replace(/\\/g, '/');
        return `${path}\0${sha256(readFileSync(file))}`;
      })
      .join('\n')
  );
}

function createSystemdBundle(outputDirectory: string): Buffer {
  const zip = new AdmZip();
  const roots = ['app', 'packaging/systemd', 'source'];
  const files = roots.flatMap((root) => listFiles(join(outputDirectory, root)));
  for (const file of files.sort()) {
    const entryName = relative(outputDirectory, file).replace(/\\/g, '/');
    const executable = entryName.endsWith('/install.sh') || entryName.endsWith('/rollback.sh');
    const mode = executable ? 0o100755 : 0o100644;
    const entry = zip.addFile(entryName, readFileSync(file), '', mode << 16);
    entry.header.time = FIXED_ZIP_TIME;
  }
  return zip.toBuffer();
}

function buildOci(
  runner: DeviceArtifactCommandRunner,
  appDirectory: string,
  outputPath: string,
  platform: string
): void {
  runner(
    'docker',
    [
      'buildx',
      'build',
      '--platform',
      platform,
      '--provenance=false',
      '--sbom=false',
      '--output',
      `type=oci,dest=${outputPath},rewrite-timestamp=true`,
      '.',
    ],
    { cwd: appDirectory, env: { SOURCE_DATE_EPOCH } }
  );
  if (!existsSync(outputPath)) throw new Error(`Docker did not write OCI artifact: ${outputPath}`);
}

function resolveGradleCommand(): string {
  const configured = process.env.HOLOSCRIPT_GRADLE?.trim();
  if (configured) return configured;
  const gradleHome = process.env.GRADLE_HOME?.trim();
  if (gradleHome) {
    return join(gradleHome, 'bin', process.platform === 'win32' ? 'gradle.bat' : 'gradle');
  }
  return process.platform === 'win32' ? 'gradle.bat' : 'gradle';
}

function buildAndroidArtifacts(
  materialization: DevicePackageMaterialization,
  outputDirectory: string,
  runner: DeviceArtifactCommandRunner
): DeviceArtifactBuildResult {
  const gradleCommand = resolveGradleCommand();
  const updateContract = JSON.parse(
    materialization.files['packaging/android-update-contract.json']
  ) as AndroidUpdateContract;
  const inputTreeSha256 = stableTreeHash(outputDirectory);
  const artifactsDirectory = join(outputDirectory, 'artifacts');
  mkdirSync(artifactsDirectory, { recursive: true });
  const buildArgs = [
    'clean',
    'assembleRelease',
    'bundleRelease',
    '--no-daemon',
    '--console=plain',
  ] as const;
  const env = { SOURCE_DATE_EPOCH };
  const emittedApkPath = join(
    outputDirectory,
    'app',
    'build',
    'outputs',
    'apk',
    'release',
    'app-release-unsigned.apk'
  );
  const emittedAabPath = join(
    outputDirectory,
    'app',
    'build',
    'outputs',
    'bundle',
    'release',
    'app-release.aab'
  );
  const runBuild = (): void => {
    runner(gradleCommand, buildArgs, { cwd: outputDirectory, env });
    if (!existsSync(emittedApkPath)) {
      throw new Error(`Gradle did not write unsigned release APK: ${emittedApkPath}`);
    }
    if (!existsSync(emittedAabPath)) {
      throw new Error(`Gradle did not write release AAB: ${emittedAabPath}`);
    }
  };

  runBuild();
  const apkPath = join(artifactsDirectory, 'holonode-android-arm64.unsigned.apk');
  const aabPath = join(artifactsDirectory, 'holonode-android-arm64.unsigned.aab');
  copyFileSync(emittedApkPath, apkPath);
  copyFileSync(emittedAabPath, aabPath);
  const apkSha256 = sha256(readFileSync(apkPath));
  const aabSha256 = sha256(readFileSync(aabPath));

  runBuild();
  const repeatedApkSha256 = sha256(readFileSync(emittedApkPath));
  const repeatedAabSha256 = sha256(readFileSync(emittedAabPath));
  if (apkSha256 !== repeatedApkSha256) {
    throw new Error(`APK reproducibility mismatch: ${apkSha256} != ${repeatedApkSha256}`);
  }
  if (aabSha256 !== repeatedAabSha256) {
    throw new Error(`AAB reproducibility mismatch: ${aabSha256} != ${repeatedAabSha256}`);
  }

  const artifacts = [
    {
      format: 'apk' as const,
      path: relative(outputDirectory, apkPath).replace(/\\/g, '/'),
      bytes: statSync(apkPath).size,
      sha256: apkSha256,
      signing: 'unsigned' as const,
    },
    {
      format: 'aab' as const,
      path: relative(outputDirectory, aabPath).replace(/\\/g, '/'),
      bytes: statSync(aabPath).size,
      sha256: aabSha256,
      signing: 'unsigned' as const,
    },
  ];
  const receipt: AndroidDeviceArtifactReceipt = {
    schema: ANDROID_DEVICE_ARTIFACT_BUILD_SCHEMA,
    phase: 'artifact-built',
    profileId: 'android-arm64',
    materializationSha256: materialization.receipt.materializationSha256,
    inputTreeSha256,
    toolchain: {
      gradleCommand: gradleCommand.replace(/\\/g, '/').split('/').pop() ?? gradleCommand,
      compileSdk: 36,
      targetSdk: 36,
      abi: 'arm64-v8a',
    },
    release: updateContract.release,
    rollback: updateContract.rollback,
    reproducibility: {
      sourceDateEpoch: SOURCE_DATE_EPOCH,
      apkSha256,
      repeatedApkSha256,
      aabSha256,
      repeatedAabSha256,
      byteIdentical: true,
    },
    artifacts,
    gates: [
      { id: 'born-from-holoscript', status: 'passed' },
      { id: 'device-profile', status: 'passed' },
      { id: 'reproducible-build', status: 'passed' },
      { id: 'platform-security', status: 'passed' },
      { id: 'signing-custody', status: 'required' },
      { id: 'physical-device', status: 'required' },
      { id: 'cold-public-consumer', status: 'required' },
      { id: 'upgrade-rollback', status: 'required' },
    ],
  };
  writeFileSync(
    join(artifactsDirectory, 'holonode-android-arm64.artifact-receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
    'utf8'
  );
  return { outputDirectory, receipt };
}

export function buildDeviceArtifacts(
  input: DeviceReleasePlanInput,
  outputDirectoryInput: string,
  runner: DeviceArtifactCommandRunner = defaultCommandRunner
): DeviceArtifactBuildResult {
  const materialization = materializeDevicePackage(input);
  const outputDirectory = resolve(outputDirectoryInput);
  assertEmptyOutputDirectory(outputDirectory);
  writeMaterialization(materialization, outputDirectory);

  if (materialization.receipt.profileId === 'android-arm64') {
    return buildAndroidArtifacts(materialization, outputDirectory, runner);
  }
  const profileId = materialization.receipt.profileId;

  const appDirectory = join(outputDirectory, 'app');
  runner('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: appDirectory,
  });
  const baseDigest = resolveBaseImageDigest(runner, appDirectory);
  pinAndHardenDockerfile(appDirectory, baseDigest);

  const releaseId = stableTreeHash(outputDirectory);
  writeFileSync(join(outputDirectory, 'packaging', 'systemd', 'release-id'), `${releaseId}\n`);

  const artifactsDirectory = join(outputDirectory, 'artifacts');
  mkdirSync(artifactsDirectory, { recursive: true });
  const stem = `holonode-${profileId}`;
  const ociPath = join(artifactsDirectory, `${stem}.oci.tar`);
  const repeatedOciPath = join(artifactsDirectory, `${stem}.repro.oci.tar`);
  const platform = profileId === 'linux-x64' ? 'linux/amd64' : 'linux/arm64';
  buildOci(runner, appDirectory, ociPath, platform);
  buildOci(runner, appDirectory, repeatedOciPath, platform);
  const ociSha256 = sha256(readFileSync(ociPath));
  const repeatedOciSha256 = sha256(readFileSync(repeatedOciPath));
  unlinkSync(repeatedOciPath);
  if (ociSha256 !== repeatedOciSha256) {
    throw new Error(`OCI reproducibility mismatch: ${ociSha256} != ${repeatedOciSha256}`);
  }

  const systemdPath = join(artifactsDirectory, `${stem}.systemd.zip`);
  const systemdBundle = createSystemdBundle(outputDirectory);
  const repeatedSystemdBundle = createSystemdBundle(outputDirectory);
  const systemdBundleSha256 = sha256(systemdBundle);
  const repeatedSystemdBundleSha256 = sha256(repeatedSystemdBundle);
  if (systemdBundleSha256 !== repeatedSystemdBundleSha256) {
    throw new Error('Systemd bundle reproducibility mismatch');
  }
  writeFileSync(systemdPath, systemdBundle);

  const inputTreeSha256 = stableTreeHash(outputDirectory);
  const artifacts = [
    {
      format: 'oci' as const,
      path: relative(outputDirectory, ociPath).replace(/\\/g, '/'),
      bytes: statSync(ociPath).size,
      sha256: ociSha256,
    },
    {
      format: 'systemd-bundle' as const,
      path: relative(outputDirectory, systemdPath).replace(/\\/g, '/'),
      bytes: statSync(systemdPath).size,
      sha256: systemdBundleSha256,
    },
  ];
  const receipt: DeviceArtifactReceipt = {
    schema: DEVICE_ARTIFACT_BUILD_SCHEMA,
    phase: 'artifact-built',
    profileId,
    materializationSha256: materialization.receipt.materializationSha256,
    inputTreeSha256,
    baseImage: { reference: NODE_BASE_IMAGE, digest: baseDigest },
    reproducibility: {
      sourceDateEpoch: SOURCE_DATE_EPOCH,
      ociSha256,
      repeatedOciSha256,
      systemdBundleSha256,
      repeatedSystemdBundleSha256,
      byteIdentical: true,
    },
    artifacts,
    gates: [
      { id: 'born-from-holoscript', status: 'passed' },
      { id: 'device-profile', status: 'passed' },
      { id: 'reproducible-build', status: 'passed' },
      { id: 'platform-security', status: 'passed' },
      { id: 'physical-device', status: 'required' },
      { id: 'cold-public-consumer', status: 'required' },
      { id: 'upgrade-rollback', status: 'required' },
    ],
  };
  writeFileSync(
    join(artifactsDirectory, `${stem}.artifact-receipt.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
    'utf8'
  );
  return { outputDirectory, receipt };
}
