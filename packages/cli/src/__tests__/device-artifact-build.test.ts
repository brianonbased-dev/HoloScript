import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it } from 'vitest';

import { buildDeviceArtifacts, type DeviceArtifactCommandRunner } from '../device-artifact-build';

const SOURCE = `composition "Public Holon Node" {
  metadata { version: "0.1.0" }
  object "Node Runtime" {
    role: "owned_edge_agent"
    health_endpoint: "/health"
  }
}`;

const BASE_DIGEST = `sha256:${'a'.repeat(64)}`;
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fakeRunner(commands: string[]): DeviceArtifactCommandRunner {
  return (command, args, options) => {
    commands.push(`${command} ${args.join(' ')}`);
    if (command === 'npm') {
      writeFileSync(
        join(options.cwd, 'package-lock.json'),
        '{"name":"public-holon-node","lockfileVersion":3}\n',
        'utf8'
      );
      return { stdout: 'locked', stderr: '' };
    }
    if (command.includes('gradle')) {
      const apk = join(
        options.cwd,
        'app',
        'build',
        'outputs',
        'apk',
        'release',
        'app-release-unsigned.apk'
      );
      const aab = join(
        options.cwd,
        'app',
        'build',
        'outputs',
        'bundle',
        'release',
        'app-release.aab'
      );
      mkdirSync(join(apk, '..'), { recursive: true });
      mkdirSync(join(aab, '..'), { recursive: true });
      writeFileSync(apk, Buffer.from('deterministic-apk-fixture'));
      writeFileSync(aab, Buffer.from('deterministic-aab-fixture'));
      return { stdout: 'android built', stderr: '' };
    }
    if (args[1] === 'imagetools') {
      return { stdout: JSON.stringify({ digest: BASE_DIGEST }), stderr: '' };
    }
    const output = args[args.indexOf('--output') + 1];
    const destination = output.match(/dest=(.*),rewrite-timestamp=true$/)?.[1];
    if (!destination) throw new Error(`Missing OCI destination in ${output}`);
    writeFileSync(destination, Buffer.from('deterministic-oci-fixture'));
    return { stdout: 'built', stderr: '' };
  };
}

describe('device artifact build', () => {
  it('builds reproducible OCI and rootless systemd artifacts', () => {
    const root = mkdtempSync(join(tmpdir(), 'holoscript-device-artifact-'));
    roots.push(root);
    const output = join(root, 'output');
    const commands: string[] = [];
    const result = buildDeviceArtifacts(
      {
        sourcePath: 'public-holon-node.holo',
        source: SOURCE,
        device: 'jetson-orin',
        compilerVersion: '8.0.15',
      },
      output,
      fakeRunner(commands)
    );

    expect(result.receipt).toMatchObject({
      schema: 'holoscript-device-artifact-build/v0.1.0',
      phase: 'artifact-built',
      profileId: 'jetson-orin',
      baseImage: { reference: 'node:20-alpine', digest: BASE_DIGEST },
      reproducibility: { byteIdentical: true, sourceDateEpoch: '0' },
    });
    if (result.receipt.schema !== 'holoscript-device-artifact-build/v0.1.0') {
      throw new Error(`Unexpected receipt schema: ${result.receipt.schema}`);
    }
    expect(result.receipt.reproducibility.ociSha256).toBe(
      result.receipt.reproducibility.repeatedOciSha256
    );
    expect(result.receipt.reproducibility.systemdBundleSha256).toBe(
      result.receipt.reproducibility.repeatedSystemdBundleSha256
    );
    expect(result.receipt.gates).toContainEqual({
      id: 'reproducible-build',
      status: 'passed',
    });
    expect(result.receipt.gates).toContainEqual({ id: 'physical-device', status: 'required' });
    expect(readFileSync(join(output, 'app', 'Dockerfile'), 'utf8')).toContain(
      `FROM node:20-alpine@${BASE_DIGEST}`
    );
    expect(readFileSync(join(output, 'app', 'Dockerfile'), 'utf8')).toContain('USER node');
    expect(commands.filter((command) => command.includes('buildx build'))).toHaveLength(2);
    expect(commands.some((command) => command.includes('linux/arm64'))).toBe(true);

    const systemdArtifact = result.receipt.artifacts.find(
      (artifact) => artifact.format === 'systemd-bundle'
    );
    expect(systemdArtifact).toBeDefined();
    const archive = new AdmZip(join(output, systemdArtifact!.path));
    expect(archive.getEntry('packaging/systemd/install.sh')).not.toBeNull();
    expect(archive.getEntry('packaging/systemd/rollback.sh')).not.toBeNull();
    expect(archive.getEntry('packaging/systemd/release-id')).not.toBeNull();
    expect(archive.getEntry('app/package-lock.json')).not.toBeNull();
  });

  it('builds reproducible unsigned APK and AAB artifacts without signing custody', () => {
    const root = mkdtempSync(join(tmpdir(), 'holoscript-device-artifact-'));
    roots.push(root);
    const commands: string[] = [];
    const result = buildDeviceArtifacts(
      {
        sourcePath: 'public-holon-node.holo',
        source: SOURCE,
        device: 'android-arm64',
        compilerVersion: '8.0.17',
      },
      join(root, 'output'),
      fakeRunner(commands)
    );

    expect(result.receipt).toMatchObject({
      schema: 'holoscript-android-device-artifact-build/v0.1.0',
      phase: 'artifact-built',
      profileId: 'android-arm64',
      reproducibility: { byteIdentical: true, sourceDateEpoch: '0' },
      toolchain: { compileSdk: 36, targetSdk: 36, abi: 'arm64-v8a' },
    });
    expect(result.receipt.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ format: 'apk', signing: 'unsigned' }),
        expect.objectContaining({ format: 'aab', signing: 'unsigned' }),
      ])
    );
    expect(result.receipt.gates).toContainEqual({ id: 'signing-custody', status: 'required' });
    expect(commands.filter((command) => command.includes('assembleRelease'))).toHaveLength(2);
    expect(readFileSync(join(root, 'output', 'build.gradle.kts'), 'utf8')).toContain(
      'com.android.application'
    );
  });
});
