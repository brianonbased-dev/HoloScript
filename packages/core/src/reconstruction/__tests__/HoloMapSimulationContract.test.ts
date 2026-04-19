import { describe, expect, it } from 'vitest';
import { createHoloMapRuntime, HOLOMAP_DEFAULTS, type ReconstructionFrame } from '../HoloMapRuntime';
import { computeHoloMapReplayFingerprint } from '../replayFingerprint';
import { assertHoloMapManifestContract } from '../simulationContractBinding';

describe('HoloMap SimulationContract binding', () => {
  const baseFrame = (): ReconstructionFrame => ({
    index: 0,
    timestampMs: 0,
    rgb: new Uint8Array([10, 20, 30, 255]),
    width: 1,
    height: 1,
    stride: 4,
  });

  it('replay fingerprint matches standalone helper for same inputs', () => {
    const fp = computeHoloMapReplayFingerprint({
      modelHash: 'golden-model',
      seed: 7,
      weightStrategy: 'distill',
      videoHash: 'golden-video',
    });
    expect(fp.length).toBe(16);
  });

  it('two runs with identical config produce identical manifest fingerprints', async () => {
    const cfg = {
      ...HOLOMAP_DEFAULTS,
      seed: 99,
      modelHash: 'contract-golden',
      videoHash: 'vid-a',
    };

    async function runOnce() {
      const rt = createHoloMapRuntime();
      await rt.init(cfg);
      await rt.step(baseFrame());
      const m = await rt.finalize();
      await rt.dispose();
      return m;
    }

    const a = await runOnce();
    const b = await runOnce();
    expect(a.replayHash).toBe(b.replayHash);
    expect(a.simulationContract.replayFingerprint).toBe(b.simulationContract.replayFingerprint);
    assertHoloMapManifestContract(a);
    assertHoloMapManifestContract(b);
  });

  it('video hash changes the replay fingerprint', async () => {
    async function fingerprintForVideo(videoHash: string) {
      const rt = createHoloMapRuntime();
      await rt.init({
        ...HOLOMAP_DEFAULTS,
        seed: 1,
        modelHash: 'm',
        videoHash,
      });
      await rt.step(baseFrame());
      const m = await rt.finalize();
      await rt.dispose();
      return m.replayHash;
    }

    const h1 = await fingerprintForVideo('v1');
    const h2 = await fingerprintForVideo('v2');
    expect(h1).not.toBe(h2);
  });
});
