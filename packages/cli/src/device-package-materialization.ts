import { createHash } from 'node:crypto';
import { AndroidCompiler, HoloCompositionParser } from '@holoscript/core';
import { DialectRegistry } from '@holoscript/core/compiler/index';

import {
  createDeviceReleasePlan,
  type DeviceProfileId,
  type DeviceReleasePlanInput,
} from './device-release-plan';

export const DEVICE_PACKAGE_MATERIALIZATION_SCHEMA =
  'holoscript-device-package-materialization/v0.1.0';
export const ANDROID_UPDATE_CONTRACT_SCHEMA = 'holoscript-android-update-contract/v0.1.0';

const ANDROID_APPLICATION_ID = 'dev.holoscript.holonode';

export interface AndroidReleaseIdentity {
  readonly applicationId: typeof ANDROID_APPLICATION_ID;
  readonly versionName: string;
  readonly versionCode: number;
}

export interface AndroidUpdateContract {
  readonly schema: typeof ANDROID_UPDATE_CONTRACT_SCHEMA;
  readonly release: AndroidReleaseIdentity & {
    readonly sourceSha256: string;
    readonly releaseSha256: string;
  };
  readonly upgrade: {
    readonly requireSameApplicationId: true;
    readonly requireSameSigningCertificate: true;
    readonly requireIncreasingVersionCode: true;
  };
  readonly rollback: {
    readonly strategy: 'forward-fix';
    readonly directDowngradeAllowed: false;
    readonly predecessorSourceRequired: true;
    readonly predecessorArtifactRequired: true;
    readonly rollbackVersionCodeMustExceedCurrent: true;
    readonly deviceDataBackupRestoreProofRequired: true;
  };
}

export interface DevicePackageFileReceipt {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly owner: 'compiler' | 'packager' | 'source';
}

export interface DevicePackageMaterializationReceipt {
  readonly schema: typeof DEVICE_PACKAGE_MATERIALIZATION_SCHEMA;
  readonly phase: 'source-materialized';
  readonly profileId: DeviceProfileId;
  readonly planSha256: string;
  readonly sourceSha256: string;
  readonly compiler: {
    readonly name: 'AndroidCompiler' | 'NodeServiceCompiler';
    readonly classification: 'bridge';
    readonly sourceCompiled: true;
    readonly outputSha256: string;
  };
  readonly files: readonly DevicePackageFileReceipt[];
  readonly gates: readonly {
    readonly id: string;
    readonly status: 'passed' | 'required';
  }[];
  readonly materializationSha256: string;
}

export interface DevicePackageMaterialization {
  readonly files: Readonly<Record<string, string>>;
  readonly receipt: DevicePackageMaterializationReceipt;
}

interface MultiFileCompiler {
  compile(composition: unknown, agentToken: string): unknown;
}

interface AndroidFileCompiler {
  compileToFiles(composition: unknown, agentToken?: string): Record<string, string>;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function androidReleaseIdentity(composition: unknown): AndroidReleaseIdentity {
  const metadata =
    composition && typeof composition === 'object'
      ? (composition as { metadata?: Record<string, unknown> }).metadata
      : undefined;
  const versionName = metadata?.version;
  if (typeof versionName !== 'string') {
    throw new Error('Android device packages require metadata.version in HoloScript source');
  }
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.exec(versionName);
  if (!match) {
    throw new Error('Android metadata.version must be semantic major.minor.patch');
  }
  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  const patch = Number.parseInt(match[3], 10);
  if (minor > 999 || patch > 999) {
    throw new Error('Android metadata.version minor and patch components must be at most 999');
  }
  const versionCode = major * 1_000_000 + minor * 1_000 + patch;
  if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2_100_000_000) {
    throw new Error('Android metadata.version does not map to a valid positive versionCode');
  }
  return { applicationId: ANDROID_APPLICATION_ID, versionName, versionCode };
}

function androidUpdateContract(
  release: AndroidReleaseIdentity,
  sourceSha256: string
): AndroidUpdateContract {
  return {
    schema: ANDROID_UPDATE_CONTRACT_SCHEMA,
    release: {
      ...release,
      sourceSha256,
      releaseSha256: sha256(
        `${release.applicationId}\0${release.versionCode}\0${release.versionName}\0${sourceSha256}`
      ),
    },
    upgrade: {
      requireSameApplicationId: true,
      requireSameSigningCertificate: true,
      requireIncreasingVersionCode: true,
    },
    rollback: {
      strategy: 'forward-fix',
      directDowngradeAllowed: false,
      predecessorSourceRequired: true,
      predecessorArtifactRequired: true,
      rollbackVersionCodeMustExceedCurrent: true,
      deviceDataBackupRestoreProofRequired: true,
    },
  };
}

