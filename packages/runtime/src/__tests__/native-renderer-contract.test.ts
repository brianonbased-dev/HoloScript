import { describe, expect, it } from 'vitest';
import {
  NATIVE_RENDERER_CONTRACT_VERSION,
  NATIVE_RENDERER_GOLDEN_FIXTURES,
  REQUIRED_NATIVE_RENDERER_CAPABILITIES,
  validateNativeRendererBackendContract,
  validateNativeRendererGoldenFixtures,
  type NativeRendererBackendContract,
  type NativeRendererGoldenFixture,
} from '../native-renderer-contract';

const VALID_NATIVE_BACKEND: NativeRendererBackendContract = {
  contractVersion: NATIVE_RENDERER_CONTRACT_VERSION,
  backendId: 'runtime.webgpu-native',
  adapterKind: 'native-runtime-backend',
  runtimeEntryPoint: '@holoscript/runtime/native/webgpu',
  semanticsSource: 'holo-runtime',
  consumes: {
    sourceFormats: ['holo', 'hsplus', 'hs'],
    ir: 'scene-ir',
    runtime: '@holoscript/runtime',
  },
  implementsCapabilities: REQUIRED_NATIVE_RENDERER_CAPABILITIES,
  goldenFixtureIds: NATIVE_RENDERER_GOLDEN_FIXTURES.map((fixture) => fixture.id),
};

describe('native renderer golden fixtures', () => {
  it('covers every native renderer capability required by the source-owned path', () => {
    const result = validateNativeRendererGoldenFixtures();

    expect(result.ok).toBe(true);
    expect(result.fixtureCount).toBe(3);
    expect(result.missingCapabilities).toEqual([]);
    expect(result.coveredCapabilities).toEqual(REQUIRED_NATIVE_RENDERER_CAPABILITIES);
  });

  it('keeps every fixture source-owned and routed through scene IR', () => {
    for (const fixture of NATIVE_RENDERER_GOLDEN_FIXTURES) {
      expect(fixture.contractVersion).toBe(NATIVE_RENDERER_CONTRACT_VERSION);
      expect(fixture.source.ownedBy).toBe('holoscript-source');
      expect(fixture.source.irKind).toBe('scene-ir');
      expect(['holo', 'hsplus', 'hs']).toContain(fixture.source.format);
      expect(fixture.source.path).toMatch(/\.(holo|hsplus|hs)$/);
    }
  });

  it('rejects a suite when a declared capability has no matching fixture section', () => {
    const brokenFixture: NativeRendererGoldenFixture = {
      ...NATIVE_RENDERER_GOLDEN_FIXTURES[1],
      state: undefined,
    };

    const result = validateNativeRendererGoldenFixtures([
      NATIVE_RENDERER_GOLDEN_FIXTURES[0],
      brokenFixture,
      NATIVE_RENDERER_GOLDEN_FIXTURES[2],
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'native-renderer.input-timeline-state.v1 declares state but does not include its fixture section'
    );
  });

  it('rejects a suite that no longer covers a required capability', () => {
    const trimmedFixture: NativeRendererGoldenFixture = {
      ...NATIVE_RENDERER_GOLDEN_FIXTURES[2],
      requiredCapabilities: ['asset_loading'],
      xrDevice: undefined,
    };

    const result = validateNativeRendererGoldenFixtures([
      NATIVE_RENDERER_GOLDEN_FIXTURES[0],
      NATIVE_RENDERER_GOLDEN_FIXTURES[1],
      trimmedFixture,
    ]);

    expect(result.ok).toBe(false);
    expect(result.missingCapabilities).toEqual(['xr_device_semantics']);
    expect(result.errors).toContain('golden suite is missing capability: xr_device_semantics');
  });
});

describe('native renderer backend contract', () => {
  it('accepts a backend that implements Holo runtime semantics and every fixture', () => {
    const result = validateNativeRendererBackendContract(VALID_NATIVE_BACKEND);

    expect(result.ok).toBe(true);
    expect(result.backendId).toBe('runtime.webgpu-native');
    expect(result.missingCapabilities).toEqual([]);
    expect(result.missingFixtureIds).toEqual([]);
  });

  it('rejects target-local semantics even when the backend claims every capability', () => {
    const result = validateNativeRendererBackendContract({
      ...VALID_NATIVE_BACKEND,
      backendId: 'runtime.target-local-theater',
      semanticsSource: 'target-local',
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'runtime.target-local-theater must consume Holo IR/runtime semantics, not target-local semantics'
    );
  });

  it('rejects backends that skip golden fixtures or renderer capabilities', () => {
    const result = validateNativeRendererBackendContract({
      ...VALID_NATIVE_BACKEND,
      backendId: 'runtime.partial',
      implementsCapabilities: REQUIRED_NATIVE_RENDERER_CAPABILITIES.filter(
        (capability) => capability !== 'timeline'
      ),
      goldenFixtureIds: [NATIVE_RENDERER_GOLDEN_FIXTURES[0].id],
    });

    expect(result.ok).toBe(false);
    expect(result.missingCapabilities).toEqual(['timeline']);
    expect(result.missingFixtureIds).toEqual([
      'native-renderer.input-timeline-state.v1',
      'native-renderer.assets-xr-device.v1',
    ]);
  });
});
