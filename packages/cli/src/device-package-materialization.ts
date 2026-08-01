import { createHash } from 'node:crypto';
import { HoloCompositionParser } from '@holoscript/core';
import { DialectRegistry } from '@holoscript/core/compiler/index';

import {
  createDeviceReleasePlan,
  type DeviceProfileId,
  type DeviceReleasePlanInput,
} from './device-release-plan';

export const DEVICE_PACKAGE_MATERIALIZATION_SCHEMA =
  'holoscript-device-package-materialization/v0.1.0';

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
    readonly name: 'NodeServiceCompiler';
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

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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
WorkingDirectory=%h/.local/share/holonode/app
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
  if (plan.profile.operatingSystem === 'android') {
    throw new Error('Android materialization requires the Android compiler path');
  }

  const parsed = new HoloCompositionParser().parse(input.source);
  if (!parsed.success || !parsed.ast) {
    const errors = (parsed.errors as Array<{ message?: string } | string>)
      .map((error) => (typeof error === 'string' ? error : (error.message ?? 'unknown error')))
      .join('; ');
    throw new Error(`HoloScript source failed canonical parsing: ${errors || 'unknown error'}`);
  }

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
  const compiledFiles = Object.fromEntries(
    Object.entries(compiled)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, contents]) => [`app/${path}`, contents])
  );

  const sourcePathParts = plan.source.path.split('/');
  const sourceFileName = sourcePathParts[sourcePathParts.length - 1] || 'node.holo';
  const files: Record<string, string> = {
    ...compiledFiles,
    [`source/${sourceFileName}`]: input.source,
    'packaging/device-profile.json': `${JSON.stringify(plan.profile, null, 2)}\n`,
    'packaging/release-plan.json': `${JSON.stringify(plan, null, 2)}\n`,
    'packaging/systemd/user/holonode.service': rootlessSystemdUnit(),
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
      name: 'NodeServiceCompiler' as const,
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