function stableFileHash(files: Readonly<Record<string, string>>): string {
  return sha256(
    Object.keys(files)
      .sort()
      .map((path) => `${path}\0${sha256(files[path])}`)
      .join('\n')
  );
}

function rootlessSystemdUnit(): string {
  return `[Unit]
Description=HoloScript public HoloNode
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=%h/.local/share/holonode/current
ExecStart=/usr/bin/env npm start
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=%h/.local/share/holonode
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
`;
}

function systemdInstallScript(): string {
  return `#!/bin/sh
set -eu

BUNDLE_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
APP_SOURCE="$BUNDLE_ROOT/app"
STATE_ROOT="${'$'}HOME/.local/share/holonode"
RELEASES_ROOT="$STATE_ROOT/releases"
UNIT_ROOT="${'$'}HOME/.config/systemd/user"
RELEASE_ID=$(cat "$BUNDLE_ROOT/packaging/systemd/release-id")
case "$RELEASE_ID" in
  *[!a-f0-9]*|'') printf '%s\n' "Invalid HoloNode release identifier" >&2; exit 1 ;;
esac
RELEASE_ROOT="$RELEASES_ROOT/$RELEASE_ID"

mkdir -p "$RELEASES_ROOT" "$UNIT_ROOT"
if [ ! -d "$RELEASE_ROOT" ]; then
  mkdir -p "$RELEASE_ROOT"
  cp -R "$APP_SOURCE/." "$RELEASE_ROOT/"
  (cd "$RELEASE_ROOT" && npm ci --ignore-scripts && npm run build && npm prune --omit=dev)
fi

if [ -L "$STATE_ROOT/current" ]; then
  CURRENT_TARGET=$(readlink "$STATE_ROOT/current")
  ln -sfn "$CURRENT_TARGET" "$STATE_ROOT/previous"
fi
ln -sfn "$RELEASE_ROOT" "$STATE_ROOT/current"
cp "$BUNDLE_ROOT/packaging/systemd/user/holonode.service" "$UNIT_ROOT/holonode.service"
systemctl --user daemon-reload
systemctl --user enable --now holonode.service
printf '%s\n' "$RELEASE_ID"
`;
}

function systemdRollbackScript(): string {
  return `#!/bin/sh
set -eu

STATE_ROOT="${'$'}HOME/.local/share/holonode"
if [ ! -L "$STATE_ROOT/previous" ]; then
  printf '%s\n' "No previous HoloNode release is available" >&2
  exit 1
fi

PREVIOUS_TARGET=$(readlink "$STATE_ROOT/previous")
CURRENT_TARGET=$(readlink "$STATE_ROOT/current")
ln -sfn "$PREVIOUS_TARGET" "$STATE_ROOT/current"
ln -sfn "$CURRENT_TARGET" "$STATE_ROOT/previous"
systemctl --user restart holonode.service
printf '%s\n' "$PREVIOUS_TARGET"
`;
}

function androidSettings(): string {
  return `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "HoloNode"
include(":app")
`;
}

function androidRootBuild(): string {
  return `plugins {
  id("com.android.application") version "8.9.1" apply false
  id("org.jetbrains.kotlin.android") version "2.3.21" apply false
  id("org.jetbrains.kotlin.plugin.compose") version "2.3.21" apply false
}
`;
}

function androidGradleProperties(): string {
  return `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
`;
}

function androidProguardRules(): string {
  return `# Project-specific ProGuard rules for the compiler-generated Android app.
`;
}

function androidAdmission(): string {
  return `${JSON.stringify(
    {
      schema: 'holoscript-android-device-admission/v0.1.0',
      requiredAbi: ['arm64-v8a'],
      rootRequired: false,
      signingCredentialBundled: false,
      signingRequiredForRelease: true,
      permissionReviewRequired: true,
      physicalDeviceRequired: true,
      updateRollbackProofRequired: true,
    },
    null,
    2
  )}\n`;
}

function materializationGates(): DevicePackageMaterializationReceipt['gates'] {
  return [
    { id: 'born-from-holoscript', status: 'passed' },
    { id: 'device-profile', status: 'passed' },
    { id: 'reproducible-build', status: 'required' },
    { id: 'platform-security', status: 'required' },
    { id: 'physical-device', status: 'required' },
    { id: 'cold-public-consumer', status: 'required' },
    { id: 'upgrade-rollback', status: 'required' },
  ];
}

