import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  createDeviceReleasePlan,
  getDeviceProfile,
  listDeviceProfiles,
  resolveDeviceProfile,
} from '../device-release-plan';

const SOURCE = `composition PublicEdgeNode {
  metadata { name: "Public Edge Node" }
}`;

describe('public device release planning', () => {
  it('publishes selectable profiles without confusing devices with compiler targets', () => {
    expect(listDeviceProfiles().map((profile) => profile.id)).toEqual([
      'android-arm64',
      'jetson-orin',
      'linux-arm64',
      'linux-x64',
    ]);

    expect(getDeviceProfile('jetson-orin')).toMatchObject({
      compilerTarget: 'node',
      architecture: 'arm64',
      serviceManager: 'systemd',
      privilegeModel: 'non-root',
      packageFormats: ['oci', 'systemd-bundle'],
    });
    expect(getDeviceProfile('android-arm64')).toMatchObject({
      compilerTarget: 'android',
      architecture: 'arm64-v8a',
      serviceManager: 'android',
      privilegeModel: 'android-app-sandbox',
      packageFormats: ['apk', 'aab'],
    });
  });

  it('emits a deterministic born-from-HoloScript plan receipt', () => {
    const first = createDeviceReleasePlan({
      sourcePath: 'examples/edge/public-holon-node.holo',
      source: SOURCE,
      device: 'jetson-orin',
      compilerVersion: '8.0.13',
    });
    const second = createDeviceReleasePlan({
      sourcePath: 'examples/edge/public-holon-node.holo',
      source: SOURCE,
      device: 'jetson-orin',
      compilerVersion: '8.0.13',
    });

    expect(first).toEqual(second);
    expect(first.schema).toBe('holoscript-device-release-plan/v0.1.0');
    expect(first.source).toEqual({
      path: 'examples/edge/public-holon-node.holo',
      language: 'holo',
      sha256: createHash('sha256').update(SOURCE).digest('hex'),
    });
    expect(first.provenance).toMatchObject({
      compilerVersion: '8.0.13',
      compilerTarget: 'node',
      generatedOutputRequired: true,
      generatedOutputEditable: false,
    });
    expect(first.gates.map((gate) => gate.id)).toEqual([
      'born-from-holoscript',
      'device-profile',
      'reproducible-build',
      'platform-security',
      'physical-device',
      'cold-public-consumer',
      'upgrade-rollback',
    ]);
    expect(first.planSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('fails closed for native wrapper sources and unknown profiles', () => {
    expect(() =>
      createDeviceReleasePlan({
        sourcePath: 'src/private-installer.ts',
        source: 'console.log("wrapper")',
        device: 'jetson-orin',
        compilerVersion: '8.0.13',
      })
    ).toThrow(/HoloScript source/);

    expect(() => getDeviceProfile('raspberry-pi-magic')).toThrow(/Unknown device profile/);
  });

  it('auto-detects supported Linux profiles and refuses unsupported hosts', () => {
    expect(
      resolveDeviceProfile('auto', { platform: 'linux', architecture: 'arm64', nvidiaTegra: true })
        .id
    ).toBe('jetson-orin');
    expect(
      resolveDeviceProfile('auto', {
        platform: 'linux',
        architecture: 'arm64',
        nvidiaTegra: false,
      }).id
    ).toBe('linux-arm64');
    expect(() => resolveDeviceProfile('auto', { platform: 'win32', architecture: 'x64' })).toThrow(
      /No certified device profile/
    );
  });
});
