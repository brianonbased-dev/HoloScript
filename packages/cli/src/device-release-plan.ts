import { createHash } from 'node:crypto';

export const DEVICE_RELEASE_PLAN_SCHEMA = 'holoscript-device-release-plan/v0.1.0';

export type DeviceProfileId = 'android-arm64' | 'jetson-orin' | 'linux-arm64' | 'linux-x64';

export type DeviceProfileSelection = DeviceProfileId | 'auto';

export interface DeviceProfile {
  readonly id: DeviceProfileId;
  readonly operatingSystem: 'android' | 'linux';
  readonly architecture: 'arm64' | 'arm64-v8a' | 'x64';
  readonly compilerTarget: 'android' | 'node';
  readonly packageFormats: readonly ('aab' | 'apk' | 'deb' | 'oci' | 'systemd-bundle')[];
  readonly serviceManager: 'android' | 'systemd';
  readonly privilegeModel: 'android-app-sandbox' | 'exact-sudo-allowlist' | 'non-root';
  readonly acceleration: readonly ('cpu' | 'cuda' | 'tensorrt' | 'vulkan')[];
  readonly certification: 'planned';
}

export interface DeviceFacts {
  readonly platform: string;
  readonly architecture: string;
  readonly nvidiaTegra?: boolean;
}

export interface DeviceReleasePlanInput {
  readonly sourcePath: string;
  readonly source: string;
  readonly device: DeviceProfileSelection | string;
  readonly compilerVersion: string;
  readonly deviceFacts?: DeviceFacts;
}

export interface DeviceReleaseGate {
  readonly id:
    | 'born-from-holoscript'
    | 'device-profile'
    | 'reproducible-build'
    | 'platform-security'
    | 'physical-device'
    | 'cold-public-consumer'
    | 'upgrade-rollback';
  readonly status: 'required';
}

export interface DeviceReleasePlan {
  readonly schema: typeof DEVICE_RELEASE_PLAN_SCHEMA;
  readonly source: {
    readonly path: string;
    readonly language: 'holo' | 'hs' | 'hsplus';
    readonly sha256: string;
  };
  readonly profile: DeviceProfile;
  readonly provenance: {
    readonly compilerVersion: string;
    readonly compilerTarget: DeviceProfile['compilerTarget'];
    readonly generatedOutputRequired: true;
    readonly generatedOutputEditable: false;
  };
  readonly plannedArtifacts: readonly {
    readonly format: DeviceProfile['packageFormats'][number];
    readonly status: 'not-built';
  }[];
  readonly gates: readonly DeviceReleaseGate[];
  readonly planSha256: string;
}

const DEVICE_PROFILES: Readonly<Record<DeviceProfileId, DeviceProfile>> = Object.freeze({
  'android-arm64': Object.freeze({
    id: 'android-arm64',
    operatingSystem: 'android',
    architecture: 'arm64-v8a',
    compilerTarget: 'android',
    packageFormats: Object.freeze(['apk', 'aab'] as const),
    serviceManager: 'android',
    privilegeModel: 'android-app-sandbox',
    acceleration: Object.freeze(['cpu', 'vulkan'] as const),
    certification: 'planned',
  }),
  'jetson-orin': Object.freeze({
    id: 'jetson-orin',
    operatingSystem: 'linux',
    architecture: 'arm64',
    compilerTarget: 'node',
    packageFormats: Object.freeze(['oci', 'systemd-bundle'] as const),
    serviceManager: 'systemd',
    privilegeModel: 'non-root',
    acceleration: Object.freeze(['cpu', 'cuda', 'tensorrt'] as const),
    certification: 'planned',
  }),
  'linux-arm64': Object.freeze({
    id: 'linux-arm64',
    operatingSystem: 'linux',
    architecture: 'arm64',
    compilerTarget: 'node',
    packageFormats: Object.freeze(['oci', 'deb'] as const),
    serviceManager: 'systemd',
    privilegeModel: 'non-root',
    acceleration: Object.freeze(['cpu', 'vulkan'] as const),
    certification: 'planned',
  }),
  'linux-x64': Object.freeze({
    id: 'linux-x64',
    operatingSystem: 'linux',
    architecture: 'x64',
    compilerTarget: 'node',
    packageFormats: Object.freeze(['oci', 'deb'] as const),
    serviceManager: 'systemd',
    privilegeModel: 'non-root',
    acceleration: Object.freeze(['cpu', 'vulkan'] as const),
    certification: 'planned',
  }),
});

