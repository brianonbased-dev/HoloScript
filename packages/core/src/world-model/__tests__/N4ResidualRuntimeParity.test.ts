import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  generateN4Artifacts,
  generateN4Scene,
  projectN4TypedFeatures,
} from '../N4ResidualWorldLoop';
import {
  inferN4Cpu,
  inferN4Wasm,
  verifyN4RuntimeParity,
} from '../N4ResidualRuntimeParity';

const SOURCE_PATH = new URL('../n4_residual_world_loop.hsplus', import.meta.url);

describe('N4 CPU/WASM tensor custody', () => {
  it('executes the identical typed feature and weight tensors in real WebAssembly', async () => {
    const artifacts = generateN4Artifacts(readFileSync(SOURCE_PATH, 'utf8'));
    const scene = generateN4Scene(9100, 'ood');
    const features = projectN4TypedFeatures(scene, scene.objects[0]!);
    const cpu = inferN4Cpu(artifacts.weightsManifest, features);
    const wasm = await inferN4Wasm(artifacts.weightsManifest, features);
    const parity = verifyN4RuntimeParity(cpu, wasm);

    expect(wasm.runtime).toBe('wasm');
    expect(parity.valid).toBe(true);
    expect(parity.maxAbsoluteError).toBeLessThanOrEqual(1e-5);
  });

  it('fails closed on a tensor mutation before runtime execution', async () => {
    const artifacts = generateN4Artifacts(readFileSync(SOURCE_PATH, 'utf8'));
    const scene = generateN4Scene(9100, 'ood');
    const features = projectN4TypedFeatures(scene, scene.objects[0]!);
    const tampered = {
      ...artifacts.weightsManifest,
      weightTensor: artifacts.weightsManifest.weightTensor.map((value, index) =>
        index === 0 ? value + 1 : value
      ),
    };

    await expect(inferN4Wasm(tampered, features)).rejects.toThrow(/checksum mismatch/);
  });
});