export function materializeDevicePackage(
  input: DeviceReleasePlanInput
): DevicePackageMaterialization {
  const plan = createDeviceReleasePlan(input);
  const parsed = new HoloCompositionParser().parse(input.source);
  if (!parsed.success || !parsed.ast) {
    const errors = (parsed.errors as Array<{ message?: string } | string>)
      .map((error) => (typeof error === 'string' ? error : (error.message ?? 'unknown error')))
      .join('; ');
    throw new Error(`HoloScript source failed canonical parsing: ${errors || 'unknown error'}`);
  }

  let compilerName: DevicePackageMaterializationReceipt['compiler']['name'];
  let compiledFiles: Record<string, string>;
  let platformFiles: Record<string, string>;

  if (plan.profile.operatingSystem === 'android') {
    compilerName = 'AndroidCompiler';
    const release = androidReleaseIdentity(parsed.ast);
    const compiler = new AndroidCompiler({
      packageName: release.applicationId,
      className: 'HoloNode',
      versionCode: release.versionCode,
      versionName: release.versionName,
      minSdk: 26,
      targetSdk: 34,
    }) as unknown as AndroidFileCompiler;
    compiledFiles = Object.fromEntries(
      Object.entries(compiler.compileToFiles(parsed.ast, '')).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    );
    platformFiles = {
      'settings.gradle.kts': androidSettings(),
      'build.gradle.kts': androidRootBuild(),
      'gradle.properties': androidGradleProperties(),
      'app/proguard-rules.pro': androidProguardRules(),
      'packaging/android-admission.json': androidAdmission(),
      'packaging/android-update-contract.json': `${JSON.stringify(
        androidUpdateContract(release, plan.source.sha256),
        null,
        2
      )}\n`,
    };
  } else {
    compilerName = 'NodeServiceCompiler';
    const compiler = DialectRegistry.create('node-service', {
      includeDocker: true,
      nodeVersion: '20',
      typescript: true,
    }) as unknown as MultiFileCompiler;
    const compiledOutput = compiler.compile(parsed.ast, '');
    if (
      !compiledOutput ||
      typeof compiledOutput !== 'object' ||
      Array.isArray(compiledOutput) ||
      !Object.values(compiledOutput).every((contents) => typeof contents === 'string')
    ) {
      throw new Error('NodeServiceCompiler did not return a multi-file text bundle');
    }
    const compiled = compiledOutput as Record<string, string>;
    compiledFiles = Object.fromEntries(
      Object.entries(compiled)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([path, contents]) => [`app/${path}`, contents])
    );
    platformFiles = {
      'packaging/systemd/user/holonode.service': rootlessSystemdUnit(),
      'packaging/systemd/install.sh': systemdInstallScript(),
      'packaging/systemd/rollback.sh': systemdRollbackScript(),
    };
  }

  const sourcePathParts = plan.source.path.split('/');
  const sourceFileName = sourcePathParts[sourcePathParts.length - 1] || 'node.holo';
  const files: Record<string, string> = {
    ...compiledFiles,
    [`source/${sourceFileName}`]: input.source,
    'packaging/device-profile.json': `${JSON.stringify(plan.profile, null, 2)}\n`,
    'packaging/release-plan.json': `${JSON.stringify(plan, null, 2)}\n`,
    ...platformFiles,
  };

  const compilerOutputSha256 = stableFileHash(compiledFiles);
  const fileReceipts = Object.keys(files)
    .sort()
    .map((path): DevicePackageFileReceipt => {
      const contents = files[path];
      return {
        path,
        bytes: Buffer.byteLength(contents, 'utf8'),
        sha256: sha256(contents),
        owner: path.startsWith('app/')
          ? 'compiler'
          : path.startsWith('source/')
            ? 'source'
            : 'packager',
      };
    });
  const body: Omit<DevicePackageMaterializationReceipt, 'materializationSha256'> = {
    schema: DEVICE_PACKAGE_MATERIALIZATION_SCHEMA,
    phase: 'source-materialized' as const,
    profileId: plan.profile.id,
    planSha256: plan.planSha256,
    sourceSha256: plan.source.sha256,
    compiler: {
      name: compilerName,
      classification: 'bridge' as const,
      sourceCompiled: true as const,
      outputSha256: compilerOutputSha256,
    },
    files: fileReceipts,
    gates: materializationGates(),
  };
  const receipt: DevicePackageMaterializationReceipt = {
    ...body,
    materializationSha256: sha256(JSON.stringify(body)),
  };
  files['packaging/materialization-receipt.json'] = `${JSON.stringify(receipt, null, 2)}\n`;

  return { files, receipt };
}