const REQUIRED_GATES: readonly DeviceReleaseGate[] = Object.freeze(
  [
    'born-from-holoscript',
    'device-profile',
    'reproducible-build',
    'platform-security',
    'physical-device',
    'cold-public-consumer',
    'upgrade-rollback',
  ].map((id) => Object.freeze({ id, status: 'required' as const })) as DeviceReleaseGate[]
);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeSourcePath(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error('Release plan source path must be workspace-relative');
  }
  if (normalized.split('/').includes('..')) {
    throw new Error('Release plan source path cannot escape the workspace');
  }
  return normalized;
}

function sourceLanguage(sourcePath: string): DeviceReleasePlan['source']['language'] {
  if (sourcePath.endsWith('.holo')) return 'holo';
  if (sourcePath.endsWith('.hsplus')) return 'hsplus';
  if (sourcePath.endsWith('.hs')) return 'hs';
  throw new Error('Public device releases require .holo, .hsplus, or .hs HoloScript source');
}

export function listDeviceProfiles(): readonly DeviceProfile[] {
  return (Object.keys(DEVICE_PROFILES) as DeviceProfileId[])
    .sort()
    .map((id) => DEVICE_PROFILES[id]);
}

export function getDeviceProfile(device: string): DeviceProfile {
  if (!(device in DEVICE_PROFILES)) {
    throw new Error(
      `Unknown device profile "${device}". Available profiles: ${listDeviceProfiles()
        .map((profile) => profile.id)
        .join(', ')}`
    );
  }
  return DEVICE_PROFILES[device as DeviceProfileId];
}

export function resolveDeviceProfile(
  selection: DeviceProfileSelection | string,
  facts?: DeviceFacts
): DeviceProfile {
  if (selection !== 'auto') return getDeviceProfile(selection);
  if (!facts) throw new Error('Automatic device selection requires detected device facts');

  if (facts.platform === 'linux' && facts.architecture === 'arm64') {
    return getDeviceProfile(facts.nvidiaTegra ? 'jetson-orin' : 'linux-arm64');
  }
  if (facts.platform === 'linux' && facts.architecture === 'x64') {
    return getDeviceProfile('linux-x64');
  }

  throw new Error(
    `No certified device profile can be selected for ${facts.platform}/${facts.architecture}; choose an explicit planned profile`
  );
}

export function createDeviceReleasePlan(input: DeviceReleasePlanInput): DeviceReleasePlan {
  const path = normalizeSourcePath(input.sourcePath);
  const profile = resolveDeviceProfile(input.device, input.deviceFacts);
  const body: Omit<DeviceReleasePlan, 'planSha256'> = {
    schema: DEVICE_RELEASE_PLAN_SCHEMA,
    source: {
      path,
      language: sourceLanguage(path),
      sha256: sha256(input.source),
    },
    profile,
    provenance: {
      compilerVersion: input.compilerVersion,
      compilerTarget: profile.compilerTarget,
      generatedOutputRequired: true as const,
      generatedOutputEditable: false as const,
    },
    plannedArtifacts: profile.packageFormats.map((format) => ({
      format,
      status: 'not-built' as const,
    })),
    gates: REQUIRED_GATES,
  };

  return Object.freeze({ ...body, planSha256: sha256(canonicalJson(body)) });
}
